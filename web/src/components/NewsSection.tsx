import { useEffect, useState } from 'react'

import { isFirebaseConfigured } from '../lib/firebase'
import { CATEGORY_LABELS, formatRelativeTime, listPublishedNews, type NewsIssue } from '../lib/news'

/**
 * 홈 화면의 "오늘의 AI·IT 이슈" 섹션.
 *
 * 뉴스가 없거나(아직 교사가 하나도 발행 안 함) Firebase 설정이 없는 개발 환경이면
 * 조용히 아무것도 그리지 않는다 — 기존 홈 화면 레이아웃을 절대 깨면 안 되고, 이
 * 섹션은 있으면 좋은 보조 콘텐츠지 핵심 내비게이션이 아니기 때문이다.
 */
export default function NewsSection() {
  const [news, setNews] = useState<NewsIssue[] | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    listPublishedNews(5)
      .then(setNews)
      .catch((caught) => {
        console.error('오늘의 이슈를 불러오지 못했습니다', caught)
        setNews([])
      })
  }, [])

  if (!news || news.length === 0) return null

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-xl font-extrabold tracking-tight text-ink-900">🔥 오늘의 AI·IT 이슈</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {news.map((issue) => (
          <NewsCard key={issue.id} issue={issue} />
        ))}
      </div>
    </section>
  )
}

function NewsCard({ issue }: { issue: NewsIssue }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <span className="w-fit rounded-full bg-cheese-100 px-2.5 py-1 text-xs font-bold text-cheese-600">
        {CATEGORY_LABELS[issue.category]}
      </span>

      <h3 className="font-bold leading-snug text-ink-900">{issue.title}</h3>

      <p className="text-sm leading-relaxed text-ink-700">{issue.summary}</p>

      {issue.whyImportant && (
        <p className="text-sm leading-relaxed text-ink-700">
          <span className="font-semibold text-ink-900">왜 중요한가? </span>
          {issue.whyImportant}
        </p>
      )}

      {issue.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.keywords.map((keyword) => (
            <span key={keyword} className="text-xs font-semibold text-cheese-600">
              #{keyword}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-ink-500">
        <span>
          {formatRelativeTime(issue.issuedAt)} · 출처: {issue.sourceName}
        </span>
        <a
          href={issue.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 font-semibold text-cheese-600 underline underline-offset-2"
        >
          원문 보기 →
        </a>
      </div>
    </article>
  )
}
