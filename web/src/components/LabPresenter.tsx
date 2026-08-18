import { useEffect, useRef, useState } from 'react'

import { setCurrentSlide, stopPresentation } from '../lib/labPresentation'
import { updateNote } from '../lib/labSlides'
import PdfViewer from './PdfViewer'

/**
 * 교사용 발표 화면 — PDF(현재 슬라이드)와 대본을 나란히 보여주고, 넘기는
 * 버튼은 여기에만 있다("PPT를 넘기는 건 교사만 제어" 요구사항). 페이지를
 * 넘기면 Firestore(labPresentations)에 바로 쓰고, 화면에 보이는 currentSlide
 * 는 그 구독 값을 그대로 받아쓴다 — 이 컴포넌트가 자체적으로 페이지 상태를
 * 들고 있지 않는다. 그래야 "다른 기기에서 이어서 조작하기"가 자연히 된다.
 */
export default function LabPresenter({
  activityId,
  pdfFile,
  currentSlide,
  notes,
  onExit,
}: {
  activityId: string
  pdfFile: Blob
  currentSlide: number
  notes: string[]
  onExit: () => void
}) {
  const [pageCount, setPageCount] = useState(0)
  const [noteDraft, setNoteDraft] = useState(notes[currentSlide - 1] ?? '')
  const saveTimerRef = useRef<number | undefined>(undefined)

  // 슬라이드가 바뀌면 그 슬라이드의 저장된 대본으로 바꿔 보여준다.
  useEffect(() => {
    setNoteDraft(notes[currentSlide - 1] ?? '')
  }, [currentSlide, notes])

  function goTo(page: number) {
    const clamped = Math.max(1, Math.min(pageCount || page, page))
    void setCurrentSlide(activityId, clamped)
  }

  function handleNoteChange(text: string) {
    setNoteDraft(text)
    window.clearTimeout(saveTimerRef.current)
    // 타이핑마다 쓰지 않고 잠깐 멈췄을 때만 저장한다 — Firestore 쓰기 아끼기.
    saveTimerRef.current = window.setTimeout(() => {
      void updateNote(activityId, currentSlide, text)
    }, 600)
  }

  async function handleExit() {
    await stopPresentation(activityId)
    onExit()
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-cheese-300 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-ink-900">
          🔴 발표 중 · {currentSlide} / {pageCount || '?'}
        </h2>
        <button
          onClick={handleExit}
          className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
        >
          발표 종료
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="h-[60vh] overflow-hidden rounded-xl border border-cream-deep">
          <PdfViewer
            file={pdfFile}
            filename="발표자료"
            page={currentSlide}
            onPageChange={goTo}
            onPageCountChange={setPageCount}
            hideControls
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-ink-700">
            대본 <span className="font-normal text-ink-500">(학생 화면엔 안 보입니다)</span>
          </label>
          <textarea
            value={noteDraft}
            onChange={(event) => handleNoteChange(event.target.value)}
            placeholder="PPT에 발표자 노트가 없으면 여기 바로 적어도 됩니다."
            className="min-h-[60vh] flex-1 rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm leading-relaxed text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => goTo(currentSlide - 1)}
          disabled={currentSlide <= 1}
          className="rounded-lg border border-cream-deep px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:opacity-40"
        >
          ← 이전
        </button>
        <span className="text-sm font-semibold text-ink-700">
          {currentSlide} / {pageCount || '?'}
        </span>
        <button
          onClick={() => goTo(currentSlide + 1)}
          disabled={pageCount > 0 && currentSlide >= pageCount}
          className="rounded-lg border border-cream-deep px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:opacity-40"
        >
          다음 →
        </button>
      </div>
    </section>
  )
}
