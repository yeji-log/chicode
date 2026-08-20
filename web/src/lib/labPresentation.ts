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

import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore'

import { db } from './firebase'

export interface LabPresentationState {
  active: boolean
  currentSlide: number
  updatedAt: number
}

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

export async function stopPresentation(activityId: string): Promise<void> {
  await setDoc(
    presentationDoc(activityId),
    { active: false, updatedAt: Date.now() },
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
