/**
 * 교사 시간표(요일 x 교시) 데이터 계층.
 *
 * subjects.ts 의 OT 자료 목록과 같은 "문서 하나를 통째로 읽고 다시 쓰기" 패턴이다 —
 * 칸이 최대 5(요일) x 10(교시) 정도로 작아서 컬렉션으로 쪼갤 필요가 없다.
 * labSettings/practiceSettings 처럼 문서 하나("default")만 쓰는 싱글턴.
 *
 * 학생에게는 보여줄 이유가 없는 교사 개인/공용 업무용 정보(반 이름, 교실 등)라
 * subjects/materials 와 달리 firestore.rules 에서 읽기도 isTeacher() 로 막는다
 * (firestore.rules 의 timetable 규칙 참고) — "가벼운 잠금"이 아니라 진짜로
 * 로그인한 교사만 볼 수 있다.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { db } from './firebase'

export const TIMETABLE_DAYS = ['월', '화', '수', '목', '금'] as const

export const DEFAULT_PERIODS = 7
const MIN_PERIODS = 1
const MAX_PERIODS = 10

const TIMETABLE = 'timetable'
const DOC_ID = 'default'

export interface TimetableCell {
  subject: string
  className: string
  room: string
  note: string
}

export interface TimetableData {
  periods: number
  /** 키는 `${dayIndex}-${period}` (dayIndex: 0=월 … 4=금, period: 1부터). */
  cells: Record<string, TimetableCell>
}

const EMPTY_CELL: TimetableCell = { subject: '', className: '', room: '', note: '' }

export function cellKey(dayIndex: number, period: number): string {
  return `${dayIndex}-${period}`
}

export function isEmptyCell(cell: TimetableCell | undefined): boolean {
  if (!cell) return true
  return !cell.subject.trim() && !cell.className.trim() && !cell.room.trim() && !cell.note.trim()
}

export async function getTimetable(): Promise<TimetableData> {
  const snapshot = await getDoc(doc(db, TIMETABLE, DOC_ID))
  if (!snapshot.exists()) return { periods: DEFAULT_PERIODS, cells: {} }
  const data = snapshot.data()
  const periods = typeof data.periods === 'number' ? data.periods : DEFAULT_PERIODS
  return { periods, cells: (data.cells as Record<string, TimetableCell>) ?? {} }
}

/**
 * 칸 하나만 저장한다. dot-notation 필드 경로(`cells.${key}`)를 키로 써서
 * merge:true 와 함께 보내면 그 칸만 정확히 덮어쓰고 다른 칸은 그대로 남는다
 * — {cells: {[key]: cell}} 형태로 보내면 Firestore가 cells 필드 전체를
 * 새 값으로 교체해버려 다른 교사가 채운 칸이 지워질 수 있다. 문서가 아직
 * 없어도 setDoc(merge:true)는 새로 만들어주므로 별도 존재 확인이 필요 없다.
 */
export async function saveCell(key: string, cell: TimetableCell): Promise<void> {
  await setDoc(doc(db, TIMETABLE, DOC_ID), { [`cells.${key}`]: cell }, { merge: true })
}

export async function clearCell(key: string): Promise<void> {
  await saveCell(key, EMPTY_CELL)
}

export async function setPeriods(periods: number): Promise<void> {
  const clamped = Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, Math.round(periods)))
  await setDoc(doc(db, TIMETABLE, DOC_ID), { periods: clamped }, { merge: true })
}

export { MIN_PERIODS, MAX_PERIODS }
