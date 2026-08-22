import { useEffect, useRef } from 'react'

import type { InkPoint, InkStroke } from '../lib/labPresentation'

const PEN_COLOR = '#e11d48'
const PEN_WIDTH_CSS_PX = 3

/**
 * PDF 캔버스 위에 얹는 투명한 펜 오버레이. 파워포인트 발표 펜처럼 슬라이드
 * 위에 자유롭게 줄을 긋는 용도라 좌표는 캔버스 픽셀이 아니라 슬라이드
 * 기준 0~1 비율(InkPoint)로 저장한다 — 교사 화면과 학생 화면의 실제 렌더
 * 크기가 서로 다르기 때문에(PdfViewer가 각자 컨테이너 폭에 맞춰 그린다),
 * 비율로 저장해야 어느 화면에서든 같은 자리에 그려진다.
 *
 * strokes(=Firestore에서 이미 확정된 획들)와 "지금 그리고 있는 중이라
 * 아직 커밋 안 된 구간"을 같은 캔버스에 같이 그린다. 후자는 pointermove
 * 마다 리액트 상태를 거치지 않고 캔버스에 직접 선분을 이어 그리는
 * 방식이다 — 매 프레임 리렌더를 피하기 위해서다. onStrokeComplete는 펜을
 * 뗄 때 한 번만 불린다(호출부가 그때 Firestore에 쓴다).
 */
export default function PresentationInk({
  strokes,
  editable,
  active,
  onStrokeComplete,
}: {
  /** 지금 슬라이드에 이미 저장된 획들. */
  strokes: InkStroke[]
  /** 이 화면이 그릴 수 있는 화면인지(교사 화면만 true). */
  editable: boolean
  /** 펜 도구가 켜져 있는지 — editable && active일 때만 입력을 받는다. */
  active: boolean
  onStrokeComplete?: (stroke: InkStroke) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const pointsRef = useRef<InkPoint[]>([])

  function applyPenStyle(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1
    ctx.strokeStyle = PEN_COLOR
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

  function redrawAll() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    applyPenStyle(ctx, canvas)
    for (const stroke of strokes) drawStroke(ctx, stroke.points, canvas.width, canvas.height)
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
  // 다른 기기가 그린 획이 도착함) 통째로 다시 그린다. 지금 한창 그리는
  // 중이면 건드리지 않는다 — 그리던 도중 다른 이유로 부모가 리렌더되면서
  // strokes 참조만 새로 만들어져 들어오는 경우, 아직 커밋 전인 획이 화면에서
  // 지워지는 걸 막기 위해서다. 펜을 떼면 곧 Firestore를 거쳐 strokes에
  // 반영되고 그때 자연스럽게 다시 그려진다.
  useEffect(() => {
    if (drawingRef.current) return
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

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!editable || !active) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    pointsRef.current = [toNormalized(event)]
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const point = toNormalized(event)
    const points = pointsRef.current
    const prev = points[points.length - 1]
    points.push(point)

    applyPenStyle(ctx, canvas)
    ctx.beginPath()
    ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height)
    ctx.lineTo(point.x * canvas.width, point.y * canvas.height)
    ctx.stroke()
  }

  function handlePointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    const points = pointsRef.current
    pointsRef.current = []
    if (points.length >= 2) onStrokeComplete?.({ points })
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
        cursor: editable && active ? 'crosshair' : undefined,
      }}
    />
  )
}
