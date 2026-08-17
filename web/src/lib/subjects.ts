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
}

const SUBJECTS = 'subjects'

export async function listSubjects(): Promise<SubjectMeta[]> {
  const snapshot = await getDocs(query(collection(db, SUBJECTS), orderBy('order', 'asc')))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SubjectMeta)
}

export async function getSubject(id: string): Promise<SubjectMeta | null> {
  const snapshot = await getDoc(doc(db, SUBJECTS, id))
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as SubjectMeta) : null
}

export async function updateSubject(
  id: string,
  patch: Partial<Pick<SubjectMeta, 'name' | 'pin' | 'notionUrl'>>,
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
