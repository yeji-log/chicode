import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type * as PptxPreview from 'pptx-preview'

import PdfViewer from './PdfViewer'

type PptxPreviewer = ReturnType<typeof PptxPreview.init>

/**
 * 슬라이드 높이가 화면(뷰포트)의 이 비율을 넘지 않게 한다. 예전엔 폭을
 * max-w-3xl(768px)로 묶어놨는데, PC에서 자리가 남는데도 슬라이드가 작아서
 * 글씨가 안 보인다는 실사용 보고를 받았다 — 그렇다고 폭만 마음껏 늘리면
 * 16:9 슬라이드는 세로가 화면 밖으로 나가서 스크롤해야 겨우 아래쪽을 보게
 * 된다(그게 더 나쁘다). 그래서 "가로는 자리가 되는 만큼, 단 세로가 한 화면을
 * 넘지 않는 선까지"로 정한다. 0.74 는 위 제목·아래 쪽넘김 버튼과 페이지
 * 스크롤 여유까지 남기고 슬라이드가 한눈에 들어오는 값으로 잡았다.
 */
const MAX_SLIDE_VIEWPORT_HEIGHT = 0.74

/** 다시 그릴 만큼 폭이 유의미하게 달라졌는지 판단하는 기준(px). 창을 1px씩
 *  끄는 동안 매번 pptx 를 다시 렌더하면 눈에 띄게 버벅인다. */
const RESIZE_THRESHOLD = 24

/** 크기가 더 안 바뀔 때까지 기다렸다가 한 번만 다시 그리는 시간. */
const RESIZE_SETTLE_MS = 150

/**
 * 발표자료 카드를 본문 칸(App.tsx의 max-w-6xl = 1152px)보다 넓게 빼는 스타일.
 *
 * 본문 글줄은 1152px가 읽기 좋은 폭이지만 슬라이드는 다르다 — 학교 PC가
 * 1920px인데 슬라이드가 1062px에 묶여 화면의 절반만 쓰고 있었다. 그래서
 * 발표자료 섹션만 칸 밖으로 빼서 화면 폭(최대 1600px)까지 쓰게 한다.
 *
 * left:50% 는 부모 기준, translateX(-50%) 는 자기 자신 기준이라 부모가 얼마나
 * 좁든 화면 한가운데에 놓인다. 100vw 는 세로 스크롤바까지 포함한 값이라
 * 2.5rem(= 본문 좌우 여백 px-5 두 번)을 빼야 가로 스크롤바가 안 생긴다.
 *
 * 세 번째 항(높이에서 거꾸로 계산한 폭)이 카드를 슬라이드에 붙여 준다.
 * 이게 없으면 카드만 화면 폭까지 넓어지고 슬라이드는 세로 상한에 먼저
 * 걸려서, 그 차이만큼 양옆이 빈 카드가 된다 — "카드가 PPT보다 넓어서 보기
 * 불편하다"는 지적을 받은 게 이것이다. 아래 fitSlideWidth 가 고르는 두 값
 * (쓸 수 있는 폭 / 세로에서 나온 폭) 중 어느 쪽이 이기든 카드가 정확히 그
 * 폭이 되도록, 같은 두 값을 CSS 로 한 번 더 적는다. JS 로 재서 맞추지 않는
 * 이유는 순환이다 — 카드 폭을 슬라이드에 맞추면 슬라이드가 재는 "쓸 수
 * 있는 폭"이 곧 자기 자신이 되어버린다. 뷰포트만 보는 CSS 식은 그 고리를
 * 만들지 않는다.
 *
 * 3rem 은 카드 안쪽 여백(p-6) 좌우 합이다 — 이 상수는 p-6 카드에 쓴다는
 * 전제가 붙어 있다(지금 쓰는 두 곳 다 p-6).
 */
export const SLIDE_SECTION_BREAKOUT: CSSProperties = {
  position: 'relative',
  left: '50%',
  transform: 'translateX(-50%)',
  width: `min(100vw - 2.5rem, 1600px, calc(${MAX_SLIDE_VIEWPORT_HEIGHT} * 100vh * 16 / 9 + 3rem))`,
  maxWidth: 'none',
}

/** 쓸 수 있는 가로 폭에서 실제로 그릴 슬라이드 폭을 정한다(16:9 가정 —
 *  아래 init 에 넘기는 height 도 같은 가정이다).
 *
 *  아래한계(예: 320px)를 두면 안 된다 — 폰처럼 좁은 화면에서는 available 이
 *  그보다 작아서 슬라이드가 카드 밖으로 삐져나온다(실측: 285px 자리에 320px
 *  슬라이드). 좁으면 좁은 대로 자리에 맞추는 게 맞다. */
function fitSlideWidth(available: number): number {
  const maxHeight = window.innerHeight * MAX_SLIDE_VIEWPORT_HEIGHT
  return Math.max(1, Math.min(available, (maxHeight * 16) / 9))
}

/**
 * Lab 활동에 첨부된 발표자료(PPT) 뷰어.
 *
 * pptx-preview로 실제 .pptx 렌더링을 먼저 시도한다. pptxgenjs로 만든 테스트
 * 파일로 직접 확인한 결과, 이 라이브러리가 렌더링 도중 내부에서 예외를
 * 던지는 경우가 있었다("Cannot read properties of undefined (reading
 * 'background')") — 실제 파워포인트에서 내보낸 파일은 다를 수도 있지만
 * 신뢰할 근거가 부족하다. 그래서 pptx 렌더링이 실패하면(예외든 슬라이드
 * 0장이든) 조용히 PDF 버전(교사가 함께 올렸다면)으로 넘어간다.
 *
 * 원본 Blob 은 렌더링에만 쓰고 다운로드 링크·URL로 절대 내보내지 않는다 —
 * "뷰어만, 다운로드 불가" 요구사항 때문이다. (PIN 잠금과 같은 수준의
 * 소프트한 방지다 — 화면을 캡처하는 것까지 막을 수는 없다.)
 */
export default function PptxSlideViewer({
  pptxFile,
  pdfFile,
  filename,
  initialPage,
  onPageChange,
}: {
  pptxFile: Blob | null
  pdfFile: Blob | null
  filename: string
  /** 문서를 처음 열 때 보여줄 쪽 — 안 주면 1쪽부터. "발표 시작"을 마지막으로
   *  발표를 종료한 자리부터 재개하려는 용도(LabActivityDetail/
   *  SubjectMaterials가 마운트 시점에만 한 번 넘긴다). */
  initialPage?: number
  /** 지금 보고 있는 쪽 번호가 바뀔 때마다 알려준다 — "발표 시작"이 지금
   *  보고 있는 쪽에서 그대로 이어지게 하려는 용도(LabActivityDetail). */
  onPageChange?: (page: number) => void
}) {
  /** pptx-preview가 실제로 그려넣는 대상. 로딩 중엔 className="hidden"
   *  (display:none)이라 clientWidth가 0이 된다 — 폭은 반드시 sizingRef에서 잰다. */
  const containerRef = useRef<HTMLDivElement>(null)
  /** 항상 레이아웃에 남아있는 바깥 wrapper. 실제로 쓸 수 있는 폭(부모의 패딩까지
   *  적용된 값)을 재는 용도로만 쓴다. */
  const sizingRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PptxPreviewer | null>(null)
  const [state, setState] = useState<'loading' | 'pptx-ok' | 'fallback' | 'failed'>('loading')
  const [slideIndex, setSlideIndex] = useState(1)
  const [slideCount, setSlideCount] = useState(0)
  /** 창 크기가 바뀌어 다시 그려야 할 때 올린다(아래 렌더 effect 의 의존성). */
  const [sizeTick, setSizeTick] = useState(0)
  /** 지금 화면에 그려져 있는 슬라이드 폭. 창 크기 변화가 다시 그릴 만한지
   *  판단하는 기준값이라 state 가 아니라 ref 다. */
  const renderedWidthRef = useRef(0)
  /** 지금 보고 있는 쪽. 다시 그릴 때 1쪽으로 돌아가지 않게 하려고 들고 있다 —
   *  pptx-preview 는 init 부터 다시 해야 크기가 바뀌기 때문에, 다시 그리는 것이
   *  곧 "처음부터 다시 여는 것"이다. */
  const slideRef = useRef(Math.max(1, initialPage ?? 1))

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    const sizing = sizingRef.current

    if (!pptxFile || !container) {
      setState(pdfFile ? 'fallback' : 'failed')
      return
    }

    async function render() {
      try {
        const { init } = await import('pptx-preview')
        const buf = await pptxFile!.arrayBuffer()
        // container는 로딩 중 display:none이라 clientWidth가 0이다. 항상
        // 보이는 sizing wrapper에서 실제 렌더 폭을 잰다.
        const available = sizing?.clientWidth || container!.clientWidth || 960
        const width = fitSlideWidth(available)
        renderedWidthRef.current = width

        // 여기까지 오는 동안(동적 import + arrayBuffer) 이 렌더가 이미 무효가
        // 됐을 수 있다. init 은 되돌릴 수 없는 DOM 삽입이라, 그 전에 반드시
        // 한 번 더 확인한다 — 이 확인이 없으면 창 크기를 빠르게 바꿀 때
        // 옛 크기의 슬라이드가 새 것 아래에 그대로 남아 쌓인다.
        if (cancelled) return
        container!.replaceChildren()

        const viewer = init(container!, { width, height: (width * 9) / 16, mode: 'slide' })
        viewerRef.current = viewer
        await viewer.preview(buf)
        if (cancelled) return

        if (!viewer.slideCount) throw new Error('슬라이드를 찾지 못함')
        setSlideCount(viewer.slideCount)
        // preview()는 항상 1번째 슬라이드(index 0)를 먼저 그린다 — 다른
        // 쪽에서 시작해야 하면 한 번 더 그려서 덮는다.
        // slideRef 는 처음엔 initialPage, 그 뒤로는 지금 보고 있는 쪽이다 —
        // 창 크기가 바뀌어 다시 그릴 때 보던 쪽이 그대로 남는다.
        const start = Math.max(1, Math.min(viewer.slideCount, slideRef.current))
        if (start !== 1) viewer.renderSingleSlide(start - 1)
        slideRef.current = start
        setSlideIndex(start)
        onPageChange?.(start)
        setState('pptx-ok')
      } catch (caught) {
        console.error('pptx 렌더링 실패, PDF로 대체합니다', caught)
        if (!cancelled) setState(pdfFile ? 'fallback' : 'failed')
      }
    }

    void render()

    return () => {
      cancelled = true
      viewerRef.current?.destroy()
      viewerRef.current = null
      // destroy() 는 자기가 만든 뷰어만 정리하고 container 안의 DOM은 남긴다 —
      // 다시 그릴 때(sizeTick) 예전 크기의 슬라이드가 아래에 그대로 쌓인다.
      if (container) container.replaceChildren()
    }
  }, [pptxFile, pdfFile, sizeTick])

  // 창 크기가 바뀌면 슬라이드도 새 크기로 다시 그린다. pptx-preview 는 init 에
  // 넘긴 px 크기로 고정 렌더라 CSS 만으로는 따라오지 않는다.
  //
  // ResizeObserver 로 자리를 직접 지켜보는 게 더 일반적이지만 여기선 window 의
  // resize 로 충분하다 — 이 뷰어가 쓸 수 있는 폭은 카드가 정하고, 카드 폭은
  // 뷰포트만 보는 CSS 식이다(SLIDE_SECTION_BREAKOUT). 즉 뷰포트가 안 바뀌면
  // 자리도 안 바뀐다. 게다가 ResizeObserver 는 화면을 실제로 그리지 않는
  // 상황에서 콜백이 아예 안 오는 경우가 있어서(미리보기 창을 숨긴 채로
  // 확인해보니 폭이 1314→650→1314 로 변하는 동안 콜백이 0번 왔다) 검증하기도
  // 어렵다.
  useEffect(() => {
    if (!pptxFile) return

    // 창을 끄는 동안 pptx 를 매번 처음부터 다시 여는 건 너무 무겁다 —
    // 멈춘 뒤 한 번만 그린다.
    let timer: number | undefined

    // iPad Safari 는 스크롤로 상단 주소창이 접혔다 펴질 때마다 window 에 resize
    // 를 쏘고 window.innerHeight 가 수십~수백 px 출렁인다. fitSlideWidth 는 그
    // 높이로 슬라이드 폭을 정하므로, 매 스크롤마다 다른 값이 나와 pptx 를
    // 처음부터 다시 여는 통에 슬라이드가 스크롤 중에 커졌다 작아졌다 하고
    // 화면이 버벅였다(사용자 보고 + 화면 녹화로 확인). 슬라이드 자리를 실제로
    // 바꾸는 건 가로폭 변화(회전·분할보기 크기 조절)뿐이므로, 가로가 그대로면
    // — 즉 주소창만 여닫힌 resize 는 — 무시한다.
    let lastWidth = window.innerWidth

    const onResize = () => {
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth

      const sizing = sizingRef.current
      if (!sizing || !sizing.clientWidth) return
      const next = fitSlideWidth(sizing.clientWidth)
      if (Math.abs(next - renderedWidthRef.current) < RESIZE_THRESHOLD) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setSizeTick((tick) => tick + 1), RESIZE_SETTLE_MS)
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [pptxFile])

  if (state === 'fallback' && pdfFile) {
    // PdfViewer 는 제 컨테이너 폭에 맞춰 그리므로, 폭을 CSS 로만 묶어주면
    // fitSlideWidth 와 같은 규칙("가로는 자리껏, 세로는 한 화면 안")이 된다.
    // 여기선 JS 로 잴 필요가 없다 — PdfViewer 자신이 ResizeObserver 로 창
    // 크기 변화를 따라간다.
    return (
      <div className="mx-auto flex w-full justify-center">
        <div
          className="min-w-0 flex-1"
          style={{ maxWidth: `calc(${MAX_SLIDE_VIEWPORT_HEIGHT} * 100vh * 16 / 9)` }}
        >
          <PdfViewer
            file={pdfFile}
            filename={filename}
            initialPage={initialPage}
            onPageChange={onPageChange}
          />
        </div>
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <p className="p-8 text-center text-ink-500">
        이 발표자료를 화면에 표시하지 못했습니다. 선생님께 문의해 주세요.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {state === 'loading' && (
        <p className="py-8 text-center text-ink-500">발표자료 여는 중…</p>
      )}
      {/* 폭 제한을 CSS(max-w-*)로 걸지 않는다 — 실제 크기는 fitSlideWidth 가
          "쓸 수 있는 폭"과 "화면 높이" 둘 다 보고 정하고, 이 wrapper 는 그
          쓸 수 있는 폭을 재는 자 역할만 한다. */}
      <div ref={sizingRef} className="mx-auto flex w-full justify-center">
        <div
          ref={containerRef}
          className={
            state === 'pptx-ok'
              ? 'overflow-hidden rounded-lg border border-cream-deep bg-white'
              : 'hidden'
          }
        />
      </div>
      {state === 'pptx-ok' && slideCount > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => {
              viewerRef.current?.renderPreSlide()
              setSlideIndex((i) => {
                const next = Math.max(1, i - 1)
                slideRef.current = next
                onPageChange?.(next)
                return next
              })
            }}
            disabled={slideIndex <= 1}
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:opacity-40"
          >
            ← 이전
          </button>
          <span className="text-sm font-semibold text-ink-700">
            {slideIndex} / {slideCount}
          </span>
          <button
            onClick={() => {
              viewerRef.current?.renderNextSlide()
              setSlideIndex((i) => {
                const next = Math.min(slideCount, i + 1)
                slideRef.current = next
                onPageChange?.(next)
                return next
              })
            }}
            disabled={slideIndex >= slideCount}
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:opacity-40"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  )
}
