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

import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'

import { db } from './firebase'

export interface SubjectMeta {
  id: string
  name: string
  pin: string
  notionUrl: string
  order: number
  /** false 면 학생이 핀 없이 바로 열람할 수 있다. 수업 시간에 핀을 잘못
   *  불러주거나 학생이 오타를 반복해서 시간을 잡아먹는 걸 교사가 그 자리에서
   *  임시로 풀어줄 수 있게 하는 스위치다(교사 페이지에서 토글). 필드 자체가
   *  없는 기존 문서(이 기능 이전에 만든 과목)는 undefined인데, 이땐 원래
   *  동작대로 핀이 필요한 것으로 취급한다 — normalizeSubject 참고. */
  pinRequired?: boolean
}

const SUBJECTS = 'subjects'

function normalizeSubject(id: string, data: Record<string, unknown>): SubjectMeta {
  return { ...(data as Omit<SubjectMeta, 'id' | 'pinRequired'>), id, pinRequired: data.pinRequired !== false }
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
  patch: Partial<Pick<SubjectMeta, 'name' | 'pin' | 'notionUrl' | 'pinRequired'>>,
): Promise<void> {
  await updateDoc(doc(db, SUBJECTS, id), patch)
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
