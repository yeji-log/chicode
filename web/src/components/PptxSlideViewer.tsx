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
export default function PptxSlideViewer({
  pptxFile,
  pdfFile,
  filename,
  onPageChange,
}: {
  pptxFile: Blob | null
  pdfFile: Blob | null
  filename: string
  /** 지금 보고 있는 쪽 번호가 바뀔 때마다 알려준다 — "발표 시작"이 지금
   *  보고 있는 쪽에서 그대로 이어지게 하려는 용도(LabActivityDetail). */
  onPageChange?: (page: number) => void
}) {
  /** pptx-preview가 실제로 그려넣는 대상. 로딩 중엔 className="hidden"
   *  (display:none)이라 clientWidth가 0이 된다 — 폭은 반드시 sizingRef에서 잰다. */
  const containerRef = useRef<HTMLDivElement>(null)
  /** 항상 레이아웃에 남아있는 바깥 wrapper. 실제 렌더 폭(max-w-3xl 등 CSS 제약이
   *  적용된 값)을 재는 용도로만 쓴다. */
  const sizingRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PptxPreviewer | null>(null)
  const [state, setState] = useState<'loading' | 'pptx-ok' | 'fallback' | 'failed'>('loading')
  const [slideIndex, setSlideIndex] = useState(1)
  const [slideCount, setSlideCount] = useState(0)

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
        const width = sizing?.clientWidth || container!.clientWidth || 960

        const viewer = init(container!, { width, height: (width * 9) / 16, mode: 'slide' })
        viewerRef.current = viewer
        await viewer.preview(buf)
        if (cancelled) return

        if (!viewer.slideCount) throw new Error('슬라이드를 찾지 못함')
        setSlideCount(viewer.slideCount)
        setSlideIndex(1)
        onPageChange?.(1)
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
    }
  }, [pptxFile, pdfFile])

  if (state === 'fallback' && pdfFile) {
    return <PdfViewer file={pdfFile} filename={filename} onPageChange={onPageChange} />
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
      <div ref={sizingRef} className="mx-auto w-full max-w-3xl">
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
