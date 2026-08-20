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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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
 * 칸 하나만 저장한다.
 *
 * 처음엔 setDoc(..., {[`cells.${key}`]: cell}, {merge: true}) 로 썼는데, 실제
 * 저장은 성공(에러 없음)해도 새로고침하면 값이 사라지는 버그가 있었다 — 원인은
 * setDoc + merge:true 에서 점(.)이 든 키는 updateDoc 과 달리 중첩 경로로 안
 * 풀리고 "cells.0-1" 이라는 점이 그대로 들어간 별도의 최상위 필드로 저장돼서다
 * (실제 프로덕션 프로젝트에 임시 스크래치 컬렉션을 만들어 setDoc vs updateDoc
 * 결과를 직접 비교해 확인함 — cells 맵 자체는 안 건드려지고 "cells.0-1"이라는
 * 필드가 새로 생겼다). updateDoc 은 점 표기를 진짜 중첩 경로로 해석해서 그
 * 칸만 정확히 덮어쓰고 다른 칸은 그대로 둔다 — 이게 맞는 방법이다.
 *
 * 다만 updateDoc 은 문서가 아직 없으면 not-found 로 실패한다(이것도 같은
 * 방식으로 실측함). 시간표를 처음 쓰는 순간(문서가 아직 없을 때)만 setDoc +
 * 진짜 중첩 객체({cells: {[key]: cell}}, merge:true) 로 새로 만든다 — 이
 * 형태(점 표기 키가 아니라 실제 JS 중첩 객체)는 merge:true 와 함께 써도 다른
 * 칸을 안 지운다는 것도 같은 실측에서 확인했다.
 */
export async function saveCell(key: string, cell: TimetableCell): Promise<void> {
  const ref = doc(db, TIMETABLE, DOC_ID)
  try {
    await updateDoc(ref, { [`cells.${key}`]: cell })
  } catch (caught) {
    if ((caught as { code?: string }).code !== 'not-found') throw caught
    await setDoc(ref, { cells: { [key]: cell } }, { merge: true })
  }
}

export async function clearCell(key: string): Promise<void> {
  await saveCell(key, EMPTY_CELL)
}

export async function setPeriods(periods: number): Promise<void> {
  const clamped = Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, Math.round(periods)))
  await setDoc(doc(db, TIMETABLE, DOC_ID), { periods: clamped }, { merge: true })
}

export { MIN_PERIODS, MAX_PERIODS }
