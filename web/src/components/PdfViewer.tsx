import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { asset } from '../lib/asset'
import { isDebugEnabled, pushDebug } from '../lib/debugLog'

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

/** 창 크기가 더 안 바뀔 때까지 기다렸다가 한 번만 다시 그리는 시간. */
const RESIZE_SETTLE_MS = 120

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
 * 갤럭시 탭 발표 화면 한글 깨짐을 진단하려고 넣었다 — 이 기기의 pdf.js가
 * 실제로 폰트를 어떻게 로드했는지(임베드 폰트가 이 런타임에서도 정상
 * 파싱됐는지) 직접 확인한다. Node 로 이 앱 밖에서 미리 검증했을 때와 같은
 * 방식이다. commonObjs/getOperatorList 는 공식 타입 선언에 없는 내부
 * API라 필요한 부분만 any 로 접근한다 — 진단 전용이라 실패해도 무시한다.
 */
async function logFontDiagnostics(page: unknown): Promise<void> {
  try {
    const p = page as {
      getOperatorList: () => Promise<unknown>
      getTextContent: () => Promise<{ items: Array<{ fontName?: string }> }>
      commonObjs: { get: (key: string) => unknown }
    }
    await p.getOperatorList()

    // g_d0_f1 같은 패턴을 추측해서 찔러보던 첫 버전은 실기기에서 전부
    // 비어(`{}`) 나왔다 — 추측이 틀렸다는 뜻이라, 대신 이 페이지가 실제로
    // 쓴 폰트 이름을 getTextContent 로 직접 받아온다.
    const textContent = await p.getTextContent()
    const usedKeys = new Set(
      textContent.items.map((item) => item.fontName).filter((name): name is string => !!name),
    )

    const fonts: Record<string, unknown> = {}
    let firstGetError: string | null = null
    for (const key of usedKeys) {
      try {
        const font = p.commonObjs.get(key) as
          | { name?: string; fallbackName?: string; missingFile?: boolean; isType3Font?: boolean }
          | undefined
        fonts[key] = font
          ? {
              name: font.name,
              fallbackName: font.fallbackName,
              missingFile: font.missingFile,
              isType3Font: font.isType3Font,
            }
          : '(commonObjs.get 이 값을 안 줌 — undefined)'
      } catch (caught) {
        fonts[key] = `(commonObjs.get 실패: ${caught})`
        firstGetError ??= String(caught)
      }
    }
    pushDebug('PdfViewer 폰트 진단', { usedKeys: [...usedKeys], fonts, firstGetError })
  } catch (caught) {
    pushDebug('PdfViewer 폰트 진단 실패', caught)
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
  initialPage,
  onPageChange,
  onPageCountChange,
  hideControls,
  fitToContainer,
  overlay,
}: {
  file: Blob
  filename: string
  page?: number
  /** 제어되지 않는(훑어보기) 뷰어가 문서를 처음 열 때 보여줄 쪽. 안 주면
   *  예전처럼 1쪽부터. page(제어 모드)와는 무관 — 발표 모드는 항상 page를
   *  준다. */
  initialPage?: number
  onPageChange?: (page: number) => void
  onPageCountChange?: (pageCount: number) => void
  hideControls?: boolean
  /** 발표 화면처럼 "한 화면에 통째로" 보여야 하는 쓰임에 준다 — 폭뿐 아니라
   *  컨테이너 높이에도 맞춰서 스크롤 없이 전부 보이게 한다. 안 주면 예전처럼
   *  폭에만 맞추고 넘치는 만큼 세로로 스크롤한다(여러 쪽짜리 문서 열람용).
   *
   *  세로까지 맞추는 건 보기 좋으라고만 있는 게 아니다 — 폭에만 맞추면 세로가
   *  넘쳐 스크롤바가 생기고, 스크롤바가 생기면 clientWidth 가 줄어 다시
   *  그리고, 작아지니 스크롤바가 사라져 clientWidth 가 늘고… 하는 되먹임이
   *  생긴다. 윈도우에서 F11 로 전체화면을 켰을 때 발표 화면이 떨린다는 보고의
   *  원인이 이거였다(아래 renderPage 주석). */
  fitToContainer?: boolean
  /** 실제로 그려진 PDF 캔버스 위에 정확히 겹쳐 그릴 내용(펜 오버레이 등).
   *  이 캔버스를 감싸는 wrapper가 캔버스 크기에 딱 맞게 shrink-wrap되어
   *  있어서(className="w-fit"), 위치·크기를 따로 재지 않아도 항상 캔버스와
   *  겹친다. */
  overlay?: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const documentRef = useRef<PdfDocument | null>(null)
  const loadingTaskRef = useRef<PdfLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  /** 렌더를 한 줄로 세우기 위한 체인. 겹쳐 그리면 캔버스가 비어버린다. */
  const renderChainRef = useRef<Promise<void>>(Promise.resolve())
  /** 마지막으로 그릴 때 기준으로 삼은 컨테이너 크기. ResizeObserver 가 알려온
   *  변화가 진짜로 다시 그릴 만한 것인지 판단하는 데 쓴다. */
  const lastRenderSizeRef = useRef({ width: 0, height: 0 })
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
        // 경로로 그리면 깨지는 알려진 버그가 여럿 있다길래
        // (mozilla/pdf.js#19672, #20143, #3466 등) disableFontFace: true 로
        // 바꿔봤는데, 이것도 틀렸다 — 실기기 진단 로그(logFontDiagnostics)로
        // 확인해보니 disableFontFace: true 를 켠 채로는 이 기기에서 모든
        // 폰트가 missingFile: true 로 나왔다. pdf.js 가 브라우저 폰트 API 없이
        // 직접 폰트를 파싱하는 이 경로 자체가 이 기기의 자바스크립트 엔진에서
        // 실패해서, 진짜 한글 폰트 대신 monospace/sans-serif 같은 대체
        // 폰트(fallbackName)로 그려버리고 있었다 — 그래서 엉뚱한 글자가
        // 나온 것이었다. 그래서 disableFontFace 는 다시 뺐다(기본값 false,
        // 브라우저 네이티브 @font-face 사용). 위 mozilla 이슈들이 걱정한
        // "네이티브 렌더링이 깨지는" 경우와는 다른 기기·다른 폰트일 수 있어서
        // 여기 있는 실제 진단 데이터를 더 신뢰한다.
        const task = pdfjs.getDocument({
          data,
          cMapUrl: asset('pdfjs/cmaps/'),
          cMapPacked: true,
          standardFontDataUrl: asset('pdfjs/standard_fonts/'),
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
          const start = Math.max(1, Math.min(loaded.numPages, initialPage ?? 1))
          setInternalPage(start)
          onPageChange?.(start)
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

        // 이 진단은 페이지 내용을 통째로 두 번(연산자 목록 + 텍스트) 파싱해서
        // 한 번에 수십 ms 가 든다. 창 크기가 바뀔 때마다 렌더가 다시 도는데
        // 거기에 매번 얹히면 그 자체가 버벅임이 된다 — 원래 목적(갤럭시 탭
        // 한글 깨짐 조사)대로 ?debug=1 로 켰을 때만 돌린다.
        if (isDebugEnabled()) await logFontDiagnostics(target)

        const base = target.getViewport({ scale: 1 })

        // 폭을 컨테이너에 맞추고, 화면 배율(레티나 등)을 곱해 또렷하게 그린다.
        // 32 는 컨테이너의 p-4(양쪽 16px).
        const availableWidth = container.clientWidth - 32
        const availableHeight = container.clientHeight - 32
        lastRenderSizeRef.current = {
          width: container.clientWidth,
          height: container.clientHeight,
        }

        // fitToContainer 면 세로도 같이 맞춘다 — 둘 중 더 빡빡한 쪽이 이긴다.
        //
        // 이게 없을 때 윈도우 F11 전체화면에서 발표 화면이 떨렸다. 폭에만
        // 맞추면 16:9 슬라이드의 세로가 화면보다 몇 픽셀 넘치는데, 그러면
        // overflow-auto 컨테이너에 세로 스크롤바가 생긴다 → clientWidth 가
        // 스크롤바 폭만큼 줄어든다 → 더 작게 다시 그린다 → 이제 안 넘치니
        // 스크롤바가 사라진다 → clientWidth 가 원래대로 는다 → 다시 크게
        // 그린다 → … ResizeObserver 가 이 되먹임을 계속 돌린다. 창 높이가
        // 딱 그 경계에 놓일 때만 나타나는데, F11 이 정확히 창 높이를 바꾸는
        // 조작이라 거기서 잘 걸렸다. 세로까지 맞추면 애초에 넘치지 않아서
        // 스크롤바가 생길 일이 없다(컨테이너도 아래에서 overflow-hidden 이 된다).
        const widthScale = availableWidth / base.width
        const scale = Math.max(
          fitToContainer && availableHeight > 0
            ? Math.min(widthScale, availableHeight / base.height)
            : widthScale,
          0.1,
        )
        const ratio = Math.min(window.devicePixelRatio || 1, 2)

        // "화면에 보이는 크기"는 배율(ratio)과 무관하게 컨테이너 폭에만 맞춘다.
        // 아래 해상도 캡이 걸리더라도 이 크기는 절대 줄어들면 안 된다 — 예전엔
        // 캡이 걸린 viewport를 ratio로 나눠 되돌리는 방식이라, 캡이 걸리는 순간
        // 화면 크기까지 같이 줄어들었다(아래 설명).
        const displayViewport = target.getViewport({ scale })

        let renderViewport = target.getViewport({ scale: scale * ratio })

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
        //
        // 이 캡을 화면 크기(style.width/height) 계산에도 같이 써버리는 버그가
        // 있었다: devicePixelRatio 2인 큰 화면(발표를 넓게 띄워놓는 상황일수록
        // available이 커서 더 잘 걸림)에서 캡이 걸리면 화면에 보이는 슬라이드
        // 폭이 1600 / ratio = 800px로 뚝 떨어졌다 — "학생 화면 PPT가 작게
        // 보인다"는 보고의 원인. 캡은 아래 renderViewport(해상도)에만 적용하고
        // 화면 크기는 항상 displayViewport를 쓰도록 분리해서 고쳤다.
        const MAX_CANVAS_SIDE = 1600
        const longestSide = Math.max(renderViewport.width, renderViewport.height)
        if (longestSide > MAX_CANVAS_SIDE) {
          renderViewport = target.getViewport({
            scale: (scale * ratio * MAX_CANVAS_SIDE) / longestSide,
          })
        }

        canvas.width = renderViewport.width
        canvas.height = renderViewport.height
        canvas.style.width = `${displayViewport.width}px`
        canvas.style.height = `${displayViewport.height}px`

        pushDebug('PdfViewer 렌더 시작', {
          page,
          containerClientWidth: container.clientWidth,
          containerClientHeight: container.clientHeight,
          fitToContainer: !!fitToContainer,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          cssWidth: displayViewport.width,
          cssHeight: displayViewport.height,
          ratio,
          cappedByMaxSide: longestSide > MAX_CANVAS_SIDE,
        })

        const task = target.render({ canvas, viewport: renderViewport })
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
  }, [page, fitToContainer])

  useEffect(() => {
    if (loading || error) return
    void renderPage()
  }, [loading, error, renderPage])

  // 창 크기가 바뀌면 다시 맞춘다.
  useEffect(() => {
    if (loading || error) return
    const container = containerRef.current
    if (!container) return

    // F11 로 전체화면을 켜고 끌 때처럼 크기가 한 번에 여러 단계로 바뀌는
    // 상황에서는 resize 가 연달아 들어온다. 그때마다 통째로 다시 그리면
    // (한 번이 수십 ms 다) 화면이 눈에 띄게 버벅인다 — 마지막 크기 하나만
    // 그리면 된다.
    let timer: number | undefined

    const observer = new ResizeObserver(() => {
      // 실제로 기준이 바뀌었을 때만 다시 그린다. 폭에만 맞추는 모드에서는
      // 높이가 아무리 변해도 결과가 같으므로 무시한다 — 쓸데없이 다시 그리면
      // 그 자체가 레이아웃을 건드려 또 다른 resize 를 부를 수 있다.
      const last = lastRenderSizeRef.current
      const sameWidth = container.clientWidth === last.width
      const sameHeight = container.clientHeight === last.height
      if (sameWidth && (!fitToContainer || sameHeight)) return

      window.clearTimeout(timer)
      timer = window.setTimeout(() => void renderPage(), RESIZE_SETTLE_MS)
    })
    observer.observe(container)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [loading, error, renderPage, fitToContainer])

  if (error) {
    return <p className="p-8 text-center font-semibold text-ink-700">⚠️ {error}</p>
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={containerRef}
        className={
          'flex-1 bg-ink-900/5 p-4 ' +
          (fitToContainer
            ? // 넘칠 일이 없으므로 스크롤을 아예 끈다(스크롤바가 폭을 흔드는
              // 되먹임의 마지막 여지까지 없앤다). 남는 자리에는 슬라이드를
              // 가운데 둔다.
              'flex items-center justify-center overflow-hidden'
            : // 스크롤바가 나타나고 사라져도 clientWidth 가 변하지 않게 자리를
              // 미리 비워둔다 — 여기서도 같은 되먹임이 날 수 있어서다.
              'overflow-auto [scrollbar-gutter:stable]')
        }
      >
        {loading ? (
          // 옅은 글자만 있으면 "그냥 빈 화면"처럼 보인다는 실사용 보고가
          // 있어서, 로딩 중이라는 게 눈에 확실히 띄도록 굵게·크게 바꿨다.
          <p className="animate-pulse py-8 text-center text-base font-semibold text-ink-700">
            ⏳ {filename} 여는 중…
          </p>
        ) : (
          <div className="relative mx-auto w-fit">
            <canvas
              ref={canvasRef}
              className="block bg-white shadow-md"
              // 아이패드(애플펜슬)에서 이 캔버스 위 드래그를 iOS Safari가
              // 텍스트/이미지 선택 제스처로 오인해서 "복사하기·선택 영역
              // 찾기" 콜아웃 메뉴를 띄운다는 실사용 보고가 있었다. 발표 펜
              // (PresentationInk.tsx)이 편집 가능한 상태(active && editable)
              // 일 때는 그 오버레이 캔버스가 이 캔버스 위를 덮어 포인터
              // 이벤트를 대신 받지만, 그 전(발표를 아직 시작 안 했을 때)이나
              // 학생 화면(항상 읽기 전용이라 오버레이가 pointerEvents:none)
              // 에서는 터치가 이 PDF 캔버스로 그대로 통과해서 그 콜아웃이
              // 뜬다. PresentationInk.tsx의 NO_CALLOUT_STYLE과 같은 값을
              // 여기 직접 둔다 — PdfViewer가 더 하위/범용 컴포넌트라 특정
              // 기능(발표 펜) 컴포넌트를 거꾸로 import하고 싶지 않아서다.
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            />
            {overlay}
          </div>
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
