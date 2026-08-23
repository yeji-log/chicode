import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  addInkStroke,
  clearInkForSlide,
  EMPTY_INK_STROKES,
  setCurrentSlide,
  setInkForSlide,
  startPresentation,
  stopPresentation,
  type LabPresentationState,
} from '../lib/labPresentation'
import { updateNote } from '../lib/labSlides'
import PdfViewer from './PdfViewer'
import PresentationInk, { NO_CALLOUT_STYLE, PEN_COLORS } from './PresentationInk'

/**
 * 교사용 발표 화면 — 전체화면 모달.
 *
 * charim(자매 프로젝트, github.com/yeji-log/charim)의 발표 화면 열기 방식을
 * 참고해서 "열기"와 "발표 시작"을 분리했다. 이 화면을 여는 것 자체는 학생
 * 화면에 아무 영향을 주지 않는다 — 교사가 슬라이드를 미리 훑어보고
 * (browsing) 준비할 시간을 준다. "이 쪽부터 발표 시작"을 눌러야 그때부터
 * Firestore(labPresentations)의 active가 true가 되고 학생 화면
 * (LabPresentationOverlay)이 따라오기 시작한다.
 *
 * "닫기"는 방송을 끊지 않는다 — 열려 있는 창만 닫는다. 방송을 끊는 버튼은
 * 발표 중일 때만 따로 뜨는 "발표 끝내기"다(창을 닫는 방법이 이것뿐이면,
 * 창을 닫는 순간 학생 화면이 계속 발표에 묶인 걸 교사가 되돌릴 수 없다).
 * 닫아도 방송이 계속되므로, 부모가 이 컴포넌트를 치우고 나면 그 교사의
 * 화면에도 LabPresentationOverlay(학생과 같은 화면 + "발표 제어하기" 버튼)가
 * 대신 뜬다 — 창을 닫아도 발표가 안 끊겼다는 걸 스스로 확인할 수 있다.
 *
 * 열기/시작을 분리하면서 예전에 있던 "발표 시작 버튼을 누르면 onSnapshot이
 * 따라잡을 때까지 잠깐 이전 페이지로 보이는 깜빡임"도 자연히 없어졌다 —
 * 이 화면은 방송 시작 전부터 이미 열려서 훑어보기 상태로 떠 있으므로,
 * active가 false→true로 바뀌는 순간은 그냥 표시 문구와 버튼만 바뀌는
 * 자연스러운 전환이지 마운트 자체가 아니다.
 *
 * 펜/지우개는 방송이 실제로 시작된 뒤에만 쓸 수 있다 — addInkStroke가
 * updateDoc이라 Firestore 문서 자체가 없으면(발표를 한 번도 시작 안 한
 * 활동) 실패한다.
 */
export default function LabPresenter({
  activityId,
  pdfFile,
  filename,
  presentation,
  initialBrowsePage,
  notes,
  onBrowsePageChange,
  onNoteSaved,
  onClose,
}: {
  activityId: string
  pdfFile: Blob
  filename: string
  presentation: LabPresentationState
  /** 방송 중이 아닐 때(active===false) 이 화면을 열면 어느 쪽부터 훑어볼지 —
   *  보통 "지난 발표를 마지막으로 끝낸 자리"(부모가 들고 있는 browsePage). */
  initialBrowsePage: number
  notes: string[]
  /** 방송 중이 아닐 때 훑어보는 쪽이 바뀔 때마다 알려준다 — 부모가
   *  browsePage를 최신으로 유지해야, 창을 닫았다 다시 열어도 보던 자리부터
   *  이어지고 "발표 시작"도 그 자리에서 된다. */
  onBrowsePageChange: (page: number) => void
  onNoteSaved: (slideIndex: number, text: string) => void
  onClose: () => void
}) {
  const active = presentation.active
  const [pageCount, setPageCount] = useState(0)
  /** 방송 중이 아닐 때 이 창 안에서 혼자 훑어보는 쪽. */
  const [browsing, setBrowsing] = useState(initialBrowsePage)
  const slide = active ? presentation.currentSlide : browsing

  const [noteDraft, setNoteDraft] = useState(notes[slide - 1] ?? '')
  /** 펜 도구 on/off — 방송 중일 때만 의미가 있다(아래 effect가 방송이
   *  끝나면 자동으로 끈다). */
  const [penActive, setPenActive] = useState(false)
  const [tool, setTool] = useState<'draw' | 'erase'>('draw')
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].hex)
  const currentSlideInk = presentation.ink?.[slide] ?? EMPTY_INK_STROKES

  const saveTimerRef = useRef<number | undefined>(undefined)
  const pendingRef = useRef<{ slide: number; text: string } | null>(null)
  // effect 안에서 최신 notes를 읽기 위한 것 — notes를 의존성에 넣으면
  // 저장이 돌아올 때마다 이 효과가 다시 돌면서 지금 입력 중인 대본을
  // 덮어써버린다.
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  // 방송이 꺼지면(다른 기기에서 끝냈을 수도 있다) 펜도 자동으로 끈다 —
  // 방송 없이는 그릴 대상(Firestore 문서)이 없고, 켜둔 채로 두면 다음에
  // 다시 시작했을 때 그릴 준비가 안 된 것처럼 보인다.
  useEffect(() => {
    if (!active) setPenActive(false)
  }, [active])

  // 동적으로 삽입된 position:fixed 레이어가 일부 모바일 브라우저에서 다음
  // 리플로우 전까지 페인트되지 않는 문제의 방어책
  // (LabPresentationOverlay.tsx와 같은 이유로 여기도 넣는다).
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [])

  function flushPending() {
    if (!pendingRef.current) return
    window.clearTimeout(saveTimerRef.current)
    const { slide: pendingSlide, text } = pendingRef.current
    pendingRef.current = null
    void updateNote(activityId, pendingSlide, text)
    onNoteSaved(pendingSlide, text)
  }

  // 슬라이드가 바뀌면: 이전 슬라이드의 미저장 편집을 먼저 흘려보내고, 새
  // 슬라이드의 저장된 대본으로 바꿔 보여준다.
  useEffect(() => {
    flushPending()
    setNoteDraft(notesRef.current[slide - 1] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide])

  // 컴포넌트가 통째로 사라질 때도(닫기, 브라우저 탭 닫기 전 등) 마지막으로 한 번.
  useEffect(() => () => flushPending(), [])

  function go(next: number) {
    flushPending()
    const clamped = Math.max(1, Math.min(pageCount || next, next))
    if (active) {
      void setCurrentSlide(activityId, clamped)
    } else {
      setBrowsing(clamped)
      onBrowsePageChange(clamped)
    }
  }

  function handleNoteChange(text: string) {
    setNoteDraft(text)
    pendingRef.current = { slide, text }
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(flushPending, 600)
  }

  // 방향키/PageUp·Down/Space로 슬라이드를 넘긴다 — 발표 중에 버튼을 겨냥해
  // 누르는 것보다 빠르고, 리모컨(프레젠터)도 대개 이 신호를 보낸다. 대본을
  // 타이핑하는 중에는 가로채면 안 된다(스페이스를 치면 슬라이드가 그냥
  // 넘어가 버린다) — 입력 요소에 포커스가 있으면 무시한다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.isContentEditable
      if (typing) return

      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        go(slide + 1)
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        go(slide - 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, active, pageCount])

  async function handleStartBroadcast() {
    flushPending()
    await startPresentation(activityId, browsing)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-900 text-cream">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="font-bold">
          {active ? `🔴 발표 중 · ${slide} / ${pageCount || '?'}` : `👀 미리보기 · ${slide} / ${pageCount || '?'}`}
        </span>
        <span className="text-sm text-cream/60">
          {active ? '학생 화면이 따라오고 있어요' : '아직 학생 화면엔 안 보여요'}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {active && (
            <>
              <button
                onClick={() => setPenActive((current) => !current)}
                aria-pressed={penActive}
                style={NO_CALLOUT_STYLE}
                className={
                  penActive
                    ? 'rounded-lg border border-cheese-400 bg-cheese-100 px-3 py-1.5 text-sm font-semibold text-ink-900'
                    : 'rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-cream/80 transition-colors hover:bg-white/10'
                }
              >
                🖊️ 펜 {penActive ? '끄기' : '켜기'}
              </button>
              {penActive && (
                <div className="flex items-center gap-1" role="group" aria-label="펜/지우개">
                  <button
                    type="button"
                    onClick={() => setTool('draw')}
                    aria-pressed={tool === 'draw'}
                    style={NO_CALLOUT_STYLE}
                    className={
                      tool === 'draw'
                        ? 'rounded-lg border border-cheese-400 bg-cheese-100 px-2.5 py-1.5 text-sm font-semibold text-ink-900'
                        : 'rounded-lg border border-white/20 px-2.5 py-1.5 text-sm font-semibold text-cream/80 hover:bg-white/10'
                    }
                  >
                    🖊️ 그리기
                  </button>
                  <button
                    type="button"
                    onClick={() => setTool('erase')}
                    aria-pressed={tool === 'erase'}
                    style={NO_CALLOUT_STYLE}
                    className={
                      tool === 'erase'
                        ? 'rounded-lg border border-cheese-400 bg-cheese-100 px-2.5 py-1.5 text-sm font-semibold text-ink-900'
                        : 'rounded-lg border border-white/20 px-2.5 py-1.5 text-sm font-semibold text-cream/80 hover:bg-white/10'
                    }
                  >
                    🧹 지우개
                  </button>
                </div>
              )}
              {penActive && tool === 'draw' && (
                <div className="flex items-center gap-1" role="group" aria-label="펜 색">
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setPenColor(c.hex)}
                      aria-label={c.name}
                      aria-pressed={penColor === c.hex}
                      style={{ backgroundColor: c.hex, ...NO_CALLOUT_STYLE }}
                      className={
                        'size-6 shrink-0 rounded-full ring-offset-2 ring-offset-ink-900 transition-shadow' +
                        (penColor === c.hex ? ' ring-2 ring-white' : ' ring-1 ring-white/30')
                      }
                    />
                  ))}
                </div>
              )}
              <button
                onClick={() => void clearInkForSlide(activityId, slide)}
                disabled={currentSlideInk.length === 0}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-cream/80 transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                전체 지우기
              </button>
              <button
                onClick={() => void stopPresentation(activityId)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                발표 끝내기
              </button>
            </>
          )}
          {!active && (
            <button
              onClick={() => void handleStartBroadcast()}
              className="rounded-lg bg-cheese-400 px-4 py-1.5 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-300"
            >
              ▶ 이 쪽부터 발표 시작
            </button>
          )}
          <button
            onClick={() => {
              flushPending()
              onClose()
            }}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-cream/80 transition-colors hover:bg-white/10"
          >
            닫기
          </button>
        </div>
      </header>

      {/* 펜이 켜져 있는 동안은 대본을 볼 일보다 그릴 공간이 더 급하다 —
          대본 패널을 잠시 접고 슬라이드가 전체 폭을 쓰게 한다. */}
      <div
        className={
          penActive
            ? 'flex min-h-0 flex-1 flex-col p-4'
            : 'grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[3fr_2fr]'
        }
      >
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10">
          <PdfViewer
            file={pdfFile}
            filename={filename}
            page={slide}
            onPageChange={go}
            onPageCountChange={setPageCount}
            hideControls
            overlay={
              <PresentationInk
                strokes={currentSlideInk}
                editable
                active={active && penActive}
                mode={tool}
                color={penColor}
                onStrokeComplete={(stroke) => void addInkStroke(activityId, slide, stroke)}
                onEraseComplete={(remaining) => void setInkForSlide(activityId, slide, remaining)}
              />
            }
          />
        </div>

        {!penActive && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-cream/80">
              대본 <span className="font-normal text-cream/50">(학생 화면엔 안 보입니다)</span>
            </label>
            <textarea
              value={noteDraft}
              onChange={(event) => handleNoteChange(event.target.value)}
              onBlur={flushPending}
              placeholder="PPT에 발표자 노트가 없으면 여기 바로 적어도 됩니다."
              className="min-h-[40vh] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm leading-relaxed text-cream outline-none placeholder:text-cream/30 focus:border-white/40"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 px-4 py-3">
        <button
          onClick={() => go(slide - 1)}
          disabled={slide <= 1}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-cream/80 transition-colors hover:bg-white/10 disabled:opacity-30"
        >
          ← 이전
        </button>
        <span className="tabular-nums text-sm font-semibold text-cream/80">
          {slide} / {pageCount || '?'}
        </span>
        <button
          onClick={() => go(slide + 1)}
          disabled={pageCount > 0 && slide >= pageCount}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-cream/80 transition-colors hover:bg-white/10 disabled:opacity-30"
        >
          다음 →
        </button>
        <span className="text-xs text-cream/40">← → 또는 Space · Esc로 닫기</span>
      </div>
    </div>,
    document.body,
  )
}
