/**
 * 수업기록(반별 학생 명단 + 날짜별 참여 여부) 데이터 계층.
 *
 * `chicode_수업기록_기능_요구사항.md` 기준. 학생의 학번·이름은 미성년자 개인정보라
 * subjects/materials 같은 "가벼운 잠금"이 아니라 timetable과 동일하게
 * firestore.rules 에서 읽기까지 isTeacher() 로 막는다 — 학생은 이 데이터의 존재
 * 자체를 모른다.
 *
 *   classRecords/{classId}              반 하나 (예: "2학년 1반")
 *     students/{studentId}              학생 한 명 (id는 crypto.randomUUID())
 *     dates/{date}                      수업 날짜 하나 (문서 id = "2026-08-21" 형식
 *                                        문자열 그대로 — 자연 정렬되고 같은 날짜를
 *                                        두 번 만들 수 없다)
 *
 * dates/{date} 문서의 records 필드는 `{ [studentId]: boolean }` 맵이다(참여=true).
 * 새 학생이 지난 날짜엔 없을 수 있는데(그 학생이 그 날짜엔 반에 없었으니까), 이
 * 경우 "참여"로 간주한다 — timetable의 cells/classColors와 같은 dot-notation
 * updateDoc 패턴을 쓴다(saveCell 주석 참고, 실제 프로덕션에 스크래치 컬렉션을
 * 만들어 이미 여러 번 검증한 패턴이라 이번엔 값 타입만 boolean으로 바뀐 것이라
 * 재검증하지 않았다).
 */
import {
  collection,
  deleteDoc,
  deleteField,
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

const CLASS_RECORDS = 'classRecords'
const STUDENTS = 'students'
const DATES = 'dates'

export interface ClassRecordMeta {
  id: string
  name: string
  order: number
  /** 반 전체에 대한 자유 메모(사용자 요청) — 특정 학생·날짜에 매이지 않는
   *  일반 메모. 기존에 만든 반에는 이 필드가 아예 없을 수 있어 optional. */
  memo?: string
}

export interface Student {
  id: string
  studentNumber: string
  name: string
  order: number
}

export interface DateRecord {
  id: string
  date: string
  /** 학생 id -> 참여 여부. 키가 없으면 참여로 간주한다(isParticipating 참고). */
  records: Record<string, boolean>
}

export function isParticipating(dateRecord: DateRecord, studentId: string): boolean {
  return dateRecord.records[studentId] ?? true
}

export async function listClasses(): Promise<ClassRecordMeta[]> {
  const snapshot = await getDocs(query(collection(db, CLASS_RECORDS), orderBy('order', 'asc')))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<ClassRecordMeta, 'id'>) }))
}

export async function createClass(name: string): Promise<ClassRecordMeta> {
  const existing = await listClasses()
  const order = existing.reduce((max, entry) => Math.max(max, entry.order ?? 0), -1) + 1
  const id = crypto.randomUUID()
  const meta = { name: name.trim(), order }
  await setDoc(doc(db, CLASS_RECORDS, id), meta)
  return { id, ...meta }
}

export async function renameClass(classId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await updateDoc(doc(db, CLASS_RECORDS, classId), { name: trimmed })
}

/** 반 전체에 대한 자유 메모를 저장한다(사용자 요청) — 특정 학생·날짜에
 *  매이지 않는 일반 메모라 dot-notation 없이 필드 하나만 통째로 갱신한다. */
export async function setClassMemo(classId: string, memo: string): Promise<void> {
  await updateDoc(doc(db, CLASS_RECORDS, classId), { memo: memo.trim() })
}

/**
 * 반 탭을 드래그로 정렬한 뒤 새 순서를 저장한다 — subjects.ts의
 * reorderSubjects와 같은 패턴(writeBatch로 한 번에 커밋).
 */
export async function reorderClasses(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db)
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, CLASS_RECORDS, id), { order: index })
  })
  await batch.commit()
}

/**
 * 반을 통째로 지운다. Firestore는 상위 문서를 지워도 하위 컬렉션(students,
 * dates)이 자동으로 지워지지 않는다 — 개인정보가 안 남게 직접 다 지운다.
 * writeBatch는 500개 연산 제한이 있는데, 실제 학급 규모(학생 40명 안팎,
 * 수업일 200일 안팎)면 합쳐도 250개 정도라 안전하게 한 번에 처리된다.
 */
export async function deleteClass(classId: string): Promise<void> {
  const [studentsSnapshot, datesSnapshot] = await Promise.all([
    getDocs(collection(db, CLASS_RECORDS, classId, STUDENTS)),
    getDocs(collection(db, CLASS_RECORDS, classId, DATES)),
  ])
  const batch = writeBatch(db)
  studentsSnapshot.docs.forEach((entry) => batch.delete(entry.ref))
  datesSnapshot.docs.forEach((entry) => batch.delete(entry.ref))
  batch.delete(doc(db, CLASS_RECORDS, classId))
  await batch.commit()
}

export async function listStudents(classId: string): Promise<Student[]> {
  const snapshot = await getDocs(
    query(collection(db, CLASS_RECORDS, classId, STUDENTS), orderBy('order', 'asc')),
  )
  return snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<Student, 'id'>) }))
}

export async function addStudent(classId: string, studentNumber: string, name: string): Promise<Student> {
  const trimmedNumber = studentNumber.trim()
  const existing = await listStudents(classId)
  // addStudentsBulk(일괄 추가)는 이미 있는 학번을 건너뛰는데, 이 함수엔 그 확인이
  // 없었다 — 실제 프로덕션 데이터에서 같은 학번이 두 번 저장된 걸 발견하고 나서
  // 추가했다(사용자가 "한 명만 추가"로 이미 있는 학번을 다시 넣은 것으로 보임).
  if (existing.some((entry) => entry.studentNumber === trimmedNumber)) {
    throw new Error(`이미 있는 학번입니다 (${trimmedNumber}).`)
  }
  const order = existing.reduce((max, entry) => Math.max(max, entry.order ?? 0), -1) + 1
  const id = crypto.randomUUID()
  const student = { studentNumber: trimmedNumber, name: name.trim(), order }
  await setDoc(doc(db, CLASS_RECORDS, classId, STUDENTS, id), student)
  return { id, ...student }
}

interface ParsedStudentLine {
  studentNumber: string
  name: string
}

/**
 * "학번 이름" 한 줄씩 붙여넣은 텍스트를 파싱한다. 엑셀에서 두 칸을 긁어
 * 붙여넣으면 탭으로 구분되고, 직접 타이핑하면 보통 공백이나 쉼표로
 * 구분하니 셋 다 구분자로 받는다. 토큰이 2개 미만인 줄(학번만 있거나 빈
 * 줄)은 건너뛰고 개수를 센다.
 */
function parseBulkStudents(raw: string): { entries: ParsedStudentLine[]; invalidLines: number } {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const entries: ParsedStudentLine[] = []
  let invalidLines = 0
  for (const line of lines) {
    const tokens = line.split(/[\t,]+|\s+/).filter(Boolean)
    if (tokens.length < 2) {
      invalidLines += 1
      continue
    }
    const [studentNumber, ...rest] = tokens
    entries.push({ studentNumber, name: rest.join(' ') })
  }
  return { entries, invalidLines }
}

export interface BulkAddResult {
  added: number
  skippedDuplicate: number
  skippedInvalid: number
}

/**
 * 학번·이름을 한 번에 여러 명 추가한다(사용자 요청). 이미 있는 학번은
 * 건너뛴다 — 실수로 같은 명단을 두 번 붙여넣어도 중복 학생이 생기지 않는다.
 */
export async function addStudentsBulk(classId: string, raw: string): Promise<BulkAddResult> {
  const { entries, invalidLines } = parseBulkStudents(raw)
  const existing = await listStudents(classId)
  const existingNumbers = new Set(existing.map((entry) => entry.studentNumber))
  let nextOrder = existing.reduce((max, entry) => Math.max(max, entry.order ?? 0), -1) + 1

  const batch = writeBatch(db)
  let added = 0
  let skippedDuplicate = 0
  for (const entry of entries) {
    if (existingNumbers.has(entry.studentNumber)) {
      skippedDuplicate += 1
      continue
    }
    existingNumbers.add(entry.studentNumber) // 붙여넣은 목록 안에서 같은 학번이 중복돼도 한 번만 추가
    const id = crypto.randomUUID()
    batch.set(doc(db, CLASS_RECORDS, classId, STUDENTS, id), {
      studentNumber: entry.studentNumber,
      name: entry.name,
      order: nextOrder,
    })
    nextOrder += 1
    added += 1
  }
  if (added > 0) await batch.commit()

  return { added, skippedDuplicate, skippedInvalid: invalidLines }
}

/**
 * 학생을 명단에서 지운다. 그 학생이 들어있던 모든 날짜 기록에서도 항목을
 * 지워야 한다 — 안 지우면 탈퇴한 학생의 참여 기록이 고아 데이터로 계속
 * 남는다(개인정보 삭제 요청 대응).
 */
export async function deleteStudent(classId: string, studentId: string): Promise<void> {
  const dates = await listDates(classId)
  const batch = writeBatch(db)
  batch.delete(doc(db, CLASS_RECORDS, classId, STUDENTS, studentId))
  dates.forEach((entry) => {
    if (studentId in entry.records) {
      batch.update(doc(db, CLASS_RECORDS, classId, DATES, entry.id), {
        [`records.${studentId}`]: deleteField(),
      })
    }
  })
  await batch.commit()
}

export async function listDates(classId: string): Promise<DateRecord[]> {
  const snapshot = await getDocs(
    query(collection(db, CLASS_RECORDS, classId, DATES), orderBy('date', 'asc')),
  )
  return snapshot.docs.map((entry) => {
    const data = entry.data()
    return {
      id: entry.id,
      date: data.date as string,
      records: (data.records as Record<string, boolean>) ?? {},
    }
  })
}

/**
 * 새 수업 날짜를 만든다. 이미 있으면(같은 날짜를 두 번 누른 경우) 있는 그대로
 * 돌려주고 새로 안 만든다 — 기존 기록을 덮어쓰면 안 되니까. 문서 id를
 * 날짜 문자열로 고정해서 이 중복 확인이 조회 한 번으로 끝난다.
 */
export async function createDate(classId: string, date: string, studentIds: string[]): Promise<DateRecord> {
  const ref = doc(db, CLASS_RECORDS, classId, DATES, date)
  const existing = await getDoc(ref)
  if (existing.exists()) {
    const data = existing.data()
    return { id: date, date, records: (data.records as Record<string, boolean>) ?? {} }
  }
  const records = Object.fromEntries(studentIds.map((id) => [id, true]))
  await setDoc(ref, { date, records })
  return { id: date, date, records }
}

export async function deleteDate(classId: string, dateId: string): Promise<void> {
  await deleteDoc(doc(db, CLASS_RECORDS, classId, DATES, dateId))
}

/**
 * 날짜 문서는 createDate에서 이미 만들어진 뒤에만 토글되므로(그리드에 안 뜨는
 * 날짜는 누를 수 없다) not-found 폴백이 필요 없다 — saveCell과 달리 여기선
 * 항상 문서가 이미 있다는 게 보장된다.
 */
export async function setAttendance(
  classId: string,
  dateId: string,
  studentId: string,
  participated: boolean,
): Promise<void> {
  await updateDoc(doc(db, CLASS_RECORDS, classId, DATES, dateId), {
    [`records.${studentId}`]: participated,
  })
}
