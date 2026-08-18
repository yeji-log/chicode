import { useEffect, type ReactNode } from 'react'

/**
 * 풋터의 개인정보처리방침·이용약관을 여는 팝업.
 *
 * Materials.tsx 의 자료 뷰어와 같은 모달 패턴(오버레이 + 중앙 카드 + Escape 닫기)을
 * 그대로 따른다 — 사이트 안에 모달이 두 가지 다른 방식으로 보이지 않도록.
 */
export default function PolicyModal({
  title,
  effectiveDate,
  onClose,
  children,
}: {
  title: string
  effectiveDate?: string
  onClose: () => void
  children: ReactNode
}) {
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
        className="flex h-full max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-cream-deep px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="font-display text-lg text-ink-900">{title}</h2>
            {effectiveDate && <p className="text-xs text-ink-500">{effectiveDate} 시행</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300"
          >
            닫기
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-5 sm:px-8 sm:py-6">{children}</div>
      </div>
    </div>
  )
}
