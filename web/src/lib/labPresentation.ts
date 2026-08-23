/**
 * Lab 활동의 "발표 모드" 실시간 상태.
 *
 * 사이트 전체에서 처음 등장하는 실시간 동기화 기능이다 — 학생은 로그인이
 * 없으므로 "어느 반, 어느 교실"을 구분할 방법이 없다. 그래서 활동 하나당
 * 발표 상태는 전역으로 딱 하나만 존재한다: 같은 활동 페이지를 보는 모든
 * 학생이 같은 슬라이드를 보게 된다. 여러 교실이 동시에 같은 활동으로
 * 발표를 진행하면 서로의 화면에 영향을 준다 — 사용자가 확인하고 받아들인
 * 트레이드오프다. "진짜" 반 구분이 필요해지면 세션 코드 같은 걸 붙여야
 * 하는데, 그러려면 학생도 뭔가를 입력해야 해서(회원가입 없는 지금 구조와
 * 충돌) 지금은 하지 않는다.
 *
 * currentSlide 는 1부터 시작하고, PDF 페이지 번호와 그대로 맞아떨어진다
 * (발표 모드는 PDF 필수라 labSlides.ts 에서 강제한다).
 */

import {
  arrayUnion,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'

import { db } from './firebase'

export interface InkPoint {
  x: number
  y: number
}

/** 슬라이드 한 쪽 안에서 펜을 누르고 뗄 때까지의 궤적 하나. 굵기는 아직
 *  고정값(PresentationInk.tsx)이라 따로 안 담는다. color가 없으면(색
 *  선택 기능 추가 전에 그려진 획) 렌더링 쪽에서 기본색으로 대체한다. */
export interface InkStroke {
  points: InkPoint[]
  color?: string
}

export interface LabPresentationState {
  active: boolean
  currentSlide: number
  updatedAt: number
  /** 슬라이드 번호(1부터) → 그 쪽에 그려진 펜 획들. Firestore 맵 필드라 키는
   *  실제로는 문자열이지만, 자바스크립트 대괄호 접근은 숫자를 문자열로 자동
   *  변환해주므로 호출부에서는 숫자로 그냥 읽고 쓰면 된다. 발표를 시작한
   *  적 없거나 아직 아무도 안 그렸으면 필드 자체가 없다. */
  ink?: Record<number, InkStroke[]>
}

/** strokes prop이 없을 때 매번 새 배열을 만들지 않기 위한 공유 빈 배열. */
export const EMPTY_INK_STROKES: InkStroke[] = []

const LAB_PRESENTATIONS = 'labPresentations'

const IDLE_STATE: LabPresentationState = { active: false, currentSlide: 1, updatedAt: 0 }

function presentationDoc(activityId: string) {
  return doc(db, LAB_PRESENTATIONS, activityId)
}

/** 학생·교사 화면 모두 이걸로 실시간 상태를 구독한다. */
export function subscribePresentation(
  activityId: string,
  onChange: (state: LabPresentationState) => void,
): Unsubscribe {
  return onSnapshot(presentationDoc(activityId), (snapshot) => {
    onChange(snapshot.exists() ? (snapshot.data() as LabPresentationState) : IDLE_STATE)
  })
}

/**
 * 발표를 시작한다 — 시작 페이지는 호출한 쪽이 정해서 넘긴다.
 * LabActivityDetail/SubjectMaterials는 교사가 지금 훑어보고 있는(browsing)
 * 쪽을 그대로 넘기는데, 그 훑어보기 화면 자체가 처음 열릴 때 "마지막으로
 * 발표를 종료한 자리"로 미리 맞춰져 있어서(stopPresentation이 currentSlide를
 * 건드리지 않고 종료하니까), 교사가 따로 페이지를 옮기지 않으면 자연히
 * "종료한 페이지부터 재개"가 되고, 옮기면 그 페이지부터 새로 시작된다.
 */
export async function startPresentation(activityId: string, atSlide: number): Promise<void> {
  await setDoc(presentationDoc(activityId), {
    active: true,
    currentSlide: atSlide,
    updatedAt: Date.now(),
  } satisfies LabPresentationState)
}

/**
 * 발표를 끝낸다 — 파워포인트 펜처럼, 그동안 그린 펜 자국은 여기서 전부
 * 폐기한다("잉크 유지할까요?" 같은 저장 옵션은 안 둔다, 사용자와 합의한
 * 동작). deleteField()는 merge:true 안에서도 그 필드 자체를 지운다(값을
 * 빈 객체로 덮어쓰는 것과 달리, merge가 중첩 맵을 깊이 병합해버리는 문제를
 * 피할 수 있다).
 */
export async function stopPresentation(activityId: string): Promise<void> {
  await setDoc(
    presentationDoc(activityId),
    { active: false, updatedAt: Date.now(), ink: deleteField() },
    { merge: true },
  )
}

export async function setCurrentSlide(activityId: string, slide: number): Promise<void> {
  await setDoc(
    presentationDoc(activityId),
    { currentSlide: slide, updatedAt: Date.now() },
    { merge: true },
  )
}

/**
 * 지금 그은 획 하나를 그 슬라이드에 추가한다. 마우스가 움직일 때마다 쓰지
 * 않고 펜을 뗀 시점에 한 번만 부른다(PresentationInk.tsx) — Firestore 무료
 * 쓰기 한도를 지키기 위한 이 프로젝트의 원칙과 같은 이유다.
 */
export async function addInkStroke(
  activityId: string,
  slide: number,
  stroke: InkStroke,
): Promise<void> {
  await updateDoc(presentationDoc(activityId), {
    [`ink.${slide}`]: arrayUnion(stroke),
  })
}

/** 슬라이드 넘길 때는 유지하고(파워포인트 펜과 같은 동작), "전체 지우기"
 *  버튼을 눌렀을 때만 그 쪽의 펜 자국을 전부 지운다. */
export async function clearInkForSlide(activityId: string, slide: number): Promise<void> {
  await updateDoc(presentationDoc(activityId), {
    [`ink.${slide}`]: deleteField(),
  })
}

/**
 * 지우개로 일부 획만 지운 뒤, 남은 획들로 그 슬라이드를 통째로 덮어쓴다.
 * addInkStroke(arrayUnion)와 달리 이건 배열 전체를 새로 준다 — 지우개는
 * "무엇을 지울지"가 아니라 "무엇이 남는지"를 클라이언트가 이미 계산해서
 * 알고 있어서(지금 구독 중인 값에서 지운 나머지), 그 결과를 그대로 덮어쓰는
 * 게 맞다.
 */
export async function setInkForSlide(
  activityId: string,
  slide: number,
  strokes: InkStroke[],
): Promise<void> {
  await updateDoc(presentationDoc(activityId), {
    [`ink.${slide}`]: strokes,
  })
}
