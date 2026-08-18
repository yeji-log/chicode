import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import CodeBlock from '../components/CodeBlock'
import LabPresentationOverlay from '../components/LabPresentationOverlay'
import LabPresenter from '../components/LabPresenter'
import PptxSlideViewer from '../components/PptxSlideViewer'
import {
  startPresentation,
  subscribePresentation,
  type LabPresentationState,
} from '../lib/labPresentation'
import { getActivity, getSeason, type LabActivity } from '../lib/labs'
import { getNotes, getSlidePdfFile, getSlidePptxFile, getSlideSet } from '../lib/labSlides'
import { linkify } from '../lib/linkify'

const IDLE_PRESENTATION: LabPresentationState = { active: false, currentSlide: 1, updatedAt: 0 }

/** /lab/activities/:id — 설계안 5절 활동 페이지 템플릿. */
export default function LabActivityDetail() {
  const { id } = useParams<{ id: string }>()
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'

  const [activity, setActivity] = useState<LabActivity | null>(null)
  const [seasonTitle, setSeasonTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [slideFiles, setSlideFiles] = useState<{ pptx: Blob | null; pdf: Blob | null } | null>(
    null,
  )
  const [notes, setNotes] = useState<string[]>([])
  const [presentation, setPresentation] = useState<LabPresentationState>(IDLE_PRESENTATION)
  /** 이 브라우저 탭에서 "발표 시작"을 눌러 지금 직접 조작 중인지. Firestore의
   *  active 플래그와 별개다 — 다른 기기가 이미 발표 중이면 이 탭은 false다. */
  const [isPresenting, setIsPresenting] = useState(false)

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

  // 발표자료(PPT/PDF)와 대본 — 대부분의 활동엔 없으므로 메타부터 확인하고,
  // 있을 때만 실제 파일 조각까지 읽어온다.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    getSlideSet(id).then(async (meta) => {
      if (!meta.pptx && !meta.pdf) {
        if (!cancelled) setSlideFiles(null)
        return
      }
      const [pptx, pdf] = await Promise.all([
        meta.pptx ? getSlidePptxFile(id) : Promise.resolve(null),
        meta.pdf ? getSlidePdfFile(id) : Promise.resolve(null),
      ])
      if (!cancelled) setSlideFiles({ pptx, pdf })
    })
    getNotes(id).then((loaded) => {
      if (!cancelled) setNotes(loaded)
    })

    return () => {
      cancelled = true
    }
  }, [id])

  // 발표 상태 실시간 구독 — 사이트에서 처음 쓰는 onSnapshot. 교사가 슬라이드를
  // 넘기면 이 콜백으로 즉시 들어온다.
  useEffect(() => {
    if (!id) return
    return subscribePresentation(id, setPresentation)
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

  // 발표 모드는 PDF가 있어야만 켤 수 있다 — pptx-preview 렌더링이 불안정해서
  // (PptxSlideViewer 주석 참고) 교사·학생 화면이 정확히 같은 슬라이드 번호로
  // 맞아떨어지려면 검증된 PdfViewer가 필요하다.
  const canPresent = isTeacherViewer && !!slideFiles?.pdf
  const showFollowerOverlay = presentation.active && !isPresenting && !!slideFiles?.pdf

  async function handleStartPresenting() {
    if (!id) return
    await startPresentation(id, presentation.currentSlide || 1)
    setIsPresenting(true)
  }

  return (
    <div className="flex flex-col gap-6">
      {showFollowerOverlay && slideFiles?.pdf && (
        <LabPresentationOverlay
          pdfFile={slideFiles.pdf}
          currentSlide={presentation.currentSlide}
          isTeacherViewer={isTeacherViewer}
          onTakeControl={() => setIsPresenting(true)}
        />
      )}

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
          <CodeBlock code={activity.code} />
        </Section>
      )}
      <Section title="실습">{activity.practice}</Section>
      <Section title="Mission">{activity.mission}</Section>
      <Section title="Challenge">{activity.challenge}</Section>

      {isPresenting && slideFiles?.pdf && id ? (
        <LabPresenter
          activityId={id}
          pdfFile={slideFiles.pdf}
          currentSlide={presentation.currentSlide}
          notes={notes}
          onExit={() => setIsPresenting(false)}
        />
      ) : (
        slideFiles && (
          <section className="flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-ink-900">발표자료</h2>
              {canPresent && (
                <button
                  onClick={handleStartPresenting}
                  className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-300"
                >
                  ▶ {presentation.active ? '발표 제어하기' : '발표 시작'}
                </button>
              )}
            </div>
            <PptxSlideViewer
              pptxFile={slideFiles.pptx}
              pdfFile={slideFiles.pdf}
              filename="발표자료"
            />
          </section>
        )
      )}

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
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink-700">
        {typeof children === 'string' ? linkify(children) : children}
      </div>
    </section>
  )
}
