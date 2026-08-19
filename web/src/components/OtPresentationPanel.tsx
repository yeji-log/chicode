import { useEffect, useState } from 'react'

import {
  addOtPresentation,
  removeOtPresentation,
  renameOtPresentation,
  type OtPresentationMeta,
  type SubjectMeta,
} from '../lib/subjects'
import { SlidesPanel } from '../pages/LabBoardEditor'
import {
  startPresentation,
  subscribePresentation,
  type LabPresentationState,
} from '../lib/labPresentation'
import {
  deleteSlidePdf,
  deleteSlidePptx,
  getNotes,
  getSlidePdfFile,
  getSlidePptxFile,
  getSlideSet,
  type LabSlideSet,
} from '../lib/labSlides'
import LabPresentationOverlay from './LabPresentationOverlay'
import LabPresenter from './LabPresenter'
import PptxSlideViewer from './PptxSlideViewer'

const IDLE_PRESENTATION: LabPresentationState = { active: false, currentSlide: 1, updatedAt: 0 }

/**
 * 교사 페이지 OT 탭 전용 "OT 발표자료" 목록 — 항목을 여러 개 추가할 수 있고
 * (예: 1차시/2차시 발표자료를 따로 두는 식), 항목마다 독립적으로 PPT 업로드 +
 * 발표(슬라이드+대본 나란히) 기능을 쓴다. Lab 활동의 발표 기능(LabPresenter/
 * PptxSlideViewer/labPresentation.ts/labSlides.ts)을 그대로 재사용한다 — 전부
 * activityId 문자열 하나로만 동작해서 "활동" 데이터 모델 없이도 그대로 붙는다.
 *
 * 목록 자체(제목)는 subjects/{subjectId}.otPresentations 배열에 있고, 항목별
 * 실제 PPT/PDF·대본은 각자 자기 id로 된 labSlides/labPresentations 문서에
 * 있다(id는 crypto.randomUUID() — 다른 곳의 활동 id와 겹칠 일이 없다).
 *
 * 학생 화면 어디에도 이 컴포넌트를 그리지 않으므로 학생은 볼 수 없다 — 다만
 * labSlides/labPresentations 문서 자체는 이 프로젝트의 다른 "가벼운 잠금"과
 * 같은 이유로 Firestore read:true라(firestore.rules), 그게 진짜 보안 장치는
 * 아니라는 점은 동일하다.
 */
export default function OtPresentationPanel({
  subject,
  onSubjectChange,
}: {
  subject: SubjectMeta
  onSubjectChange: (patch: Partial<SubjectMeta>) => void
}) {
  const items = subject.otPresentations ?? []
  const [busy, setBusy] = useState(false)

  async function handleAdd() {
    setBusy(true)
    try {
      const entry = await addOtPresentation(subject.id, `발표자료 ${items.length + 1}`)
      onSubjectChange({ otPresentations: [...items, entry] })
    } catch (caught) {
      console.error('발표자료 추가 실패', caught)
      alert('발표자료를 추가하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(entry: OtPresentationMeta) {
    if (!confirm(`"${entry.title}"를 삭제할까요? 업로드한 PPT/PDF도 함께 삭제됩니다.`)) return
    try {
      await removeOtPresentation(subject.id, entry.id)
      // labSlides 문서 자체(대본)는 Lab의 deleteActivity와 같은 이유로 안
      // 지운다(subjects.ts의 removeOtPresentation 주석 참고) — 용량을 크게
      // 차지하는 PPT/PDF 원본만 확실히 지운다.
      await Promise.all([deleteSlidePptx(entry.id), deleteSlidePdf(entry.id)])
      onSubjectChange({ otPresentations: items.filter((item) => item.id !== entry.id) })
    } catch (caught) {
      console.error('발표자료 삭제 실패', caught)
      alert('발표자료를 삭제하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  async function handleRename(entry: OtPresentationMeta, title: string) {
    // 낙관적으로 먼저 반영 — 실패해도 다음에 다시 고치면 되는 사소한 텍스트라
    // SubjectSettings처럼 저장 버튼/에러 문구까지 둘 정도는 아니라고 판단했다.
    onSubjectChange({
      otPresentations: items.map((item) => (item.id === entry.id ? { ...item, title } : item)),
    })
    try {
      await renameOtPresentation(subject.id, entry.id, title)
    } catch (caught) {
      console.error('발표자료 이름 변경 실패', caught)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <div>
        <h2 className="font-bold text-ink-900">🎤 OT 발표자료</h2>
        <p className="mt-1 text-xs text-ink-500">
          여기 올린 PPT와 대본은 학생 화면 어디에도 안 보입니다. 발표자료를 여러 개 추가해서
          (예: 1차시/2차시) 각각 따로 관리할 수 있어요. "발표 시작"을 누르면 슬라이드와 대본을
          나란히 보면서 프로젝터로 진행할 수 있습니다.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cream-deep px-4 py-8 text-center text-sm text-ink-500">
          아직 추가한 발표자료가 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((entry) => (
            <OtPresentationItem
              key={entry.id}
              entry={entry}
              onRename={(title) => handleRename(entry, title)}
              onRemove={() => handleRemove(entry)}
            />
          ))}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={busy}
        className="self-start rounded-xl border border-cream-deep px-4 py-2 text-sm font-bold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '추가하는 중…' : '+ 발표자료 추가'}
      </button>
    </div>
  )
}

/** 발표자료 하나 — 제목 인라인 수정 + 업로드(SlidesPanel) + 미리보기/발표
 *  모드. entry.id 를 그대로 labSlides/labPresentations 문서 id로 쓴다. */
function OtPresentationItem({
  entry,
  onRename,
  onRemove,
}: {
  entry: OtPresentationMeta
  onRename: (title: string) => void
  onRemove: () => void
}) {
  const slideId = entry.id

  const [titleDraft, setTitleDraft] = useState(entry.title)
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
    setTitleDraft(entry.title)
  }, [entry.title])

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
  const showFollowerOverlay = presentation.active && !isPresenting && !!slideFiles?.pdf

  async function handleStartPresenting() {
    await startPresentation(slideId, browsePage)
    setIsPresenting(true)
  }

  function handleResumeControl() {
    setIsPresenting(true)
  }

  function handleSlidesChange(next: LabSlideSet) {
    if (!next.pptx && !next.pdf) {
      setSlideFiles(null)
      return
    }
    setRefreshToken((token) => token + 1)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-cream-deep bg-cream/40 p-4">
      <div className="flex items-center gap-2">
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => {
            const trimmed = titleDraft.trim() || '발표자료'
            setTitleDraft(trimmed)
            if (trimmed !== entry.title) onRename(trimmed)
          }}
          className="min-w-0 flex-1 rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-sm font-bold text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
        <button
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
        >
          삭제
        </button>
      </div>

      <SlidesPanel activityId={slideId} onChange={handleSlidesChange} />

      {showFollowerOverlay && slideFiles?.pdf && (
        <LabPresentationOverlay
          pdfFile={slideFiles.pdf}
          currentSlide={presentation.currentSlide}
          filename={entry.title}
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
              filename={entry.title}
              onPageChange={setBrowsePage}
            />
          </div>
        )
      )}
    </div>
  )
}
