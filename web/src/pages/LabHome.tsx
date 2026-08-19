import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import FeatureCard from '../components/FeatureCard'
import { asset } from '../lib/asset'
import { getActivity, getHomeSettings, type LabActivity, type LabHomeSettings } from '../lib/labs'

/**
 * Lab 첫 화면 (/lab). 설계안 3절 "대시보드" 형태를 최소한으로 구현한다 —
 * 진행률 바는 계산 근거가 없어 Phase 1 에서는 뺐다(작업 로그 참고).
 */
export default function LabHome() {
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [settings, setSettings] = useState<LabHomeSettings | null>(null)
  const [featuredActivities, setFeaturedActivities] = useState<LabActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHomeSettings()
      .then(async (loaded) => {
        setSettings(loaded)
        if (loaded.featuredActivityIds.length > 0) {
          const activities = await Promise.all(
            loaded.featuredActivityIds.map((id) => getActivity(id)),
          )
          // 강조로 지정된 뒤 삭제된 활동은 조용히 건너뛴다.
          setFeaturedActivities(activities.filter((activity): activity is LabActivity => !!activity))
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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl tracking-tight text-ink-900">EMBED-LAB</h1>
          {isTeacherViewer && settings?.pin && (
            // 교사만 보이는 표시 — SubjectMaterials.tsx 의 과목별 핀 배지와 같은 패턴.
            // 학생에게는 절대 안 보인다(isTeacherViewer 는 Firebase 로그인 상태로만 정해짐).
            <span className="rounded-lg border border-cheese-300 bg-cheese-50 px-3 py-1.5 text-sm font-semibold text-cheese-700">
              🔑 학생용 핀번호: {settings.pin}
            </span>
          )}
        </div>
        <p className="text-ink-700">배우고, 만들고, 실험하다.</p>
      </section>

      {!loading && settings?.todayMissionText && (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-cream-deep bg-white/70 p-6">
          <span className="rounded-full bg-cheese-100 px-3 py-1 text-xs font-semibold text-cheese-600">
            TODAY&apos;S MISSION
          </span>
          <p className="whitespace-pre-wrap text-ink-900">{settings.todayMissionText}</p>
          {featuredActivities.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {featuredActivities.map((activity) => (
                <Link
                  key={activity.id}
                  to={`/lab/activities/${activity.id}`}
                  className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300"
                >
                  {activity.title} 이어가기 →
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-5 sm:grid-cols-2">
        <FeatureCard to="/lab/roadmap" emoji="🗺️" title="Roadmap">
          지금까지 진행한 시즌을 순서대로
          <br />
          동아리 활동의 흐름을 확인해 보세요.
        </FeatureCard>
        <FeatureCard to="/lab/activities" emoji="🧪" title="활동">
          각 시즌에서 진행한 활동을
          <br />
          한눈에 확인해 보세요.
        </FeatureCard>
      </section>
    </div>
  )
}
