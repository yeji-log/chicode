import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BOARD_HEIGHT, BOARD_PINS, BOARD_WIDTH, BOARD_X, BOARD_Y, type BoardPin } from './board'
import {
  type BreadboardLayout,
  breadboardAnchor,
  breadboardRailAnchor,
  layoutBreadboard,
} from './breadboard'
import { resolveConnectivity } from './connectivity'
import {
  BREADBOARD_SIZES,
  type BreadboardSize,
  COMPONENT_LIST,
  COMPONENT_PINS,
  type ComponentCategory,
  type ComponentType,
  type PinRef,
  type PlacedBreadboard,
  type PlacedComponent,
  type Point,
  type Wire,
  pinRefKey,
} from './types'

const STORAGE_KEY = 'chicode.pico.circuit'
const VIEW_WIDTH = 900
const VIEW_HEIGHT = 640

interface SavedCircuit {
  components: PlacedComponent[]
  breadboards: PlacedBreadboard[]
  wires: Wire[]
}

function loadInitial(): SavedCircuit {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedCircuit>
      if (parsed.components && parsed.wires) {
        return { components: parsed.components, breadboards: parsed.breadboards ?? [], wires: parsed.wires }
      }
    }
  } catch {
    /* 저장된 값이 깨졌으면 그냥 기본값으로 시작한다 */
  }
  return {
    components: [
      { id: 'led1', type: 'led', x: 700, y: 90 },
      { id: 'button1', type: 'button', x: 700, y: 200 },
    ],
    breadboards: [{ id: 'bb1', size: 'mini', x: 24, y: 90 }],
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
  /** 워커가 보고하는 GPIO 출력값 — LED 등을 실제로 켜고 끄는 데 쓴다. */
  gpioLevels: Map<number, 0 | 1>
  /** 버튼/스위치가 눌리거나 켜질 때, 연결된 GPIO 번호로 알려준다(연결 안 됐으면 안 불림). */
  onButtonChange: (gpio: number, pressed: boolean) => void
}

type DragTarget = { id: string; kind: 'component' | 'breadboard'; dx: number; dy: number }

export default function CircuitCanvas({ gpioLevels, onButtonChange }: CircuitCanvasProps) {
  const [{ components, breadboards, wires }, setState] = useState<SavedCircuit>(loadInitial)
  const [tab, setTab] = useState<ComponentCategory | 'breadboard'>('output')
  const [draft, setDraft] = useState<{ from: PinRef; to: Point } | null>(null)
  const [dragging, setDragging] = useState<DragTarget | null>(null)
  // 버튼(누르는 동안)과 스위치(클릭해서 토글) 둘 다 "지금 켜진 입력 부품 id" 로 통일해서 관리한다.
  const [activeInputs, setActiveInputs] = useState<Set<string>>(new Set())
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ components, breadboards, wires }))
  }, [components, breadboards, wires])

  const connectivity = useMemo(() => resolveConnectivity(wires), [wires])

  const breadboardLayouts = useMemo(() => {
    const map = new Map<string, BreadboardLayout>()
    for (const b of breadboards) {
      const columns = BREADBOARD_SIZES.find((s) => s.size === b.size)?.columns ?? 10
      map.set(b.id, layoutBreadboard(b.id, b.x, b.y, columns))
    }
    return map
  }, [breadboards])

  const gpioForPin = useCallback(
    (componentId: string, pin: string) =>
      connectivity.pinToGpio.get(pinRefKey({ kind: 'component', componentId, pin })),
    [connectivity],
  )

  /** 입력 부품이 켜져 있는 동안, 연결이 바뀌어도(재배선) 최신 GPIO 로 계속 알려준다. */
  useEffect(() => {
    for (const c of components) {
      if (c.type !== 'button' && c.type !== 'switch') continue
      if (!activeInputs.has(c.id)) continue
      const gpio = gpioForPin(c.id, 'a') ?? gpioForPin(c.id, 'b')
      if (gpio !== undefined) onButtonChange(gpio, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity, activeInputs])

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

  const startWire = (ref: PinRef, point: Point) => setDraft({ from: ref, to: point })

  const finishWire = (ref: PinRef) => {
    setDraft((current) => {
      if (!current) return null
      if (pinRefKey(current.from) === pinRefKey(ref)) return null
      // exists 체크를 setState 콜백 "안"에서 최신 s.wires 로 해야 한다 — 바깥의 wires 는
      // 클로저에 붙잡힌 예전 값이라, 한 제스처에서 finishWire 가 두 번 불리면 중복 전선이
      // 생긴다(실제로 재현해서 찾은 버그).
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
      setState((s) =>
        dragging.kind === 'component'
          ? {
              ...s,
              components: s.components.map((c) =>
                c.id === dragging.id ? { ...c, x: p.x - dragging.dx, y: p.y - dragging.dy } : c,
              ),
            }
          : {
              ...s,
              breadboards: s.breadboards.map((b) =>
                b.id === dragging.id ? { ...b, x: p.x - dragging.dx, y: p.y - dragging.dy } : b,
              ),
            },
      )
    }
  }

  const onPointerUp = () => {
    setDragging(null)
    setDraft(null) // 빈 곳에서 놓으면 배선 취소
  }

  const removeWire = (id: string) => setState((s) => ({ ...s, wires: s.wires.filter((w) => w.id !== id) }))

  const addComponent = (type: ComponentType) => {
    const id = `${type.replace('-', '')}${Date.now().toString(36)}`
    setState((s) => ({
      ...s,
      components: [...s.components, { id, type, x: 560, y: 380 + ((s.components.length * 36) % 200) }],
    }))
  }

  const removeComponent = (id: string) => {
    setState((s) => ({
      ...s,
      components: s.components.filter((c) => c.id !== id),
      wires: s.wires.filter(
        (w) =>
          !(w.from.kind === 'component' && w.from.componentId === id) &&
          !(w.to.kind === 'component' && w.to.componentId === id),
      ),
    }))
  }

  const addBreadboard = (size: BreadboardSize) => {
    const id = `bb${Date.now().toString(36)}`
    setState((s) => ({ ...s, breadboards: [...s.breadboards, { id, size, x: 24, y: 90 + s.breadboards.length * 40 }] }))
  }

  const removeBreadboard = (id: string) => {
    setState((s) => ({
      ...s,
      breadboards: s.breadboards.filter((b) => b.id !== id),
      wires: s.wires.filter(
        (w) =>
          !((w.from.kind === 'breadboard' || w.from.kind === 'breadboardRail') && w.from.boardId === id) &&
          !((w.to.kind === 'breadboard' || w.to.kind === 'breadboardRail') && w.to.boardId === id),
      ),
    }))
  }

  const setInputActive = (componentId: string, active: boolean) => {
    setActiveInputs((prev) => {
      const next = new Set(prev)
      if (active) next.add(componentId)
      else next.delete(componentId)
      return next
    })
    const gpio = gpioForPin(componentId, 'a') ?? gpioForPin(componentId, 'b')
    if (gpio !== undefined) onButtonChange(gpio, active)
  }

  const pinPoint = (ref: PinRef): Point => {
    if (ref.kind === 'board') {
      const pin = BOARD_PINS.find((p) => p.id === ref.pinId)
      return pin ? { x: pin.x, y: pin.y } : { x: 0, y: 0 }
    }
    if (ref.kind === 'breadboard') {
      const layout = breadboardLayouts.get(ref.boardId)
      return layout ? breadboardAnchor(layout, ref.col, ref.side) : { x: 0, y: 0 }
    }
    if (ref.kind === 'breadboardRail') {
      const layout = breadboardLayouts.get(ref.boardId)
      return layout ? breadboardRailAnchor(layout, ref.rail) : { x: 0, y: 0 }
    }
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
      <Palette tab={tab} setTab={setTab} addComponent={addComponent} addBreadboard={addBreadboard} />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-[520px] w-full touch-none rounded-xl border border-cream-deep bg-cream/40 select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setDragging(null)}
      >
        {breadboards.map((b) => {
          const layout = breadboardLayouts.get(b.id)
          if (!layout) return null
          return (
            <BreadboardGlyph
              key={b.id}
              layout={layout}
              onBodyPointerDown={(event) => {
                const p = toSvgPoint(event.clientX, event.clientY)
                setDragging({ id: b.id, kind: 'breadboard', dx: p.x - b.x, dy: p.y - b.y })
              }}
              onRemove={() => removeBreadboard(b.id)}
              onDotPointerDown={(ref, point) => startWire(ref, point)}
              onDotPointerUp={(ref) => finishWire(ref)}
            />
          )
        })}

        <PicoBoard
          onPinPointerDown={(pin, point) => startWire({ kind: 'board', pinId: pin.id }, point)}
          onPinPointerUp={(pin) => finishWire({ kind: 'board', pinId: pin.id })}
        />

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
        {/* 실제 선 위(3px)는 클릭하기 얇아서, 안 보이는 굵은 선을 하나 더 깔아 클릭 영역을 넓힌다. */}
        {wires.map((w) => (
          <path
            key={`${w.id}-hit`}
            d={elbowPath(pinPoint(w.from), pinPoint(w.to))}
            stroke="transparent"
            strokeWidth={14}
            fill="none"
            className="cursor-pointer"
            onClick={() => removeWire(w.id)}
          />
        ))}

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
            gpioForPin={(pin) => gpioForPin(c.id, pin)}
            active={activeInputs.has(c.id)}
            onBodyPointerDown={(event) => {
              const p = toSvgPoint(event.clientX, event.clientY)
              setDragging({ id: c.id, kind: 'component', dx: p.x - c.x, dy: p.y - c.y })
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
            onInputActiveChange={(active) => setInputActive(c.id, active)}
          />
        ))}
      </svg>
    </div>
  )
}

function Palette({
  tab,
  setTab,
  addComponent,
  addBreadboard,
}: {
  tab: ComponentCategory | 'breadboard'
  setTab: (t: ComponentCategory | 'breadboard') => void
  addComponent: (type: ComponentType) => void
  addBreadboard: (size: BreadboardSize) => void
}) {
  const TABS: { key: ComponentCategory | 'breadboard'; label: string }[] = [
    { key: 'output', label: '출력 장치' },
    { key: 'input', label: '입력 장치' },
    { key: 'breadboard', label: '브레드보드' },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 border-b border-cream-deep">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'rounded-t-lg px-3 py-1.5 text-xs font-bold transition-colors',
              tab === t.key
                ? 'border border-b-0 border-cream-deep bg-white text-ink-900'
                : 'text-ink-500 hover:text-ink-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tab !== 'breadboard'
          ? COMPONENT_LIST.filter((c) => c.category === tab).map((c) => (
              <button
                key={c.type}
                onClick={() => addComponent(c.type)}
                className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-cheese-50"
              >
                {c.emoji} {c.label} 추가
              </button>
            ))
          : BREADBOARD_SIZES.map((b) => (
              <button
                key={b.size}
                onClick={() => addBreadboard(b.size)}
                className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-cheese-50"
              >
                🍞 {b.label} 추가
              </button>
            ))}
        <span className="text-xs text-ink-500">
          핀(원)을 끌어 다른 핀까지 전선을 잇고, 몸통은 끌어서 옮기고, 전선/✕는 클릭합니다.
        </span>
      </div>
    </div>
  )
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

function BreadboardGlyph({
  layout,
  onBodyPointerDown,
  onRemove,
  onDotPointerDown,
  onDotPointerUp,
}: {
  layout: BreadboardLayout
  onBodyPointerDown: (e: React.PointerEvent<SVGRectElement>) => void
  onRemove: () => void
  onDotPointerDown: (ref: PinRef, point: Point) => void
  onDotPointerUp: (ref: PinRef) => void
}) {
  const l = layout
  const dots: React.ReactNode[] = []

  for (let col = 0; col < l.columns; col++) {
    const x = l.colX(col)
    l.topRowsY.forEach((y, i) => {
      const ref: PinRef = { kind: 'breadboard', boardId: l.id, col, side: 'top' }
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
            onDotPointerDown(ref, { x, y })
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            onDotPointerUp(ref)
          }}
        />,
      )
    })
    l.bottomRowsY.forEach((y, i) => {
      const ref: PinRef = { kind: 'breadboard', boardId: l.id, col, side: 'bottom' }
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
            onDotPointerDown(ref, { x, y })
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            onDotPointerUp(ref)
          }}
        />,
      )
    })
  }
  for (let col = 0; col < l.columns; col++) {
    const x = l.colX(col)
    const plusRef: PinRef = { kind: 'breadboardRail', boardId: l.id, rail: 'plus' }
    const minusRef: PinRef = { kind: 'breadboardRail', boardId: l.id, rail: 'minus' }
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
          onDotPointerDown(plusRef, { x, y: l.railPlusY })
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          onDotPointerUp(plusRef)
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
          onDotPointerDown(minusRef, { x, y: l.railMinusY })
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          onDotPointerUp(minusRef)
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
        className="cursor-grab"
        onPointerDown={onBodyPointerDown}
      />
      <text x={l.x + 8} y={l.y + l.height - 6} fontSize={10} fill="#a08a5c">
        브레드보드
      </text>
      <text
        x={l.x + l.width - 8}
        y={l.y + l.height - 6}
        fontSize={9}
        fill="#b91c1c"
        textAnchor="end"
        className="cursor-pointer"
        onClick={onRemove}
      >
        ✕ 삭제
      </text>
      {dots}
    </g>
  )
}

function PicoBoard({
  onPinPointerDown,
  onPinPointerUp,
}: {
  onPinPointerDown: (pin: BoardPin, point: Point) => void
  onPinPointerUp: (pin: BoardPin) => void
}) {
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
          onPointerDown={(e) => {
            e.stopPropagation()
            onPinPointerDown(pin, { x: pin.x, y: pin.y })
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            onPinPointerUp(pin)
          }}
        />
      ))}
    </g>
  )
}

function BoardPinDot({
  pin,
  onPointerDown,
  onPointerUp,
}: {
  pin: BoardPin
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
  gpioForPin,
  active,
  onBodyPointerDown,
  onPinPointerDown,
  onPinPointerUp,
  onInputActiveChange,
  onRemove,
}: {
  component: PlacedComponent
  gpioLevels: Map<number, 0 | 1>
  gpioForPin: (pin: string) => number | undefined
  active: boolean
  onBodyPointerDown: (e: React.PointerEvent<SVGGElement>) => void
  onPinPointerDown: (pin: string, e: React.PointerEvent) => void
  onPinPointerUp: (pin: string, e: React.PointerEvent) => void
  onInputActiveChange: (active: boolean) => void
  onRemove: () => void
}) {
  const pins = COMPONENT_PINS[component.type]
  const isOn = (pin: string) => {
    const gpio = gpioForPin(pin)
    return gpio !== undefined && gpioLevels.get(gpio) === 1
  }

  return (
    <g transform={`translate(${component.x} ${component.y})`}>
      {component.type === 'led' && (
        <g onPointerDown={onBodyPointerDown} className="cursor-grab">
          <circle
            cx={0}
            cy={20}
            r={16}
            fill={isOn('anode') || isOn('cathode') ? '#fde047' : '#e5e7eb'}
            stroke={isOn('anode') || isOn('cathode') ? '#f59e0b' : '#9ca3af'}
            strokeWidth={2}
            style={isOn('anode') || isOn('cathode') ? { filter: 'drop-shadow(0 0 8px #fbbf24)' } : undefined}
          />
          <text x={0} y={24} fontSize={9} textAnchor="middle" fill="#57534e">
            LED
          </text>
        </g>
      )}

      {component.type === 'rgb-led' && (
        <g onPointerDown={onBodyPointerDown} className="cursor-grab">
          <circle
            cx={0}
            cy={20}
            r={16}
            fill={`rgb(${isOn('r') ? 255 : 60}, ${isOn('g') ? 255 : 60}, ${isOn('b') ? 255 : 60})`}
            stroke="#78716c"
            strokeWidth={2}
            style={
              isOn('r') || isOn('g') || isOn('b')
                ? { filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' }
                : undefined
            }
          />
          <text x={0} y={24} fontSize={8} textAnchor="middle" fill="#57534e">
            RGB
          </text>
        </g>
      )}

      {component.type === 'buzzer' && (
        <g onPointerDown={onBodyPointerDown} className="cursor-grab">
          <rect
            x={-14}
            y={4}
            width={28}
            height={22}
            rx={14}
            fill={isOn('positive') || isOn('negative') ? '#fca5a5' : '#e7e5e4'}
            stroke={isOn('positive') || isOn('negative') ? '#ef4444' : '#a8a29e'}
            strokeWidth={2}
          />
          <text x={0} y={19} fontSize={9} textAnchor="middle" fill="#57534e">
            🔔
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
            fill={active ? '#fde68a' : '#f5f0e6'}
            stroke="#a8a29e"
            strokeWidth={2}
            className="cursor-pointer"
            onPointerDown={(e) => {
              e.stopPropagation()
              onInputActiveChange(true)
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              onInputActiveChange(false)
            }}
            onPointerLeave={() => active && onInputActiveChange(false)}
          />
          <text x={0} y={14} fontSize={9} textAnchor="middle" fill="#57534e">
            버튼
          </text>
        </g>
      )}

      {component.type === 'switch' && (
        <g onPointerDown={onBodyPointerDown} className="cursor-grab">
          <rect
            x={-20}
            y={0}
            width={40}
            height={20}
            rx={10}
            fill={active ? '#bbf7d0' : '#f5f0e6'}
            stroke={active ? '#22c55e' : '#a8a29e'}
            strokeWidth={2}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              onInputActiveChange(!active)
            }}
          />
          <circle cx={active ? 10 : -10} cy={10} r={7} fill="#fff" stroke="#78716c" strokeWidth={1} />
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
          fill={gpioForPin(p.pin) !== undefined ? '#4ade80' : '#fff'}
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
