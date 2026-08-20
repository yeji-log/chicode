import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import OtPresentationPanel from '../components/OtPresentationPanel'
import ToggleSwitch from '../components/ToggleSwitch'
import { asset } from '../lib/asset'
import { isFirebaseConfigured } from '../lib/firebase'
import { deleteActivity, listActivities, listSeasons, deleteSeason } from '../lib/labs'
import {
  type MaterialMeta,
  MaterialValidationError,
  addMaterial,
  deleteMaterial,
  formatDate,
  formatSize,
  listMaterials,
} from '../lib/materials'
import { getPicoPracticeSettings, setPicoOpen } from '../lib/practiceSettings'
import {
  createSubject,
  deleteSubject,
  listSubjects,
  reorderSubjects,
  updateSubject,
  type SubjectMeta,
} from '../lib/subjects'
import { ActivitiesPanel, SeasonsPanel } from './LabBoardEditor'
import { OtFrame } from './SubjectMaterials'
import TeacherLab from './TeacherLab'
import TeacherNews from './TeacherNews'

/** SubjectPanel의 "수업목차" 탭에서 쓰는 명사 — Lab의 시즌/활동에 대응하되
 *  수업자료 맥락에 맞게 이름만 바꿨다(사용자 요청). */
const SUBJECT_OUTLINE_LABELS = { seasonNoun: '수업목차', activityNoun: '내용' }

export default function Teacher() {
  const { user, state, error, signIn, signOutTeacher } = useAuth()

  if (!isFirebaseConfigured) {
    return (
      <Centered>
        <h1 className="text-xl font-extrabold text-ink-900">Firebase 설정이 없습니다</h1>
        <p className="text-sm text-ink-700">
          <code className="rounded bg-cream-deep px-1.5 py-0.5">web/.env.local</code> 에 설정값을
          넣고 개발 서버를 다시 시작해 주세요. 예시는{' '}
          <code className="rounded bg-cream-deep px-1.5 py-0.5">.env.example</code> 에 있습니다.
        </p>
      </Centered>
    )
  }

  if (state === 'loading') {
    return (
      <Centered>
        <p className="text-ink-500">확인 중…</p>
      </Centered>
    )
  }

  if (state === 'anonymous') {
    return (
      <Centered>
        <img
          src={asset('chicode.png')}
          alt=""
          className="size-20 rounded-full ring-2 ring-cheese-300"
        />
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">교사 로그인</h1>
        <p className="max-w-sm text-sm text-ink-700">
          허용된 교사 계정만 들어올 수 있습니다. 학생은 로그인 없이{' '}
          <Link to="/materials" className="font-semibold text-cheese-600 underline">
            수업자료
          </Link>
          와 Python 실습을 이용합니다.
        </p>

        <button
          onClick={signIn}
          className="mt-2 flex items-center gap-2.5 rounded-xl border border-cream-deep bg-white px-5 py-3 font-bold text-ink-900 shadow-sm transition-colors hover:border-cheese-300"
        >
          <GoogleMark />
          Google 계정으로 로그인
        </button>

        {error && <p className="max-w-sm text-sm text-red-700">{error}</p>}
      </Centered>
    )
  }

  if (state === 'not-allowed') {
    return (
      <Centered>
        <span className="text-4xl">🚫</span>
        <h1 className="text-xl font-extrabold text-ink-900">접근 권한이 없습니다</h1>
        <p className="max-w-sm text-sm text-ink-700">
          <strong className="font-semibold">{user?.email}</strong> 은(는) 허용된 교사 계정이
          아닙니다. 다른 계정으로 로그인하거나 관리자에게 등록을 요청해 주세요.
        </p>
        <button
          onClick={signOutTeacher}
          className="rounded-xl border border-cream-deep px-4 py-2.5 font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          로그아웃
        </button>
      </Centered>
    )
  }

  return <TeacherDashboard />
}

function TeacherDashboard() {
  const { user, signOutTeacher } = useAuth()
  const [section, setSection] = useState<'materials' | 'lab' | 'news' | 'practice'>('materials')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">교사 페이지</h1>
          <p className="text-sm text-ink-500">수업자료와 Lab 활동을 올리고 관리합니다.</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-ink-700">{user?.email}</span>
          <button
            onClick={signOutTeacher}
            className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
          >
            로그아웃
          </button>
        </div>
      </header>

      <nav className="flex gap-2 border-b border-cream-deep pb-3">
        <button
          onClick={() => setSection('materials')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            section === 'materials'
              ? 'bg-cheese-400 text-ink-900'
              : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          📚 수업자료
        </button>
        <button
          onClick={() => setSection('lab')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            section === 'lab' ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          🧪 Lab
        </button>
        <button
          onClick={() => setSection('news')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            section === 'news' ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          🔥 오늘의 뉴스
        </button>
        <button
          onClick={() => setSection('practice')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            section === 'practice' ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          🔌 실습
        </button>
      </nav>

      {section === 'materials' && <MaterialsSection uploaderEmail={user?.email ?? ''} />}
      {section === 'lab' && <TeacherLab uploaderEmail={user?.email ?? ''} />}
      {section === 'news' && <TeacherNews teacherEmail={user?.email ?? ''} />}
      {section === 'practice' && <PracticeSection />}
    </div>
  )
}

/**
 * 실습 탭 공개 설정. 지금은 Pico 2 W 하나뿐이다 — Python/C는 이미 다 만들어져서
 * 잠글 이유가 없다(사용자 요청). SubjectSettings 의 "학생에게 공개" 카드와
 * 같은 모양(낙관적 업데이트 + 실패 시 롤백)으로 맞췄다.
 */
function PracticeSection() {
  const [open, setOpen] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    getPicoPracticeSettings()
      .then((settings) => setOpen(settings.open))
      .catch((caught) => {
        console.error('Pico 공개 설정 불러오기 실패', caught)
        setLoadError(true)
      })
  }, [])

  async function toggle() {
    if (open === null) return
    const next = !open
    setOpen(next)
    setBusy(true)
    try {
      await setPicoOpen(next)
    } catch (caught) {
      console.error('Pico 공개 설정 변경 실패', caught)
      setOpen(!next)
      alert('설정을 바꾸지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-bold text-ink-900">실습 공개 설정</h2>
        <p className="text-sm text-ink-500">
          Python/C 실습은 이미 열려 있습니다. 아래에서 켜고 끌 수 있는 건 Pico 2 W
          시뮬레이터뿐입니다.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          설정을 불러오지 못했습니다. 새로고침해 주세요.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-cream-deep bg-white/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink-900">🔌 Pico 2 W 시뮬레이터</p>
            <p className="text-xs text-ink-500">
              꺼두면 학생 화면에는 "준비 중"만 보이고 들어갈 수 없습니다(교사 계정은 이
              설정과 무관하게 항상 들어갈 수 있어요).
              <br />
              지금 상태:{' '}
              <strong className="font-semibold text-ink-700">
                {open === null ? '불러오는 중…' : open ? '✅ 학생도 볼 수 있음' : '🚧 준비중 (학생에게 비공개)'}
              </strong>
            </p>
          </div>
          <ToggleSwitch
            checked={open === true}
            disabled={open === null || busy}
            onChange={toggle}
            label="Pico 2 W 시뮬레이터 학생 공개 여부"
          />
        </div>
      )}
    </div>
  )
}

function MaterialsSection({ uploaderEmail }: { uploaderEmail: string }) {
  const [subjects, setSubjects] = useState<SubjectMeta[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    listSubjects()
      .then((list) => {
        setSubjects(list)
        setActiveSubjectId((current) => current ?? list[0]?.id ?? null)
      })
      .finally(() => setLoadingSubjects(false))
  }, [])

  const activeSubject = subjects.find((subject) => subject.id === activeSubjectId) ?? null

  function handleSubjectUpdate(subjectId: string, patch: Partial<SubjectMeta>) {
    setSubjects((list) =>
      list.map((subject) => (subject.id === subjectId ? { ...subject, ...patch } : subject)),
    )
  }

  function handleSubjectCreated(subject: SubjectMeta) {
    setSubjects((list) => [...list, subject])
    setActiveSubjectId(subject.id)
    setShowAddForm(false)
  }

  function handleSubjectDeleted(subjectId: string) {
    setSubjects((list) => {
      const remaining = list.filter((subject) => subject.id !== subjectId)
      setActiveSubjectId((current) =>
        current === subjectId ? (remaining[0]?.id ?? null) : current,
      )
      return remaining
    })
  }

  // 과목 탭도 LabBoardEditor.tsx 의 섹션 드래그 정렬과 같은 @dnd-kit 조합을
  // 쓴다 — PointerSensor 에 activationConstraint(distance 4)를 줘서 살짝만
  // 눌렀다 떼는 보통의 "탭 클릭"과 실제 드래그를 구분한다(그래서 버튼 자체를
  // 그대로 드래그 핸들로 써도 클릭 선택이 안 깨진다).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setSubjects((current) => {
      const oldIndex = current.findIndex((subject) => subject.id === active.id)
      const newIndex = current.findIndex((subject) => subject.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return current
      const reordered = arrayMove(current, oldIndex, newIndex)
      // 낙관적으로 화면 순서부터 바꾸고, 서버 저장은 뒤에서 조용히 진행한다 —
      // 실패해도 다음에 페이지를 새로고침하면 저장된(예전) 순서로 돌아오니
      // 별도 롤백 처리는 안 했다(드래그 정렬 실패는 거의 없고, 있어도 다시
      // 드래그하면 되는 가벼운 조작이라).
      reorderSubjects(reordered.map((subject) => subject.id)).catch((caught) => {
        console.error('과목 순서 저장 실패', caught)
        alert('과목 순서를 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.')
      })
      return reordered
    })
  }

  if (loadingSubjects) return <p className="text-ink-500">과목을 불러오는 중…</p>

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap items-center gap-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={subjects.map((subject) => subject.id)}
            strategy={horizontalListSortingStrategy}
          >
            {subjects.map((subject) => (
              <SortableSubjectTab
                key={subject.id}
                subject={subject}
                active={subject.id === activeSubjectId}
                onSelect={() => setActiveSubjectId(subject.id)}
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
          + 새 과목
        </button>
      </nav>

      {showAddForm && (
        <AddSubjectForm onCreated={handleSubjectCreated} onCancel={() => setShowAddForm(false)} />
      )}

      {subjects.length === 0 && !showAddForm && (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
          아직 등록된 과목이 없습니다. 위의 &quot;+ 새 과목&quot;으로 만들어 주세요.
        </p>
      )}

      {activeSubject && (
        <SubjectPanel
          key={activeSubject.id}
          subject={activeSubject}
          uploaderEmail={uploaderEmail}
          onSubjectChange={(patch) => handleSubjectUpdate(activeSubject.id, patch)}
          onSubjectDeleted={() => handleSubjectDeleted(activeSubject.id)}
        />
      )}
    </div>
  )
}

/** 드래그로 순서를 바꿀 수 있는 과목 탭 하나. 버튼 자체가 드래그 핸들이다 —
 *  섹션 편집기(SortableSectionRow)처럼 안에 다른 입력 요소가 없는 단순한
 *  탭이라 별도 손잡이(⠿)를 둘 필요가 없다. */
function SortableSubjectTab({
  subject,
  active,
  onSelect,
}: {
  subject: SubjectMeta
  active: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subject.id,
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
      {subject.name}
      {subject.published === false && (
        <span className="ml-1.5 text-xs font-semibold text-ink-500">🚧 준비중</span>
      )}
    </button>
  )
}

function AddSubjectForm({
  onCreated,
  onCancel,
}: {
  onCreated: (subject: SubjectMeta) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [notionUrl, setNotionUrl] = useState('')
  const [otUrl, setOtUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedPin = pin.trim()
    if (!trimmedName) {
      setError('과목 이름을 입력해 주세요.')
      return
    }
    if (!trimmedPin) {
      setError('핀번호를 입력해 주세요.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const subject = await createSubject({ name: trimmedName, pin: trimmedPin, notionUrl, otUrl })
      onCreated(subject)
    } catch (caught) {
      console.error('과목 만들기 실패', caught)
      setError('과목을 만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-cheese-300 bg-cheese-50/50 p-6"
    >
      <h2 className="font-bold text-ink-900">새 과목 만들기</h2>
      <p className="text-xs text-ink-500">
        새 과목은 처음엔 <strong className="font-semibold">🚧 준비중(학생에게 비공개)</strong>{' '}
        상태로 만들어집니다. 자료를 올리고 정리가 끝나면 과목 설정에서 공개로 바꿔 주세요.
        준비중인 동안에도 학생 화면 과목 목록에는 이름이 보이지만 들어갈 수는 없습니다.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          과목 이름
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            placeholder="예: 데이터베이스"
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          핀번호
          <input
            value={pin}
            onChange={(event) => {
              setPin(event.target.value)
              setError(null)
            }}
            placeholder="예: 1234"
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          노션 링크 (선택)
          <input
            value={notionUrl}
            onChange={(event) => setNotionUrl(event.target.value)}
            placeholder="https://www.notion.so/..."
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          OT 링크 (선택)
          <input
            value={otUrl}
            onChange={(event) => setOtUrl(event.target.value)}
            placeholder="https://..."
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '만드는 중…' : '과목 만들기'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-cream-deep px-5 py-2.5 font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          취소
        </button>
      </div>
    </form>
  )
}

function SubjectPanel({
  subject,
  uploaderEmail,
  onSubjectChange,
  onSubjectDeleted,
}: {
  subject: SubjectMeta
  uploaderEmail: string
  onSubjectChange: (patch: Partial<SubjectMeta>) => void
  onSubjectDeleted: () => void
}) {
  const [materials, setMaterials] = useState<MaterialMeta[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingSubject, setDeletingSubject] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // "자료"(기존 파일 업로드) / "수업목차"(Lab과 같은 시즌+활동 에디터, 이름만
  // 수업자료용으로 바꿈) 두 탭 — TeacherDashboard의 최상위 section 탭과 같은 자리 원칙.
  // 기본값은 수업목차 — 학생 화면(SubjectMaterials.tsx)도 과목에 들어가면
  // 자료보다 수업목차부터 보이게 되어 있어서, 교사 쪽도 같은 순서로 맞췄다.
  // "OT" 탭은 학생 화면과 달리 여기서만 별도로 노출한다 — 교사가 수업 시작
  // 전에 이 화면을 열어 프로젝터로 띄워놓고 진행하려는 용도. otUrl이 설정된
  // 과목에서만 탭이 보인다(SubjectSettings 아래 참고).
  const [panelTab, setPanelTab] = useState<'materials' | 'outline' | 'ot'>('outline')

  useEffect(() => {
    listMaterials(subject.id).then(setMaterials)
  }, [subject.id])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return

    setBusy(true)
    setUploadError(null)
    try {
      await addMaterial(file, {
        title,
        description,
        uploadedBy: uploaderEmail,
        subjectId: subject.id,
      })
      setMaterials(await listMaterials(subject.id))
      setTitle('')
      setDescription('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (caught) {
      setUploadError(
        caught instanceof MaterialValidationError
          ? caught.message
          : '업로드에 실패했습니다. 다시 시도해 주세요.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(material: MaterialMeta) {
    if (!confirm(`"${material.title}" 자료를 삭제할까요?`)) return
    await deleteMaterial(material.id)
    setMaterials(await listMaterials(subject.id))
  }

  async function handleDeleteSubject() {
    const countNote = materials.length > 0 ? ` (자료 ${materials.length}개도 함께 삭제됩니다)` : ''
    if (
      !confirm(
        `"${subject.name}" 과목을 삭제할까요?${countNote} 수업목차·내용도 함께 삭제됩니다. 되돌릴 수 없습니다.`,
      )
    )
      return

    setDeletingSubject(true)
    try {
      // 자료 → 내용(활동) → 수업목차(시즌) → 과목 문서 순으로 지운다 —
      // 과목 문서가 먼저 사라지면 학생 화면이 "존재하지 않는 과목"으로
      // 튕기긴 하지만, 지우다 중간에 실패했을 때 고아가 된 자료/내용이 이미
      // 사라진 과목에 매달려 안 보이는 상태보다는, 과목이 아직 남아있는 채
      // 일부만 지워진 상태가 다시 시도하기 쉽다. labSlides/labSectionFiles/
      // labPresentations 하위 문서까지는 안 지운다 — Lab 자체의
      // deleteActivity 도 그건 안 지우는 기존 한계라 여기서 새로 만드는
      // 문제가 아니다(labs.ts 참고).
      for (const material of materials) {
        await deleteMaterial(material.id)
      }
      const activities = await listActivities({ subjectId: subject.id })
      for (const activity of activities) {
        await deleteActivity(activity.id)
      }
      const seasons = await listSeasons({ subjectId: subject.id })
      for (const season of seasons) {
        await deleteSeason(season.id)
      }
      await deleteSubject(subject.id)
      onSubjectDeleted()
    } catch (caught) {
      console.error('과목 삭제 실패', caught)
      alert('과목을 삭제하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setDeletingSubject(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SubjectSettings
        subject={subject}
        onChange={onSubjectChange}
        onDelete={handleDeleteSubject}
        deleting={deletingSubject}
      />

      <nav className="flex gap-2 border-b border-cream-deep pb-3">
        {subject.otUrl && (
          <button
            onClick={() => setPanelTab('ot')}
            className={[
              'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
              panelTab === 'ot' ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
            ].join(' ')}
          >
            🙋 OT
          </button>
        )}
        <button
          onClick={() => setPanelTab('outline')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            panelTab === 'outline'
              ? 'bg-cheese-400 text-ink-900'
              : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          🗺️ 수업목차
        </button>
        <button
          onClick={() => setPanelTab('materials')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            panelTab === 'materials'
              ? 'bg-cheese-400 text-ink-900'
              : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          📎 자료
        </button>
      </nav>

      {panelTab === 'ot' && (
        <div className="flex flex-col gap-6">
          <OtFrame subject={subject} />
          <OtPresentationPanel subject={subject} onSubjectChange={onSubjectChange} />
        </div>
      )}

      {panelTab === 'materials' && (
        <>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6"
          >
            <h2 className="font-bold text-ink-900">{subject.name} 자료 올리기</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
                제목
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="비워두면 파일 이름을 사용합니다"
                  className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
                설명 (선택)
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="예: 3차시 반복문 수업자료"
                  className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
              파일
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.py,.zip"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                  setUploadError(null)
                }}
                className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 file:mr-3 file:rounded-md file:border-0 file:bg-cheese-200 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-ink-900"
              />
              <span className="text-xs font-normal text-ink-500">
                PDF, 이미지, 텍스트, ZIP · 최대 10MB
              </span>
            </label>

            {uploadError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadError}
              </p>
            )}

            <button
              type="submit"
              disabled={!file || busy}
              className="self-start rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? '올리는 중…' : '올리기'}
            </button>
          </form>

          <section className="flex flex-col gap-3">
            <h2 className="font-bold text-ink-900">
              {subject.name} 자료 ({materials.length})
            </h2>

            {materials.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
                아직 올린 자료가 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-cream-deep overflow-hidden rounded-2xl border border-cream-deep bg-white/70">
                {materials.map((material) => (
                  <li key={material.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">{material.title}</p>
                      <p className="truncate text-xs text-ink-500">
                        {material.filename} · {formatSize(material.size)} ·{' '}
                        {formatDate(material.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(material)}
                      className="ml-auto shrink-0 rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {panelTab === 'outline' && (
        <SubjectOutlineEditor subjectId={subject.id} uploaderEmail={uploaderEmail} />
      )}
    </div>
  )
}

/**
 * 과목의 "수업목차"(Lab의 시즌/로드맵에 대응) + "내용"(Lab의 활동에 대응)
 * 에디터 — LabBoardEditor.tsx 의 SeasonsPanel/ActivitiesPanel 을 subjectId 만
 * 넘겨서 그대로 재사용한다. TeacherLab.tsx 의 LAB_TABS 와 같은 서브탭 패턴.
 */
function SubjectOutlineEditor({
  subjectId,
  uploaderEmail,
}: {
  subjectId: string
  uploaderEmail: string
}) {
  const [tab, setTab] = useState<'season' | 'activity'>('season')

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab('season')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            tab === 'season'
              ? 'bg-cheese-400 text-ink-900'
              : 'border border-cream-deep text-ink-700 hover:border-cheese-300',
          ].join(' ')}
        >
          수업목차
        </button>
        <button
          onClick={() => setTab('activity')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            tab === 'activity'
              ? 'bg-cheese-400 text-ink-900'
              : 'border border-cream-deep text-ink-700 hover:border-cheese-300',
          ].join(' ')}
        >
          내용
        </button>
      </nav>

      {tab === 'season' && <SeasonsPanel subjectId={subjectId} labels={SUBJECT_OUTLINE_LABELS} />}
      {tab === 'activity' && (
        <ActivitiesPanel
          subjectId={subjectId}
          labels={SUBJECT_OUTLINE_LABELS}
          uploaderEmail={uploaderEmail}
        />
      )}
    </div>
  )
}

function SubjectSettings({
  subject,
  onChange,
  onDelete,
  deleting,
}: {
  subject: SubjectMeta
  onChange: (patch: Partial<SubjectMeta>) => void
  onDelete: () => void
  deleting: boolean
}) {
  const [pin, setPin] = useState(subject.pin)
  const [notionUrl, setNotionUrl] = useState(subject.notionUrl ?? '')
  const [otUrl, setOtUrl] = useState(subject.otUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // 핀 없이 접속 허용은 "설정 저장" 폼과 별개로 즉시 반영한다 — 수업 중에
  // 눌러서 바로 효과가 나야 의미가 있는 스위치라, 핀·노션 링크 저장까지
  // 같이 기다리게 하고 싶지 않았다(TeacherLab.tsx 의 활동 공개 토글과 같은
  // 이유의 낙관적 업데이트).
  const [bypassEnabled, setBypassEnabled] = useState(subject.pinRequired === false)
  const [bypassBusy, setBypassBusy] = useState(false)
  // 공개 여부도 같은 이유로 즉시 반영 — 준비가 끝나자마자 그 자리에서 켜고
  // 바로 학생 화면에서 확인해보고 싶을 때 저장 버튼까지 기다리게 하고 싶지
  // 않았다.
  const [published, setPublished] = useState(subject.published !== false)
  const [publishBusy, setPublishBusy] = useState(false)

  useEffect(() => {
    setBypassEnabled(subject.pinRequired === false)
  }, [subject.pinRequired])

  useEffect(() => {
    setPublished(subject.published !== false)
  }, [subject.published])

  async function toggleBypass() {
    const next = !bypassEnabled
    setBypassEnabled(next)
    setBypassBusy(true)
    try {
      await updateSubject(subject.id, { pinRequired: !next })
      onChange({ pinRequired: !next })
    } catch (caught) {
      console.error('핀 잠금 설정 변경 실패', caught)
      setBypassEnabled(!next)
      alert('설정을 바꾸지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBypassBusy(false)
    }
  }

  async function togglePublished() {
    const next = !published
    setPublished(next)
    setPublishBusy(true)
    try {
      await updateSubject(subject.id, { published: next })
      onChange({ published: next })
    } catch (caught) {
      console.error('과목 공개 설정 변경 실패', caught)
      setPublished(!next)
      alert('설정을 바꾸지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setPublishBusy(false)
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const trimmedPin = pin.trim()
    if (!trimmedPin) {
      setSaveError('핀번호는 비워둘 수 없습니다.')
      return
    }

    setBusy(true)
    setSaveError(null)
    try {
      const patch = { pin: trimmedPin, notionUrl: notionUrl.trim(), otUrl: otUrl.trim() }
      await updateSubject(subject.id, patch)
      onChange(patch)
      setSavedAt(Date.now())
    } catch (caught) {
      console.error('과목 설정 저장 실패', caught)
      setSaveError('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-ink-900">{subject.name} 설정</h2>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? '삭제 중…' : '과목 삭제'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-cream-deep bg-cream/40 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">학생에게 공개</p>
          <p className="text-xs text-ink-500">
            꺼두면 학생 과목 목록에 이름은 보이지만 눌러도 들어갈 수 없습니다(🚧 준비중). 자료를
            올리고 정리를 끝낸 뒤에 켜 주세요.
            <br />
            지금 상태:{' '}
            <strong className="font-semibold text-ink-700">
              {published ? '✅ 공개됨' : '🚧 준비중 (학생에게 비공개)'}
            </strong>
          </p>
        </div>
        <ToggleSwitch
          checked={published}
          disabled={publishBusy}
          onChange={togglePublished}
          label={`${subject.name} 학생 공개 여부`}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-cream-deep bg-cream/40 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">핀번호 없이 바로 접속 허용</p>
          <p className="text-xs text-ink-500">
            수업 중 핀번호를 잘못 불러줬거나 학생들이 계속 틀릴 때 잠깐 꺼두면, 학생이 핀
            입력 없이 바로 들어옵니다. 평소엔 켜져 있지 않은(핀 필요) 상태를 권장합니다.
            <br />
            지금 상태: <strong className="font-semibold text-ink-700">
              {bypassEnabled ? '🔓 핀 없이 접속 가능' : '🔒 핀 필요'}
            </strong>
          </p>
        </div>
        <ToggleSwitch
          checked={bypassEnabled}
          disabled={bypassBusy}
          onChange={toggleBypass}
          label={`${subject.name} 핀번호 없이 접속 허용`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          핀번호
          <input
            value={pin}
            onChange={(event) => {
              setPin(event.target.value)
              setSaveError(null)
            }}
            placeholder="예: 1234"
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          노션 링크 (선택)
          <input
            value={notionUrl}
            onChange={(event) => {
              setNotionUrl(event.target.value)
              setSaveError(null)
            }}
            placeholder="https://www.notion.so/..."
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          OT 링크 (선택)
          <input
            value={otUrl}
            onChange={(event) => {
              setOtUrl(event.target.value)
              setSaveError(null)
            }}
            placeholder="https://..."
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
          <span className="text-xs font-normal text-ink-500">
            학생 화면 OT 탭에 이 페이지를 화면 안에 그대로 띄웁니다. 비워두면 OT 탭이 안 보입니다.
          </span>
        </label>
      </div>

      {saveError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '저장 중…' : '설정 저장'}
        </button>
        {savedAt && <span className="text-sm text-ink-500">저장했습니다.</span>}
      </div>

      <p className="text-xs text-ink-500">
        학생은 이 핀번호를 입력해야 {subject.name} 자료를 볼 수 있습니다. 다만 진짜 보안 장치는
        아니므로, 정말 민감한 자료는 올리지 마세요.
      </p>
    </form>
  )
}

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">{children}</div>
  )
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
