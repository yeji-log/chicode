import type { ReactNode } from 'react'

/** 정책 문서의 "제N조" 한 항목. 목록·표·강조가 섞여도 여백이 일정하게 유지된다. */
export default function PolicyArticle({
  num,
  title,
  children,
}: {
  num: string
  title: string
  children: ReactNode
}) {
  return (
    <article className="mb-6 last:mb-0">
      <h3 className="mb-2 flex items-baseline gap-2 text-[15px] font-bold text-ink-900">
        <span className="shrink-0 text-cheese-600">{num}</span>
        {title}
      </h3>
      <div
        className="space-y-2 text-sm leading-relaxed text-ink-700
          [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold
          [&_strong]:text-ink-900 [&_ul]:list-disc [&_ul]:pl-5"
      >
        {children}
      </div>
    </article>
  )
}
