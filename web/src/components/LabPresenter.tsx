import { useEffect, useRef, useState } from 'react'

import {
  addInkStroke,
  clearInkForSlide,
  EMPTY_INK_STROKES,
  setCurrentSlide,
  setInkForSlide,
  stopPresentation,
  type InkStroke,
} from '../lib/labPresentation'
import { updateNote } from '../lib/labSlides'
import PdfViewer from './PdfViewer'
import PresentationInk, { NO_CALLOUT_STYLE, PEN_COLORS } from './PresentationInk'

/**
 * 교사용 발표 화면 — PDF(현재 슬라이드)와 대본을 나란히 보여주고, 넘기는
 * 버튼은 여기에만 있다("PPT를 넘기는 건 교사만 제어" 요구사항). 페이지를
 * 넘기면 Firestore(labPresentations)에 바로 쓰고, 화면에 보이는 currentSlide
 * 는 그 구독 값을 그대로 받아쓴다 — 이 컴포넌트가 자체적으로 페이지 상태를
 * 들고 있지 않는다. 그래야 "다른 기기에서 이어서 조작하기"가 자연히 된다.
 *
 * 대본 저장은 타이핑을 멈추고 600ms 뒤에 이뤄지는데(Firestore 쓰기 아끼기),
 * 그 전에 슬라이드를 넘기거나 발표를 끝내면 마지막 몇 글자가 그대로 날아갈
 * 수 있었다 — flushPending 으로 그 시점마다 미저장분을 먼저 흘려보낸다.
 */
export default function LabPresenter({
  activityId,
  pdfFile,
  currentSlide,
  notes,
  ink,
  onNoteSaved,
  onExit,
}: {
  activityId: string
  pdfFile: Blob
  currentSlide: number
  notes: string[]
  /** 슬라이드별 펜 획(Firestore 구독 값 그대로) — 발표를 시작한 적 없으면
   *  undefined. */
  ink?: Record<number, InkStroke[]>
  /** 대본이 저장될 때마다 호출 — 부모(LabActivityDetail)가 notes 배열을
   *  최신으로 들고 있어야, 발표를 나갔다 다시 들어와도 방금 고친 내용이
   *  보인다(부모의 notes 는 처음 마운트될 때 한 번만 불러오기 때문). */
  onNoteSaved: (slideIndex: number, text: string) => void
  onExit: () => void
}) {
  const [pageCount, setPageCount] = useState(0)
  const [noteDraft, setNoteDraft] = useState(notes[currentSlide - 1] ?? '')
  /** 펜 도구 on/off. 기본은 꺼짐 — 파워포인트도 발표 시작할 때마다 다시
   *  켜야 한다. 슬라이드를 넘겨도 켜둔 채로 유지한다(계속 필기하며
   *  넘기는 흐름이 자연스러워서). */
  const [penActive, setPenActive] = useState(false)
  /** 펜 켜져 있는 동안 "그리기"인지 "지우개"인지. 펜을 처음 켤 때마다
   *  그리기로 초기화한다(끄면 리셋되는 게 아니라 이 값 자체가 초기값). */
  const [tool, setTool] = useState<'draw' | 'erase'>('draw')
  /** 지금부터 그릴 획에 쓸 색. 기본은 무지개 목록 맨 앞(빨강) — 이미
   *  그려둔 획들은 각자 커밋될 때의 색을 그대로 갖고 있어서 이후에 색을
   *  바꿔도 안 변한다. */
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].hex)
  const currentSlideInk = ink?.[currentSlide] ?? EMPTY_INK_STROKES

  const saveTimerRef = useRef<number | undefined>(undefined)
  const pendingRef = useRef<{ slide: number; text: string } | null>(null)
  // effect 안에서 최신 notes 를 읽기 위한 것 — notes 를 의존성에 넣으면
  // 저장이 돌아올 때마다(=notes 배열이 바뀔 때마다) 이 효과가 다시 돌면서
  // 지금 입력 중인 대본을 덮어써버린다.
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  function flushPending() {
    if (!pendingRef.current) return
    window.clearTimeout(saveTimerRef.current)
    const { slide, text } = pendingRef.current
    pendingRef.current = null
    void updateNote(activityId, slide, text)
    onNoteSaved(slide, text)
  }

  // 슬라이드가 바뀌면: 이전 슬라이드의 미저장 편집을 먼저 흘려보내고,
  // 새 슬라이드의 저장된 대본으로 바꿔 보여준다.
  useEffect(() => {
    flushPending()
    setNoteDraft(notesRef.current[currentSlide - 1] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide])

  // 컴포넌트가 통째로 사라질 때도(브라우저 탭 닫기 전 등) 마지막으로 한 번.
  useEffect(() => () => flushPending(), [])

  function goTo(page: number) {
    flushPending()
    const clamped = Math.max(1, Math.min(pageCount || page, page))
    void setCurrentSlide(activityId, clamped)
  }

  function handleNoteChange(text: string) {
    setNoteDraft(text)
    pendingRef.current = { slide: currentSlide, text }
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(flushPending, 600)
  }

  async function handleExit() {
    flushPending()
    await stopPresentation(activityId)
    onExit()
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-cheese-300 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-ink-900">
          🔴 발표 중 · {currentSlide} / {pageCount || '?'}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPenActive((current) => !current)}
            aria-pressed={penActive}
            style={NO_CALLOUT_STYLE}
            className={
              penActive
                ? 'rounded-lg border border-cheese-400 bg-cheese-100 px-3 py-1.5 text-sm font-semibold text-ink-900'
                : 'rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300'
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
                    : 'rounded-lg border border-cream-deep px-2.5 py-1.5 text-sm font-semibold text-ink-700 hover:border-cheese-300'
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
                    : 'rounded-lg border border-cream-deep px-2.5 py-1.5 text-sm font-semibold text-ink-700 hover:border-cheese-300'
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
                    'size-6 shrink-0 rounded-full ring-offset-2 transition-shadow' +
                    (penColor === c.hex ? ' ring-2 ring-ink-900' : ' ring-1 ring-cream-deep')
                  }
                />
              ))}
            </div>
          )}
          <button
            onClick={() => void clearInkForSlide(activityId, currentSlide)}
            disabled={currentSlideInk.length === 0}
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:opacity-40"
          >
            전체 지우기
          </button>
          <button
            onClick={handleExit}
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
          >
            발표 종료
          </button>
        </div>
      </div>

      {/* 펜이 켜져 있는 동안은 대본을 볼 일보다 그릴 공간이 더 급하다 —
          대본 패널을 잠시 접고 슬라이드가 가로폭을 전부 쓰게 한다. 펜을
          끄면 원래 나란히 배치로 돌아온다. 대본 입력값(noteDraft)은
          컴포넌트 state라 패널이 잠깐 안 보여도 그대로 남아있다. */}
      <div className={penActive ? 'flex flex-col gap-4' : 'grid gap-4 lg:grid-cols-[3fr_2fr]'}>
        <div
          className={
            (penActive ? 'h-[80vh]' : 'h-[60vh]') +
            ' overflow-hidden rounded-xl border border-cream-deep'
          }
        >
          <PdfViewer
            file={pdfFile}
            filename="발표자료"
            page={currentSlide}
            onPageChange={goTo}
            onPageCountChange={setPageCount}
            hideControls
            overlay={
              <PresentationInk
                strokes={currentSlideInk}
                editable
                active={penActive}
                mode={tool}
                color={penColor}
                onStrokeComplete={(stroke) => void addInkStroke(activityId, currentSlide, stroke)}
                onEraseComplete={(remaining) =>
                  void setInkForSlide(activityId, currentSlide, remaining)
                }
              />
            }
          />
        </div>

        {!penActive && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-ink-700">
              대본 <span className="font-normal text-ink-500">(학생 화면엔 안 보입니다)</span>
            </label>
            <textarea
              value={noteDraft}
              onChange={(event) => handleNoteChange(event.target.value)}
              onBlur={flushPending}
              placeholder="PPT에 발표자 노트가 없으면 여기 바로 적어도 됩니다."
              className="min-h-[60vh] flex-1 rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm leading-relaxed text-ink-900 focus:border-cheese-300 focus:outline-none"
            />
          </div>
        )}
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
