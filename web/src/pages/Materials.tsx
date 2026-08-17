import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import PdfViewer from '../components/PdfViewer'
import {
  type MaterialMeta,
  formatDate,
  formatSize,
  getMaterialFile,
  kindOf,
  listMaterials,
} from '../lib/materials'

export default function Materials() {
  const [materials, setMaterials] = useState<MaterialMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MaterialMeta | null>(null)

  useEffect(() => {
    listMaterials()
      .then(setMaterials)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">수업자료</h1>
        <p className="text-sm text-ink-500">
          선생님이 올린 자료를 열어보고 내려받을 수 있습니다.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : materials.length === 0 ? (
        <EmptyState />
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center">
      <p className="text-4xl">📭</p>
      <p className="mt-3 font-bold text-ink-900">아직 올라온 자료가 없습니다.</p>
      <p className="mt-1 text-sm text-ink-500">
        선생님은{' '}
        <Link to="/teacher" className="font-semibold text-cheese-600 underline">
          교사 페이지
        </Link>
        에서 자료를 올릴 수 있습니다.
      </p>
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
