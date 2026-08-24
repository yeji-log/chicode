import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

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
  type CircuitSnapshot,
  COMPONENT_LIST,
  COMPONENT_PINS,
  type ComponentCategory,
  type ComponentType,
  type PinRef,
  type PlacedComponent,
  type Point,
  pinRefKey,
} from './types'

const STORAGE_KEY = 'chicode.pico.circuit'
const VIEW_WIDTH = 900
const VIEW_HEIGHT = 640

/** 그리드/스냅/줌 — 팅커캐드처럼 부품이 격자에 맞춰 정돈되고, 화면을 확대/축소·이동해
 *  볼 수 있게 한다(계획 문서 "캔버스 기본기" 1단계). 모델 좌표(컴포넌트 x/y 등)는 이
 *  그리드 단위와 무관한 자유 float로 그대로 두고, 렌더링 시점에만 반영한다. */
const GRID = 20
const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
const snap = (v: number) => Math.round(v / GRID) * GRID

// 처음 들어왔을 때(저장된 회로가 없을 때)는 빈 회로로 시작한다 — 코드도
// STARTER_CODE(from machine import Pin 하나)뿐이라 앞뒤가 맞아야 한다
// (PicoLab.tsx 참고). 예제별 회로는 examples.ts 의 circuit 이 맡는다.
const DEFAULT_CIRCUIT: CircuitSnapshot = {
  components: [],
  breadboards: [],
  wires: [],
}

function loadInitial(): CircuitSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CircuitSnapshot>
      if (parsed.components && parsed.wires) {
        return { components: parsed.components, breadboards: parsed.breadboards ?? [], wires: parsed.wires }
      }
    }
  } catch {
    /* 저장된 값이 깨졌으면 그냥 기본값으로 시작한다 */
  }
  return DEFAULT_CIRCUIT
}

export interface CircuitCanvasProps {
  /** 워커가 보고하는 GPIO 출력값 — LED 등을 실제로 켜고 끄는 데 쓴다. */
  gpioLevels: Map<number, 0 | 1>
  /** 버튼/스위치가 눌리거나 켜질 때, 연결된 GPIO 번호로 알려준다(연결 안 됐으면 안 불림). */
  onButtonChange: (gpio: number, pressed: boolean) => void
  /**
   * true 면 배선/부품 편집을 전부 막는다(코드 실행 중). 버튼·스위치를 눌러보는 것만은
   * 계속 된다 — "실행 중인 회로가 실제로 반응하는 걸 보는" 게 이 잠금의 목적이지,
   * 상호작용 자체를 막는 게 아니라서다.
   */
  locked?: boolean
}

/** "예제 불러오기" 가 코드와 함께 회로도 같이 구성할 수 있도록 여는 창구. */
export interface CircuitCanvasHandle {
  loadCircuit: (circuit: CircuitSnapshot) => void
}

type DragTarget = { id: string; kind: 'component' | 'breadboard'; dx: number; dy: number }

function CircuitCanvas(
  { gpioLevels, onButtonChange, locked = false }: CircuitCanvasProps,
  ref: React.Ref<CircuitCanvasHandle>,
) {
  const [{ components, breadboards, wires }, setState] = useState<CircuitSnapshot>(loadInitial)
  const [tab, setTab] = useState<ComponentCategory | 'breadboard'>('output')
  const [draft, setDraft] = useState<{ from: PinRef; to: Point } | null>(null)
  const [dragging, setDragging] = useState<DragTarget | null>(null)
  // 버튼(누르는 동안)과 스위치(클릭해서 토글) 둘 다 "지금 켜진 입력 부품 id" 로 통일해서 관리한다.
  const [activeInputs, setActiveInputs] = useState<Set<string>>(new Set())
  const svgRef = useRef<SVGSVGElement>(null)

  // 줌/팬은 회로 데이터(components/breadboards/wires)와 달리 저장하지 않는다 — 매번
  // 처음 화면으로 시작해도 무방하고, "예제 불러오기"가 회로를 통째로 갈아끼우는 로직과
  // 섞이지 않게 단순하게 둔다.
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  // 팬 제스처 시작 시점의 좌표를 들고 있는다. state 대신 ref 인 이유: 매 pointermove 마다
  // setState 로 다시 만들 필요 없이 시작점만 고정해 두고 델타만 계산하면 되기 때문.
  const panStartRef = useRef<{ svg: Point; view: { x: number; y: number; scale: number } } | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ components, breadboards, wires }))
  }, [components, breadboards, wires])

  // "예제 불러오기" 가 이 handle 로 회로를 통째로 갈아끼운다. JSON 왕복으로 깊은 복사를
  // 해서, 같은 예제를 두 번 불러오거나 부품을 옮겨도 EXAMPLES 원본 데이터가 오염되지
  // 않게 한다(배열/객체를 그대로 두면 여러 로드가 같은 참조를 공유하게 된다).
  useImperativeHandle(
    ref,
    () => ({
      loadCircuit: (circuit) => {
        setState(JSON.parse(JSON.stringify(circuit)) as CircuitSnapshot)
        setDraft(null)
        setDragging(null)
        setActiveInputs(new Set())
      },
    }),
    [],
  )

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

  /** toSvgPoint(뷰포트 좌표)를 한 번 더 view(줌/팬) 역변환해서 모델 좌표로 만든다.
   *  컴포넌트/브레드보드 x/y, 드래그 계산은 전부 이 모델 좌표를 기준으로 한다 —
   *  view가 (0,0,1)일 땐 toSvgPoint와 완전히 같은 값이 나온다. */
  const toModelPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const svgP = toSvgPoint(clientX, clientY)
      return { x: (svgP.x - view.x) / view.scale, y: (svgP.y - view.y) / view.scale }
    },
    [toSvgPoint, view],
  )

  /** center(뷰포트 좌표) 아래의 모델 좌표가 확대/축소 후에도 그대로 그 자리에 남도록
   *  view.x/y를 같이 보정한다 — "커서 위치 기준 줌". 버튼 줌은 캔버스 중앙을 center로 준다. */
  const zoomAt = useCallback((factor: number, center: Point) => {
    setView((v) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const modelX = (center.x - v.x) / v.scale
      const modelY = (center.y - v.y) / v.scale
      return { scale: nextScale, x: center.x - modelX * nextScale, y: center.y - modelY * nextScale }
    })
  }, [])

  // 휠 줌. React의 onWheel(합성 이벤트)은 브라우저가 스크롤 성능을 위해 기본적으로
  // passive 리스너로 등록하는 이벤트라 preventDefault()가 안 먹을 수 있다 — svg에
  // 직접(non-passive) 리스너를 붙여서 확실하게 막는다.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const svgP = toSvgPoint(event.clientX, event.clientY)
      zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, svgP)
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [toSvgPoint, zoomAt])

  const startWire = (ref: PinRef, point: Point) => {
    if (locked) return
    setDraft({ from: ref, to: point })
  }

  const finishWire = (ref: PinRef) => {
    if (locked) return
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
    // 팬은 locked와 무관하게 항상 된다 — 회로를 둘러보는 것 자체는 편집이 아니다.
    if (panStartRef.current) {
      const svgP = toSvgPoint(event.clientX, event.clientY)
      const start = panStartRef.current
      setView({
        x: start.view.x + (svgP.x - start.svg.x),
        y: start.view.y + (svgP.y - start.svg.y),
        scale: start.view.scale,
      })
      return
    }
    if (locked) return
    const p = toModelPoint(event.clientX, event.clientY)
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

  /** 부품/브레드보드를 옮기는 동안엔 자유롭게 움직이다가, 놓는(pointer up) 순간에만
   *  그리드에 스냅한다 — 매 프레임 스냅하면 뚝뚝 끊겨 보인다(팅커캐드도 이 방식). */
  const onPointerUp = () => {
    panStartRef.current = null
    if (dragging) {
      const target = dragging
      setState((s) =>
        target.kind === 'component'
          ? { ...s, components: s.components.map((c) => (c.id === target.id ? { ...c, x: snap(c.x), y: snap(c.y) } : c)) }
          : { ...s, breadboards: s.breadboards.map((b) => (b.id === target.id ? { ...b, x: snap(b.x), y: snap(b.y) } : b)) },
      )
    }
    setDragging(null)
    setDraft(null) // 빈 곳에서 놓으면 배선 취소
  }

  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    panStartRef.current = { svg: toSvgPoint(event.clientX, event.clientY), view }
  }

  const zoomIn = () => zoomAt(1.2, { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 })
  const zoomOut = () => zoomAt(1 / 1.2, { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 })
  const resetView = () => setView({ x: 0, y: 0, scale: 1 })

  const removeWire = (id: string) => {
    if (locked) return
    setState((s) => ({ ...s, wires: s.wires.filter((w) => w.id !== id) }))
  }

  const addComponent = (type: ComponentType) => {
    if (locked) return
    const id = `${type.replace('-', '')}${Date.now().toString(36)}`
    setState((s) => ({
      ...s,
      components: [...s.components, { id, type, x: 560, y: 380 + ((s.components.length * 36) % 200) }],
    }))
  }

  const removeComponent = (id: string) => {
    if (locked) return
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
    if (locked) return
    const id = `bb${Date.now().toString(36)}`
    setState((s) => ({ ...s, breadboards: [...s.breadboards, { id, size, x: 24, y: 90 + s.breadboards.length * 40 }] }))
  }

  const removeBreadboard = (id: string) => {
    if (locked) return
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

  // 버튼/스위치는 locked 여부와 무관하게 항상 된다 — 실행 중인 회로를 눌러보는 게
  // 이번 요청의 핵심이라 여기만 잠금에서 뺐다.
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

  /** Tinkercad 처럼 전선이 부드러운 곡선(케이블)으로 처지게 그린다 — 직각 꺾임 대신. */
  const wirePath = (a: Point, b: Point) => {
    const dx = Math.max(30, Math.abs(b.x - a.x) * 0.55)
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
  }

  return (
    <div className="flex flex-col gap-2">
      <Palette
        tab={tab}
        setTab={setTab}
        addComponent={addComponent}
        addBreadboard={addBreadboard}
        locked={locked}
      />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-[520px] w-full touch-none rounded-xl border border-cream-deep bg-[#eef2ea] select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <filter id="chico-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#1c1917" floodOpacity="0.28" />
          </filter>
          <linearGradient id="chico-board-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2c7a54" />
            <stop offset="55%" stopColor="#1f6b48" />
            <stop offset="100%" stopColor="#175a3c" />
          </linearGradient>
          <linearGradient id="chico-bb-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbfaf5" />
            <stop offset="100%" stopColor="#ece7d8" />
          </linearGradient>
          {/* 팅커캐드 스타일 점 그리드. patternTransform을 콘텐츠 그룹과 똑같은
              translate/scale로 맞춰서, 줌/팬 중에도 점이 부품과 같이 움직이는 것처럼
              보이게 한다(실제로는 배경 rect 자체는 화면에 고정돼 있고 패턴만 움직인다). */}
          <pattern
            id="chico-grid"
            width={GRID}
            height={GRID}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
          >
            <circle cx={1} cy={1} r={1} fill="#c7d1c2" />
          </pattern>
        </defs>

        {/* 빈 캔버스를 누르면 팬(화면 이동) — 부품/보드/전선이 위에 겹쳐 그려지므로
            그 위를 눌렀을 땐 이 배경이 아니라 해당 부품이 이벤트를 받는다. */}
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#chico-grid)" onPointerDown={onBackgroundPointerDown} />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {breadboards.map((b) => {
            const layout = breadboardLayouts.get(b.id)
            if (!layout) return null
            return (
              <BreadboardGlyph
                key={b.id}
                layout={layout}
                locked={locked}
                onBodyPointerDown={(event) => {
                  if (locked) return
                  const p = toModelPoint(event.clientX, event.clientY)
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
                d={wirePath(a, b)}
                stroke="#dc2626"
                strokeWidth={3.5}
                fill="none"
                strokeLinecap="round"
                className={locked ? '' : 'cursor-pointer hover:stroke-red-800'}
                onClick={() => removeWire(w.id)}
              />
            )
          })}
          {/* 실제 선(3.5px)은 클릭하기 얇아서, 안 보이는 굵은 선을 하나 더 깔아 클릭 영역을 넓힌다. */}
          {!locked &&
            wires.map((w) => (
              <path
                key={`${w.id}-hit`}
                d={wirePath(pinPoint(w.from), pinPoint(w.to))}
                stroke="transparent"
                strokeWidth={14}
                fill="none"
                className="cursor-pointer"
                onClick={() => removeWire(w.id)}
              />
            ))}

          {draft && (
            <path
              d={wirePath(pinPoint(draft.from), draft.to)}
              stroke="#94a3b8"
              strokeWidth={2.5}
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
              locked={locked}
              onBodyPointerDown={(event) => {
                if (locked) return
                const p = toModelPoint(event.clientX, event.clientY)
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
        </g>

        {/* 줌 컨트롤 — transform 그룹 밖에 그려서 확대/축소와 무관하게 항상 같은
            화면 위치·크기를 유지한다. 휠이 없는 아이패드 등 터치 기기에선 이 버튼이
            줌의 유일한 수단이라 꼭 있어야 한다. */}
        <g transform={`translate(${VIEW_WIDTH - 112} ${VIEW_HEIGHT - 40})`}>
          <rect x={0} y={0} width={104} height={28} rx={14} fill="#ffffff" fillOpacity={0.9} stroke="#d9d2bd" />
          {[
            { dx: 14, label: '−', onClick: zoomOut, aria: '축소' },
            { dx: 52, label: '⤢', onClick: resetView, aria: '전체 보기(100%)' },
            { dx: 90, label: '+', onClick: zoomIn, aria: '확대' },
          ].map((btn) => (
            <text
              key={btn.aria}
              x={btn.dx}
              y={19}
              fontSize={btn.label === '⤢' ? 11 : 15}
              fontWeight="bold"
              textAnchor="middle"
              fill="#57534e"
              className="cursor-pointer select-none"
              aria-label={btn.aria}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={btn.onClick}
            >
              {btn.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}

export default forwardRef(CircuitCanvas)

function Palette({
  tab,
  setTab,
  addComponent,
  addBreadboard,
  locked,
}: {
  tab: ComponentCategory | 'breadboard'
  setTab: (t: ComponentCategory | 'breadboard') => void
  addComponent: (type: ComponentType) => void
  addBreadboard: (size: BreadboardSize) => void
  locked: boolean
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
                disabled={locked}
                onClick={() => addComponent(c.type)}
                className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-cheese-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {c.emoji} {c.label} 추가
              </button>
            ))
          : BREADBOARD_SIZES.map((b) => (
              <button
                key={b.size}
                disabled={locked}
                onClick={() => addBreadboard(b.size)}
                className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-cheese-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                🍞 {b.label} 추가
              </button>
            ))}
        <span className="text-xs text-ink-500">
          {locked
            ? '실행 중에는 배선을 편집할 수 없어요. 버튼/스위치는 눌러볼 수 있어요.'
            : '핀(원)을 끌어 다른 핀까지 전선을 잇고, 몸통은 끌어서 옮기고, 전선/✕는 클릭합니다.'}
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
  interactive,
  onPointerDown,
  onPointerUp,
}: {
  x: number
  y: number
  r: number
  fill: string
  stroke: string
  interactive: boolean
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
      className={interactive ? 'cursor-crosshair' : ''}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
    />
  )
}

function BreadboardGlyph({
  layout,
  locked,
  onBodyPointerDown,
  onRemove,
  onDotPointerDown,
  onDotPointerUp,
}: {
  layout: BreadboardLayout
  locked: boolean
  onBodyPointerDown: (e: React.PointerEvent<SVGRectElement>) => void
  onRemove: () => void
  onDotPointerDown: (ref: PinRef, point: Point) => void
  onDotPointerUp: (ref: PinRef) => void
}) {
  const l = layout
  const dots: React.ReactNode[] = []
  const ROW_LETTERS_TOP = ['a', 'b', 'c', 'd', 'e']
  const ROW_LETTERS_BOTTOM = ['f', 'g', 'h', 'i', 'j']

  for (let col = 0; col < l.columns; col++) {
    const x = l.colX(col)
    l.topRowsY.forEach((y, i) => {
      const ref: PinRef = { kind: 'breadboard', boardId: l.id, col, side: 'top' }
      dots.push(
        <PinDot
          key={`t${col}-${i}`}
          x={x}
          y={y}
          r={3.2}
          fill="#fff"
          stroke="#c2b391"
          interactive={!locked}
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
          r={3.2}
          fill="#fff"
          stroke="#c2b391"
          interactive={!locked}
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
        r={2.8}
        fill="#fecaca"
        stroke="#ef4444"
        interactive={!locked}
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
        r={2.8}
        fill="#cbd5f5"
        stroke="#3b82f6"
        interactive={!locked}
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

  // 5칸마다 눈금(1, 5, 10, …) — 진짜 브레드보드처럼.
  const tickCols = [0]
  for (let c = 4; c < l.columns; c += 5) tickCols.push(c)

  return (
    <g style={{ filter: 'url(#chico-shadow)' }}>
      <rect x={l.x} y={l.y} width={l.width} height={l.height} rx={6} fill="url(#chico-bb-body)" stroke="#cbbf9c" />
      {/* 전원 레일 줄무늬 */}
      <line x1={l.x + 10} y1={l.railPlusY} x2={l.x + l.width - 10} y2={l.railPlusY} stroke="#f87171" strokeWidth={1.5} opacity={0.5} />
      <line x1={l.x + 10} y1={l.railMinusY} x2={l.x + l.width - 10} y2={l.railMinusY} stroke="#60a5fa" strokeWidth={1.5} opacity={0.5} />
      <text x={l.x + 6} y={l.railPlusY + 3} fontSize={9} fill="#dc2626" fontWeight="bold">+</text>
      <text x={l.x + 6} y={l.railMinusY + 3} fontSize={9} fill="#2563eb" fontWeight="bold">−</text>
      {/* 가운데 홈(중앙 골) */}
      <rect
        x={l.x + 8}
        y={(l.topRowsY[4] + l.bottomRowsY[0]) / 2 - 3}
        width={l.width - 16}
        height={6}
        fill="#00000010"
      />
      {/* 줄 문자(a~e / f~j) */}
      {ROW_LETTERS_TOP.map((letter, i) => (
        <text key={letter} x={l.x + 8} y={l.topRowsY[i] + 3} fontSize={7} fill="#a08a5c">
          {letter}
        </text>
      ))}
      {ROW_LETTERS_BOTTOM.map((letter, i) => (
        <text key={letter} x={l.x + 8} y={l.bottomRowsY[i] + 3} fontSize={7} fill="#a08a5c">
          {letter}
        </text>
      ))}
      {/* 칸 눈금 숫자 */}
      {tickCols.map((c) => (
        <text key={c} x={l.colX(c)} y={l.topRowsY[0] - 8} fontSize={7} fill="#a08a5c" textAnchor="middle">
          {c + 1}
        </text>
      ))}

      <rect
        x={l.x}
        y={l.y}
        width={l.width}
        height={l.height}
        rx={6}
        fill="transparent"
        className={locked ? '' : 'cursor-grab'}
        onPointerDown={locked ? undefined : onBodyPointerDown}
      />
      <text x={l.x + l.width / 2} y={l.y + l.height + 12} fontSize={9} fill="#8a7a55" textAnchor="middle">
        브레드보드
      </text>
      {!locked && (
        <text
          x={l.x + l.width - 4}
          y={l.y + 10}
          fontSize={9}
          fill="#b91c1c"
          textAnchor="end"
          className="cursor-pointer"
          onClick={onRemove}
        >
          ✕
        </text>
      )}
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
  const cx = BOARD_X + BOARD_WIDTH / 2
  return (
    <g style={{ filter: 'url(#chico-shadow)' }}>
      <rect
        x={BOARD_X}
        y={BOARD_Y}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        rx={10}
        fill="url(#chico-board-body)"
        stroke="#0f3d29"
      />
      {/* USB 커넥터 */}
      <rect x={cx - 18} y={BOARD_Y - 6} width={36} height={16} rx={2} fill="#c7cdd6" stroke="#8891a1" />
      {/* BOOTSEL 버튼 */}
      <rect x={cx - 12} y={BOARD_Y + 60} width={24} height={24} rx={3} fill="#f8fafc" stroke="#cbd5e1" />
      <text x={cx} y={BOARD_Y + 90} fontSize={6} fill="#bfe3d2" textAnchor="middle">
        BOOTSEL
      </text>
      {/* 칩 */}
      <rect x={cx - 22} y={BOARD_Y + 130} width={44} height={44} rx={2} fill="#111827" stroke="#000" />
      <text
        x={cx}
        y={BOARD_Y + BOARD_HEIGHT / 2 + 60}
        fontSize={13}
        fill="#bfe3d2"
        textAnchor="middle"
        transform={`rotate(90 ${cx} ${BOARD_Y + BOARD_HEIGHT / 2 + 60})`}
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
      <rect
        x={pin.x - 5}
        y={pin.y - 5}
        width={10}
        height={10}
        rx={2}
        fill="#0b2f1f"
        stroke="#0b2f1f"
      />
      <circle
        cx={pin.x}
        cy={pin.y}
        r={4}
        fill={pin.gpio !== null ? '#facc15' : '#cbd5e1'}
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
  locked,
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
  locked: boolean
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

  /** 부품 몸통에서 각 핀까지 내려가는 다리(리드선) — 실제 부품처럼 보이게 한다. */
  const Legs = () => (
    <>
      {pins.map((p) => (
        <line
          key={p.pin}
          x1={p.dx * 0.4}
          y1={30}
          x2={p.dx}
          y2={p.dy}
          stroke="#9ca3af"
          strokeWidth={2}
        />
      ))}
    </>
  )

  return (
    <g transform={`translate(${component.x} ${component.y})`}>
      {(component.type === 'led' || component.type === 'rgb-led' || component.type === 'buzzer') && <Legs />}

      {component.type === 'led' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <path d="M -13 20 A 13 13 0 1 1 13 20 L 13 26 L -13 26 Z" fill="#78716c" opacity={0.35} />
          <circle
            cx={0}
            cy={18}
            r={14}
            fill={isOn('anode') || isOn('cathode') ? '#fde047' : '#fca5a5'}
            stroke={isOn('anode') || isOn('cathode') ? '#f59e0b' : '#b91c1c'}
            strokeWidth={2}
            style={isOn('anode') || isOn('cathode') ? { filter: 'drop-shadow(0 0 9px #fbbf24)' } : undefined}
          />
          <ellipse cx={-4} cy={13} rx={4} ry={2.5} fill="#ffffff" opacity={0.5} />
        </g>
      )}

      {component.type === 'rgb-led' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <path d="M -14 20 A 14 14 0 1 1 14 20 L 14 26 L -14 26 Z" fill="#78716c" opacity={0.3} />
          <circle
            cx={0}
            cy={18}
            r={15}
            fill={`rgb(${isOn('r') ? 255 : 90}, ${isOn('g') ? 255 : 90}, ${isOn('b') ? 255 : 90})`}
            stroke="#57534e"
            strokeWidth={2}
            opacity={0.9}
            style={
              isOn('r') || isOn('g') || isOn('b')
                ? { filter: 'drop-shadow(0 0 9px rgba(255,255,255,0.9))' }
                : undefined
            }
          />
          <ellipse cx={-4} cy={12} rx={4} ry={2.5} fill="#ffffff" opacity={0.6} />
        </g>
      )}

      {component.type === 'buzzer' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <circle
            cx={0}
            cy={18}
            r={15}
            fill={isOn('positive') || isOn('negative') ? '#fca5a5' : '#3f3f46'}
            stroke={isOn('positive') || isOn('negative') ? '#ef4444' : '#18181b'}
            strokeWidth={2}
          />
          <circle cx={0} cy={18} r={7} fill="#18181b" opacity={0.6} />
          <text x={0} y={22} fontSize={8} textAnchor="middle" fill="#fafaf9">
            🔔
          </text>
        </g>
      )}

      {component.type === 'button' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <line x1={-16} y1={20} x2={-16} y2={18} stroke="#9ca3af" strokeWidth={2} />
          <line x1={16} y1={20} x2={16} y2={18} stroke="#9ca3af" strokeWidth={2} />
          <rect x={-18} y={0} width={36} height={20} rx={3} fill="#e7e5e4" stroke="#78716c" strokeWidth={1.5} />
          <rect
            x={-11}
            y={active ? 5 : 3}
            width={22}
            height={12}
            rx={2}
            fill={active ? '#fbbf24' : '#f5f0e6'}
            stroke="#57534e"
            strokeWidth={1.5}
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
        </g>
      )}

      {component.type === 'switch' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <line x1={-16} y1={20} x2={-16} y2={18} stroke="#9ca3af" strokeWidth={2} />
          <line x1={16} y1={20} x2={16} y2={18} stroke="#9ca3af" strokeWidth={2} />
          <rect x={-18} y={2} width={36} height={16} rx={8} fill="#e7e5e4" stroke="#78716c" strokeWidth={1.5} />
          <rect
            x={-16}
            y={4}
            width={32}
            height={12}
            rx={6}
            fill={active ? '#bbf7d0' : '#d6d3d1'}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              onInputActiveChange(!active)
            }}
          />
          <circle cx={active ? 10 : -10} cy={10} r={6} fill="#fff" stroke="#57534e" strokeWidth={1} />
        </g>
      )}

      {!locked && (
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
      )}

      {pins.map((p) => (
        <circle
          key={p.pin}
          cx={p.dx}
          cy={p.dy}
          r={4}
          fill={gpioForPin(p.pin) !== undefined ? '#4ade80' : '#fff'}
          stroke="#334155"
          strokeWidth={1}
          className={locked ? '' : 'cursor-crosshair'}
          onPointerDown={locked ? undefined : (e) => onPinPointerDown(p.pin, e)}
          onPointerUp={locked ? undefined : (e) => onPinPointerUp(p.pin, e)}
        />
      ))}
    </g>
  )
}
