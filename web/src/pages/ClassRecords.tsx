import { useEffect, useState } from 'react'

import {
  addStudent,
  addStudentsBulk,
  createClass,
  createDate,
  deleteClass,
  deleteStudent,
  isParticipating,
  listClasses,
  listDates,
  listStudents,
  setAttendance,
  type BulkAddResult,
  type ClassRecordMeta,
  type DateRecord,
  type Student,
} from '../lib/classRecords'

/**
 * 시간표 탭("일정") 안의 "기록" 섹션 — `chicode_수업기록_기능_요구사항.md` 기준.
 *
 * 핵심 UX는 "교사가 모든 학생을 하나씩 체크하지 않아도 되는 것"이다(문서 8절) —
 * 새 날짜를 만들면 전원 참여로 시작하고, 미참여인 학생만 클릭해서 뒤집는다.
 * 그래서 시간표 그리드와 달리 여기엔 "편집 모드" 스위치를 따로 안 뒀다 —
 * 빠른 클릭이 이 화면의 존재 이유라 오히려 방해가 된다고 판단했다.
 *
 * UI 어디에도 "출석"이라는 단어를 쓰지 않는다(문서 2·13절 — 사용자가 명시적으로
 * 금지) — 참여/미참여로만 표현한다.
 */
export default function ClassRecords() {
  const [classes, setClasses] = useState<ClassRecordMeta[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)

  useEffect(() => {
    listClasses()
      .then((loaded) => {
        setClasses(loaded)
        setSelectedClassId((prev) => prev ?? loaded[0]?.id ?? null)
      })
      .catch((caught) => {
        console.error('반 목록 불러오기 실패', caught)
        setLoadError(true)
      })
  }, [])

  async function handleCreateClass(name: string) {
    const created = await createClass(name)
    setClasses((prev) => [...(prev ?? []), created])
    setSelectedClassId(created.id)
  }

  async function handleDeleteClass(target: ClassRecordMeta) {
    if (!confirm(`"${target.name}" 반을 삭제할까요? 학생 명단과 참여 기록이 모두 지워지고 되돌릴 수 없습니다.`))
      return
    await deleteClass(target.id)
    setClasses((prev) => (prev ?? []).filter((entry) => entry.id !== target.id))
    setSelectedClassId((prev) => (prev === target.id ? null : prev))
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        반 목록을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!classes) {
    return <p className="text-ink-500">불러오는 중…</p>
  }

  const selectedClass = classes.find((entry) => entry.id === selectedClassId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <ClassPicker
        classes={classes}
        selectedClassId={selectedClassId}
        onSelect={setSelectedClassId}
        onCreate={handleCreateClass}
        onDelete={selectedClass ? () => handleDeleteClass(selectedClass) : undefined}
      />

      {selectedClass ? (
        <ClassRoster key={selectedClass.id} classMeta={selectedClass} />
      ) : (
        <p className="text-sm text-ink-500">
          반이 없습니다. 위에서 새 반을 만들어 주세요(예: "2학년 1반").
        </p>
      )}
    </div>
  )
}

function ClassPicker({
  classes,
  selectedClassId,
  onSelect,
  onCreate,
  onDelete,
}: {
  classes: ClassRecordMeta[]
  selectedClassId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (() => void) | undefined
}) {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    setCreating(true)
    setCreateError(null)
    try {
      await onCreate(trimmed)
      setNewName('')
    } catch (caught) {
      console.error('반 생성 실패', caught)
      setCreateError('만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selectedClassId ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        disabled={classes.length === 0}
        className="rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm font-semibold text-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {classes.length === 0 && <option value="">반 없음</option>}
        {classes.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>

      {onDelete && (
        <button
          onClick={onDelete}
          className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-red-300 hover:text-red-600"
        >
          반 삭제
        </button>
      )}

      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="예: 2학년 1반"
          className="w-36 rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm text-ink-900"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? '만드는 중…' : '+ 새 반'}
        </button>
      </form>

      {createError && <p className="text-sm text-red-700">{createError}</p>}
    </div>
  )
}

function ClassRoster({ classMeta }: { classMeta: ClassRecordMeta }) {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [dates, setDates] = useState<DateRecord[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    setStudents(null)
    setDates(null)
    setLoadError(false)
    Promise.all([listStudents(classMeta.id), listDates(classMeta.id)])
      .then(([loadedStudents, loadedDates]) => {
        setStudents(loadedStudents)
        setDates(loadedDates)
      })
      .catch((caught) => {
        console.error('명단/기록 불러오기 실패', caught)
        setLoadError(true)
      })
  }, [classMeta.id])

  async function handleStudentAdded(student: Student) {
    setStudents((prev) => [...(prev ?? []), student])
  }

  async function handleStudentsBulkAdded(added: Student[]) {
    setStudents((prev) => [...(prev ?? []), ...added])
  }

  async function handleDeleteStudent(student: Student) {
    if (!confirm(`"${student.name}"(${student.studentNumber}) 학생을 명단에서 지울까요? 참여 기록도 함께 지워집니다.`))
      return
    await deleteStudent(classMeta.id, student.id)
    setStudents((prev) => (prev ?? []).filter((entry) => entry.id !== student.id))
    setDates((prev) =>
      (prev ?? []).map((entry) => {
        if (!(student.id in entry.records)) return entry
        const nextRecords = { ...entry.records }
        delete nextRecords[student.id]
        return { ...entry, records: nextRecords }
      }),
    )
  }

  async function handleDateCreated(dateRecord: DateRecord) {
    setDates((prev) => [...(prev ?? []), dateRecord])
  }

  async function handleToggle(dateId: string, studentId: string, next: boolean) {
    setDates((prev) =>
      (prev ?? []).map((entry) =>
        entry.id === dateId ? { ...entry, records: { ...entry.records, [studentId]: next } } : entry,
      ),
    )
    try {
      await setAttendance(classMeta.id, dateId, studentId, next)
    } catch (caught) {
      console.error('참여 상태 변경 실패', caught)
      setDates((prev) =>
        (prev ?? []).map((entry) =>
          entry.id === dateId ? { ...entry, records: { ...entry.records, [studentId]: !next } } : entry,
        ),
      )
      alert('저장하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        명단을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!students || !dates) {
    return <p className="text-ink-500">불러오는 중…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <StudentAddPanel
        classId={classMeta.id}
        onAdded={handleStudentAdded}
        onBulkAdded={handleStudentsBulkAdded}
      />

      {students.length === 0 ? (
        <p className="text-sm text-ink-500">학생이 없습니다. 위에서 학번·이름을 추가해 주세요.</p>
      ) : (
        <>
          <DateSummary students={students} dates={dates} />
          <NewDatePanel classId={classMeta.id} studentIds={students.map((entry) => entry.id)} onCreated={handleDateCreated} />
          <RecordTable students={students} dates={dates} onDelete={handleDeleteStudent} onToggle={handleToggle} />
        </>
      )}
    </div>
  )
}

function StudentAddPanel({
  classId,
  onAdded,
  onBulkAdded,
}: {
  classId: string
  onAdded: (student: Student) => void
  onBulkAdded: (added: Student[]) => void
}) {
  const [studentNumber, setStudentNumber] = useState('')
  const [name, setName] = useState('')
  const [addingSingle, setAddingSingle] = useState(false)

  const [bulkText, setBulkText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkAddResult | null>(null)

  async function handleAddSingle(event: React.FormEvent) {
    event.preventDefault()
    if (!studentNumber.trim() || !name.trim()) return
    setAddingSingle(true)
    try {
      const student = await addStudent(classId, studentNumber, name)
      onAdded(student)
      setStudentNumber('')
      setName('')
    } catch (caught) {
      console.error('학생 추가 실패', caught)
      alert('추가하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setAddingSingle(false)
    }
  }

  async function handleBulkAdd() {
    if (!bulkText.trim()) return
    setBulkBusy(true)
    setBulkResult(null)
    try {
      // addStudentsBulk는 실제로 추가된 학생 객체를 안 돌려주므로(개수만
      // 알려줌), 화면에 바로 반영하려면 다시 목록을 불러와야 한다 — 여기서는
      // 간단하게 부모가 넘겨준 콜백에 다시 조회한 결과를 넘긴다.
      const result = await addStudentsBulk(classId, bulkText)
      setBulkResult(result)
      if (result.added > 0) {
        const refreshed = await listStudents(classId)
        onBulkAdded(refreshed)
        setBulkText('')
      }
    } catch (caught) {
      console.error('학생 일괄 추가 실패', caught)
      alert('일괄 추가하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-5">
      <div>
        <h2 className="font-bold text-ink-900">학생 추가</h2>
        <p className="text-xs text-ink-500">
          한 줄에 "학번 이름" 형식으로 여러 명을 붙여넣으면 한 번에 추가됩니다(엑셀에서 두 칸을 긁어
          붙여넣어도 됩니다). 이미 있는 학번은 건너뜁니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          placeholder={'20116\t김길동\n20217\t이길동\n20230\t홍길동'}
          rows={4}
          className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-mono text-xs text-ink-900"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBulkAdd}
            disabled={bulkBusy || !bulkText.trim()}
            className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkBusy ? '추가하는 중…' : '일괄 추가'}
          </button>
          {bulkResult && (
            <p className="text-xs text-ink-600">
              {bulkResult.added}명 추가됨
              {bulkResult.skippedDuplicate > 0 && ` · 중복 ${bulkResult.skippedDuplicate}명 건너뜀`}
              {bulkResult.skippedInvalid > 0 && ` · 형식 오류 ${bulkResult.skippedInvalid}줄 건너뜀`}
            </p>
          )}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-700">학생 한 명만 추가</summary>
        <form onSubmit={handleAddSingle} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={studentNumber}
            onChange={(event) => setStudentNumber(event.target.value)}
            placeholder="학번"
            className="w-24 rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름"
            className="w-28 rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900"
          />
          <button
            type="submit"
            disabled={addingSingle || !studentNumber.trim() || !name.trim()}
            className="rounded-lg border border-cream-deep px-3 py-2 font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            추가
          </button>
        </form>
      </details>
    </div>
  )
}

function NewDatePanel({
  classId,
  studentIds,
  onCreated,
}: {
  classId: string
  studentIds: string[]
  onCreated: (dateRecord: DateRecord) => void
}) {
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    if (!dateInput) return
    setBusy(true)
    try {
      const created = await createDate(classId, dateInput, studentIds)
      onCreated(created)
    } catch (caught) {
      console.error('수업 날짜 생성 실패', caught)
      alert('만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={dateInput}
        onChange={(event) => setDateInput(event.target.value)}
        className="rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm text-ink-900"
      />
      <button
        onClick={handleCreate}
        disabled={busy || !dateInput}
        className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '만드는 중…' : '+ 수업 날짜 추가'}
      </button>
    </div>
  )
}

function formatDateShort(date: string): string {
  const [, month, day] = date.split('-')
  if (!month || !day) return date
  return `${Number(month)}/${Number(day)}`
}

/** 가장 최근 날짜를 기준으로 요약한다 — "오늘 막 만든 기록 현황"을 보고 싶을
 *  때가 대부분이라, 날짜를 따로 선택하게 하지 않고 자동으로 마지막 컬럼을
 *  보여준다. */
function DateSummary({ students, dates }: { students: Student[]; dates: DateRecord[] }) {
  if (dates.length === 0) {
    return <p className="text-sm text-ink-500">아직 수업 날짜가 없습니다. 아래에서 날짜를 추가해 주세요.</p>
  }
  const latest = dates[dates.length - 1]
  const participating = students.filter((entry) => isParticipating(latest, entry.id)).length

  return (
    <div className="rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-sm">
      <span className="font-bold text-ink-900">{formatDateShort(latest.date)}</span>
      <span className="ml-2 text-ink-700">
        학생 {students.length}명 · 참여 {participating}명 · 미참여 {students.length - participating}명
      </span>
    </div>
  )
}

function RecordTable({
  students,
  dates,
  onDelete,
  onToggle,
}: {
  students: Student[]
  dates: DateRecord[]
  onDelete: (student: Student) => void
  onToggle: (dateId: string, studentId: string, next: boolean) => void
}) {
  if (dates.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-2xl border border-cream-deep bg-white/70">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-12 border-b border-cream-deep bg-white px-2 py-3 text-xs font-semibold text-ink-500">
              순서
            </th>
            <th className="sticky left-12 z-10 w-20 border-b border-l border-cream-deep bg-white px-2 py-3 text-xs font-semibold text-ink-500">
              학번
            </th>
            <th className="sticky left-[128px] z-10 w-32 border-b border-l border-cream-deep bg-white px-2 py-3 text-left text-xs font-semibold text-ink-500">
              이름
            </th>
            {dates.map((entry) => (
              <th
                key={entry.id}
                className="w-16 border-b border-l border-cream-deep px-2 py-3 text-xs font-semibold text-ink-500"
              >
                {formatDateShort(entry.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => (
            <tr key={student.id}>
              <td className="sticky left-0 z-10 border-b border-cream-deep bg-white px-2 py-2 text-center text-ink-500">
                {index + 1}
              </td>
              <td className="sticky left-12 z-10 border-b border-l border-cream-deep bg-white px-2 py-2 text-center text-ink-700">
                {student.studentNumber}
              </td>
              <td className="sticky left-[128px] z-10 border-b border-l border-cream-deep bg-white px-2 py-2 text-ink-900">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{student.name}</span>
                  <button
                    onClick={() => onDelete(student)}
                    aria-label={`${student.name} 삭제`}
                    className="shrink-0 rounded px-1 text-xs text-ink-400 transition-colors hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              </td>
              {dates.map((dateRecord) => {
                const participating = isParticipating(dateRecord, student.id)
                return (
                  <td key={dateRecord.id} className="border-b border-l border-cream-deep p-0 text-center">
                    <button
                      onClick={() => onToggle(dateRecord.id, student.id, !participating)}
                      aria-label={`${student.name} ${formatDateShort(dateRecord.date)} ${
                        participating ? '참여' : '미참여'
                      } — 클릭해서 전환`}
                      className="flex h-11 w-16 items-center justify-center text-lg transition-colors hover:bg-cheese-100"
                    >
                      {participating ? '🟢' : '🔴'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
