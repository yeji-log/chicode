import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import PdfViewer from '../components/PdfViewer'
import {
  type MaterialMeta,
  formatDate,
  formatSize,
  getMaterialFile,
  kindOf,
  listMaterials,
} from '../lib/materials'
import { usePinAttemptThrottle } from '../lib/pinThrottle'
import { getSubject, isSubjectUnlocked, unlockSubject, type SubjectMeta } from '../lib/subjects'

/**
 * 과목별 수업자료 화면 (/materials/:subjectId).
 *
 * 핀을 통과하기 전에는 목록을 아예 그리지 않는다 — Firestore 규칙상 어차피 읽기가
 * 공개라 완전한 차단은 아니지만, 최소한 이 화면 자체는 핀 없이는 자료를 보여주지 않는다.
 *
 * 로그인한 교사는 핀을 몰라서가 아니라 매번 치는 게 번거로워서 건너뛴다 —
 * 자기 계정으로 이미 Google 로그인했다는 것 자체가 학생보다 강한 확인이다.
 */
export default function SubjectMaterials() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [subject, setSubject] = useState<SubjectMeta | null>(null)
  const [loadingSubject, setLoadingSubject] = useState(true)
  const [unlocked, setUnlocked] = useState(() => Boolean(subjectId && isSubjectUnlocked(subjectId)))

  useEffect(() => {
    if (!subjectId) return
    setLoadingSubject(true)
    getSubject(subjectId)
      .then(setSubject)
      .finally(() => setLoadingSubject(false))
  }, [subjectId])

  if (!subjectId) return null

  if (loadingSubject) {
    return <p className="text-ink-500">불러오는 중…</p>
  }

  if (!subject) {
    return (
      <div className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center">
        <p className="text-4xl">🤔</p>
        <p className="mt-3 font-bold text-ink-900">존재하지 않는 과목입니다.</p>
        <Link
          to="/materials"
          className="mt-2 inline-block text-sm font-semibold text-cheese-600 underline"
        >
          과목 목록으로 돌아가기
        </Link>
      </div>
    )
  }

  const pinRequired = subject.pinRequired !== false

  if (!unlocked && !isTeacherViewer && pinRequired) {
    return <PinGate subject={subject} onUnlock={() => setUnlocked(true)} />
  }

  return <MaterialsList subject={subject} isTeacherViewer={isTeacherViewer} />
}

function PinGate({ subject, onUnlock }: { subject: SubjectMeta; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  // 과목마다 독립적으로 세도록 subject.id 로 키를 나눈다 — pinThrottle.ts 설명 참고.
  const { isLocked, isBusy, remainingSeconds, recordFailure, reset } = usePinAttemptThrottle(
    `materials:${subject.id}`,
  )

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isLocked || isBusy) return
    if (pin.trim().length > 0 && pin.trim() === subject.pin) {
      reset()
      unlockSubject(subject.id)
      onUnlock()
    } else {
      recordFailure()
      setError('핀번호가 올바르지 않습니다.')
    }
  }

  const disabled = isLocked || isBusy

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <span className="text-4xl">🔒</span>
      <h1 className="text-xl font-extrabold text-ink-900">{subject.name}</h1>
      <p className="text-sm text-ink-500">선생님이 알려준 핀번호를 입력하세요.</p>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <input
          value={pin}
          onChange={(event) => {
            setPin(event.target.value)
            setError(null)
          }}
          inputMode="numeric"
          autoFocus
          disabled={disabled}
          placeholder="핀번호"
          className="rounded-lg border border-cream-deep bg-white px-3 py-2.5 text-center text-lg tracking-widest text-ink-900 focus:border-cheese-300 focus:outline-none disabled:opacity-50"
        />
        {isLocked ? (
          <p className="text-sm text-red-700">
            너무 많이 틀렸어요. {remainingSeconds}초 후 다시 시도해 주세요.
          </p>
        ) : (
          error && <p className="text-sm text-red-700">{error}</p>
        )}
        <button
          type="submit"
          disabled={disabled}
          className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          입장하기
        </button>
      </form>

      <Link to="/materials" className="text-sm font-semibold text-ink-500 underline">
        다른 과목 선택
      </Link>
    </div>
  )
}

function MaterialsList({
  subject,
  isTeacherViewer,
}: {
  subject: SubjectMeta
  isTeacherViewer: boolean
}) {
  const [materials, setMaterials] = useState<MaterialMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MaterialMeta | null>(null)

  useEffect(() => {
    listMaterials(subject.id)
      .then(setMaterials)
      .finally(() => setLoading(false))
  }, [subject.id])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <Link to="/materials" className="text-sm font-semibold text-ink-500 underline">
            ← 과목 목록
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{subject.name}</h1>
        </div>

        {isTeacherViewer && (
          // 교사만 보이는 표시 — 수업 중에 핀번호를 불러줄 때 교사 페이지까지
          // 안 가고 바로 여기서 읽을 수 있게. 학생에게는 절대 안 보인다
          // (isTeacherViewer 는 Firebase 로그인 상태로만 정해짐).
          <span className="rounded-lg border border-cheese-300 bg-cheese-50 px-3 py-1.5 text-sm font-semibold text-cheese-700">
            {subject.pinRequired === false
              ? '🔓 지금은 핀번호 없이 접속 가능'
              : `🔑 학생용 핀번호: ${subject.pin}`}
          </span>
        )}

        {subject.notionUrl && (
          <a
            href={subject.notionUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
          >
            📔 노션 페이지 열기
          </a>
        )}
      </header>

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : materials.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 올라온 자료가 없습니다.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((material) => (
            <li key={material.id}>
              <button
                onClick={() => setSelected(material)}
                className="flex h-full w-full flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md"
              >
                <span className="text-2xl">{iconFor(material)}</span>
                <h2 className="font-bold text-ink-900">{material.title}</h2>
                {material.description && (
                  <p className="line-clamp-2 text-sm text-ink-700">{material.description}</p>
                )}
                <p className="mt-auto pt-2 text-xs text-ink-500">
                  {formatDate(material.createdAt)} · {formatSize(material.size)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <Viewer material={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function iconFor(material: MaterialMeta): string {
  switch (kindOf(material)) {
    case 'pdf':
      return '📄'
    case 'image':
      return '🖼️'
    case 'text':
      return '📝'
    case 'archive':
      return '🗂️'
    default:
      return '📎'
  }
}

function Viewer({ material, onClose }: { material: MaterialMeta; onClose: () => void }) {
  const [file, setFile] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const kind = kindOf(material)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    getMaterialFile(material.id)
      .then(async (blob) => {
        if (!blob || cancelled) {
          if (!blob && !cancelled) setLoadError('자료를 찾을 수 없습니다.')
          return
        }
        if (kind === 'text') setText(await blob.text())
        objectUrl = URL.createObjectURL(blob)
        setFile(blob)
        setUrl(objectUrl)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('자료 불러오기 실패', caught)
        setLoadError('자료를 불러오지 못했습니다. 잠시 후 다시 열어주세요.')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [material.id, kind])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-cream-deep px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate font-bold text-ink-900">{material.title}</h2>
            <p className="truncate text-xs text-ink-500">
              {material.filename} · {formatSize(material.size)}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {url && (
              <a
                href={url}
                download={material.filename}
                className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 hover:bg-cheese-300"
              >
                다운로드
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300"
            >
              닫기
            </button>
          </div>
        </header>

        <div
          className={`flex-1 bg-cream/40 ${kind === 'pdf' ? 'overflow-hidden' : 'overflow-auto'}`}
        >
          {loadError ? (
            <p className="p-8 text-center text-ink-500">{loadError}</p>
          ) : !url || !file ? (
            <p className="p-8 text-center text-ink-500">불러오는 중…</p>
          ) : kind === 'pdf' ? (
            <PdfViewer file={file} filename={material.filename} />
          ) : kind === 'image' ? (
            <img src={url} alt={material.title} className="mx-auto max-h-full object-contain" />
          ) : kind === 'text' ? (
            <pre className="p-5 font-mono text-sm whitespace-pre-wrap text-ink-900">{text}</pre>
          ) : (
            <p className="p-8 text-center text-ink-500">
              이 형식은 미리보기를 지원하지 않습니다. 다운로드해서 열어주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
