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
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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
  /** 반 이름(trim된 값) -> 지정 색상(hex). 여기 없는 반은 autoClassColor()로
   *  이름에서 결정론적으로 뽑은 색을 쓴다 — CellEditor의 색상 선택기 참고. */
  classColors: Record<string, string>
  /** 교시(1부터) -> 시간 표시용 자유 텍스트(예: "09:00"). 값을 안 넣은
   *  교시는 시간이 아예 안 보인다 — 형식을 강제하지 않는다(사용자가
   *  "09:00~09:50"처럼 범위로 쓸 수도 있으니). */
  periodTimes: Record<number, string>
}

const EMPTY_CELL: TimetableCell = { subject: '', className: '', room: '', note: '' }

/**
 * 같은 반 이름은 항상 같은 색으로 보이게 하는 기본값(사용자 요청 — "랜덤
 * 색 배정"이지만 새로고침마다 바뀌면 오히려 헷갈리므로, 이름을 해시해서
 * 매번 같은 색이 나오게 했다. classColors에 직접 지정해두면 그 색이
 * 우선한다.
 */
const AUTO_PALETTE = [
  '#FBCFE8', // pink-200
  '#BFDBFE', // blue-200
  '#BBF7D0', // green-200
  '#DDD6FE', // violet-200
  '#FED7AA', // orange-200
  '#A5F3FC', // cyan-200
  '#FECACA', // red-200
  '#D9F99D', // lime-200
  '#E9D5FF', // purple-200
  '#99F6E4', // teal-200
] as const

export { AUTO_PALETTE }

export function autoClassColor(className: string): string {
  const trimmed = className.trim()
  let hash = 0
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0
  }
  return AUTO_PALETTE[Math.abs(hash) % AUTO_PALETTE.length]
}

export function classColorFor(data: Pick<TimetableData, 'classColors'>, className: string): string {
  const trimmed = className.trim()
  return data.classColors[trimmed] ?? autoClassColor(trimmed)
}

export function cellKey(dayIndex: number, period: number): string {
  return `${dayIndex}-${period}`
}

export function isEmptyCell(cell: TimetableCell | undefined): boolean {
  if (!cell) return true
  return !cell.subject.trim() && !cell.className.trim() && !cell.room.trim() && !cell.note.trim()
}

export async function getTimetable(): Promise<TimetableData> {
  const snapshot = await getDoc(doc(db, TIMETABLE, DOC_ID))
  if (!snapshot.exists()) return { periods: DEFAULT_PERIODS, cells: {}, classColors: {}, periodTimes: {} }
  const data = snapshot.data()
  const periods = typeof data.periods === 'number' ? data.periods : DEFAULT_PERIODS
  return {
    periods,
    cells: (data.cells as Record<string, TimetableCell>) ?? {},
    classColors: (data.classColors as Record<string, string>) ?? {},
    periodTimes: (data.periodTimes as Record<number, string>) ?? {},
  }
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

/**
 * 반 이름에 색을 지정하거나(색을 넘김), 지정을 지워 다시 자동 색으로
 * 돌린다(color를 null로 넘김) — saveCell과 같은 이유로 updateDoc의
 * dot-notation을 쓰고, 문서가 아직 없을 때만 setDoc(merge:true)로
 * 새로 만든다.
 */
export async function setClassColor(className: string, color: string | null): Promise<void> {
  const trimmed = className.trim()
  if (!trimmed) return
  const ref = doc(db, TIMETABLE, DOC_ID)
  const value = color ?? deleteField()
  try {
    await updateDoc(ref, { [`classColors.${trimmed}`]: value })
  } catch (caught) {
    if ((caught as { code?: string }).code !== 'not-found') throw caught
    if (color === null) return // 문서가 없다는 건 지정된 색도 없다는 뜻이니 그냥 끝낸다.
    await setDoc(ref, { classColors: { [trimmed]: color } }, { merge: true })
  }
}

/**
 * 교시 하나의 시간 표시를 저장한다(빈 문자열이면 지운다) — setClassColor와
 * 같은 dot-notation + not-found 폴백 패턴.
 */
export async function setPeriodTime(period: number, time: string): Promise<void> {
  const trimmed = time.trim()
  const ref = doc(db, TIMETABLE, DOC_ID)
  const value = trimmed ? trimmed : deleteField()
  try {
    await updateDoc(ref, { [`periodTimes.${period}`]: value })
  } catch (caught) {
    if ((caught as { code?: string }).code !== 'not-found') throw caught
    if (!trimmed) return
    await setDoc(ref, { periodTimes: { [period]: trimmed } }, { merge: true })
  }
}

export async function setPeriods(periods: number): Promise<void> {
  const clamped = Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, Math.round(periods)))
  await setDoc(doc(db, TIMETABLE, DOC_ID), { periods: clamped }, { merge: true })
}

export { MIN_PERIODS, MAX_PERIODS }
