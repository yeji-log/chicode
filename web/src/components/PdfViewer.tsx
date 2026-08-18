import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * PDF 뷰어.
 *
 * 브라우저 내장 뷰어(<iframe src="blob:...">)에 맡기면 환경에 따라 화면이 비어버린다.
 * 특히 blob 주소로 만든 PDF 는 렌더링을 거부하는 경우가 있고, 모바일 브라우저는
 * iframe 안에서 PDF 를 아예 못 연다. 그래서 PDF.js 로 직접 캔버스에 그린다.
 *
 * PDF.js 는 1MB 가 넘으므로 이 컴포넌트가 실제로 쓰일 때만 내려받는다(동적 import).
 */

type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
}

/**
 * pdf.js 6 에서 문서 자체에는 destroy() 가 없다. 정리는 로딩 작업(loading task)이 맡으므로
 * 그 핸들을 따로 들고 있어야 한다.
 */
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> }

type RenderTask = { promise: Promise<void>; cancel: () => void }

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  // pdf.js 6 부터 canvas 가 필수다. 예전 방식(canvasContext) 만 넘기면 렌더가 끝나지 않는다.
  render: (options: {
    canvas: HTMLCanvasElement
    viewport: { width: number; height: number }
  }) => RenderTask
}

const LOAD_TIMEOUT_MS = 15_000
const RENDER_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

/**
 * page/onPageChange 를 주면 "제어되는" 뷰어가 된다 — 발표 모드에서 교사의
 * 조작(또는 실시간으로 받은 슬라이드 번호)을 그대로 반영해야 해서 추가했다.
 * 안 주면 예전처럼 내부 상태로 알아서 페이지를 넘긴다(SubjectMaterials 등
 * 기존 쓰임은 그대로 동작).
 */
export default function PdfViewer({
  file,
  filename,
  page: controlledPage,
  onPageChange,
  onPageCountChange,
  hideControls,
}: {
  file: Blob
  filename: string
  page?: number
  onPageChange?: (page: number) => void
  onPageCountChange?: (pageCount: number) => void
  hideControls?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const documentRef = useRef<PdfDocument | null>(null)
  const loadingTaskRef = useRef<PdfLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  /** 렌더를 한 줄로 세우기 위한 체인. 겹쳐 그리면 캔버스가 비어버린다. */
  const renderChainRef = useRef<Promise<void>>(Promise.resolve())
  const generationRef = useRef(0)

  const [pageCount, setPageCount] = useState(0)
  const [internalPage, setInternalPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const isControlled = controlledPage !== undefined
  const page = isControlled ? controlledPage! : internalPage

  function goToPage(next: number) {
    const clamped = Math.max(1, Math.min(pageCount || 1, next))
    if (isControlled) onPageChange?.(clamped)
    else setInternalPage(clamped)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist')
        // 워커는 번들러가 만든 주소를 그대로 쓴다. CDN 을 타지 않으므로
        // 학교 네트워크가 외부를 막아도 동작한다.
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default

        const data = new Uint8Array(await file.arrayBuffer())
        const task = pdfjs.getDocument({ data }) as unknown as PdfLoadingTask
        loadingTaskRef.current = task

        // 일부 기기(모듈 워커를 못 돌리는 구형 브라우저 등)는 여기서 에러를
        // 던지지 않고 그냥 영영 응답이 없다 — 화면엔 옅은 "여는 중…" 글자만
        // 남아서 "그냥 흰 화면"으로 보인다는 실사용 보고를 받았다. 일정
        // 시간 안에 안 끝나면 명확한 에러로 바꿔서 최소한 무엇이 문제인지
        // 알 수 있게 한다.
        const loaded = await withTimeout(task.promise, LOAD_TIMEOUT_MS, '문서를 여는 데 시간이 너무 오래 걸립니다')

        if (cancelled) {
          void task.destroy()
          return
        }

        documentRef.current = loaded
        setPageCount(loaded.numPages)
        onPageCountChange?.(loaded.numPages)
        if (!isControlled) setInternalPage(1)
        setLoading(false)
      } catch (caught) {
        if (cancelled) return
        console.error('PDF 열기 실패', caught)
        setError(
          '이 PDF 를 화면에 표시하지 못했습니다. 이 기기·브라우저와 호환되지 않을 수 있습니다. 다른 브라우저로 다시 시도해 주세요.',
        )
        setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      documentRef.current = null
      void loadingTaskRef.current?.destroy()
      loadingTaskRef.current = null
    }
  }, [file])

  /**
   * 현재 쪽을 컨테이너 너비에 맞춰 그린다.
   *
   * pdf.js 는 같은 캔버스에 두 렌더가 겹치는 것을 허용하지 않는다. 첫 렌더와
   * ResizeObserver 가 부르는 렌더가 겹치면 둘 다 어그러져 빈 화면이 남는다.
   * 새로 그리기 전에 진행 중인 작업을 반드시 취소한다.
   */
  const renderPage = useCallback(() => {
    // 이 호출이 최신인지 판별할 번호. 뒤이어 다른 요청이 들어오면 이 렌더는 건너뛴다.
    const generation = ++generationRef.current

    // 진행 중인 렌더가 있으면 즉시 취소 신호를 보낸다.
    renderTaskRef.current?.cancel()

    // 앞선 렌더가 완전히 끝난 뒤에 시작한다. 취소만으로는 부족하다 —
    // 두 호출이 나란히 getPage 를 기다리는 동안에는 취소할 대상 자체가 없어서,
    // 둘 다 같은 캔버스에 그리려다 화면이 비어버린다.
    const chained = renderChainRef.current
      .catch(() => {})
      .then(async () => {
        if (generation !== generationRef.current) return

        const pdf = documentRef.current
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!pdf || !canvas || !container) return

        const target = await pdf.getPage(page)
        if (generation !== generationRef.current) return

        const base = target.getViewport({ scale: 1 })

        // 폭을 컨테이너에 맞추고, 화면 배율(레티나 등)을 곱해 또렷하게 그린다.
        const available = container.clientWidth - 32
        const scale = Math.max(available / base.width, 0.1)
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        let viewport = target.getViewport({ scale: scale * ratio })

        // 일부 모바일 기기(특히 큰 화면 태블릿 + 고배율)는 캔버스 한 변이
        // 일정 크기를 넘으면 JS 에러 없이 그냥 빈 화면만 남긴다 — GPU 텍스처
        // 한도를 넘어서인 것으로 보인다. 발표 모드의 전체화면 오버레이처럼
        // 화면 전체 크기로 그릴 때 특히 이 값이 커진다. 화질 차이가 거의
        // 안 느껴지는 선에서 최대 변 길이를 안전하게 제한한다.
        const MAX_CANVAS_SIDE = 2600
        const longestSide = Math.max(viewport.width, viewport.height)
        if (longestSide > MAX_CANVAS_SIDE) {
          viewport = target.getViewport({ scale: (scale * ratio * MAX_CANVAS_SIDE) / longestSide })
        }

        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${viewport.width / ratio}px`
        canvas.style.height = `${viewport.height / ratio}px`

        const task = target.render({ canvas, viewport })
        renderTaskRef.current = task

        try {
          // getDocument() 는 성공했는데 실제 캔버스 그리기만 멈추는 기기도
          // 있을 수 있어서(GPU 드라이버 관련 등) 여기도 타임아웃을 건다.
          await withTimeout(task.promise, RENDER_TIMEOUT_MS, '쪽을 그리는 데 시간이 너무 오래 걸립니다')
        } catch (caught) {
          // 취소는 정상적인 흐름이다 (쪽 이동이나 창 크기 변경).
          if ((caught as { name?: string }).name !== 'RenderingCancelledException') {
            console.error('PDF 쪽 그리기 실패', caught)
            if (generation === generationRef.current) {
              setError(
                '이 화면을 그리지 못했습니다. 이 기기·브라우저와 호환되지 않을 수 있습니다. 다른 브라우저로 다시 시도해 주세요.',
              )
            }
          }
        } finally {
          if (renderTaskRef.current === task) renderTaskRef.current = null
        }
      })

    renderChainRef.current = chained
    return chained
  }, [page])

  useEffect(() => {
    if (loading || error) return
    void renderPage()
  }, [loading, error, renderPage])

  // 창 크기가 바뀌면 폭에 다시 맞춘다.
  useEffect(() => {
    if (loading || error) return
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => void renderPage())
    observer.observe(container)
    return () => observer.disconnect()
  }, [loading, error, renderPage])

  if (error) {
    return <p className="p-8 text-center font-semibold text-ink-700">⚠️ {error}</p>
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="flex-1 overflow-auto bg-ink-900/5 p-4">
        {loading ? (
          // 옅은 글자만 있으면 "그냥 빈 화면"처럼 보인다는 실사용 보고가
          // 있어서, 로딩 중이라는 게 눈에 확실히 띄도록 굵게·크게 바꿨다.
          <p className="animate-pulse py-8 text-center text-base font-semibold text-ink-700">
            ⏳ {filename} 여는 중…
          </p>
        ) : (
          <canvas ref={canvasRef} className="mx-auto block bg-white shadow-md" />
        )}
      </div>

      {!hideControls && pageCount > 1 && (
        <div className="flex items-center justify-center gap-4 border-t border-cream-deep bg-white px-4 py-2.5">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:opacity-40"
          >
            ← 이전
          </button>

          <span className="text-sm font-semibold text-ink-700">
            {page} / {pageCount}
          </span>

          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= pageCount}
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:opacity-40"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  )
}
