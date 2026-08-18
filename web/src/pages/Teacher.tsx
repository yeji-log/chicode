import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import ToggleSwitch from '../components/ToggleSwitch'
import { asset } from '../lib/asset'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  type MaterialMeta,
  MaterialValidationError,
  addMaterial,
  deleteMaterial,
  formatDate,
  formatSize,
  listMaterials,
} from '../lib/materials'
import { listSubjects, updateSubject, type SubjectMeta } from '../lib/subjects'
import TeacherLab from './TeacherLab'
import TeacherNews from './TeacherNews'

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
  const [section, setSection] = useState<'materials' | 'lab' | 'news'>('materials')

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
      </nav>

      {section === 'materials' && <MaterialsSection uploaderEmail={user?.email ?? ''} />}
      {section === 'lab' && <TeacherLab uploaderEmail={user?.email ?? ''} />}
      {section === 'news' && <TeacherNews teacherEmail={user?.email ?? ''} />}
    </div>
  )
}

function MaterialsSection({ uploaderEmail }: { uploaderEmail: string }) {
  const [subjects, setSubjects] = useState<SubjectMeta[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null)

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

  if (loadingSubjects) return <p className="text-ink-500">과목을 불러오는 중…</p>

  if (subjects.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
        아직 등록된 과목이 없습니다. Firebase 콘솔에서 subjects 컬렉션에 과목 문서를 먼저
        만들어 주세요.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2">
        {subjects.map((subject) => (
          <button
            key={subject.id}
            onClick={() => setActiveSubjectId(subject.id)}
            className={[
              'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
              subject.id === activeSubjectId
                ? 'bg-cheese-400 text-ink-900'
                : 'border border-cream-deep text-ink-700 hover:border-cheese-300',
            ].join(' ')}
          >
            {subject.name}
          </button>
        ))}
      </nav>

      {activeSubject && (
        <SubjectPanel
          key={activeSubject.id}
          subject={activeSubject}
          uploaderEmail={uploaderEmail}
          onSubjectChange={(patch) => handleSubjectUpdate(activeSubject.id, patch)}
        />
      )}
    </div>
  )
}

function SubjectPanel({
  subject,
  uploaderEmail,
  onSubjectChange,
}: {
  subject: SubjectMeta
  uploaderEmail: string
  onSubjectChange: (patch: Partial<SubjectMeta>) => void
}) {
  const [materials, setMaterials] = useState<MaterialMeta[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="flex flex-col gap-6">
      <SubjectSettings subject={subject} onChange={onSubjectChange} />

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
    </div>
  )
}

function SubjectSettings({
  subject,
  onChange,
}: {
  subject: SubjectMeta
  onChange: (patch: Partial<SubjectMeta>) => void
}) {
  const [pin, setPin] = useState(subject.pin)
  const [notionUrl, setNotionUrl] = useState(subject.notionUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // 핀 없이 접속 허용은 "설정 저장" 폼과 별개로 즉시 반영한다 — 수업 중에
  // 눌러서 바로 효과가 나야 의미가 있는 스위치라, 핀·노션 링크 저장까지
  // 같이 기다리게 하고 싶지 않았다(TeacherLab.tsx 의 활동 공개 토글과 같은
  // 이유의 낙관적 업데이트).
  const [bypassEnabled, setBypassEnabled] = useState(subject.pinRequired === false)
  const [bypassBusy, setBypassBusy] = useState(false)

  useEffect(() => {
    setBypassEnabled(subject.pinRequired === false)
  }, [subject.pinRequired])

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
      const patch = { pin: trimmedPin, notionUrl: notionUrl.trim() }
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
      <h2 className="font-bold text-ink-900">{subject.name} 설정</h2>

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

      <div className="grid gap-4 sm:grid-cols-2">
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">{children}</div>
  )
}

function GoogleMark() {
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
