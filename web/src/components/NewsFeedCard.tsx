import { CATEGORY_LABELS, formatRelativeTime, type NewsCandidate } from '../lib/news'

/**
 * `/news` 아래 칸 — 자동 수집 새소식 카드.
 *
 * NewsCard(교사 발행본)와 따로 둔 이유: 담는 내용이 다르다. 발행본에는 교사가 쓴
 * 요약과 "왜 중요한가"가 있고, 이쪽에는 RSS 발췌와 지역 태그가 있다. 한 컴포넌트에
 * 양쪽을 optional 로 우겨넣으면 "지금 무엇이 보이는 카드인가"가 흐려진다 —
 * 검증된 글과 자동 수집물의 구분은 화면에서 분명해야 한다.
 */
export default function NewsFeedCard({ item }: { item: NewsCandidate }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-fit rounded-full bg-cheese-100 px-2.5 py-1 text-xs font-bold text-cheese-600">
          {CATEGORY_LABELS[item.category]}
        </span>
        <span className="w-fit rounded-full bg-cream-deep px-2.5 py-1 text-xs font-semibold text-ink-700">
          {item.region}
        </span>
      </div>

      <h3 className="break-keep font-bold leading-snug text-ink-900">{item.title}</h3>

      {/*
        발췌는 RSS 원문이라 300자까지 온다(실측 평균 237자). 그대로 두면 카드 하나가
        화면을 다 먹어서 3줄에서 접는다 — 자르는 것이지 요약이 아니다(요약은 LLM 이
        필요하고 비용이 든다). 더 읽고 싶으면 아래 "원문 보기"로 간다.
        stripHtml(lib/news.ts)이 줄바꿈을 이미 공백으로 정리하므로 whitespace-pre-line 은 뺐다.
      */}
      {item.excerpt && (
        <p className="line-clamp-3 break-keep text-sm leading-relaxed text-ink-700">
          {item.excerpt}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-ink-500">
        <span>
          {formatRelativeTime(item.publishedAt)} · 출처: {item.sourceName}
          {item.sources && item.sources.length > 1 && ` 외 ${item.sources.length - 1}곳`}
        </span>
        <a
          href={item.sourceUrl}
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
