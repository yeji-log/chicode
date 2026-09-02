import { Link } from 'react-router-dom'

import TodayTermCard from '../components/TodayTermCard'
import { TERMS, recentTerms, todayTerm } from '../lib/terms'

/**
 * 오늘의 용어 — 전체 목록 화면.
 *
 * 오늘 용어만 보려면 `/news` 아래쪽에 이미 같은 카드가 있다. 이 화면은 "지난 용어까지
 * 훑어보고 싶을 때" 들어오는 곳이라 목록을 더 길게 보여준다.
 * 데이터가 코드 안에 있어(lib/terms.ts) 네트워크도 로딩 상태도 없다.
 */
export default function Terms() {
  const term = todayTerm()
  const past = recentTerms(12)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">🧀 오늘의 AI·IT 용어</h1>
        <p className="text-sm text-ink-500">
          하루에 하나씩, AI와 컴퓨터를 이해하는 데 꼭 필요한 말을 짚어 봅니다.
        </p>
      </header>

      <TodayTermCard term={term} />

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-ink-900">지난 용어</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {past.map((item) => (
            <article
              key={item.term}
              className="flex flex-col gap-1.5 rounded-2xl border border-cream-deep bg-white/70 p-5"
            >
              <h3 className="break-keep font-bold text-ink-900">
                {item.term} <span className="text-xs font-medium text-ink-500">{item.reading}</span>
              </h3>
              <p className="break-keep text-sm leading-relaxed text-ink-700">{item.oneLine}</p>
            </article>
          ))}
        </div>
        <p className="text-xs text-ink-500">
          모두 {TERMS.length}개의 용어가 하루에 하나씩 차례로 나옵니다.
        </p>
      </section>

      <Link
        to="/news"
        className="text-sm font-semibold text-cheese-600 underline underline-offset-2"
      >
        ← AI·IT 새소식으로
      </Link>
    </div>
  )
}
