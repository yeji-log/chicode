import { CATEGORY_LABELS, formatRelativeTime, type NewsIssue } from '../lib/news'

/** `/news` 페이지에서 쓰는 뉴스 카드. 학생 홈 화면에는 카드를 안 그리고, 대신
 * "오늘의 AI·IT 이슈" 버튼을 눌러 이 페이지로 들어와야 보인다. */
export default function NewsCard({ issue }: { issue: NewsIssue }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <span className="w-fit rounded-full bg-cheese-100 px-2.5 py-1 text-xs font-bold text-cheese-600">
        {CATEGORY_LABELS[issue.category]}
      </span>

      <h3 className="font-bold leading-snug text-ink-900">{issue.title}</h3>

      <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{issue.summary}</p>

      {issue.whyImportant && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">
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
