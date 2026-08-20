import { useCallback, useEffect, useRef, useState } from 'react'

import { asset } from '../lib/asset'
import { pushDebug } from '../lib/debugLog'

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
 * 렌더가 "성공"으로 끝났는데도 실제로는 빈 캔버스만 남는(GPU 텍스처 한도로
 * 추정되는) 문제를 진단하려고 넣었다. 몇 개 점만 샘플로 찍어 전부 완전
 * 흰색·완전 투명이면 사실상 빈 화면으로 본다 — 진단용이라 정밀할 필요는 없다.
 */
function checkCanvasBlank(canvas: HTMLCanvasElement): string {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return '2d context 없음(다른 context 타입 사용 중일 수 있음)'
    const w = canvas.width
    const h = canvas.height
    if (w === 0 || h === 0) return `캔버스 크기가 0 (${w}x${h})`
    const points = [
      [Math.floor(w / 2), Math.floor(h / 2)],
      [2, 2],
      [w - 2, h - 2],
    ]
    const isBlankPixel = (data: Uint8ClampedArray) =>
      (data[3] === 0) || (data[0] === 255 && data[1] === 255 && data[2] === 255)
    const allBlank = points.every(([x, y]) => isBlankPixel(ctx.getImageData(x, y, 1, 1).data))
    return allBlank ? '빈 화면으로 보임(샘플 픽셀 전부 흰색/투명)' : '정상적으로 그려진 것으로 보임'
  } catch (caught) {
    return `확인 실패: ${caught}`
  }
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

  // onPageChange 는 "제어"(page prop)와 별개로 "지금 몇 쪽인지 알림" 용도로도
  // 쓴다 — 제어되지 않는(우연히 그냥 훑어보는) 뷰어에서도 항상 부른다.
  // 발표 시작 페이지를 "지금 보고 있는 쪽"과 자동으로 맞추려는 쓰임이 있어서다.
  function goToPage(next: number) {
    const clamped = Math.max(1, Math.min(pageCount || 1, next))
    if (isControlled) onPageChange?.(clamped)
    else {
      setInternalPage(clamped)
      onPageChange?.(clamped)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      pushDebug('PdfViewer 로드 시작', { filename })
      try {
        const pdfjs = await import('pdfjs-dist')
        // 워커는 번들러가 만든 주소를 그대로 쓴다. CDN 을 타지 않으므로
        // 학교 네트워크가 외부를 막아도 동작한다.
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default

        const data = new Uint8Array(await file.arrayBuffer())
        // cMap/표준 폰트 데이터 없이 열면, 한글처럼 폰트가 통짜로 임베드되지
        // 않고 CID 매핑이 필요하거나(예: 시스템 폰트로 대체되는 경우) 표준
        // 폰트로 대체해야 하는 글자가 깨져서(네모/엉뚱한 글자) 나온다 — 갤럭시
        // 탭에서 발표 화면 크래시(mapUpsertPolyfill.ts)를 고치고 나서야 실제로
        // 확인된 증상이다. scripts/sync-pdfjs-assets.mjs 가 node_modules 안의
        // pdfjs-dist 데이터를 그대로 public/pdfjs 로 복사해둔다(외부 CDN 금지
        // 원칙과 같은 이유로 자체 호스팅).
        //
        // 이걸로도 안 되는 경우가 있었다 — 실제 OT 발표 파일로 확인해보니
        // 폰트는 정상적으로 임베드돼 있는데도(missingFile: false, node로 직접
        // 검증함) 갤럭시 탭 발표 화면에서만 한글이 네모/엉뚱한 글자로 나왔다.
        // pdf.js 는 기본으로 브라우저 네이티브 @font-face 로 임베드 폰트를
        // 그리는데, 안드로이드 Chrome/WebView 에는 특정 임베드 폰트를 이
        // 경로로 그리면 깨지는 알려진 버그가 여럿 있다
        // (mozilla/pdf.js#19672, #20143, #3466 등). disableFontFace: true 로
        // 두면 브라우저 폰트 API를 거치지 않고 pdf.js 가 임베드된 폰트의
        // 글리프를 직접 그린다 — 이 앱이 다루는 발표자료는 폰트가 다 임베드돼
        // 있어서(시스템 폰트로 대체할 일이 없어서) 이 설정으로 잃을 게 없다.
        const task = pdfjs.getDocument({
          data,
          cMapUrl: asset('pdfjs/cmaps/'),
          cMapPacked: true,
          standardFontDataUrl: asset('pdfjs/standard_fonts/'),
          disableFontFace: true,
        }) as unknown as PdfLoadingTask
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

        pushDebug('PdfViewer 로드 성공', { numPages: loaded.numPages })
        documentRef.current = loaded
        setPageCount(loaded.numPages)
        onPageCountChange?.(loaded.numPages)
        if (!isControlled) {
          setInternalPage(1)
          onPageChange?.(1)
        }
        setLoading(false)
      } catch (caught) {
        if (cancelled) return
        console.error('PDF 열기 실패', caught)
        pushDebug('PdfViewer 로드 실패', caught)
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
        //
        // 갤럭시 탭에서 겪은 "발표 모드에서 완전히 빈 화면" 버그의 실제 원인은
        // 이게 아니었다 — 실기기 로그로 확인해보니 pdf.js 가 이 기기의 구형
        // Chrome 에 없는 Map.prototype.getOrInsertComputed 를 불러서 렌더링
        // 도중 예외를 던지는 게 진짜 원인이었다(mapUpsertPolyfill.ts 참고).
        // 그래도 이 캔버스 크기 제한 자체는 별개로 다른 기기에서 실사용
        // 보고가 있었던 값이라 남겨둔다 — 2600 → 1600 으로 낮춘 것도 그
        // 보고 이후였고, 위 진짜 원인이 고쳐진 뒤에도 여전히 문제가
        // 재현되면 그때 다시 2600 으로 되돌려도 된다.
        const MAX_CANVAS_SIDE = 1600
        const longestSide = Math.max(viewport.width, viewport.height)
        if (longestSide > MAX_CANVAS_SIDE) {
          viewport = target.getViewport({ scale: (scale * ratio * MAX_CANVAS_SIDE) / longestSide })
        }

        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${viewport.width / ratio}px`
        canvas.style.height = `${viewport.height / ratio}px`

        pushDebug('PdfViewer 렌더 시작', {
          page,
          containerClientWidth: container.clientWidth,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          ratio,
          cappedByMaxSide: longestSide > MAX_CANVAS_SIDE,
        })

        const task = target.render({ canvas, viewport })
        renderTaskRef.current = task

        try {
          // getDocument() 는 성공했는데 실제 캔버스 그리기만 멈추는 기기도
          // 있을 수 있어서(GPU 드라이버 관련 등) 여기도 타임아웃을 건다.
          await withTimeout(task.promise, RENDER_TIMEOUT_MS, '쪽을 그리는 데 시간이 너무 오래 걸립니다')
          pushDebug('PdfViewer 렌더 완료', { page, blankCheck: checkCanvasBlank(canvas) })
        } catch (caught) {
          // 취소는 정상적인 흐름이다 (쪽 이동이나 창 크기 변경).
          if ((caught as { name?: string }).name !== 'RenderingCancelledException') {
            console.error('PDF 쪽 그리기 실패', caught)
            pushDebug('PdfViewer 렌더 실패', caught)
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
