import type { Term } from '../lib/terms'

/**
 * "오늘의 용어" 카드 하나.
 *
 * `/news` 아래쪽 칸과 `/terms` 전체 목록 화면에서 같은 모양을 써야 해서 컴포넌트로 뺐다.
 * 데이터는 lib/terms.ts 에 있고 네트워크를 타지 않으므로 로딩 상태가 없다.
 */
export default function TodayTermCard({ term, date = new Date() }: { term: Term; date?: Date }) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-7">
      <div className="flex items-baseline gap-3">
        <span className="rounded-full bg-cheese-100 px-2.5 py-1 text-xs font-bold text-cheese-600">
          오늘의 용어
        </span>
        <span className="text-xs text-ink-500">
          {date.getMonth() + 1}월 {date.getDate()}일
        </span>
      </div>

      <div>
        <h3 className="break-keep text-3xl font-extrabold text-ink-900">{term.term}</h3>
        <p className="text-sm text-ink-500">{term.reading}</p>
      </div>

      <p className="break-keep text-lg font-bold leading-snug text-ink-900">{term.oneLine}</p>

      <p className="break-keep text-sm leading-relaxed text-ink-700">{term.detail}</p>

      <p className="break-keep rounded-xl bg-cheese-50 px-4 py-3 text-sm leading-relaxed text-ink-700">
        <span className="font-bold text-ink-900">어디서 만나나? </span>
        {term.life}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {term.keywords.map((keyword) => (
          <span key={keyword} className="text-xs font-semibold text-cheese-600">
            #{keyword}
          </span>
        ))}
      </div>
    </article>
  )
}
