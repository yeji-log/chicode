import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BOARD_HEIGHT, BOARD_PINS, BOARD_WIDTH, BOARD_X, BOARD_Y, type BoardPin } from './board'
import { breadboardAnchor, breadboardRailAnchor, COLUMNS, layoutBreadboard } from './breadboard'
import { resolveConnectivity } from './connectivity'
import {
  COMPONENT_PINS,
  type ComponentType,
  type PinRef,
  type PlacedComponent,
  type Point,
  type Wire,
  pinRefKey,
} from './types'

const STORAGE_KEY = 'chicode.pico.circuit'
const VIEW_WIDTH = 900
const VIEW_HEIGHT = 640

const BREADBOARD = layoutBreadboard('bb1', 24, 90)

interface SavedCircuit {
  components: PlacedComponent[]
  wires: Wire[]
}

function loadInitial(): SavedCircuit {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SavedCircuit
  } catch {
    /* 저장된 값이 깨졌으면 그냥 기본값으로 시작한다 */
  }
  return {
    components: [
      { id: 'led1', type: 'led', x: 700, y: 90 },
      { id: 'button1', type: 'button', x: 700, y: 200 },
    ],
    wires: [
      {
        id: 'w1',
        from: { kind: 'component', componentId: 'led1', pin: 'cathode' },
        to: { kind: 'board', pinId: 'L20' }, // GP15
      },
      {
        id: 'w2',
        from: { kind: 'component', componentId: 'button1', pin: 'a' },
        to: { kind: 'board', pinId: 'L19' }, // GP14
      },
    ],
  }
}

export interface CircuitCanvasProps {
  /** 워커가 보고하는 GPIO 출력값 — LED 를 실제로 켜고 끄는 데 쓴다. */
  gpioLevels: Map<number, 0 | 1>
  /** 버튼 부품을 누르고 뗄 때, 그 버튼이 연결된 GPIO 번호로 알려준다(연결 안 됐으면 안 불림). */
  onButtonChange: (gpio: number, pressed: boolean) => void
}

export default function CircuitCanvas({ gpioLevels, onButtonChange }: CircuitCanvasProps) {
  const [{ components, wires }, setState] = useState<SavedCircuit>(loadInitial)
  const [draft, setDraft] = useState<{ from: PinRef; to: Point } | null>(null)
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [heldButtons, setHeldButtons] = useState<Set<string>>(new Set())
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ components, wires }))
  }, [components, wires])

  const connectivity = useMemo(() => resolveConnectivity(wires), [wires])

  // 버튼 부품이 눌려 있는 동안, 연결된 GPIO 로 계속 알려준다(연결이 바뀌어도 따라감).
  useEffect(() => {
    for (const c of components) {
      if (c.type !== 'button') continue
      const gpio = connectivity.pinToGpio.get(pinRefKey({ kind: 'component', componentId: c.id, pin: 'a' })) ??
        connectivity.pinToGpio.get(pinRefKey({ kind: 'component', componentId: c.id, pin: 'b' }))
      if (gpio !== undefined && heldButtons.has(c.id)) onButtonChange(gpio, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity, heldButtons])

  const toSvgPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const local = pt.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }, [])

  const startWire = (ref: PinRef, point: Point) => {
    setDraft({ from: ref, to: point })
  }

  const finishWire = (ref: PinRef) => {
    setDraft((current) => {
      if (!current) return null
      if (pinRefKey(current.from) === pinRefKey(ref)) return null
      // exists 체크를 setState 콜백 "안"에서 최신 s.wires 로 해야 한다 — 바깥의 wires 는
      // 클로저에 붙잡힌 예전 값이라, 한 제스처에서 finishWire 가 두 번 불리면(실측으로
      // 재현됨 — 드래그 한 번에 전선이 두 개 생기는 버그였다) 둘 다 "아직 없다"고
      // 잘못 판단해서 중복 전선이 생긴다.
      setState((s) => {
        const exists = s.wires.some(
          (w) =>
            (pinRefKey(w.from) === pinRefKey(current.from) && pinRefKey(w.to) === pinRefKey(ref)) ||
            (pinRefKey(w.to) === pinRefKey(current.from) && pinRefKey(w.from) === pinRefKey(ref)),
        )
        if (exists) return s
        return {
          ...s,
          wires: [
            ...s.wires,
            { id: `w${Date.now()}${Math.random().toString(36).slice(2, 6)}`, from: current.from, to: ref },
          ],
        }
      })
      return null
    })
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const p = toSvgPoint(event.clientX, event.clientY)
    if (draft) setDraft((d) => (d ? { ...d, to: p } : d))
    if (dragging) {
      setState((s) => ({
        ...s,
        components: s.components.map((c) =>
          c.id === dragging.id ? { ...c, x: p.x - dragging.dx, y: p.y - dragging.dy } : c,
        ),
      }))
    }
  }

  const onPointerUp = () => {
    setDragging(null)
    // 빈 곳에서 놓으면 배선 취소
    setDraft(null)
  }

  const removeWire = (id: string) => {
    setState((s) => ({ ...s, wires: s.wires.filter((w) => w.id !== id) }))
  }

  const addComponent = (type: ComponentType) => {
    const id = `${type}${Date.now().toString(36)}`
    setState((s) => ({
      ...s,
      components: [...s.components, { id, type, x: 560, y: 380 + s.components.length * 10 }],
    }))
  }

  const removeComponent = (id: string) => {
    setState((s) => ({
      components: s.components.filter((c) => c.id !== id),
      wires: s.wires.filter(
        (w) =>
          !(w.from.kind === 'component' && w.from.componentId === id) &&
          !(w.to.kind === 'component' && w.to.componentId === id),
      ),
    }))
  }

  const pinPoint = (ref: PinRef): Point => {
    if (ref.kind === 'board') {
      const pin = BOARD_PINS.find((p) => p.id === ref.pinId)
      return pin ? { x: pin.x, y: pin.y } : { x: 0, y: 0 }
    }
    if (ref.kind === 'breadboard') return breadboardAnchor(BREADBOARD, ref.col, ref.side)
    if (ref.kind === 'breadboardRail') return breadboardRailAnchor(BREADBOARD, ref.rail)
    const comp = components.find((c) => c.id === ref.componentId)
    const spec = comp ? COMPONENT_PINS[comp.type].find((p) => p.pin === ref.pin) : undefined
    if (!comp || !spec) return { x: 0, y: 0 }
    return { x: comp.x + spec.dx, y: comp.y + spec.dy }
  }

  const elbowPath = (a: Point, b: Point) => {
    const midX = (a.x + b.x) / 2
    return `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => addComponent('led')}
          className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-cheese-50"
        >
          + LED 추가
        </button>
        <button
          onClick={() => addComponent('button')}
          className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-cheese-50"
        >
          + 버튼 추가
        </button>
        <span className="text-xs text-ink-500">
          핀(원)을 마우스로 눌러 끌면 다른 핀까지 전선이 이어집니다. 부품 몸통은 끌어서 옮길 수
          있어요. 전선을 클릭하면 지워집니다.
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-[520px] w-full rounded-xl border border-cream-deep bg-cream/40 touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setDragging(null)}
      >
        <Breadboard />
        <PicoBoard />

        {wires.map((w) => {
          const a = pinPoint(w.from)
          const b = pinPoint(w.to)
          return (
            <path
              key={w.id}
              d={elbowPath(a, b)}
              stroke="#2563eb"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              className="cursor-pointer hover:stroke-red-500"
              onClick={() => removeWire(w.id)}
            />
          )
        })}

        {draft && (
          <path
            d={elbowPath(pinPoint(draft.from), draft.to)}
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="4 3"
            fill="none"
          />
        )}

        {components.map((c) => (
          <ComponentGlyph
            key={c.id}
            component={c}
            gpioLevels={gpioLevels}
            connectivity={connectivity}
            heldButtons={heldButtons}
            onBodyPointerDown={(event) => {
              const p = toSvgPoint(event.clientX, event.clientY)
              setDragging({ id: c.id, dx: p.x - c.x, dy: p.y - c.y })
            }}
            onRemove={() => removeComponent(c.id)}
            onPinPointerDown={(pin, event) => {
              event.stopPropagation()
              startWire({ kind: 'component', componentId: c.id, pin }, pinPoint({ kind: 'component', componentId: c.id, pin }))
            }}
            onPinPointerUp={(pin, event) => {
              event.stopPropagation()
              finishWire({ kind: 'component', componentId: c.id, pin })
            }}
            onButtonHold={(pressed) => {
              setHeldButtons((prev) => {
                const next = new Set(prev)
                if (pressed) next.add(c.id)
                else next.delete(c.id)
                return next
              })
              const gpio =
                connectivity.pinToGpio.get(pinRefKey({ kind: 'component', componentId: c.id, pin: 'a' })) ??
                connectivity.pinToGpio.get(pinRefKey({ kind: 'component', componentId: c.id, pin: 'b' }))
              if (gpio !== undefined) onButtonChange(gpio, pressed)
            }}
          />
        ))}
      </svg>
    </div>
  )

  function Breadboard() {
    const l = BREADBOARD
    const dots: React.ReactNode[] = []
    for (let col = 0; col < COLUMNS; col++) {
      const x = l.colX(col)
      l.topRowsY.forEach((y, i) => {
        dots.push(
          <PinDot
            key={`t${col}-${i}`}
            x={x}
            y={y}
            r={3.5}
            fill="#fff"
            stroke="#c9b28a"
            onPointerDown={(e) => {
              e.stopPropagation()
              startWire({ kind: 'breadboard', boardId: l.id, col, side: 'top' }, { x, y })
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              finishWire({ kind: 'breadboard', boardId: l.id, col, side: 'top' })
            }}
          />,
        )
      })
      l.bottomRowsY.forEach((y, i) => {
        dots.push(
          <PinDot
            key={`b${col}-${i}`}
            x={x}
            y={y}
            r={3.5}
            fill="#fff"
            stroke="#c9b28a"
            onPointerDown={(e) => {
              e.stopPropagation()
              startWire({ kind: 'breadboard', boardId: l.id, col, side: 'bottom' }, { x, y })
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              finishWire({ kind: 'breadboard', boardId: l.id, col, side: 'bottom' })
            }}
          />,
        )
      })
    }
    for (let col = 0; col < COLUMNS; col++) {
      const x = l.colX(col)
      dots.push(
        <PinDot
          key={`rp${col}`}
          x={x}
          y={l.railPlusY}
          r={3}
          fill="#fecaca"
          stroke="#ef4444"
          onPointerDown={(e) => {
            e.stopPropagation()
            startWire({ kind: 'breadboardRail', boardId: l.id, rail: 'plus' }, { x, y: l.railPlusY })
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            finishWire({ kind: 'breadboardRail', boardId: l.id, rail: 'plus' })
          }}
        />,
      )
      dots.push(
        <PinDot
          key={`rm${col}`}
          x={x}
          y={l.railMinusY}
          r={3}
          fill="#cbd5f5"
          stroke="#3b82f6"
          onPointerDown={(e) => {
            e.stopPropagation()
            startWire({ kind: 'breadboardRail', boardId: l.id, rail: 'minus' }, { x, y: l.railMinusY })
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            finishWire({ kind: 'breadboardRail', boardId: l.id, rail: 'minus' })
          }}
        />,
      )
    }

    return (
      <g>
        <rect
          x={l.x}
          y={l.y}
          width={l.width}
          height={l.height}
          rx={8}
          fill="#f2e6c9"
          stroke="#d8c39a"
        />
        <text x={l.x + 8} y={l.y + l.height - 6} fontSize={10} fill="#a08a5c">
          브레드보드
        </text>
        {dots}
      </g>
    )
  }

  function PicoBoard() {
    return (
      <g>
        <rect
          x={BOARD_X}
          y={BOARD_Y}
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          rx={10}
          fill="#1f6b4d"
          stroke="#134a34"
        />
        <text
          x={BOARD_X + BOARD_WIDTH / 2}
          y={BOARD_Y + BOARD_HEIGHT / 2}
          fontSize={13}
          fill="#bfe3d2"
          textAnchor="middle"
          transform={`rotate(90 ${BOARD_X + BOARD_WIDTH / 2} ${BOARD_Y + BOARD_HEIGHT / 2})`}
        >
          Pico 2 W
        </text>
        {BOARD_PINS.map((pin) => (
          <BoardPinDot
            key={pin.id}
            pin={pin}
            connected={connectivity.pinToGpio !== undefined}
            onPointerDown={(e) => {
              e.stopPropagation()
              startWire({ kind: 'board', pinId: pin.id }, { x: pin.x, y: pin.y })
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              finishWire({ kind: 'board', pinId: pin.id })
            }}
          />
        ))}
      </g>
    )
  }
}

function PinDot({
  x,
  y,
  r,
  fill,
  stroke,
  onPointerDown,
  onPointerUp,
}: {
  x: number
  y: number
  r: number
  fill: string
  stroke: string
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}) {
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      fill={fill}
      stroke={stroke}
      strokeWidth={1}
      className="cursor-crosshair"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    />
  )
}

function BoardPinDot({
  pin,
  onPointerDown,
  onPointerUp,
}: {
  pin: BoardPin
  connected: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}) {
  const labelX = pin.side === 'left' ? pin.x - 8 : pin.x + 8
  return (
    <g>
      <circle
        cx={pin.x}
        cy={pin.y}
        r={4.5}
        fill={pin.gpio !== null ? '#facc15' : '#94a3b8'}
        stroke="#0f172a"
        strokeWidth={1}
        className="cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      />
      <text
        x={labelX}
        y={pin.y + 3}
        fontSize={8}
        fill="#0f172a"
        textAnchor={pin.side === 'left' ? 'end' : 'start'}
      >
        {pin.label}
      </text>
    </g>
  )
}

function ComponentGlyph({
  component,
  gpioLevels,
  connectivity,
  heldButtons,
  onBodyPointerDown,
  onPinPointerDown,
  onPinPointerUp,
  onButtonHold,
  onRemove,
}: {
  component: PlacedComponent
  gpioLevels: Map<number, 0 | 1>
  connectivity: { pinToGpio: Map<string, number> }
  heldButtons: Set<string>
  onBodyPointerDown: (e: React.PointerEvent<SVGGElement>) => void
  onPinPointerDown: (pin: string, e: React.PointerEvent) => void
  onPinPointerUp: (pin: string, e: React.PointerEvent) => void
  onButtonHold: (pressed: boolean) => void
  onRemove: () => void
}) {
  const pins = COMPONENT_PINS[component.type]

  const gpioFor = (pin: string) =>
    connectivity.pinToGpio.get(pinRefKey({ kind: 'component', componentId: component.id, pin }))

  const ledGpio = component.type === 'led' ? gpioFor('anode') ?? gpioFor('cathode') : undefined
  const ledOn = ledGpio !== undefined && gpioLevels.get(ledGpio) === 1
  const held = heldButtons.has(component.id)

  return (
    <g transform={`translate(${component.x} ${component.y})`}>
      {component.type === 'led' && (
        <g onPointerDown={onBodyPointerDown} className="cursor-grab">
          <circle
            cx={0}
            cy={20}
            r={16}
            fill={ledOn ? '#fde047' : '#e5e7eb'}
            stroke={ledOn ? '#f59e0b' : '#9ca3af'}
            strokeWidth={2}
            style={ledOn ? { filter: 'drop-shadow(0 0 8px #fbbf24)' } : undefined}
          />
          <text x={0} y={24} fontSize={9} textAnchor="middle" fill="#57534e">
            LED
          </text>
        </g>
      )}
      {component.type === 'button' && (
        <g onPointerDown={onBodyPointerDown} className="cursor-grab">
          <rect
            x={-20}
            y={0}
            width={40}
            height={20}
            rx={4}
            fill={held ? '#fde68a' : '#f5f0e6'}
            stroke="#a8a29e"
            strokeWidth={2}
            onPointerDown={(e) => {
              e.stopPropagation()
              onButtonHold(true)
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              onButtonHold(false)
            }}
            onPointerLeave={() => held && onButtonHold(false)}
            className="cursor-pointer"
          />
          <text x={0} y={14} fontSize={9} textAnchor="middle" fill="#57534e">
            버튼
          </text>
        </g>
      )}

      <text
        x={0}
        y={-6}
        fontSize={9}
        textAnchor="middle"
        fill="#b91c1c"
        className="cursor-pointer"
        onClick={onRemove}
      >
        ✕ 삭제
      </text>

      {pins.map((p) => (
        <circle
          key={p.pin}
          cx={p.dx}
          cy={p.dy}
          r={4}
          fill={gpioFor(p.pin) !== undefined ? '#4ade80' : '#fff'}
          stroke="#334155"
          strokeWidth={1}
          className="cursor-crosshair"
          onPointerDown={(e) => onPinPointerDown(p.pin, e)}
          onPointerUp={(e) => onPinPointerUp(p.pin, e)}
        />
      ))}
    </g>
  )
}
