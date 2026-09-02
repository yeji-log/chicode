import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import NewsCard from '../components/NewsCard'
import NewsFeedCard from '../components/NewsFeedCard'
import TodayTermCard from '../components/TodayTermCard'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  STUDENT_VISIBLE_DAYS,
  listNewsFeed,
  listPublishedNews,
  type NewsCandidate,
  type NewsIssue,
} from '../lib/news'
import { todayTerm } from '../lib/terms'

/**
 * 홈 히어로의 "AI·IT 새소식" 버튼으로 들어오는 페이지. 세 칸이다:
 *
 *   ✏️ 선생님이 고른 이슈 — 교사가 골라 요약까지 쓴 것. 없으면 칸 자체가 안 나온다.
 *   (소제목 없음) 자동으로 모인 새소식 — 매일 자동으로 채워진다(이유는 lib/news.ts 머리말 참고).
 *   🧀 오늘의 용어 — 뉴스와 달리 네트워크를 안 타므로 위 두 칸이 다 실패해도 항상 뜬다.
 *
 * 용어를 여기 같이 둔 이유: 뉴스는 "오늘 뭐가 있었나"이고 용어는 "그걸 읽으려면 뭘
 * 알아야 하나"라서 같은 화면에서 이어 보는 게 자연스럽다. 전체 목록은 /terms 에 있다.
 */
export default function News() {
  const [issues, setIssues] = useState<NewsIssue[] | null>(null)
  const [feed, setFeed] = useState<NewsCandidate[] | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIssues([])
      setFeed([])
      return
    }

    // 두 칸은 서로 독립이다 — 한쪽이 실패해도 다른 쪽은 보여준다.
    listPublishedNews(20, { sinceDays: STUDENT_VISIBLE_DAYS })
      .then(setIssues)
      .catch((caught) => {
        console.error('선생님이 고른 이슈를 불러오지 못했습니다', caught)
        setIssues([])
      })

    listNewsFeed(12)
      .then(setFeed)
      .catch((caught) => {
        console.error('자동 수집 새소식을 불러오지 못했습니다', caught)
        setFeed([])
      })
  }, [])

  const loading = issues === null || feed === null

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">🔥 AI·IT 새소식</h1>
        <p className="text-sm text-ink-500">AI·IT·과학·공학 분야에서 화제가 되는 소식입니다.</p>
      </header>

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : (
        <>
          {issues.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-bold text-ink-900">✏️ 선생님이 고른 이슈</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {issues.map((issue) => (
                  <NewsCard key={issue.id} issue={issue} />
                ))}
              </div>
            </section>
          )}

          {/*
            소제목과 "자동 수집물" 안내 문구는 사용자 요청으로 뺐다(2026-09-02).
            카드마다 출처 이름과 "원문 보기" 링크가 그대로 있으므로 어디서 온 글인지는
            여전히 학생이 확인할 수 있다.
          */}
          <section className="flex flex-col gap-4">
            {feed.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
                아직 모인 새소식이 없습니다. 매일 아침 자동으로 수집됩니다.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {feed.map((item) => (
                  <NewsFeedCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/*
        용어 칸은 Firestore 를 안 타므로 위 두 칸의 로딩·실패와 무관하게 항상 그린다 —
        네트워크가 막힌 학교에서도 이 화면이 빈 채로 끝나지 않게 하는 안전판이다.
      */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-bold text-ink-900">🧀 오늘의 용어</h2>
          <p className="text-sm text-ink-500">
            소식을 읽으려면 알아야 하는 말을 하루에 하나씩 짚어 봅니다.
          </p>
        </div>

        <TodayTermCard term={todayTerm()} />

        <Link
          to="/terms"
          className="w-fit text-sm font-semibold text-cheese-600 underline underline-offset-2"
        >
          지난 용어 모두 보기 →
        </Link>
      </section>
    </div>
  )
}
