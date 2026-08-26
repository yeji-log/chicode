import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState } from 'react'

import {
  addStudent,
  addStudentsBulk,
  createClass,
  createDate,
  deleteClass,
  deleteDate,
  deleteStudent,
  isParticipating,
  listClasses,
  listDates,
  listStudents,
  renameClass,
  reorderClasses,
  setAttendance,
  setClassMemo,
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
  // "+ 학생추가" 토글은 반 삭제/이름 수정과 같은 줄에 나란히 있어야 해서
  // (사용자 요청) ClassPicker/ClassRoster 둘 다에서 쓸 수 있도록 여기(공통
  // 부모)로 끌어올렸다. 다른 반 탭을 누르면 자동으로 닫는다 — 안 그러면
  // A반에서 열어둔 추가 폼이 B반으로 넘어가서도 열려 있어 혼동을 준다.
  const [showStudentAdd, setShowStudentAdd] = useState(false)

  // "명단 다운로드" 버튼은 학생추가 바로 옆(ClassPicker의 통제 줄)에 있어야
  // 해서(사용자 요청), 정작 학생 목록은 ClassRoster가 들고 있는 걸 여기로도
  // 알려받는다 — ClassRoster를 통째로 끌어올리는 대신 필요한 데이터만
  // 콜백으로 미러링하는 쪽이 기존 구조를 덜 건드린다.
  const [currentStudents, setCurrentStudents] = useState<Student[] | null>(null)

  useEffect(() => {
    setShowStudentAdd(false)
    setCurrentStudents(null)
  }, [selectedClassId])

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

  // 새 반 만들기는 이름 입력과 학생 명단 붙여넣기를 한 폼에서 같이 받는다
  // (사용자 요청 — "새 반 추가 기능은 따로 빼서 학생 추가를 할 수 있게").
  // 학생 명단은 선택 사항이라 비어 있으면 반만 만든다.
  async function handleCreateClass(name: string, bulkText: string) {
    const created = await createClass(name)
    setClasses((prev) => [...(prev ?? []), created])
    setSelectedClassId(created.id)
    if (bulkText.trim()) {
      await addStudentsBulk(created.id, bulkText)
      // ClassRoster가 classMeta.id를 key로 마운트되면서 학생 목록을 새로
      // 불러오므로, 여기서 따로 상태를 안 채워도 화면에 바로 반영된다.
    }
  }

  async function handleDeleteClass(target: ClassRecordMeta) {
    if (!confirm(`"${target.name}" 반을 삭제할까요? 학생 명단과 참여 기록이 모두 지워지고 되돌릴 수 없습니다.`))
      return
    await deleteClass(target.id)
    setClasses((prev) => (prev ?? []).filter((entry) => entry.id !== target.id))
    setSelectedClassId((prev) => (prev === target.id ? null : prev))
  }

  async function handleRenameClass(target: ClassRecordMeta, name: string) {
    await renameClass(target.id, name)
    setClasses((prev) =>
      (prev ?? []).map((entry) => (entry.id === target.id ? { ...entry, name: name.trim() } : entry)),
    )
  }

  // 드래그로 옮긴 순서를 낙관적으로 먼저 반영하고, 저장은 뒤에서 조용히
  // 진행한다 — Teacher.tsx의 과목 탭 드래그 정렬과 같은 패턴(실패해도
  // 새로고침하면 저장된 순서로 돌아오니 별도 롤백은 안 함).
  function handleReorderClasses(reordered: ClassRecordMeta[]) {
    setClasses(reordered)
    reorderClasses(reordered.map((entry) => entry.id)).catch((caught) => {
      console.error('반 순서 저장 실패', caught)
      alert('반 순서를 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.')
    })
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
        onReorder={handleReorderClasses}
        onCreate={handleCreateClass}
        onRename={selectedClass ? (name) => handleRenameClass(selectedClass, name) : undefined}
        onDelete={selectedClass ? () => handleDeleteClass(selectedClass) : undefined}
        showStudentAdd={showStudentAdd}
        onToggleStudentAdd={selectedClass ? () => setShowStudentAdd((value) => !value) : undefined}
        onDownloadRoster={
          selectedClass && currentStudents && currentStudents.length > 0
            ? () => downloadRosterCsv(selectedClass.name, currentStudents)
            : undefined
        }
      />

      {selectedClass ? (
        <ClassRoster
          key={selectedClass.id}
          classMeta={selectedClass}
          showStudentAdd={showStudentAdd}
          onStudentsChange={setCurrentStudents}
        />
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
  onReorder,
  onCreate,
  onRename,
  onDelete,
  showStudentAdd,
  onToggleStudentAdd,
  onDownloadRoster,
}: {
  classes: ClassRecordMeta[]
  selectedClassId: string | null
  onSelect: (id: string) => void
  onReorder: (reordered: ClassRecordMeta[]) => void
  onCreate: (name: string, bulkText: string) => Promise<void>
  onRename: ((name: string) => Promise<void>) | undefined
  onDelete: (() => void) | undefined
  showStudentAdd: boolean
  onToggleStudentAdd: (() => void) | undefined
  onDownloadRoster: (() => void) | undefined
}) {
  const [showAddForm, setShowAddForm] = useState(false)

  // 이름 수정은 선택된 반이 바뀌면(다른 탭을 누르면) 자동으로 닫는다 — 안
  // 그러면 A반 수정 폼이 열린 채로 B반 탭을 눌렀을 때 어느 반을 고치는
  // 건지 헷갈린다.
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)

  useEffect(() => {
    setRenaming(false)
  }, [selectedClassId])

  const selected = classes.find((entry) => entry.id === selectedClassId) ?? null

  // 탭도 Teacher.tsx의 과목 탭과 같은 @dnd-kit 조합(PointerSensor에
  // activationConstraint distance 4) — 살짝만 눌렀다 떼는 보통의 "탭 클릭"과
  // 실제 드래그를 구분해서, 버튼 자체를 드래그 핸들로 써도 클릭 선택이 안
  // 깨지게 한다(사용자 요청 — 반별 탭 드래그 이동).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = classes.findIndex((entry) => entry.id === active.id)
    const newIndex = classes.findIndex((entry) => entry.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(classes, oldIndex, newIndex))
  }

  function startRename() {
    if (!selected) return
    setRenameValue(selected.name)
    setRenaming(true)
  }

  async function handleRenameSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = renameValue.trim()
    if (!trimmed || !onRename) return
    setRenameBusy(true)
    try {
      await onRename(trimmed)
      setRenaming(false)
    } catch (caught) {
      console.error('반 이름 수정 실패', caught)
      alert('이름을 바꾸지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setRenameBusy(false)
    }
  }

  async function handleCreateSubmit(name: string, bulkText: string) {
    await onCreate(name, bulkText)
    setShowAddForm(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 반마다 탭 하나 — 드롭다운 대신 탭으로 둬서 반을 오갈 때마다 그
          반의 출결(참여) 기록을 바로 누르며 확인할 수 있게 했다(사용자
          요청). Teacher.tsx의 섹션 탭과 같은 스타일 + 드래그 정렬. */}
      <nav className="flex flex-wrap items-center gap-2 border-b border-cream-deep pb-3">
        {classes.length === 0 && <span className="px-2 py-2 text-sm text-ink-500">반 없음</span>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={classes.map((entry) => entry.id)} strategy={horizontalListSortingStrategy}>
            {classes.map((entry) => (
              <SortableClassTab
                key={entry.id}
                classMeta={entry}
                active={entry.id === selectedClassId}
                onSelect={() => onSelect(entry.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          onClick={() => setShowAddForm((value) => !value)}
          className={[
            'rounded-lg border border-dashed px-4 py-2 text-sm font-bold transition-colors',
            showAddForm
              ? 'border-cheese-300 bg-cheese-50 text-cheese-700'
              : 'border-cream-deep text-ink-500 hover:border-cheese-300 hover:text-ink-700',
          ].join(' ')}
        >
          + 새 반
        </button>
      </nav>

      {showAddForm && <AddClassForm onCreated={handleCreateSubmit} onCancel={() => setShowAddForm(false)} />}

      {selected && !renaming && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={startRename}
            className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
          >
            이름 수정
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-red-300 hover:text-red-600"
            >
              반 삭제
            </button>
          )}
          {onToggleStudentAdd && (
            <button
              onClick={onToggleStudentAdd}
              className={[
                'rounded-lg border border-dashed px-3 py-2 text-sm font-bold transition-colors',
                showStudentAdd
                  ? 'border-cheese-300 bg-cheese-50 text-cheese-700'
                  : 'border-cream-deep text-ink-500 hover:border-cheese-300 hover:text-ink-700',
              ].join(' ')}
            >
              + 학생추가
            </button>
          )}
          {onDownloadRoster && (
            <button
              onClick={onDownloadRoster}
              className="ml-auto rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
            >
              명단 다운로드
            </button>
          )}
        </div>
      )}

      {selected && renaming && (
        <form onSubmit={handleRenameSubmit} className="flex items-center gap-2">
          <input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            className="w-36 rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm text-ink-900"
            autoFocus
          />
          <button
            type="submit"
            disabled={renameBusy || !renameValue.trim()}
            className="rounded-lg bg-cheese-400 px-3 py-2 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            disabled={renameBusy}
            className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
          >
            취소
          </button>
        </form>
      )}
    </div>
  )
}

/** 드래그로 순서를 바꿀 수 있는 반 탭 하나. 버튼 자체가 드래그 핸들이다 —
 *  Teacher.tsx의 SortableSubjectTab과 같은 패턴. */
function SortableClassTab({
  classMeta,
  active,
  onSelect,
}: {
  classMeta: ClassRecordMeta
  active: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: classMeta.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={[
        'touch-none rounded-lg px-4 py-2 text-sm font-bold transition-colors',
        active ? 'bg-cheese-400 text-ink-900' : 'border border-cream-deep text-ink-700 hover:border-cheese-300',
      ].join(' ')}
    >
      {classMeta.name}
    </button>
  )
}

/** 반 만들기 폼 — 이름과 학생 명단(선택)을 한 번에 받는다(사용자 요청).
 *  Teacher.tsx의 AddSubjectForm과 같은 토글+폼 패턴. */
function AddClassForm({
  onCreated,
  onCancel,
}: {
  onCreated: (name: string, bulkText: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      await onCreated(trimmed, bulkText)
    } catch (caught) {
      console.error('반 생성 실패', caught)
      setError('만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-cheese-300 bg-cheese-50 p-5"
    >
      <div>
        <h2 className="font-bold text-ink-900">새 반 만들기</h2>
        <p className="text-xs text-ink-500">
          반 이름을 정하고, 필요하면 학생 명단도 바로 붙여넣으세요. 명단은 나중에 추가해도 됩니다.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-ink-700">반 이름</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 2학년 1반"
          className="w-full max-w-xs rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900"
          autoFocus
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-ink-700">학생 명단(선택)</span>
        <textarea
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          placeholder={'20116\t김길동\n20217\t이길동\n20230\t홍길동'}
          rows={4}
          className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-mono text-xs text-ink-900"
        />
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '만드는 중…' : '만들기'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-cream-deep px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          취소
        </button>
      </div>
    </form>
  )
}

/** 명단을 CSV로 내려받는다. 엑셀에서 그대로 열리도록 UTF-8 BOM을 붙였다
 *  (BOM 없이 저장하면 한글이 깨져 보인다 — 실제로 확인함). 새 라이브러리
 *  없이 순수 문자열 조립만으로 충분해서 xlsx 같은 진짜 엑셀 포맷 라이브러리는
 *  들이지 않았다(사용자 확인 — CSV로 결정). */
function downloadRosterCsv(className: string, students: Student[]) {
  const escapeCsvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const rows = [['학번', '이름'], ...students.map((entry) => [entry.studentNumber, entry.name])]
  const csv = rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
  const bom = String.fromCharCode(0xfeff) // 엑셀이 한글을 깨진 문자로 읽는 걸 막는 UTF-8 BOM
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${className.replace(/[\\/:*?"<>|]/g, '_')}_명단.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function ClassRoster({
  classMeta,
  showStudentAdd,
  onStudentsChange,
}: {
  classMeta: ClassRecordMeta
  showStudentAdd: boolean
  // "명단 다운로드" 버튼이 ClassPicker의 통제 줄(사용자 요청)에 있어서,
  // 여기서 불러온/바뀐 학생 목록을 부모에게도 알려준다.
  onStudentsChange: (students: Student[] | null) => void
}) {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [dates, setDates] = useState<DateRecord[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    onStudentsChange(students)
  }, [students, onStudentsChange])

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

  async function handleDeleteDate(dateRecord: DateRecord) {
    if (!confirm(`${dateLabel(dates ?? [], dateRecord)} 수업 날짜를 지울까요? 그날의 참여 기록도 함께 지워지고 되돌릴 수 없습니다.`))
      return
    try {
      await deleteDate(classMeta.id, dateRecord.id)
      setDates((prev) => (prev ?? []).filter((entry) => entry.id !== dateRecord.id))
    } catch (caught) {
      console.error('수업 날짜 삭제 실패', caught)
      alert('삭제하지 못했습니다. 다시 시도해 주세요.')
    }
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
      {/* "+ 학생추가" 토글 버튼 자체는 반 삭제 옆(ClassPicker의 통제 줄)에
          있다(사용자 요청) — 여기서는 그 상태(showStudentAdd)를 부모에게서
          받아 패널만 그린다. */}
      {showStudentAdd && (
        <StudentAddPanel classId={classMeta.id} onAdded={handleStudentAdded} onBulkAdded={handleStudentsBulkAdded} />
      )}

      {students.length === 0 ? (
        <p className="text-sm text-ink-500">학생이 없습니다. "+ 학생추가"로 추가해 주세요.</p>
      ) : (
        <>
          <DateSummary students={students} dates={dates} />
          <NewDatePanel classId={classMeta.id} studentIds={students.map((entry) => entry.id)} onCreated={handleDateCreated} />
          <RecordTable
            students={students}
            dates={dates}
            onDelete={handleDeleteStudent}
            onToggle={handleToggle}
            onDeleteDate={handleDeleteDate}
          />
        </>
      )}

      <ClassMemo classId={classMeta.id} memo={classMeta.memo ?? ''} />
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
      // 중복 학번처럼 사용자가 바로 이해할 수 있는 메시지는 addStudent가 직접
      // 던진 것 그대로 보여준다 — 그 외(권한 오류 등)는 뭉뚱그린 안내로 충분하다.
      const message =
        caught instanceof Error && caught.message.startsWith('이미 있는 학번')
          ? caught.message
          : '추가하지 못했습니다. 다시 시도해 주세요.'
      alert(message)
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

/**
 * 블록타임 수업처럼 같은 날짜로 수업 기록을 두 번 이상 만든 경우(classRecords.ts
 * 머리말 참고), 컬럼 헤더가 전부 "8/26"으로만 보이면 어느 게 1교시고 어느 게
 * 2교시인지 구분이 안 된다 — 같은 날짜가 여럿일 때만 만든 순서대로 "-1", "-2"를
 * 붙인다. dates가 이미 date asc, createdAt asc로 정렬돼 있다는 전제(listDates,
 * handleDateCreated의 append 순서)로 filter 결과 순서를 그대로 쓴다.
 */
function dateLabel(dates: DateRecord[], target: DateRecord): string {
  const sameDate = dates.filter((entry) => entry.date === target.date)
  if (sameDate.length <= 1) return formatDateShort(target.date)
  const index = sameDate.findIndex((entry) => entry.id === target.id)
  return `${formatDateShort(target.date)}-${index + 1}`
}

/** 가장 최근 날짜를 기준으로 요약한다 — "오늘 막 만든 기록 현황"을 보고 싶을
 *  때가 대부분이라, 날짜를 따로 선택하게 하지 않고 자동으로 마지막 컬럼을
 *  보여준다. */
function DateSummary({ students, dates }: { students: Student[]; dates: DateRecord[] }) {
  if (dates.length === 0) {
    // 날짜가 하나도 없어도 학생 수는 보여준다 — 안 그러면 학생을 추가해도
    // "제대로 저장됐는지" 확인할 방법이 화면에 전혀 없다(실제로 이것 때문에
    // "추가가 안 된다"는 문의를 받았다 — Firestore엔 정상 저장돼 있었다).
    return (
      <p className="text-sm text-ink-500">
        학생 {students.length}명. 아직 수업 날짜가 없습니다. 아래에서 날짜를 추가해 주세요.
      </p>
    )
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
  onDeleteDate,
}: {
  students: Student[]
  dates: DateRecord[]
  onDelete: (student: Student) => void
  onToggle: (dateId: string, studentId: string, next: boolean) => void
  onDeleteDate: (dateRecord: DateRecord) => void
}) {
  // 날짜가 없어도 표 자체(순서·학번·이름)는 그린다 — 이전엔 여기서 통째로
  // null을 반환해서, 학생을 추가해도 날짜가 하나도 없으면 화면에 아무것도 안
  // 보였다(DateSummary 주석 참고, 실제 사용자 문의로 발견). 날짜 컬럼은
  // dates.map(...)이 그대로 빈 배열을 돌기만 하면 되므로 따로 분기할 필요가
  // 없다.
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
                <div className="flex items-center justify-center gap-1">
                  <span>{dateLabel(dates, entry)}</span>
                  <button
                    onClick={() => onDeleteDate(entry)}
                    aria-label={`${dateLabel(dates, entry)} 날짜 삭제`}
                    className="shrink-0 rounded px-1 font-normal text-ink-400 transition-colors hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
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
                      aria-label={`${student.name} ${dateLabel(dates, dateRecord)} ${
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

/** 반 전체에 대한 자유 메모(사용자 요청) — 특정 학생·날짜에 매이지 않는
 *  일반 메모라 기록 표 맨 아래에 둔다. 포커스를 벗어날 때 저장한다(교시
 *  시간 입력과 같은 패턴). ClassRoster가 classMeta.id를 key로 반마다
 *  새로 마운트되므로, 반을 바꾸면 이 컴포넌트도 다시 만들어져 그 반의
 *  메모로 자연히 초기화된다 — 별도 useEffect 리셋이 필요 없다. */
function ClassMemo({ classId, memo }: { classId: string; memo: string }) {
  const [value, setValue] = useState(memo)
  const [busy, setBusy] = useState(false)
  const lastSavedRef = useRef(memo)

  async function handleBlur() {
    if (value === lastSavedRef.current) return
    setBusy(true)
    try {
      await setClassMemo(classId, value)
      lastSavedRef.current = value
    } catch (caught) {
      console.error('메모 저장 실패', caught)
      alert('메모를 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink-700">메모</span>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        placeholder="이 반에 대한 메모를 자유롭게 적어두세요."
        rows={3}
        disabled={busy}
        className="rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm text-ink-900 disabled:opacity-60"
      />
    </div>
  )
}
