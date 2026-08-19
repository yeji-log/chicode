import { useEffect, useState } from 'react'

import { SlidesPanel } from '../pages/LabBoardEditor'
import {
  startPresentation,
  subscribePresentation,
  type LabPresentationState,
} from '../lib/labPresentation'
import { getNotes, getSlidePdfFile, getSlidePptxFile, getSlideSet, type LabSlideSet } from '../lib/labSlides'
import LabPresentationOverlay from './LabPresentationOverlay'
import LabPresenter from './LabPresenter'
import PptxSlideViewer from './PptxSlideViewer'

const IDLE_PRESENTATION: LabPresentationState = { active: false, currentSlide: 1, updatedAt: 0 }

/**
 * 교사 페이지 OT 탭 전용 "OT 발표자료" — PPT를 올리고, 대본과 나란히 보면서
 * 슬라이드를 넘기는 발표 모드까지 Lab 활동의 발표 기능(LabPresenter/
 * PptxSlideViewer/labPresentation.ts, LabActivityDetail.tsx가 쓰는 것과 동일)을
 * 그대로 재사용한다. Lab은 "활동" 하나에 이 슬라이드 자리가 여러 섹션 중
 * 하나로 끼워지는 구조라, 여기서는 그 활동 모델 없이 과목 하나당 발표자료
 * 하나만 두는 훨씬 단순한 버전으로 다시 짰다.
 *
 * 학생 화면 어디에도 이 컴포넌트를 그리지 않으므로 학생은 볼 수 없다 — 다만
 * labSlides/labPresentations 문서 자체는 이 프로젝트의 다른 "가벼운 잠금"과
 * 같은 이유로 Firestore read:true라(firestore.rules), 그게 진짜 보안 장치는
 * 아니라는 점은 동일하다.
 *
 * Firestore 문서 id로 실제 Lab 활동 id(crypto.randomUUID())와 절대 겹치지
 * 않도록 `ot-${subjectId}` 접두어를 쓴다 — subjectId는 Firebase 콘솔에서
 * 사람이 직접 지어준 짧은 slug(ai-basics 등)라 접두어를 붙여도 이 프로젝트
 * 안에서 충돌할 일이 없다.
 */
export default function OtPresentationPanel({ subjectId }: { subjectId: string }) {
  const slideId = `ot-${subjectId}`

  const [slideFiles, setSlideFiles] = useState<{ pptx: Blob | null; pdf: Blob | null } | null>(
    null,
  )
  const [notes, setNotes] = useState<string[]>([])
  const [presentation, setPresentation] = useState<LabPresentationState>(IDLE_PRESENTATION)
  const [isPresenting, setIsPresenting] = useState(false)
  const [browsePage, setBrowsePage] = useState(1)
  // SlidesPanel이 업로드/삭제를 마칠 때마다 값이 바뀌어, 아래 slideFiles/notes
  // 재조회 effect를 다시 돌게 만드는 트리거. 값 자체엔 의미 없다.
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setBrowsePage(1)

    getSlideSet(slideId).then(async (meta) => {
      if (!meta.pptx && !meta.pdf) {
        if (!cancelled) setSlideFiles(null)
        return
      }
      const [pptx, pdf] = await Promise.all([
        meta.pptx ? getSlidePptxFile(slideId) : Promise.resolve(null),
        meta.pdf ? getSlidePdfFile(slideId) : Promise.resolve(null),
      ])
      if (!cancelled) setSlideFiles({ pptx, pdf })
    })
    getNotes(slideId).then((loaded) => {
      if (!cancelled) setNotes(loaded)
    })

    return () => {
      cancelled = true
    }
  }, [slideId, refreshToken])

  useEffect(() => subscribePresentation(slideId, setPresentation), [slideId])

  const canPresent = !!slideFiles?.pdf
  // 두 교사가 동시에 이 화면을 열었을 때, 발표를 직접 조작하지 않는 쪽에
  // 전체화면 오버레이를 띄운다(Lab의 학생 화면과 같은 컴포넌트) — 흔치 않은
  // 상황이지만 있는 컴포넌트를 그대로 쓰는 게 새로 만드는 것보다 안전하다.
  const showFollowerOverlay = presentation.active && !isPresenting && !!slideFiles?.pdf

  async function handleStartPresenting() {
    await startPresentation(slideId, browsePage)
    setIsPresenting(true)
  }

  function handleResumeControl() {
    setIsPresenting(true)
  }

  function handleSlidesChange(next: LabSlideSet) {
    // SlidesPanel은 메타(ChunkedFileMeta)만 들고 있고 실제 Blob은 안 갖고
    // 있어서, 여기선 새로 올라온 파일이 있다는 신호로만 쓰고 실제 재조회는
    // 위 effect(getSlideSet + blob 로딩)에 맡긴다.
    if (!next.pptx && !next.pdf) {
      setSlideFiles(null)
      return
    }
    setRefreshToken((token) => token + 1)
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <div>
        <h2 className="font-bold text-ink-900">🎤 OT 발표자료</h2>
        <p className="mt-1 text-xs text-ink-500">
          여기 올린 PPT와 대본은 학생 화면 어디에도 안 보입니다. 수업 중 이 화면에서 "발표
          시작"을 누르면 슬라이드와 대본을 나란히 보면서 프로젝터로 진행할 수 있어요.
        </p>
      </div>

      <SlidesPanel activityId={slideId} onChange={handleSlidesChange} />

      {showFollowerOverlay && slideFiles?.pdf && (
        <LabPresentationOverlay
          pdfFile={slideFiles.pdf}
          currentSlide={presentation.currentSlide}
          filename="OT 발표자료"
          isTeacherViewer
          onTakeControl={() => setIsPresenting(true)}
        />
      )}

      {isPresenting && slideFiles?.pdf ? (
        <LabPresenter
          activityId={slideId}
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
      ) : (
        slideFiles &&
        (slideFiles.pptx || slideFiles.pdf) && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-ink-900">미리보기</h3>
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
              filename="OT 발표자료"
              onPageChange={setBrowsePage}
            />
          </div>
        )
      )}
    </div>
  )
}
