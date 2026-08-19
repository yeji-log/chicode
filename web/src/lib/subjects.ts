/**
 * 수업자료 과목(정보, 인공지능 기초 …) 데이터 계층.
 *
 * 과목은 Firestore `subjects` 컬렉션에 문서로 저장한다. 문서는 Firebase 콘솔에서
 * 최초 1회 만들고(문서 id 예: information, ai-basics), 이후 이름·핀·노션 링크는
 * 교사 페이지에서 수정한다.
 *
 * ── 핀번호는 "가벼운 잠금" 이다 ──
 * 학생은 로그인이 없으므로 이 핀은 진짜 보안 장치가 아니라, 화면 진입을 막는
 * 정도의 안내판이다. firestore.rules 는 subjects/materials 를 모두 읽기 공개로
 * 두므로(학생이 로그인 없이 봐야 하니까), 개발자도구로 Firestore 를 직접 열면
 * 핀 없이도 값을 볼 수 있다. 진짜 서버 검증이 필요해지면 Firebase 유료(Blaze)
 * 플랜 + Cloud Functions 로 올려야 한다 — 지금은 그 범위 밖이다.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

import { db } from './firebase'

export interface SubjectMeta {
  id: string
  name: string
  pin: string
  notionUrl: string
  order: number
  /** 과목 페이지의 "OT" 탭에 iframe으로 띄울 오리엔테이션 페이지 주소.
   *  비어 있으면 OT 탭 자체가 안 보인다(SubjectMaterials.tsx). notionUrl과
   *  달리 새 창으로 안 열고 화면 안에 그대로 보여주므로, 임베드를 막는
   *  사이트(X-Frame-Options/CSP frame-ancestors)를 넣으면 빈 화면만 보인다 —
   *  등록 전에 확인할 것. */
  otUrl?: string
  /** false 면 학생이 핀 없이 바로 열람할 수 있다. 수업 시간에 핀을 잘못
   *  불러주거나 학생이 오타를 반복해서 시간을 잡아먹는 걸 교사가 그 자리에서
   *  임시로 풀어줄 수 있게 하는 스위치다(교사 페이지에서 토글). 필드 자체가
   *  없는 기존 문서(이 기능 이전에 만든 과목)는 undefined인데, 이땐 원래
   *  동작대로 핀이 필요한 것으로 취급한다 — normalizeSubject 참고. */
  pinRequired?: boolean
  /** false 면 아직 학생에게 열지 않은(준비 중인) 과목이다. 학생 화면에는
   *  이름은 보이지만 들어갈 수는 없다 — 교사가 자료를 미리 올려두고 정리를
   *  끝낸 뒤에 공개하려고 만든 스위치다(TeacherLab.tsx 의 활동 공개 토글과
   *  같은 이유). 필드 자체가 없는 기존 문서(정보, 인공지능 기초 — 이 기능
   *  이전에 만든 과목)는 undefined인데, 이땐 이미 공개된 것으로 취급한다 —
   *  안 그러면 이 기능을 넣는 순간 기존 과목이 갑자기 학생 눈앞에서
   *  잠겨버린다. normalizeSubject 참고. */
  published?: boolean
}

const SUBJECTS = 'subjects'

function normalizeSubject(id: string, data: Record<string, unknown>): SubjectMeta {
  return {
    ...(data as Omit<SubjectMeta, 'id' | 'pinRequired' | 'published'>),
    id,
    pinRequired: data.pinRequired !== false,
    published: data.published !== false,
  }
}

export async function listSubjects(): Promise<SubjectMeta[]> {
  const snapshot = await getDocs(query(collection(db, SUBJECTS), orderBy('order', 'asc')))
  return snapshot.docs.map((entry) => normalizeSubject(entry.id, entry.data()))
}

export async function getSubject(id: string): Promise<SubjectMeta | null> {
  const snapshot = await getDoc(doc(db, SUBJECTS, id))
  return snapshot.exists() ? normalizeSubject(snapshot.id, snapshot.data()) : null
}

export async function updateSubject(
  id: string,
  patch: Partial<
    Pick<SubjectMeta, 'name' | 'pin' | 'notionUrl' | 'otUrl' | 'pinRequired' | 'published'>
  >,
): Promise<void> {
  await updateDoc(doc(db, SUBJECTS, id), patch)
}

/**
 * 새 과목을 만든다. 기본값은 "준비 중"(published: false) — 교사가 자료를
 * 올리고 설정을 정리할 시간을 준 다음, 준비가 끝나면 직접 공개 토글을 켜는
 * 흐름을 기대한다. order 는 기존 과목 중 가장 큰 값 다음으로 잡아 탭 맨
 * 뒤에 붙게 한다.
 */
export async function createSubject(input: {
  name: string
  pin: string
  notionUrl?: string
  otUrl?: string
}): Promise<SubjectMeta> {
  const existing = await listSubjects()
  const nextOrder = existing.reduce((max, subject) => Math.max(max, subject.order ?? 0), -1) + 1

  const id = crypto.randomUUID()
  const subject: Omit<SubjectMeta, 'id'> = {
    name: input.name.trim(),
    pin: input.pin.trim(),
    notionUrl: input.notionUrl?.trim() ?? '',
    otUrl: input.otUrl?.trim() ?? '',
    order: nextOrder,
    pinRequired: true,
    published: false,
  }

  await setDoc(doc(db, SUBJECTS, id), subject)
  return { ...subject, id }
}

/**
 * 교사가 과목 탭을 드래그로 옮긴 뒤 새 순서를 통째로 저장한다. orderedIds는
 * 드래그 후 화면에 보이는 순서 그대로(과목 전체) 넘겨받는다 — order 필드를
 * 배열 인덱스로 다시 매긴다. writeBatch로 한 번에 커밋해서 중간에 실패해도
 * 일부만 바뀐 순서가 저장되지 않게 한다(labs.ts의 SectionsEditor 드래그
 * 정렬과 달리 여기는 즉시 서버에 반영해야 다른 교사도 새 순서를 본다).
 */
export async function reorderSubjects(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db)
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, SUBJECTS, id), { order: index })
  })
  await batch.commit()
}

/**
 * 과목 문서만 지운다. 그 과목에 속한 자료(materials)는 여기서 지우지 않는다
 * — materials.ts 와 subjects.ts 를 서로 의존하지 않게 하려는 계층 구분이라,
 * 자료까지 함께 지우는 건 호출부(Teacher.tsx)가 두 모듈을 순서대로 불러
 * 처리한다.
 */
export async function deleteSubject(id: string): Promise<void> {
  await deleteDoc(doc(db, SUBJECTS, id))
}

const UNLOCK_KEY_PREFIX = 'chicode:materials-unlocked:'

/**
 * 핀 통과 여부는 sessionStorage 에 담는다. 탭/브라우저를 닫으면 사라지므로
 * 공용 컴퓨터에서 다음 학생이 다시 핀을 입력하게 된다.
 */
export function isSubjectUnlocked(subjectId: string): boolean {
  return sessionStorage.getItem(UNLOCK_KEY_PREFIX + subjectId) === '1'
}

export function unlockSubject(subjectId: string): void {
  sessionStorage.setItem(UNLOCK_KEY_PREFIX + subjectId, '1')
}
