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

  // 로드맵에서 "준비중" 시즌 카드를 눌러 여기로 왔을 수도 있다 — 그 경우
  // includePreparingSeason 을 켜서 활동을 숨기지 않고 미리보기로만 받는다
  // (아래 렌더링에서 링크를 안 걸어 실제로 들어가지는 못하게 막는다).
  useEffect(() => {
    setLoading(true)
    listActivities({
      publishedOnly: true,
      seasonId: activeSeasonId || undefined,
      includePreparingSeason: true,
    })
      .then(setActivities)
      .finally(() => setLoading(false))
  }, [activeSeasonId])

  const activeSeason = seasons.find((season) => season.id === activeSeasonId)
  const isPreparingSeason = activeSeason?.status === '준비중'

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

      {isPreparingSeason && !loading && activities.length > 0 && (
        <p className="rounded-xl bg-cream-deep/60 px-4 py-3 text-sm text-ink-500">
          🔒 아직 준비 중인 시즌이에요. 어떤 활동이 있는지만 미리 볼 수 있고, 열리면 들어갈 수
          있습니다.
        </p>
      )}

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : activities.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 공개된 활동이 없습니다.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) =>
            isPreparingSeason ? (
              // 준비중 시즌 — 어떤 활동이 있는지 제목만 미리 보여주고, 실제
              // 내용(본문 미리보기)은 공개 전이라 숨긴다. 링크를 아예 안 걸어서
              // 클릭해도 들어가지지 않는다(들어가더라도 LabActivityDetail이
              // seasonPreparing 검사로 다시 막는다 — 이중 방어).
              <li
                key={activity.id}
                className="flex h-full cursor-not-allowed flex-col gap-2 rounded-2xl border border-dashed border-cream-deep bg-white/40 p-5 opacity-70"
              >
                <h2 className="font-bold text-ink-900">{activity.title}</h2>
                <span className="mt-auto pt-2 text-xs font-semibold text-ink-500">
                  🔒 준비중
                </span>
              </li>
            ) : (
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
                  {/* 미리보기 한 줄 — 예전엔 "오늘의 목표" 필드였는데, 이제 항목
                      이름은 교사가 자유롭게 바꾸므로 순서상 첫 항목 내용을 쓴다. */}
                  {activity.sections[0]?.content && (
                    <p className="line-clamp-2 text-sm text-ink-700">
                      {activity.sections[0].content}
                    </p>
                  )}
                  <span className="mt-auto pt-2 text-xs text-ink-500">
                    {difficultyStars(activity.difficulty)}
                  </span>
                </Link>
              </li>
            ),
          )}
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
