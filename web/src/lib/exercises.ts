/**
 * Python 연습문제 데이터 계층.
 *
 * materials.ts / subjects.ts 와 같은 모양이다 — 화면은 이 파일의 함수만 부르고,
 * 저장 위치를 바꿀 때 손댈 곳은 여기뿐이다.
 *
 *   exercises/{id}   ← 문제 하나(설명·테스트·모범답안)
 *
 * ── 왜 학생 기록은 Firestore 에 없나 ──
 * 학생은 로그인이 없다. 푼 기록을 서버에 모으려면 학생이 우리 데이터베이스에
 * 쓸 수 있어야 하고, 그 말은 인터넷의 누구나 쓸 수 있다는 뜻이다(무료 플랜의
 * 할당량이 그대로 노출된다). 그래서 진행 상황은 그 학생 브라우저의
 * localStorage 에만 남긴다 — 컴퓨터를 바꾸면 사라지는 걸 받아들인 결정이다.
 * 수행평가로 쓰려면 Blaze 유료 플랜 + Cloud Functions 가 필요하다.
 *
 * ── 모범답안이 학생에게 내려간다 ──
 * 채점을 학생 브라우저에서 하므로 테스트 케이스는 반드시 내려가야 하고,
 * 개발자도구를 열면 숨김 테스트와 모범답안도 보인다. 수업자료 핀과 같은 성격의
 * "가벼운 잠금"이다(subjects.ts 참고). 시험이 아니라 연습이라 받아들인다.
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

export interface ExerciseTest {
  /** 표준입력으로 넣어줄 내용. 줄바꿈으로 여러 줄을 준다. */
  stdin: string
  /** 기대하는 표준출력. 손으로 적지 말고 모범답안을 실행해서 채운다. */
  expected: string
  /** true 면 학생에게 입력·기대값을 안 보여주고 통과 여부만 알려준다. */
  hidden: boolean
}

export interface ExerciseDraft {
  order: number
  title: string
  /** "배우는 것" — 목록에서 한눈에 보이는 꼬리표. */
  concept: string
  body: string
  /** 입력·출력 형식 설명. */
  io: string
  hint: string
  /** 더 짧게 쓰는 방법이나 채점의 한계처럼, 힌트와 성격이 다른 덧붙임. */
  note?: string
  answer: string
  tests: ExerciseTest[]
  /** false 면 아직 학생에게 안 보인다(과목·Lab 활동의 공개 토글과 같은 방식). */
  published: boolean
}

export interface Exercise extends ExerciseDraft {
  id: string
}

const EXERCISES = 'exercises'

function normalize(id: string, data: Record<string, unknown>): Exercise {
  const raw = data as Omit<Exercise, 'id' | 'published' | 'tests'> & {
    published?: boolean
    tests?: ExerciseTest[]
  }
  return {
    ...raw,
    id,
    // 필드가 없는 옛 문서는 공개된 것으로 본다(subjects.ts 의 normalizeSubject 와 같은 이유).
    published: raw.published !== false,
    tests: raw.tests ?? [],
  }
}

export async function listExercises(): Promise<Exercise[]> {
  const snapshot = await getDocs(query(collection(db, EXERCISES), orderBy('order', 'asc')))
  return snapshot.docs.map((entry) => normalize(entry.id, entry.data()))
}

export async function getExercise(id: string): Promise<Exercise | null> {
  const snapshot = await getDoc(doc(db, EXERCISES, id))
  return snapshot.exists() ? normalize(snapshot.id, snapshot.data()) : null
}

export async function createExercise(draft: ExerciseDraft): Promise<Exercise> {
  const id = crypto.randomUUID()
  await setDoc(doc(db, EXERCISES, id), draft)
  return { ...draft, id }
}

export async function updateExercise(id: string, patch: Partial<ExerciseDraft>): Promise<void> {
  await updateDoc(doc(db, EXERCISES, id), patch)
}

export async function deleteExercise(id: string): Promise<void> {
  await deleteDoc(doc(db, EXERCISES, id))
}

/**
 * 기본 문제 묶음을 한 번에 넣는다. 이미 문제가 있으면 아무것도 하지 않는다 —
 * 버튼을 두 번 눌러 20개가 40개가 되는 사고를 막는다(호출부에서도 확인하지만,
 * 여기서 한 번 더 막는 게 안전하다).
 */
export async function seedExercises(drafts: ExerciseDraft[]): Promise<number> {
  const existing = await listExercises()
  if (existing.length > 0) return 0

  const batch = writeBatch(db)
  for (const draft of drafts) batch.set(doc(db, EXERCISES, crypto.randomUUID()), draft)
  await batch.commit()
  return drafts.length
}

/**
 * 여러 문제의 공개 여부를 한 번에 바꾼다.
 *
 * 문제가 20개라 하나씩 누르는 건 수업 준비 때 실제로 번거롭다 — "전부 숨겨두고
 * 오늘 나갈 것만 켜기" 가 가장 흔한 동선이라 그걸 한 번에 할 수 있게 한다.
 * writeBatch 라 중간에 실패해서 일부만 바뀌는 상태가 생기지 않는다.
 */
export async function setPublishedMany(ids: string[], published: boolean): Promise<void> {
  const batch = writeBatch(db)
  for (const id of ids) batch.update(doc(db, EXERCISES, id), { published })
  await batch.commit()
}

/**
 * 교사가 문제 순서를 드래그로 바꾼 뒤 통째로 저장한다(subjects.ts 의
 * reorderSubjects 와 같은 방식 — order 를 배열 인덱스로 다시 매긴다).
 */
export async function reorderExercises(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db)
  orderedIds.forEach((id, index) => batch.update(doc(db, EXERCISES, id), { order: index + 1 }))
  await batch.commit()
}

// ── 학생 진행 상황 (그 브라우저에만 남는다) ──

const SOLVED_KEY = 'chicode.exercises.solved'
const CODE_KEY_PREFIX = 'chicode.exercises.code:'

function loadSolved(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(SOLVED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function solvedIds(): Set<string> {
  return new Set(Object.keys(loadSolved()))
}

export function markSolved(id: string): void {
  const solved = loadSolved()
  solved[id] = true
  localStorage.setItem(SOLVED_KEY, JSON.stringify(solved))
}

/** 학생이 쓰던 코드는 문제마다 따로 남겨둔다 — 다른 문제를 보고 와도 이어서 쓴다. */
export function loadDraftCode(id: string): string | null {
  return localStorage.getItem(CODE_KEY_PREFIX + id)
}

export function saveDraftCode(id: string, code: string): void {
  localStorage.setItem(CODE_KEY_PREFIX + id, code)
}

const FAILS_KEY_PREFIX = 'chicode.exercises.fails:'

/**
 * 이 문제에서 채점을 돌려 틀린 횟수. 모범답안은 2번 틀린 뒤에 열린다(사용자 결정) —
 * 안 풀고 답부터 보는 것은 막으면서, 정말 막힌 학생은 볼 수 있게 하는 선이다.
 *
 * 새로고침으로 0이 되면 안 되니 localStorage 에 남긴다. 개발자도구로 지우면
 * 바로 열리는데, 어차피 모범답안 자체가 학생 브라우저에 내려가 있으므로
 * 여기서 더 단단히 잠글 이유가 없다(exercises.ts 머리말의 "가벼운 잠금").
 */
export function failCount(id: string): number {
  return Number(localStorage.getItem(FAILS_KEY_PREFIX + id) ?? 0)
}

export function recordFailure(id: string): number {
  const next = failCount(id) + 1
  localStorage.setItem(FAILS_KEY_PREFIX + id, String(next))
  return next
}
