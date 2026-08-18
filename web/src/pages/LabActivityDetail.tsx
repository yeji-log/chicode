import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getActivity, getSeason, type LabActivity } from '../lib/labs'

/** /lab/activities/:id — 설계안 5절 활동 페이지 템플릿. */
export default function LabActivityDetail() {
  const { id } = useParams<{ id: string }>()
  const [activity, setActivity] = useState<LabActivity | null>(null)
  const [seasonTitle, setSeasonTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getActivity(id)
      .then(async (loaded) => {
        setActivity(loaded)
        if (loaded?.seasonId) {
          const season = await getSeason(loaded.seasonId)
          setSeasonTitle(season?.title ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-ink-500">불러오는 중…</p>

  // published 가 아닌 활동은 직접 링크로 와도 "존재하지 않음" 취급한다 —
  // Firestore 규칙상 읽기는 공개라 완전한 차단은 아니지만, 화면은 안 보여준다.
  if (!activity || !activity.published) {
    return (
      <div className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center">
        <p className="text-4xl">🤔</p>
        <p className="mt-3 font-bold text-ink-900">존재하지 않는 활동입니다.</p>
        <Link
          to="/lab/activities"
          className="mt-2 inline-block text-sm font-semibold text-cheese-600 underline"
        >
          활동 목록으로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to="/lab/activities" className="text-sm font-semibold text-ink-500 underline">
          ← 활동 목록
        </Link>
        <div className="flex items-center gap-2">
          {seasonTitle && (
            <span className="rounded-full bg-cheese-100 px-2.5 py-0.5 text-xs font-semibold text-cheese-600">
              {seasonTitle}
            </span>
          )}
          <span className="text-xs text-ink-500">{difficultyStars(activity.difficulty)}</span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{activity.title}</h1>
      </header>

      <Section title="오늘의 목표">{activity.goal}</Section>
      <Section title="오늘 배울 것">{activity.learn}</Section>
      <Section title="준비물">{activity.prep}</Section>
      <Section title="회로">{activity.circuit}</Section>
      {activity.code && (
        <Section title="코드">
          <pre className="overflow-x-auto rounded-xl bg-ink-900 p-4 font-mono text-sm whitespace-pre-wrap text-cream">
            {activity.code}
          </pre>
        </Section>
      )}
      <Section title="실습">{activity.practice}</Section>
      <Section title="Mission">{activity.mission}</Section>
      <Section title="Challenge">{activity.challenge}</Section>

      {activity.materialUrl && (
        <a
          href={activity.materialUrl}
          target="_blank"
          rel="noreferrer"
          className="self-start rounded-xl border border-cream-deep px-5 py-2.5 font-bold text-ink-700 transition-colors hover:border-cheese-300"
        >
          📎 자료 열기
        </a>
      )}
    </div>
  )
}

function difficultyStars(difficulty: number): string {
  const filled = Math.max(0, Math.min(5, difficulty))
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const isEmptyText = typeof children === 'string' && children.trim() === ''
  if (!children || isEmptyText) return null

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <h2 className="font-bold text-ink-900">{title}</h2>
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink-700">{children}</div>
    </section>
  )
}
