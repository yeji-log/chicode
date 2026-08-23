import { useEffect, useRef, type CSSProperties } from 'react'

import type { InkPoint, InkStroke } from '../lib/labPresentation'

/** 무지개 7색 — 색을 고르는 툴바(LabPresenter)와 여기 렌더링이 같은
 *  목록을 쓴다. 맨 앞(빨강)이 기본값이자, 색 정보가 없는 옛 획(색 선택
 *  기능 추가 전에 그려진 것)의 대체색이기도 하다. */
export const PEN_COLORS = [
  { name: '빨강', hex: '#ef4444' },
  { name: '주황', hex: '#f97316' },
  { name: '노랑', hex: '#eab308' },
  { name: '초록', hex: '#22c55e' },
  { name: '파랑', hex: '#3b82f6' },
  { name: '남색', hex: '#4f46e5' },
  { name: '보라', hex: '#a855f7' },
] as const

const DEFAULT_PEN_COLOR = PEN_COLORS[0].hex
const PEN_WIDTH_CSS_PX = 3
/** 지우개가 획에 닿았다고 인정하는 반경(CSS px 기준). 펜 굵기(3px)보다
 *  훨씬 넉넉하게 잡아야 손가락/펜슬로 얇은 선을 정확히 조준하지 않아도
 *  지워진다 — 실제 지우개 도구들이 그렇듯. */
const ERASE_RADIUS_CSS_PX = 16

/** 아이패드(애플펜슬)에서 iOS Safari가 캔버스/버튼 위 드래그를 텍스트
 *  선택 제스처로 오인해서 "복사하기/찾아보기/번역" 콜아웃 메뉴를 띄우는
 *  걸 막는 공통 스타일. touch-action: none만으로는 이 롱프레스 콜아웃까지는
 *  안 막혀서(그건 스크롤/줌 제스처만 막는다) pointerdown의 preventDefault와
 *  같이 써야 한다. 캔버스뿐 아니라 색 스와치 버튼에도 같은 문제가
 *  보고돼서(획을 그리기 직전에 색을 고르는 손가락 움직임도 같은 제스처로
 *  잡히는 것으로 추정) 두 군데 다 적용한다.
 */
export const NO_CALLOUT_STYLE: CSSProperties = {
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/**
 * PDF 캔버스 위에 얹는 투명한 펜/지우개 오버레이. 파워포인트 발표 펜처럼
 * 슬라이드 위에 자유롭게 줄을 긋는 용도라 좌표는 캔버스 픽셀이 아니라
 * 슬라이드 기준 0~1 비율(InkPoint)로 저장한다 — 교사 화면과 학생 화면의
 * 실제 렌더 크기가 서로 다르기 때문에(PdfViewer가 각자 컨테이너 폭에
 * 맞춰 그린다), 비율로 저장해야 어느 화면에서든 같은 자리에 그려진다.
 *
 * strokes(=Firestore에서 이미 확정된 획들)와 "지금 그리고 있는/지우고
 * 있는 중이라 아직 커밋 안 된 변화"를 같은 캔버스에 같이 그린다. 후자는
 * pointermove마다 리액트 상태를 거치지 않고 캔버스에 직접 그리는
 * 방식이다 — 매 프레임 리렌더를 피하기 위해서다. onStrokeComplete/
 * onEraseComplete는 손을 뗄 때 한 번만 불린다(호출부가 그때 Firestore에
 * 쓴다).
 */
export default function PresentationInk({
  strokes,
  editable,
  active,
  mode = 'draw',
  color = DEFAULT_PEN_COLOR,
  onStrokeComplete,
  onEraseComplete,
}: {
  /** 지금 슬라이드에 이미 저장된 획들. 각 획은 그릴 때 골랐던 색을 그대로
   *  들고 있다(stroke.color) — 지금 고른 색(color prop)과는 무관하다. */
  strokes: InkStroke[]
  /** 이 화면이 그릴 수 있는 화면인지(교사 화면만 true). */
  editable: boolean
  /** 펜 도구가 켜져 있는지 — editable && active일 때만 입력을 받는다. */
  active: boolean
  /** 'draw'면 줄을 긋고, 'erase'면 드래그가 닿은 획을 통째로 지운다.
   *  읽기 전용 화면(editable=false)에는 의미 없다. */
  mode?: 'draw' | 'erase'
  /** 지금부터 그릴 획에 적용할 색(PEN_COLORS 중 하나). mode가 'erase'일
   *  땐 쓰이지 않는다. */
  color?: string
  onStrokeComplete?: (stroke: InkStroke) => void
  /** 지우개 드래그가 끝났을 때, 지워지고 남은 획 배열 전체를 넘겨준다
   *  (호출부가 그 슬라이드를 이 배열로 통째로 덮어쓴다 — setInkForSlide). */
  onEraseComplete?: (remainingStrokes: InkStroke[]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 그리는 중이든 지우는 중이든 "지금 손을 대고 있다" — strokes prop이
  // 바뀌어도 이 렌더는 건드리지 않으려는 용도로 쓴다(아래 effect 참고).
  const interactingRef = useRef(false)
  const pointsRef = useRef<InkPoint[]>([])
  // handlePointerMove가 pointerdown 시점의 색으로 계속 그리도록 고정한다
  // — 그리는 도중 color prop이 바뀌어도(있을 법하지 않지만) 이미 시작한
  // 획의 색은 안 바뀌어야 한다. mode도 같은 이유로 고정한다.
  const drawingColorRef = useRef(color)
  const activeModeRef = useRef(mode)
  /** 지우개 드래그 중, 지금까지 닿아서 지워지기로 한 획들의 인덱스
   *  (드래그 시작 시점의 strokes 배열 기준). */
  const erasingIndicesRef = useRef<Set<number>>(new Set())

  function applyPenStyle(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, strokeColor: string) {
    const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = PEN_WIDTH_CSS_PX * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  function drawStroke(ctx: CanvasRenderingContext2D, points: InkPoint[], w: number, h: number) {
    if (points.length < 2) return
    ctx.beginPath()
    ctx.moveTo(points[0].x * w, points[0].y * h)
    for (const point of points.slice(1)) ctx.lineTo(point.x * w, point.y * h)
    ctx.stroke()
  }

  function redrawAll(excluded?: Set<number>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    strokes.forEach((stroke, i) => {
      if (excluded?.has(i)) return
      applyPenStyle(ctx, canvas, stroke.color ?? DEFAULT_PEN_COLOR)
      drawStroke(ctx, stroke.points, canvas.width, canvas.height)
    })
  }

  // 오버레이 캔버스는 PdfViewer가 그린 실제 PDF 캔버스와 같은 박스를 감싼
  // wrapper 안에 위치해서(PdfViewer.tsx 참고) CSS로는 항상 크기가 맞지만,
  // 내부 픽셀 해상도(devicePixelRatio 반영)는 직접 맞춰야 한다.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width * ratio))
      const height = Math.max(1, Math.round(rect.height * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      redrawAll()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // strokes가 바뀌면(발표 시작 직후 로딩, 다른 슬라이드에서 돌아옴, 지우기,
  // 다른 기기가 그린/지운 획이 도착함) 통째로 다시 그린다. 지금 한창
  // 손을 대고 있으면 건드리지 않는다 — 그리던/지우던 도중 다른 이유로
  // 부모가 리렌더되면서 strokes 참조만 새로 만들어져 들어오는 경우,
  // 아직 커밋 전인 변화가 화면에서 지워지는 걸 막기 위해서다. 손을 떼면
  // 곧 Firestore를 거쳐 strokes에 반영되고 그때 자연스럽게 다시 그려진다.
  useEffect(() => {
    if (interactingRef.current) return
    redrawAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes])

  function toNormalized(event: React.PointerEvent<HTMLCanvasElement>): InkPoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  /** 지우개 모드에서 한 지점을 지나갈 때마다 부른다 — 아직 안 지워진
   *  획들에 대해서만 충돌 검사하고, 닿은 획은 즉시(화면상으로만) 지운다. */
  function eraseAt(point: InkPoint) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const px = point.x * canvas.width
    const py = point.y * canvas.height
    const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1
    const radius = ERASE_RADIUS_CSS_PX * dpr

    let changed = false
    strokes.forEach((stroke, i) => {
      if (erasingIndicesRef.current.has(i)) return
      const points = stroke.points
      for (let j = 0; j < points.length - 1; j++) {
        const ax = points[j].x * canvas.width
        const ay = points[j].y * canvas.height
        const bx = points[j + 1].x * canvas.width
        const by = points[j + 1].y * canvas.height
        if (pointToSegmentDistance(px, py, ax, ay, bx, by) <= radius) {
          erasingIndicesRef.current.add(i)
          changed = true
          break
        }
      }
    })
    if (changed) redrawAll(erasingIndicesRef.current)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!editable || !active) return
    // 아이패드(애플펜슬)에서 iOS Safari가 이 드래그를 텍스트 선택
    // 제스처로 오인해서 콜아웃 메뉴를 띄우는 걸 막는다(NO_CALLOUT_STYLE
    // 설명 참고) — preventDefault를 같이 불러야 한다.
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    interactingRef.current = true
    activeModeRef.current = mode

    if (mode === 'erase') {
      erasingIndicesRef.current = new Set()
      eraseAt(toNormalized(event))
      return
    }

    drawingColorRef.current = color
    pointsRef.current = [toNormalized(event)]
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactingRef.current) return
    const point = toNormalized(event)

    if (activeModeRef.current === 'erase') {
      eraseAt(point)
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const points = pointsRef.current
    const prev = points[points.length - 1]
    points.push(point)

    applyPenStyle(ctx, canvas, drawingColorRef.current)
    ctx.beginPath()
    ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height)
    ctx.lineTo(point.x * canvas.width, point.y * canvas.height)
    ctx.stroke()
  }

  function handlePointerUp() {
    if (!interactingRef.current) return
    interactingRef.current = false

    if (activeModeRef.current === 'erase') {
      const excluded = erasingIndicesRef.current
      erasingIndicesRef.current = new Set()
      if (excluded.size > 0) {
        onEraseComplete?.(strokes.filter((_, i) => !excluded.has(i)))
      }
      return
    }

    const points = pointsRef.current
    pointsRef.current = []
    if (points.length >= 2) onStrokeComplete?.({ points, color: drawingColorRef.current })
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="absolute inset-0 h-full w-full"
      style={{
        touchAction: editable && active ? 'none' : undefined,
        pointerEvents: editable && active ? 'auto' : 'none',
        cursor: editable && active ? (mode === 'erase' ? 'cell' : 'crosshair') : undefined,
        ...NO_CALLOUT_STYLE,
      }}
    />
  )
}
