import { useEffect, useRef, useState } from 'react'
import type * as PptxPreview from 'pptx-preview'

import PdfViewer from './PdfViewer'

type PptxPreviewer = ReturnType<typeof PptxPreview.init>

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

/** 쓸 수 있는 가로 폭에서 실제로 그릴 슬라이드 폭을 정한다(16:9 가정 —
 *  아래 init 에 넘기는 height 도 같은 가정이다). */
function fitSlideWidth(available: number): number {
  const maxHeight = window.innerHeight * MAX_SLIDE_VIEWPORT_HEIGHT
  return Math.max(320, Math.min(available, (maxHeight * 16) / 9))
}

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
  useEffect(() => {
    if (!pptxFile) return
    const onResize = () => {
      const sizing = sizingRef.current
      if (!sizing || !sizing.clientWidth) return
      const next = fitSlideWidth(sizing.clientWidth)
      if (Math.abs(next - renderedWidthRef.current) < RESIZE_THRESHOLD) return
      setSizeTick((tick) => tick + 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pptxFile])

  if (state === 'fallback' && pdfFile) {
    return (
      <PdfViewer
        file={pdfFile}
        filename={filename}
        initialPage={initialPage}
        onPageChange={onPageChange}
      />
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
