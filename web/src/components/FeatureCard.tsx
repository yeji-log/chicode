import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** 홈의 3분류 카드와 실습 선택 화면에서 함께 쓰는 카드. */
export default function FeatureCard({
  to,
  emoji,
  title,
  children,
}: {
  to: string
  emoji: string
  title: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6 transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md"
    >
      <span className="text-3xl">{emoji}</span>
      <h2 className="text-lg font-bold text-ink-900">{title}</h2>
      <p className="text-sm leading-relaxed text-ink-700">{children}</p>
      <span className="mt-auto pt-3 text-sm font-semibold text-cheese-600 opacity-0 transition-opacity group-hover:opacity-100">
        들어가기 →
      </span>
    </Link>
  )
}
