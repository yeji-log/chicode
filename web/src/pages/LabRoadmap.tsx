import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import FeatureCard from '../components/FeatureCard'
import { listSeasons, type LabSeason } from '../lib/labs'

const STATUS_STYLE: Record<LabSeason['status'], string> = {
  진행중: 'bg-cheese-200 text-ink-900',
  준비중: 'bg-cream-deep text-ink-500',
  완료: 'bg-ink-900/10 text-ink-700',
}

/**
 * /lab/roadmap — Season 카드 그리드.
 *
 * 설계안 4절은 화살표로 이어지는 세로 타임라인에 "Arduino → Pico 2 W → IoT →
 * AI → Project" 처럼 정해진 순서를 제안하지만, 그 다섯 단계를 앱에 미리
 * 박아두지 않는다 — 교사가 시즌을 만들 때마다 로드맵이 그만큼 채워지는
 * 구조라 고정된 이름표를 화면에 남겨두면 실제 시즌 구성과 어긋난다.
 * 새 시각 언어를 만드는 대신 Home/Practice 에서 이미 쓰는 FeatureCard
 * 그리드를 그대로 썼다.
 */
export default function LabRoadmap() {
  const [seasons, setSeasons] = useState<LabSeason[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listSeasons()
      .then(setSeasons)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link to="/lab" className="text-sm font-semibold text-ink-500 underline">
          ← Lab 홈
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Roadmap</h1>
        <p className="text-sm text-ink-500">동아리 활동이 진행되는 순서대로 쌓입니다.</p>
      </header>

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : seasons.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 등록된 시즌이 없습니다.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {seasons.map((season, index) => (
            <FeatureCard
              key={season.id}
              to={`/lab/activities?season=${season.id}`}
              emoji={season.emoji || '🧪'}
              title={`${String(index + 1).padStart(2, '0')} ${season.title}`}
            >
              <span
                className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[season.status]}`}
              >
                {season.status}
              </span>
              {season.description && <span className="block">{season.description}</span>}
            </FeatureCard>
          ))}
        </div>
      )}
    </div>
  )
}
