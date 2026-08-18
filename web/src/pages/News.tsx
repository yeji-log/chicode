import { useEffect, useState } from 'react'

import NewsCard from '../components/NewsCard'
import { isFirebaseConfigured } from '../lib/firebase'
import { listPublishedNews, type NewsIssue } from '../lib/news'

/**
 * 홈 화면 히어로의 "오늘의 AI·IT 이슈" 버튼을 누르면 오는 전용 페이지.
 *
 * 처음엔 홈 화면 아래쪽에 카드를 바로 그렸는데, 홈 화면을 계속 짧게 유지하고
 * 뉴스는 보고 싶을 때 들어가서 보게 해달라는 요청으로 이 페이지로 옮겼다
 * (NewsSection.tsx 는 삭제, 카드 UI는 components/NewsCard.tsx 로 뺐다).
 */
export default function News() {
  const [news, setNews] = useState<NewsIssue[] | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setNews([])
      return
    }
    listPublishedNews(20)
      .then(setNews)
      .catch((caught) => {
        console.error('오늘의 이슈를 불러오지 못했습니다', caught)
        setNews([])
      })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
          🔥 오늘의 AI·IT 이슈
        </h1>
        <p className="text-sm text-ink-500">
          AI·IT·과학·공학 분야에서 화제가 되는 소식을 교사가 골라 학생 눈높이로 정리했습니다.
        </p>
      </header>

      {news === null ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : news.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
          아직 발행된 이슈가 없습니다. 교사가 승인하면 여기에 나타납니다.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {news.map((issue) => (
            <NewsCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}
