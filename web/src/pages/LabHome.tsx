import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import FeatureCard from '../components/FeatureCard'
import { asset } from '../lib/asset'
import { getActivity, getHomeSettings, type LabActivity, type LabHomeSettings } from '../lib/labs'

/**
 * Lab 첫 화면 (/lab). 설계안 3절 "대시보드" 형태를 최소한으로 구현한다 —
 * 진행률 바는 계산 근거가 없어 Phase 1 에서는 뺐다(작업 로그 참고).
 */
export default function LabHome() {
  const [settings, setSettings] = useState<LabHomeSettings | null>(null)
  const [featured, setFeatured] = useState<LabActivity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHomeSettings()
      .then(async (loaded) => {
        setSettings(loaded)
        if (loaded.featuredActivityId) {
          setFeatured(await getActivity(loaded.featuredActivityId))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-10 py-4">
      <section className="flex flex-col items-start gap-4">
        <img
          src={asset('chicode.png')}
          alt=""
          className="size-14 rounded-full ring-2 ring-cheese-300"
        />
        <h1 className="font-display text-3xl tracking-tight text-ink-900">EMBED-LAB</h1>
        <p className="text-ink-700">배우고, 만들고, 실험하다.</p>
      </section>

      {!loading && settings?.todayMissionText && (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-cream-deep bg-white/70 p-6">
          <span className="rounded-full bg-cheese-100 px-3 py-1 text-xs font-semibold text-cheese-600">
            TODAY&apos;S MISSION
          </span>
          <p className="whitespace-pre-wrap text-ink-900">{settings.todayMissionText}</p>
          {featured && (
            <Link
              to={`/lab/activities/${featured.id}`}
              className="mt-1 rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300"
            >
              활동 이어가기 →
            </Link>
          )}
        </section>
      )}

      <section className="grid gap-5 sm:grid-cols-2">
        <FeatureCard to="/lab/roadmap" emoji="🗺️" title="Roadmap">
          지금까지 쌓아온 시즌을 순서대로
          <br />
          동아리 활동의 전체 여정을 확인해 보세요.
        </FeatureCard>
        <FeatureCard to="/lab/activities" emoji="🧪" title="활동">
          지금까지 진행한 활동 목록에서
          <br />
          자료와 Mission을 확인해 보세요.
        </FeatureCard>
      </section>
    </div>
  )
}
