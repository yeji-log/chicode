import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import CodeBlock from '../components/CodeBlock'
import LabPresentationOverlay from '../components/LabPresentationOverlay'
import LabPresenter from '../components/LabPresenter'
import PptxSlideViewer from '../components/PptxSlideViewer'
import { useLabScope } from '../lib/labScope'
import {
  startPresentation,
  subscribePresentation,
  type LabPresentationState,
} from '../lib/labPresentation'
import {
  getSectionAttachmentFile,
  getSectionAttachmentMeta,
  isImageAttachment,
  isVideoAttachment,
} from '../lib/labSectionAttachments'
import {
  getActivity,
  getSeason,
  isChecklistSection,
  isSlidesSection,
  type LabActivity,
  type LabActivitySection,
} from '../lib/labs'
import { getNotes, getSlidePdfFile, getSlidePptxFile, getSlideSet } from '../lib/labSlides'
import { linkify } from '../lib/linkify'
import { extractYoutubeId, youtubeEmbedUrl } from '../lib/youtube'

const IDLE_PRESENTATION: LabPresentationState = { active: false, currentSlide: 1, updatedAt: 0 }

/**
 * /lab/activities/:id — 설계안 5절 활동 페이지 템플릿.
 * `/materials/:subjectId/content/:id` 아래에도 마운트되어 과목별 "내용" 상세
 * 화면으로 재사용된다(useLabScope 참고) — activityId 로만 동작해서 subjectId
 * 자체는 데이터 조회에 안 쓰이고, 뒤로가기 링크/문구에만 쓰인다.
 */
export default function LabActivityDetail() {
  const scope = useLabScope()
  const { id } = useParams<{ id: string }>()
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'

  const [activity, setActivity] = useState<LabActivity | null>(null)
  const [seasonTitle, setSeasonTitle] = useState<string | null>(null)
  /** 시즌이 로드맵에서 "준비중"이면 활동도 아직 학생에게 안 보여준다 —
   *  published 여도 마찬가지다(로드맵엔 안 보이는데 활동은 열리면 앞뒤가
   *  안 맞는다는 지적을 받았다). seasonId 가 없는 활동(미지정)은 해당 없음. */
  const [seasonPreparing, setSeasonPreparing] = useState(false)
  const [loading, setLoading] = useState(true)

  const [slideFiles, setSlideFiles] = useState<{ pptx: Blob | null; pdf: Blob | null } | null>(
    null,
  )
  const [notes, setNotes] = useState<string[]>([])
  const [presentation, setPresentation] = useState<LabPresentationState>(IDLE_PRESENTATION)
  /** 이 브라우저 탭에서 "발표 시작"을 눌러 지금 직접 조작 중인지. Firestore의
   *  active 플래그와 별개다 — 다른 기기가 이미 발표 중이면 이 탭은 false다. */
  const [isPresenting, setIsPresenting] = useState(false)
  /** "발표 시작"을 누르면 몇 페이지부터 시작할지 — 교사가 발표를 시작하기
   *  전 "수업 자료" 섹션에서 지금 훑어보고 있는(browsing) 쪽 그대로 이어진다.
   *  별도로 번호를 입력하게 했었는데, 지금 보고 있는 자리와 자동으로
   *  맞아떨어지길 원한다는 요청으로 PptxSlideViewer의 onPageChange를 받아
   *  이 값을 계속 갱신한다. */
  const [browsePage, setBrowsePage] = useState(1)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getActivity(id)
      .then(async (loaded) => {
        setActivity(loaded)
        if (loaded?.seasonId) {
          const season = await getSeason(loaded.seasonId)
          setSeasonTitle(season?.title ?? null)
          setSeasonPreparing(season?.status === '준비중')
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  // 발표자료(PPT/PDF)와 대본 — 대부분의 활동엔 없으므로 메타부터 확인하고,
  // 있을 때만 실제 파일 조각까지 읽어온다.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setBrowsePage(1)

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

  // published 가 아니거나 소속 시즌이 아직 "준비중"이면 직접 링크로 와도
  // "존재하지 않음" 취급한다 — Firestore 규칙상 읽기는 공개라 완전한 차단은
  // 아니지만, 화면은 안 보여준다.
  if (!activity || !activity.published || seasonPreparing) {
    return (
      <div className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center">
        <p className="text-4xl">🤔</p>
        <p className="mt-3 font-bold text-ink-900">존재하지 않는 {scope.activityNoun}입니다.</p>
        <Link
          to={scope.activitiesPath}
          className="mt-2 inline-block text-sm font-semibold text-cheese-600 underline"
        >
          {scope.activityNoun} 목록으로 돌아가기
        </Link>
      </div>
    )
  }

  // 발표 모드는 PDF가 있어야만 켤 수 있다 — pptx-preview 렌더링이 불안정해서
  // (PptxSlideViewer 주석 참고) 교사·학생 화면이 정확히 같은 슬라이드 번호로
  // 맞아떨어지려면 검증된 PdfViewer가 필요하다.
  const canPresent = isTeacherViewer && !!slideFiles?.pdf
  const showFollowerOverlay = presentation.active && !isPresenting && !!slideFiles?.pdf
  const slidesTitle = activity.sections.find(isSlidesSection)?.title ?? '수업 자료'

  async function handleStartPresenting() {
    if (!id) return
    await startPresentation(id, browsePage)
    setIsPresenting(true)
  }

  /** 이미 다른 기기에서 진행 중인 발표를 이어받을 땐 페이지를 건드리지
   *  않는다 — "다시 시작"이 아니라 "이어서 조작"이라서. */
  function handleResumeControl() {
    setIsPresenting(true)
  }

  return (
    <div className="flex flex-col gap-6">
      {showFollowerOverlay && slideFiles?.pdf && (
        <LabPresentationOverlay
          pdfFile={slideFiles.pdf}
          currentSlide={presentation.currentSlide}
          filename={slidesTitle}
          isTeacherViewer={isTeacherViewer}
          onTakeControl={() => setIsPresenting(true)}
        />
      )}

      <header className="flex flex-col gap-2">
        <Link to={scope.activitiesPath} className="text-sm font-semibold text-ink-500 underline">
          ← {scope.activityNoun} 목록
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

      {activity.sections.map((section) => {
        // 발표자료 자리 — 교사가 드래그로 이 활동 안 어디에든 놓을 수 있어서,
        // 다른 항목과 같은 위치에서 함께 순회하며 그린다.
        if (isSlidesSection(section)) {
          if (!slideFiles) return null

          if (isPresenting && slideFiles.pdf && id) {
            return (
              <LabPresenter
                key={section.id}
                activityId={id}
                pdfFile={slideFiles.pdf}
                currentSlide={presentation.currentSlide}
                notes={notes}
                onNoteSaved={(slideIndex, text) =>
                  setNotes((current) => {
                    const next = [...current]
                    while (next.length < slideIndex) next.push('')
                    next[slideIndex - 1] = text
                    return next
                  })
                }
                onExit={() => setIsPresenting(false)}
              />
            )
          }

          return (
            <section
              key={section.id}
              className="flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold text-ink-900">{section.title}</h2>
                {canPresent &&
                  (presentation.active ? (
                    <button
                      onClick={handleResumeControl}
                      className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-300"
                    >
                      ▶ 발표 제어하기
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-500">지금 보는 {browsePage}쪽부터</span>
                      <button
                        onClick={handleStartPresenting}
                        className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-300"
                      >
                        ▶ 발표 시작
                      </button>
                    </div>
                  ))}
              </div>
              <PptxSlideViewer
                pptxFile={slideFiles.pptx}
                pdfFile={slideFiles.pdf}
                filename={section.title}
                onPageChange={setBrowsePage}
              />
            </section>
          )
        }

        // 체크리스트 — 학생이 직접 눌러서 체크할 수 있다(모션만, labs.ts
        // kind: 'checklist' 설명·아래 ChecklistSection 주석 참고).
        if (isChecklistSection(section)) {
          return <ChecklistSection key={section.id} section={section} />
        }

        const attachment = section.hasAttachment && (
          <SectionAttachment activityId={activity.id} sectionId={section.id} />
        )
        // 유튜브 링크 — mp4 첨부와 달리 파일을 안 갖고 있고 URL만 저장하므로
        // 여기서 바로 영상 ID를 뽑아 iframe으로 그린다(lib/youtube.ts 설명 참고).
        // 교사가 인식 못 할 링크를 저장해뒀을 수도 있어 못 뽑으면 조용히 숨김
        // (교사 화면에서는 저장할 때 미리 경고해준다).
        const youtubeId = section.videoUrl && extractYoutubeId(section.videoUrl)
        const youtubeEmbed = youtubeId && (
          <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-lg border border-cream-deep">
            <iframe
              src={youtubeEmbedUrl(youtubeId)}
              title={section.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )
        const footer = (youtubeEmbed || attachment) && (
          <div className="flex flex-col gap-3">
            {youtubeEmbed}
            {attachment}
          </div>
        )

        if (section.isCode) {
          return (
            (section.content || footer) && (
              <Section key={section.id} title={section.title} footer={footer}>
                {section.content && <CodeBlock code={section.content} />}
              </Section>
            )
          )
        }

        return (
          <Section key={section.id} title={section.title} footer={footer}>
            {section.content}
          </Section>
        )
      })}

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

/**
 * 체크리스트 — 교사가 미리 정해둔 체크 상태를 초기값으로 삼되, 학생이 눌러서
 * 체크를 켜고 끌 수 있다. 서버에는 안 남는다(labs.ts kind: 'checklist' 설명
 * 참고 — 학생별 로그인/저장소가 없다) — 그냥 지금 이 화면에서 진행 상황을
 * 스스로 표시해보는 모션이다. 그래서 로컬 state 로만 두고, activity가
 * 바뀌거나(다른 활동으로 이동) 새로고침하면 교사가 정해둔 초기 상태로
 * 돌아간다.
 */
function ChecklistSection({ section }: { section: LabActivitySection }) {
  const [items, setItems] = useState(section.items ?? [])

  useEffect(() => {
    setItems(section.items ?? [])
  }, [section.items])

  if (items.length === 0) return null

  function toggle(itemId: string) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, checked: !item.checked } : item)),
    )
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <h2 className="font-bold text-ink-900">{section.title}</h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggle(item.id)}
                className="accent-cheese-400"
              />
              <span className={item.checked ? 'text-ink-500 line-through' : 'text-ink-900'}>
                {item.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}

function difficultyStars(difficulty: number): string {
  const filled = Math.max(0, Math.min(5, difficulty))
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}

/** footer 는 children 이 비어 있어도(예: 첨부파일만 있고 글은 안 쓴 항목)
 *  항상 그린다 — 그래서 "비어 있으면 통째로 숨기기" 판정에도 footer 유무를
 *  같이 본다. */
function Section({
  title,
  children,
  footer,
}: {
  title: string
  children?: ReactNode
  footer?: ReactNode
}) {
  const isEmptyText = typeof children === 'string' && children.trim() === ''
  const hasBody = children && !isEmptyText
  if (!hasBody && !footer) return null

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <h2 className="font-bold text-ink-900">{title}</h2>
      {hasBody && (
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink-700">
          {typeof children === 'string' ? linkify(children) : children}
        </div>
      )}
      {footer}
    </section>
  )
}

/** 항목 하나에 붙은 첨부파일 — 이미지면 바로 보여주고, 동영상(mp4)이면
 *  플레이어를 띄우고, 그 외(PDF/PPT/엑셀 등)는 다운로드 링크 하나만 둔다.
 *  발표자료(PptxSlideViewer)와 달리 다운로드를 막을 이유가 없는 일반
 *  수업자료라서 훨씬 단순하다.
 *
 *  동영상은 Storage가 아니라 Firestore 문서 조각으로 저장돼서(위
 *  labSectionAttachments.ts 설명 참고) 스트리밍이 안 된다 — 아래
 *  getSectionAttachmentFile 이 전체 파일을 다 받아온 뒤에야 objectUrl이
 *  생기고 <video> 가 재생 가능해진다. 용량 제한(50MB)을 짧은 시연 클립
 *  정도로 잡아둔 이유다. */
function SectionAttachment({ activityId, sectionId }: { activityId: string; sectionId: string }) {
  const [loaded, setLoaded] = useState<{
    filename: string
    url: string
    isImage: boolean
    isVideo: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    getSectionAttachmentMeta(activityId, sectionId).then(async (meta) => {
      if (!meta) return
      const blob = await getSectionAttachmentFile(activityId, sectionId)
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setLoaded({
        filename: meta.filename,
        url: objectUrl,
        isImage: isImageAttachment(meta),
        isVideo: isVideoAttachment(meta),
      })
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [activityId, sectionId])

  if (!loaded) return null

  if (loaded.isImage) {
    return (
      <img
        src={loaded.url}
        alt={loaded.filename}
        className="mt-1 max-h-[32rem] w-auto max-w-full rounded-lg border border-cream-deep object-contain"
      />
    )
  }

  if (loaded.isVideo) {
    return (
      <video
        src={loaded.url}
        controls
        className="mt-1 max-h-[32rem] w-auto max-w-full rounded-lg border border-cream-deep"
      >
        {loaded.filename}
      </video>
    )
  }

  return (
    <a
      href={loaded.url}
      download={loaded.filename}
      className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
    >
      📎 {loaded.filename} 다운로드
    </a>
  )
}
