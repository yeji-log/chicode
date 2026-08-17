import { useEffect, useRef, useState } from 'react'

import {
  type MaterialMeta,
  MaterialValidationError,
  addMaterial,
  deleteMaterial,
  formatDate,
  formatSize,
  listMaterials,
} from '../lib/materials'

export default function Teacher() {
  const [materials, setMaterials] = useState<MaterialMeta[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listMaterials().then(setMaterials)
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return

    setBusy(true)
    setError(null)
    try {
      await addMaterial(file, { title, description })
      setMaterials(await listMaterials())
      setTitle('')
      setDescription('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (caught) {
      setError(
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
    setMaterials(await listMaterials())
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">교사 페이지</h1>
        <p className="text-sm text-ink-500">수업자료를 올리고 관리합니다.</p>
      </header>

      {/* 실제 권한 검사는 백엔드에서 이뤄져야 한다. 지금은 아직 아무 보호도 없다는 점을
          화면에 그대로 적어 둔다 — 보호되는 것처럼 보이게 만들지 않는 편이 안전하다. */}
      <p className="rounded-xl border border-cheese-300 bg-cheese-50 px-4 py-3 text-sm text-ink-700">
        <strong className="font-bold">아직 로그인이 연결되지 않았습니다.</strong> 지금은 누구나
        이 화면에 들어올 수 있고, 올린 자료는 서버가 아니라 <strong>이 브라우저에만</strong>{' '}
        저장됩니다. Google 로그인과 서버 저장은 다음 단계에서 붙입니다.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6"
      >
        <h2 className="font-bold text-ink-900">자료 올리기</h2>

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
              setError(null)
            }}
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 file:mr-3 file:rounded-md file:border-0 file:bg-cheese-200 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-ink-900"
          />
          <span className="font-normal text-xs text-ink-500">
            PDF, 이미지, 텍스트, ZIP · 최대 50MB
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
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
        <h2 className="font-bold text-ink-900">올린 자료 ({materials.length})</h2>

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
