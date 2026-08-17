import type { ReactNode } from 'react'

/**
 * "무엇이 안 되나요?" 접이식 안내.
 * 기본은 접혀 있다 — 실습 화면을 처음 열었을 때 편집기가 바로 눈에 들어와야 하고,
 * 제한사항은 궁금한 사람만 펼쳐 보면 된다.
 */
export default function SupportNote({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-xl border border-cream-deep bg-white/60 open:bg-cheese-50/60">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-ink-700 select-none hover:text-ink-900">
        <span className="text-cheese-600">ⓘ</span>
        무엇이 안 되나요?
      </summary>
      <ul className="list-disc space-y-1 px-4 pt-1 pb-3 pl-9 text-sm text-ink-500">{children}</ul>
    </details>
  )
}
