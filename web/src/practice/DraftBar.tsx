import { useEffect, useRef, useState } from 'react'

import { showToast } from '../components/Toast'
import type { SavedDraft } from './draftStore'
import type { DraftContent, UseSharedDraft } from './useSharedDraft'

/**
 * 실습 헤더의 "보관함" 드롭다운 + "공유" 버튼. 세 실습(Python·C·Pico)이 그대로
 * 재사용한다 — 회로가 있고 없고는 getContent 가 흡수한다.
 */
export default function DraftBar({
  draft,
  getContent,
  onLoad,
  disabled,
}: {
  draft: UseSharedDraft
  /** 지금 에디터(+회로) 상태를 뽑아온다. */
  getContent: () => DraftContent
  /** 보관함 항목을 선택했을 때 — 페이지가 에디터/회로에 반영한다(백업은 이미 처리됨). */
  onLoad: (item: SavedDraft) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const handleSave = () => {
    draft.save(getContent(), name)
    setName('')
  }

  const handleShare = async () => {
    setOpen(false)
    const result = await draft.copyShareLink(getContent())
    setFallbackUrl(result.copied ? null : result.url)
  }

  const toggleOpen = () => {
    setFallbackUrl(null)
    setOpen((v) => !v)
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <button
        onClick={toggleOpen}
        disabled={disabled}
        className="rounded-lg border border-cream-deep bg-white/70 px-3 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        보관함{draft.saves.length > 0 ? ` (${draft.saves.length})` : ''} ▾
      </button>

      <button
        onClick={handleShare}
        disabled={disabled}
        title="링크 있는 사람은 누구나 이 코드를 볼 수 있어요"
        className="rounded-lg border border-cream-deep bg-white/70 px-3 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        공유
      </button>

      {fallbackUrl && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-xl border border-cream-deep bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-ink-500">
            복사가 막혀 있어요. 아래 링크를 길게 눌러 복사하세요.
          </p>
          <input
            readOnly
            value={fallbackUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-cream-deep bg-cream/50 px-2 py-1.5 font-mono text-xs text-ink-900"
          />
          <button
            onClick={() => setFallbackUrl(null)}
            className="mt-2 text-xs font-semibold text-ink-500 hover:text-ink-900"
          >
            닫기
          </button>
        </div>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-xl border border-cream-deep bg-white p-3 shadow-xl">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="이름 (비우면 날짜)"
              className="min-w-0 flex-1 rounded-lg border border-cream-deep bg-cream/50 px-2 py-1.5 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-cheese-300 focus:outline-none"
            />
            <button
              onClick={handleSave}
              className="shrink-0 rounded-lg bg-cheese-300 px-3 py-1.5 text-sm font-bold text-ink-900 hover:bg-cheese-200"
            >
              저장
            </button>
          </div>

          {draft.storageBlocked && (
            <p className="mt-2 text-xs text-red-600">
              이 브라우저에서는 저장이 안 돼요 (프라이빗 모드일 수 있어요).
            </p>
          )}

          <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-auto">
            {draft.saves.length === 0 && (
              <li className="px-1 py-2 text-sm text-ink-500">저장한 코드가 아직 없어요.</li>
            )}
            {draft.saves.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-cheese-50"
              >
                {renamingId === item.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        draft.rename(item.id, renameText)
                        setRenamingId(null)
                      }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => {
                      draft.rename(item.id, renameText)
                      setRenamingId(null)
                    }}
                    className="min-w-0 flex-1 rounded border border-cheese-300 bg-white px-1.5 py-1 text-sm text-ink-900 focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      onLoad(item)
                      setOpen(false)
                      showToast(`'${item.name}' 을(를) 불러왔어요`)
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink-700"
                    title={item.name}
                  >
                    {item.name}
                  </button>
                )}
                <button
                  onClick={() => {
                    setRenamingId(item.id)
                    setRenameText(item.name)
                  }}
                  className="shrink-0 rounded px-1.5 py-1 text-xs text-ink-500 hover:bg-cream hover:text-ink-900"
                  title="이름 바꾸기"
                >
                  ✎
                </button>
                <button
                  onClick={() => draft.remove(item.id)}
                  className="shrink-0 rounded px-1.5 py-1 text-xs text-ink-500 hover:bg-red-50 hover:text-red-600"
                  title="삭제"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
