import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { listActivities, listSeasons, type LabActivity, type LabSeason } from '../lib/labs'

/**
 * /lab/activities — 활동 목록.
 *
 * 탭은 고정 카테고리가 아니라 교사가 만든 시즌 목록을 그대로 불러와서 만든다
 * (lib/labs.ts 상단 설명 참고 — 로드맵이 곧 이 탭의 출처다).
 * ?season= 으로 초기 필터를 받는다 (Roadmap 카드에서 넘어옴).
 */
export default function LabActivities() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSeasonId = searchParams.get('season') ?? ''

  const [seasons, setSeasons] = useState<LabSeason[]>([])
  const [activities, setActivities] = useState<LabActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listSeasons().then(setSeasons)
  }, [])

  useEffect(() => {
    setLoading(true)
    listActivities({ publishedOnly: true, seasonId: activeSeasonId || undefined })
      .then(setActivities)
      .finally(() => setLoading(false))
  }, [activeSeasonId])

  function selectSeason(id: string) {
    setSearchParams(id ? { season: id } : {})
  }

  const seasonTitle = (seasonId: string) =>
    seasons.find((season) => season.id === seasonId)?.title ?? ''

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link to="/lab" className="text-sm font-semibold text-ink-500 underline">
          ← Lab 홈
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">활동</h1>
      </header>

      {seasons.length > 0 && (
        <nav className="flex flex-wrap gap-2">
          <button onClick={() => selectSeason('')} className={tabClass(activeSeasonId === '')}>
            전체
          </button>
          {seasons.map((season) => (
            <button
              key={season.id}
              onClick={() => selectSeason(season.id)}
              className={tabClass(activeSeasonId === season.id)}
            >
              {season.emoji} {season.title}
            </button>
          ))}
        </nav>
      )}

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : activities.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 공개된 활동이 없습니다.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                to={`/lab/activities/${activity.id}`}
                className="flex h-full flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-5 transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md"
              >
                {activity.seasonId && seasonTitle(activity.seasonId) && (
                  <span className="text-xs font-semibold text-cheese-600">
                    {seasonTitle(activity.seasonId)}
                  </span>
                )}
                <h2 className="font-bold text-ink-900">{activity.title}</h2>
                {activity.goal && (
                  <p className="line-clamp-2 text-sm text-ink-700">{activity.goal}</p>
                )}
                <span className="mt-auto pt-2 text-xs text-ink-500">
                  {difficultyStars(activity.difficulty)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function difficultyStars(difficulty: number): string {
  const filled = Math.max(0, Math.min(5, difficulty))
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}

function tabClass(active: boolean): string {
  return [
    'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
    active
      ? 'bg-cheese-400 text-ink-900'
      : 'border border-cream-deep text-ink-700 hover:border-cheese-300',
  ].join(' ')
}
