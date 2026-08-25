import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import Modal from '../../components/Modal'
import {
  BOARD_HEIGHT,
  BOARD_PINS,
  BOARD_WIDTH,
  DEFAULT_BOARD_X,
  DEFAULT_BOARD_Y,
  ONBOARD_LED_PIN,
  type BoardPin,
} from './board'
import {
  type BreadboardLayout,
  breadboardAnchor,
  breadboardRailAnchor,
  layoutBreadboard,
} from './breadboard'
import { buzzerAudio, DEFAULT_BUZZER_HZ } from './buzzerAudio'
import { resolveConnectivity } from './connectivity'
import {
  ADC_MAX,
  BREADBOARD_SIZES,
  type BreadboardSize,
  type CircuitSnapshot,
  COMPONENT_LIST,
  COMPONENT_PINS,
  COMPONENT_PIVOT,
  COMPONENT_SCALE,
  type ComponentType,
  DEFAULT_WIRE_COLOR,
  isDigitalInput,
  type AnalogChannel,
  analogKey,
  DHT_DEFAULT_HUMIDITY_RATIO,
  DHT_DEFAULT_TEMP_RATIO,
  dhtHumidity,
  dhtTemperature,
  KNOB_SWEEP_DEG,
  LDR_TRACK_HALF_WIDTH,
  LED_COLORS,
  ledColorOf,
  mirrorX,
  ANALOG_SENSORS,
  JOYSTICK_RADIUS,
  STEPPER_DEG_PER_STEP,
  stepperPhaseOf,
  LCD_COLUMNS,
  OLED_HEIGHT,
  OLED_I2C_ADDR,
  OLED_WIDTH,
  LCD_I2C_ADDR,
  LCD_LINES,
  NEOPIXEL_COUNT,
  PIR_DEFAULT_DISTANCE_RATIO,
  PIR_DEFAULT_RANGE_RATIO,
  pirDistanceM,
  pirRangeM,
  ULTRASONIC_DEFAULT_RATIO,
  ultrasonicDistance,
  type PinRef,
  type PlacedBoard,
  type PlacedBreadboard,
  type PlacedComponent,
  type Point,
  pinRefKey,
  rotateAround,
  servoAngleFromPwm,
  SEVEN_SEGMENT_BARS,
  type Wire,
  WIRE_COLORS,
} from './types'

const STORAGE_KEY = 'chicode.pico.circuit'
const MUTE_KEY = 'chicode.pico.muted'

/** 모델(회로) 좌표계의 세로 크기는 640으로 고정하고, 가로는 캔버스가 실제로 차지한
 *  칸의 비율에 맞춰 늘린다.
 *
 *  viewBox를 900×640으로 못박아 두면 preserveAspectRatio 기본값(xMidYMid meet)
 *  때문에 배율이 `min(가로/900, 세로/640)`으로 정해진다. 세로가 고정(520px)이라
 *  가로를 아무리 넓혀도 배율이 세로에 묶여서, 늘어난 폭이 전부 양옆 빈 띠가 된다 —
 *  실제로 재봤다. 컨테이너를 730→974px로 넓혀도 Pico 보드는 226px 그대로였다.
 *  가로 viewBox를 비율만큼 같이 늘리면 그 폭이 "더 넓은 작업 공간"이 된다.
 *
 *  좁은 화면에서도 900 밑으로는 안 줄인다 — 기본 회로의 Pico 보드가 x≈640~815에
 *  있어서, 그보다 좁히면 보드가 처음부터 화면 밖으로 나가버린다. */
const VIEW_HEIGHT = 640
const MIN_VIEW_WIDTH = 900

/** 그리드/스냅/줌 — 팅커캐드처럼 부품이 격자에 맞춰 정돈되고, 화면을 확대/축소·이동해
 *  볼 수 있게 한다(계획 문서 "캔버스 기본기" 1단계). 모델 좌표(컴포넌트 x/y 등)는 이
 *  그리드 단위와 무관한 자유 float로 그대로 두고, 렌더링 시점에만 반영한다. */
const GRID = 20
/** 전선을 놓을 때 이 거리(모델 단위) 안에 구멍이 있으면 거기 꽂힌 것으로 본다.
 *  손가락으로는 8px 짜리 핀을 정확히 짚기가 어렵다는 지적을 받고 넣었다. */
const PIN_SNAP_RADIUS = 24
const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
const snap = (v: number) => Math.round(v / GRID) * GRID

/** 보드의 회전 중심 — 보드 한가운데(가로/세로 절반)다. 왼쪽 위(0,0)를 축으로
 *  돌리면 보드가 모서리 기준으로 빙 돌아 선택 링 밖으로 나가버린다(실제 사용자가
 *  "파란 가이드는 가만있는데 물체가 그 밖으로 돈다"고 지적해서 찾은 문제 —
 *  ComponentGlyph의 COMPONENT_PIVOT과 같은 이유). */
const BOARD_PIVOT: Point = { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 }

/** 브레드보드의 회전 중심(가로/세로 절반) — board.ts와 달리 breadboard.ts의
 *  layoutBreadboard()는 칸/줄 좌표를 처음부터 절대좌표(b.x/b.y가 이미 반영된 값)로
 *  계산해 둔다. 그래서 pivot도 매번 layout에서 뽑아 쓴다(고정 상수가 아님) — 크기
 *  (미니/중간)마다 width가 다르고, 드래그로 옮기면 layout.x/y도 매번 바뀐다. */
const breadboardPivot = (layout: BreadboardLayout): Point => ({
  x: layout.x + layout.width / 2,
  y: layout.y + layout.height / 2,
})

// 처음 들어왔을 때(저장된 회로가 없을 때)는 빈 회로로 시작한다 — 코드도
// STARTER_CODE(from machine import Pin 하나)뿐이라 앞뒤가 맞아야 한다
// (PicoLab.tsx 참고). 예제별 회로는 examples.ts 의 circuit 이 맡는다.
const DEFAULT_BOARD: PlacedBoard = { x: DEFAULT_BOARD_X, y: DEFAULT_BOARD_Y, rotation: 0 }
const DEFAULT_CIRCUIT: CircuitSnapshot = {
  components: [],
  breadboards: [],
  wires: [],
  board: DEFAULT_BOARD,
}

/** board 필드가 있어야 CircuitCanvas 상태에서 항상 안전하게 쓸 수 있다 — 이 필드가
 *  생기기 전 저장된 회로(localStorage)나 examples.ts 가 안 채워도 여기서 채운다. */
function withDefaultBoard(snapshot: CircuitSnapshot): CircuitSnapshot {
  return { ...snapshot, board: snapshot.board ?? DEFAULT_BOARD }
}

function loadInitial(): CircuitSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CircuitSnapshot>
      if (parsed.components && parsed.wires) {
        return withDefaultBoard({
          components: parsed.components,
          breadboards: parsed.breadboards ?? [],
          wires: parsed.wires,
          board: parsed.board,
        })
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
  /** PWM 이 걸린 핀의 주파수/듀티 — LED 는 밝기로, 부저는 음 높이로 보여준다. */
  pwmLevels: Map<number, { freq: number; duty: number }>
  /** 네오픽셀 핀별 색 목록. write() 를 부른 시점의 값이다. */
  neopixelColors: Map<number, string[]>
  /** I2C LCD 화면 글자(sda 핀 → 줄 목록). */
  lcdLines: Map<number, string[]>
  /** OLED 화면(sda 핀 → 행마다 '0'/'1' 문자열). */
  oledRows: Map<number, string[]>
  /** 버튼/스위치가 눌리거나 켜질 때, 연결된 GPIO 번호로 알려준다(연결 안 됐으면 안 불림). */
  onButtonChange: (gpio: number, pressed: boolean) => void
  /** 가변저항 노브를 돌릴 때, 연결된 GPIO 번호로 0~65535 값을 알려준다. */
  onAnalogChange: (gpio: number, value: number) => void
  /** 온습도 센서 슬라이더를 움직일 때, 연결된 GPIO 번호로 온도(℃)·습도(%)를 알려준다. */
  onDhtChange: (gpio: number, temperature: number, humidity: number) => void
  /** OLED 배선을 알려준다(LCD 와 같은 이유). */
  onOledConfigChange: (screens: { sda: number; addr: number }[]) => void
  /** I2C LCD 배선을 알려준다. scan() 이 무엇을 돌려줘야 하는지 워커가 알아야 한다. */
  onLcdConfigChange: (screens: { sda: number; addr: number }[]) => void
  /** 초음파 센서의 배선(trig/echo 짝)과 거리를 알려준다. 워커가 trig 를 보고 echo
   *  펄스를 만들어야 해서 값 하나가 아니라 목록 통째로 보낸다. */
  onUltrasonicChange: (sensors: { trig: number; echo: number; distanceCm: number }[]) => void
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

/** 부품의 회전 중심을 화면 배율까지 반영해서 돌려준다. */
function scaledPivot(type: ComponentType): Point {
  const pivot = COMPONENT_PIVOT[type]
  return { x: pivot.x * COMPONENT_SCALE, y: pivot.y * COMPONENT_SCALE }
}

/** 핀에 실제로 걸린 세기(0~1). 단순 on/off 면 0 또는 1이고, PWM 이 걸려 있으면 duty
 *  비율이다. 부저 소리와 ComponentGlyph 의 그림이 어긋나면 안 되니 한 군데서 계산한다. */
function levelOfGpio(
  gpio: number | undefined,
  gpioLevels: Map<number, 0 | 1>,
  pwmLevels: Map<number, { freq: number; duty: number }>,
): number {
  if (gpio === undefined) return 0
  const pwm = pwmLevels.get(gpio)
  if (pwm) return pwm.duty / ADC_MAX
  return gpioLevels.get(gpio) === 1 ? 1 : 0
}

/** 보드는 하나뿐이라 id가 따로 없다 — 드래그/선택 상태에서 부품·브레드보드와 같은
 *  모양으로 다루려고 이 고정 문자열을 그 자리에 쓴다. */
const BOARD_ID = 'pico-board'
type DragTarget = { id: string; kind: 'component' | 'breadboard' | 'board'; dx: number; dy: number }
type Selection = { id: string; kind: 'component' | 'breadboard' | 'board' | 'wire' } | null

/** 선택한 전선의 한쪽 끝을 잡아 다른 핀으로 옮기는 중인 상태. end 는 "잡고 있는 쪽"이고,
 *  반대쪽 끝은 제자리에 붙어 있다. */
type Rewiring = { wireId: string; end: 'from' | 'to' } | null

function CircuitCanvas(
  { gpioLevels, pwmLevels, neopixelColors, lcdLines, oledRows, onButtonChange, onAnalogChange, onDhtChange, onUltrasonicChange, onLcdConfigChange, onOledConfigChange, locked = false }: CircuitCanvasProps,
  ref: React.Ref<CircuitCanvasHandle>,
) {
  const [{ components, breadboards, wires, board }, setState] = useState<CircuitSnapshot>(loadInitial)
  // withDefaultBoard가 항상 채워주므로 board는 실제로 항상 있다 — 타입만 optional.
  const boardPos = board ?? DEFAULT_BOARD
  /** 지금 긋고 있는 전선. snap 은 "지금 놓으면 여기 꽂힌다" 는 후보 구멍이다. */
  const [draft, setDraft] = useState<{ from: PinRef; to: Point; snap?: PinRef | null } | null>(null)
  const [dragging, setDragging] = useState<DragTarget | null>(null)
  // 버튼(누르는 동안)과 스위치(클릭해서 토글) 둘 다 "지금 켜진 입력 부품 id" 로 통일해서 관리한다.
  const [activeInputs, setActiveInputs] = useState<Set<string>>(new Set())
  // 아날로그 조작부의 위치(analogKey(부품 id, 채널) → 0~1). 회로 자체(components/
  // wires)와 달리 저장하지 않는다 — "지금 노브를 어디까지 돌려놨는가"는 버튼을 누르고
  // 있는 것과 같은 순간적인 물리 상태지 회로의 일부가 아니다.
  // 온습도처럼 조작부가 둘인 부품이 있어서 부품 id 하나로는 부족하다(analogKey 참고).
  const [analogValues, setAnalogValues] = useState<Map<string, number>>(new Map())
  // 아날로그 입력(가변저항 노브 / 조도센서 슬라이더)을 잡고 있는 부품 id. 부품
  // 드래그(dragging)와 별개로 둬야 조작할 때 부품이 같이 끌려오지 않는다.
  /** 아날로그 조작부를 잡고 있는 부품. ref 와 state 를 같이 두는 이유는 rewiringRef 와
   *  같다 — pointerdown 과 pointermove 사이에 리렌더가 없으면 state 는 옛 값(null)을
   *  보고 움직임을 통째로 흘려버린다. */
  const analogDragRef = useRef<{ id: string; channel: AnalogChannel } | null>(null)
  const [, setAnalogDragState] = useState<{ id: string; channel: AnalogChannel } | null>(null)
  const setAnalogDrag = (next: { id: string; channel: AnalogChannel } | null) => {
    analogDragRef.current = next
    setAnalogDragState(next)
  }
  /** 다시 잇는 중인 전선. ref 와 state 를 같이 두는 이유: finishWire 는 포인터 이벤트
   *  핸들러 안에서 "지금" 값을 읽어야 하는데, state 만 쓰면 pointerdown 과 pointerup
   *  사이에 리렌더가 없었을 때 옛 값(null)을 보고 전선을 옮기는 대신 새로 그어버린다
   *  (실제로 재현했다 — 원래 전선은 그대로 남고 엉뚱한 전선이 하나 더 생겼다).
   *  화면 표시는 state 쪽을 쓴다. */
  const rewiringRef = useRef<Rewiring>(null)
  const [rewiring, setRewiringState] = useState<Rewiring>(null)
  const setRewiring = (next: Rewiring) => {
    rewiringRef.current = next
    setRewiringState(next)
  }

  /**
   * 되돌리기/다시 실행. 회로 스냅샷을 통째로 쌓는다 — 부품 몇 개짜리 회로라 통짜 복사가
   * 가벼운데다, "무엇이 바뀌었는지" 를 항목마다 따로 기록하는 것보다 틀릴 여지가 없다.
   *
   * state 가 아니라 ref 인 이유: 스택 자체가 바뀌었다고 다시 그릴 필요는 없고, 버튼을
   * 흐리게/진하게 할 때만 필요해서 historyTick 으로 따로 알린다.
   */
  const historyRef = useRef<{ past: CircuitSnapshot[]; future: CircuitSnapshot[] }>({ past: [], future: [] })
  const [historyTick, setHistoryTick] = useState(0)
  // 드래그는 pointermove 마다 setState 를 부른다. 그때마다 기록하면 한 번 끄는 데
  // 수십 칸이 쌓이므로, 실제로 움직이기 시작한 첫 순간에 한 번만 기록한다.
  const dragHistoryRef = useRef<CircuitSnapshot | null>(null)
  // 지금부터 새로 잇는 전선에 쓸 색 — 팔레트에서 고르면 바뀐다(finishWire 참고).
  const [wireColor, setWireColor] = useState(DEFAULT_WIRE_COLOR)
  // 부품마다 "✕ 삭제"/"↻ 회전" 글자를 따로 두면 부품이 많아질수록 화면이 빽빽해지고
  // 누르기도 작아진다는 사용자 지적으로, 클릭해서 하나만 선택한 뒤 키보드(R=회전,
  // Delete=삭제) 또는 팔레트의 휴지통 버튼 하나로 조작하는 방식으로 바꿨다.
  const [selected, setSelected] = useState<Selection>(null)
  // 전체 삭제 확인은 window.confirm() 대신 앱 안 모달로 띄운다 — 특정 환경(임베드된
  // 브라우저, 일부 아이패드 웹뷰 등)에서 네이티브 confirm()이 아무 반응 없이 조용히
  // 취소로 처리되는 문제가 실제로 보고됐다(사용자가 "확인창 자체가 안 뜬다"고 확인).
  const [confirmingClearAll, setConfirmingClearAll] = useState(false)
  // 부저 음소거. 수업 중에 소리를 꺼야 할 때가 있어서 저장해 둔다 — 노브 위치와 달리
  // 이건 "이 컴퓨터를 쓰는 사람의 설정"이지 회로 상태가 아니다.
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === '1')
  useEffect(() => {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    if (muted) buzzerAudio.stopAll()
  }, [muted])
  // 캔버스 칸이 가로로 넓어진 만큼 viewBox도 넓힌다(위 MIN_VIEW_WIDTH 주석 참고).
  const [viewWidth, setViewWidth] = useState(MIN_VIEW_WIDTH)
  const svgRef = useRef<SVGSVGElement>(null)

  // 줌/팬은 회로 데이터(components/breadboards/wires)와 달리 저장하지 않는다 — 매번
  // 처음 화면으로 시작해도 무방하고, "예제 불러오기"가 회로를 통째로 갈아끼우는 로직과
  // 섞이지 않게 단순하게 둔다.
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  // 팬 제스처 시작 시점의 좌표를 들고 있는다. state 대신 ref 인 이유: 매 pointermove 마다
  // setState 로 다시 만들 필요 없이 시작점만 고정해 두고 델타만 계산하면 되기 때문.
  const panStartRef = useRef<{ svg: Point; view: { x: number; y: number; scale: number } } | null>(null)

  /**
   * 지금 화면에 닿아 있는 포인터들. 손가락 두 개면 핀치 줌으로 넘어간다 —
   * 아이패드엔 휠이 없어서 줌 버튼(10px)이 유일한 수단이었는데, 그건 손가락으로
   * 누르기엔 너무 작다는 지적을 받았다.
   */
  const pointersRef = useRef(new Map<number, Point>())
  const pinchRef = useRef<{
    distance: number
    center: Point
    view: { x: number; y: number; scale: number }
  } | null>(null)

  const pointerDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  const pointerCenter = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

  /** 두 손가락이 닿는 순간 진행 중이던 한 손가락 동작(부품 끌기·배선·슬라이더)을 접는다.
   *  안 그러면 확대하려다 부품이 딸려 온다. */
  const cancelSinglePointerGestures = () => {
    setDragging(null)
    dragHistoryRef.current = null
    setDraft(null)
    setRewiring(null)
    setAnalogDrag(null)
    panStartRef.current = null
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ components, breadboards, wires, board: boardPos }))
  }, [components, breadboards, wires, boardPos])

  const snapshotNow = useCallback(
    (): CircuitSnapshot => JSON.parse(JSON.stringify({ components, breadboards, wires, board: boardPos })),
    [components, breadboards, wires, boardPos],
  )

  /** 바꾸기 "직전" 상태를 쌓는다. 실제로 회로를 건드리는 동작마다 먼저 부른다. */
  const pushHistory = useCallback(
    (snapshot?: CircuitSnapshot) => {
      const h = historyRef.current
      h.past.push(snapshot ?? snapshotNow())
      // 무한정 쌓으면 메모리를 먹는다. 수업 중 되돌릴 만한 깊이로 충분하다.
      if (h.past.length > 50) h.past.shift()
      h.future = []
      setHistoryTick((t) => t + 1)
    },
    [snapshotNow],
  )

  /** 되돌리기/다시 실행 공용. 진행 중이던 드래그·배선은 전부 취소한다 — 화면에 남아
   *  있으면 방금 되돌린 회로와 어긋난 상태로 붙어버린다. */
  const timeTravel = useCallback(
    (direction: 'undo' | 'redo') => {
      const h = historyRef.current
      const from = direction === 'undo' ? h.past : h.future
      const to = direction === 'undo' ? h.future : h.past
      const target = from.pop()
      if (!target) return
      to.push(snapshotNow())
      setState(withDefaultBoard(target))
      setSelected(null)
      setDraft(null)
      setRewiring(null)
      setDragging(null)
      setHistoryTick((t) => t + 1)
    },
    [snapshotNow],
  )

  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0
  void historyTick // 스택이 바뀔 때 위 두 값을 다시 계산하려고 구독한다

  // "예제 불러오기" 가 이 handle 로 회로를 통째로 갈아끼운다. JSON 왕복으로 깊은 복사를
  // 해서, 같은 예제를 두 번 불러오거나 부품을 옮겨도 EXAMPLES 원본 데이터가 오염되지
  // 않게 한다(배열/객체를 그대로 두면 여러 로드가 같은 참조를 공유하게 된다).
  useImperativeHandle(
    ref,
    () => ({
      loadCircuit: (circuit) => {
        pushHistory()
        setState(withDefaultBoard(JSON.parse(JSON.stringify(circuit)) as CircuitSnapshot))
        setDraft(null)
        setDragging(null)
        setActiveInputs(new Set())
        setAnalogValues(new Map())
        setAnalogDrag(null)
        setSelected(null)
      },
    }),
    [pushHistory],
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
      if (!isDigitalInput(c.type)) continue
      if (!activeInputs.has(c.id)) continue
      const gpio = gpioForPin(c.id, 'a') ?? gpioForPin(c.id, 'b') ?? gpioForPin(c.id, 'sw')
      if (gpio !== undefined) onButtonChange(gpio, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity, activeInputs])

  // 탭으로 숨겨진 동안엔 크기가 0으로 잡히므로(display:none) 그때는 그냥 넘긴다 —
  // 다시 보이는 순간 ResizeObserver가 진짜 크기로 한 번 더 부른다.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (!width || !height) return
      setViewWidth(Math.max(MIN_VIEW_WIDTH, Math.round((width / height) * VIEW_HEIGHT)))
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  /** 가변저항 값도, 노브를 돌릴 때뿐 아니라 배선이 바뀔 때도 최신 GPIO 로 다시 알려준다
   *  (버튼의 위 useEffect 와 같은 이유). 안 이어졌으면 알릴 곳이 없으니 건너뛴다. */
  useEffect(() => {
    for (const c of components) {
      if (c.type === 'dht') {
        const gpio = gpioForPin(c.id, 'out')
        if (gpio === undefined) continue
        onDhtChange(
          gpio,
          dhtTemperature(analogValues.get(analogKey(c.id, 'temp')) ?? DHT_DEFAULT_TEMP_RATIO),
          dhtHumidity(analogValues.get(analogKey(c.id, 'hum')) ?? DHT_DEFAULT_HUMIDITY_RATIO),
        )
        continue
      }
      if (c.type === 'joystick') {
        // 축 두 개가 각각 다른 ADC 핀으로 나간다. 가운데가 절반(32768)이다.
        const x = gpioForPin(c.id, 'vrx')
        const y = gpioForPin(c.id, 'vry')
        if (x !== undefined) onAnalogChange(x, Math.round((analogValues.get(analogKey(c.id)) ?? 0.5) * ADC_MAX))
        if (y !== undefined) onAnalogChange(y, Math.round((analogValues.get(analogKey(c.id, 'range')) ?? 0.5) * ADC_MAX))
        continue
      }
      const sensor = ANALOG_SENSORS[c.type]
      if (sensor) {
        const gpio = gpioForPin(c.id, 'out')
        if (gpio === undefined) continue
        onAnalogChange(gpio, sensor.adcOf(analogValues.get(analogKey(c.id)) ?? 0))
        continue
      }
      if (c.type !== 'potentiometer' && c.type !== 'ldr') continue
      const gpio = gpioForPin(c.id, 'out')
      if (gpio === undefined) continue
      onAnalogChange(gpio, Math.round((analogValues.get(analogKey(c.id)) ?? 0) * ADC_MAX))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analogValues, connectivity, components])

  /** PIR 은 클릭이 아니라 두 슬라이더(감지 범위 / 사람까지 거리)로 켜지고 꺼진다.
   *  사람이 범위 안에 들어오면 켜진 것으로 보고, 나머지 경로(activeInputs →
   *  onButtonChange)는 버튼·스위치와 그대로 공유한다. */
  useEffect(() => {
    for (const c of components) {
      if (c.type !== 'pir') continue
      const range = pirRangeM(analogValues.get(analogKey(c.id, 'range')) ?? PIR_DEFAULT_RANGE_RATIO)
      const distance = pirDistanceM(analogValues.get(analogKey(c.id)) ?? PIR_DEFAULT_DISTANCE_RATIO)
      const detected = distance <= range
      if (activeInputs.has(c.id) !== detected) setInputActive(c.id, detected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analogValues, components, connectivity, activeInputs])

  /** 스텝모터는 "지금 어느 코일이 켜졌나" 만 봐서는 각도를 알 수 없다 — 순서가 한 칸씩
   *  넘어간 횟수를 세야 한다. 그래서 부품마다 직전 단계와 누적 각도를 들고 있는다.
   *  ref 에 쌓고 state 로 내보내는 이유: 매 gpio 변화마다 새 Map 을 만들지 않으려고. */
  const stepperRef = useRef(new Map<string, { phase: number | null; angle: number }>())
  const [stepperAngles, setStepperAngles] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let moved = false
    for (const c of components) {
      if (c.type !== 'stepper') continue
      const on = ['in1', 'in2', 'in3', 'in4'].map((pin) => {
        const gpio = gpioForPin(c.id, pin)
        return gpio !== undefined && gpioLevels.get(gpio) === 1
      })
      const phase = stepperPhaseOf(on)
      if (phase === null) continue // 시퀀스에 없는 조합이면 축이 안 돈다(실물도 그렇다)
      const state = stepperRef.current.get(c.id) ?? { phase: null, angle: 0 }
      if (state.phase !== null && phase !== state.phase) {
        // 순서가 한 칸 앞이면 정방향, 한 칸 뒤면 역방향. 건너뛰면 안 돈 것으로 본다.
        if ((state.phase + 1) % 8 === phase) {
          state.angle += STEPPER_DEG_PER_STEP
          moved = true
        } else if ((state.phase + 7) % 8 === phase) {
          state.angle -= STEPPER_DEG_PER_STEP
          moved = true
        }
      }
      state.phase = phase
      stepperRef.current.set(c.id, state)
    }
    if (moved) {
      setStepperAngles(new Map([...stepperRef.current].map(([id, v]) => [id, v.angle])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpioLevels, components, connectivity])

  /** LCD 도 배선을 워커가 알아야 한다 — scan() 이 무엇을 돌려줄지, 그리고 어느 화면에
   *  글자를 보낼지 정해야 하기 때문이다. */
  useEffect(() => {
    const screens: { sda: number; addr: number }[] = []
    for (const c of components) {
      if (c.type !== 'lcd') continue
      const sda = gpioForPin(c.id, 'sda')
      if (sda === undefined) continue
      screens.push({ sda, addr: LCD_I2C_ADDR })
    }
    onLcdConfigChange(screens)
    const oleds: { sda: number; addr: number }[] = []
    for (const c of components) {
      if (c.type !== 'oled') continue
      const sda = gpioForPin(c.id, 'sda')
      if (sda === undefined) continue
      oleds.push({ sda, addr: OLED_I2C_ADDR })
    }
    onOledConfigChange(oleds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectivity, components])

  /** 초음파는 값 하나가 아니라 "어느 핀이 trig 이고 어느 핀이 echo 인가" 까지 워커가
   *  알아야 한다 — 워커가 trig 의 내림 edge 를 보고 echo 펄스를 직접 만들기 때문이다.
   *  배선이나 거리 슬라이더가 바뀔 때마다 목록을 통째로 다시 보낸다. */
  useEffect(() => {
    const sensors: { trig: number; echo: number; distanceCm: number }[] = []
    for (const c of components) {
      if (c.type !== 'ultrasonic') continue
      const trig = gpioForPin(c.id, 'trig')
      const echo = gpioForPin(c.id, 'echo')
      if (trig === undefined || echo === undefined) continue
      sensors.push({
        trig,
        echo,
        distanceCm: ultrasonicDistance(analogValues.get(analogKey(c.id)) ?? ULTRASONIC_DEFAULT_RATIO),
      })
    }
    onUltrasonicChange(sensors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analogValues, connectivity, components])

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

  /** 선택한 전선의 한쪽 끝을 잡는다. 잡은 쪽은 떨어져 포인터를 따라오고(draft),
   *  반대쪽 끝은 제자리에 붙어 있다 — 새 전선을 긋는 것과 같은 화면이 된다. */
  const startRewire = (wire: Wire, end: 'from' | 'to') => {
    if (locked) return
    setRewiring({ wireId: wire.id, end })
    setDraft({ from: end === 'from' ? wire.to : wire.from, to: pinPoint(wire[end]) })
  }

  const finishWire = (ref: PinRef) => {
    if (locked) return

    // 다시 잇는 중이면 새 전선을 만드는 게 아니라 잡고 있던 끝만 옮긴다.
    if (rewiringRef.current) {
      pushHistory()
      const target = rewiringRef.current
      setRewiring(null)
      setDraft(null)
      setState((s) => {
        const wire = s.wires.find((w) => w.id === target.wireId)
        if (!wire) return s
        const from = target.end === 'from' ? ref : wire.from
        const to = target.end === 'to' ? ref : wire.to
        // 같은 핀끼리는 못 잇는다. 이미 같은 두 핀을 잇는 다른 전선이 있어도 무시한다
        // (새로 그을 때와 같은 규칙 — 겹친 전선이 두 개 생기면 지우기도 헷갈린다).
        if (pinRefKey(from) === pinRefKey(to)) return s
        const duplicate = s.wires.some(
          (w) =>
            w.id !== wire.id &&
            ((pinRefKey(w.from) === pinRefKey(from) && pinRefKey(w.to) === pinRefKey(to)) ||
              (pinRefKey(w.to) === pinRefKey(from) && pinRefKey(w.from) === pinRefKey(to))),
        )
        if (duplicate) return s
        return { ...s, wires: s.wires.map((w) => (w.id === wire.id ? { ...w, from, to } : w)) }
      })
      return
    }

    setDraft((current) => {
      if (!current) return null
      if (pinRefKey(current.from) === pinRefKey(ref)) return null
      pushHistory()
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
            {
              id: `w${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
              from: current.from,
              to: ref,
              color: wireColor,
            },
          ],
        }
      })
      return null
    })
  }

  /** 화면의 두 점 사이 거리·중심이 바뀐 만큼 확대/이동한다. 두 손가락 사이에 잡힌
   *  회로의 그 자리가 손가락을 따라오도록 view.x/y 도 같이 옮긴다. */
  const applyPinch = (a: Point, b: Point) => {
    const start = pinchRef.current
    if (!start || start.distance === 0) return
    const distance = pointerDistance(a, b)
    const center = pointerCenter(a, b)
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (start.view.scale * distance) / start.distance))
    const modelX = (start.center.x - start.view.x) / start.view.scale
    const modelY = (start.center.y - start.view.y) / start.view.scale
    setView({ scale, x: center.x - modelX * scale, y: center.y - modelY * scale })
  }

  /** 모든 포인터를 여기서 받는다(capture 단계라 자식이 stopPropagation 해도 들어온다). */
  const onPointerDownCapture = (event: React.PointerEvent<SVGSVGElement>) => {
    // iOS 는 사용자가 건드린 핸들러 안에서만 소리를 깨울 수 있다(buzzerAudio.unlock 주석).
    if (!muted) buzzerAudio.unlock()
    // 새 제스처의 "첫 번째" 포인터가 오면 이전 것들을 싹 비운다.
    //
    // 아이패드는 다른 제스처가 끼어들면 pointerup/cancel 을 흘려버리는 일이 있는데,
    // 그러면 안 눌린 포인터가 목록에 남아 다음 한 손가락 동작이 두 손가락(핀치)으로
    // 오인된다 — 새로고침 전까지 부품을 못 옮기게 된다(실제로 재현했다).
    // 두 번째 손가락은 isPrimary 가 false 라 이 정리에 걸리지 않는다.
    if (event.isPrimary) {
      pointersRef.current.clear()
      pinchRef.current = null
    }
    pointersRef.current.set(event.pointerId, toSvgPoint(event.clientX, event.clientY))

    // 캔버스 위 컨트롤(줌·되돌리기)은 클릭으로 동작해야 해서 캡처를 걸지 않는다 —
    // 포인터를 캡처하면 pointerup 이 svg 로 가버려서 click 이 안 만들어진다.
    const onControl = (event.target as Element | null)?.closest?.('[data-canvas-control]')
    if (!onControl) {
      // 애플펜슬·손가락은 빠르게 움직이면 포인터가 부품 밖으로 나가 이벤트를 놓친다.
      // 캡처해 두면 끝날 때까지 svg 가 모든 이벤트를 받는다.
      //
      // try 로 감싸는 이유: setPointerCapture 는 그 pointerId 가 "지금 눌려 있는"
      // 상태가 아니면 예외를 던진다. 여기서 터지면 아래 핀치 준비까지 통째로
      // 건너뛰어서 두 손가락 확대가 조용히 안 먹는다(실제로 밟았다).
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* 캡처가 안 돼도 동작 자체는 된다 — 빠른 제스처에서 이벤트를 놓칠 수 있을 뿐 */
      }
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      cancelSinglePointerGestures()
      pinchRef.current = { distance: pointerDistance(a, b), center: pointerCenter(a, b), view }
    }
  }

  const releasePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, toSvgPoint(event.clientX, event.clientY))
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      applyPinch(a, b)
      return
    }

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
    // 노브 돌리기는 locked(실행 중) 여도 된다 — 잠금의 목적은 배선 편집 금지지
    // 상호작용 금지가 아니다(버튼/스위치와 같은 이유).
    if (analogDragRef.current) {
      applyAnalogAt(analogDragRef.current, toModelPoint(event.clientX, event.clientY))
      return
    }

    if (locked) return
    const p = toModelPoint(event.clientX, event.clientY)
    if (draft) {
      // 가까운 구멍이 있으면 선 끝을 거기 붙여 보여준다 — 놓기 전에 어디에 꽂힐지
      // 눈으로 알 수 있어야 손가락으로도 배선을 할 수 있다.
      const near = nearestPin(p, draft.from)
      setDraft((d) => (d ? { ...d, to: near ? near.point : p, snap: near?.ref ?? null } : d))
    }
    if (dragging) {
      // 누르기만 하고 안 움직였으면(=선택만 했으면) 기록하지 않는다.
      if (dragHistoryRef.current) {
        pushHistory(dragHistoryRef.current)
        dragHistoryRef.current = null
      }
      const nx = p.x - dragging.dx
      const ny = p.y - dragging.dy
      setState((s) => {
        if (dragging.kind === 'component') {
          return { ...s, components: s.components.map((c) => (c.id === dragging.id ? { ...c, x: nx, y: ny } : c)) }
        }
        if (dragging.kind === 'breadboard') {
          return {
            ...s,
            breadboards: s.breadboards.map((b) => (b.id === dragging.id ? { ...b, x: nx, y: ny } : b)),
          }
        }
        // 'board' — 보드는 하나뿐이라 배열에서 찾을 필요 없이 그대로 갱신한다.
        return { ...s, board: { ...(s.board ?? DEFAULT_BOARD), x: nx, y: ny } }
      })
    }
  }

  /** 부품/브레드보드를 옮기는 동안엔 자유롭게 움직이다가, 놓는(pointer up) 순간에만
   *  그리드에 스냅한다 — 매 프레임 스냅하면 뚝뚝 끊겨 보인다(팅커캐드도 이 방식). */
  const onPointerUp = () => {
    panStartRef.current = null
    setAnalogDrag(null)
    if (dragging) {
      const target = dragging
      setState((s) => {
        if (target.kind === 'component') {
          return {
            ...s,
            components: s.components.map((c) => (c.id === target.id ? { ...c, x: snap(c.x), y: snap(c.y) } : c)),
          }
        }
        if (target.kind === 'breadboard') {
          return {
            ...s,
            breadboards: s.breadboards.map((b) => (b.id === target.id ? { ...b, x: snap(b.x), y: snap(b.y) } : b)),
          }
        }
        const current = s.board ?? DEFAULT_BOARD
        return { ...s, board: { ...current, x: snap(current.x), y: snap(current.y) } }
      })
    }
    setDragging(null)
    dragHistoryRef.current = null
    // 구멍을 정확히 짚지 않았어도 가까우면 거기 꽂아준다(PIN_SNAP_RADIUS).
    // 반경 밖이면 예전처럼 취소 — 전선은 원래 자리에 남는다.
    if (draft?.snap) finishWire(draft.snap)
    else {
      setDraft(null)
      setRewiring(null)
    }
  }

  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    panStartRef.current = { svg: toSvgPoint(event.clientX, event.clientY), view }
    setSelected(null) // 빈 곳을 누르면 선택 해제
  }

  const zoomIn = () => zoomAt(1.2, { x: viewWidth / 2, y: VIEW_HEIGHT / 2 })
  const zoomOut = () => zoomAt(1 / 1.2, { x: viewWidth / 2, y: VIEW_HEIGHT / 2 })
  const resetView = () => setView({ x: 0, y: 0, scale: 1 })

  const removeWire = (id: string) => {
    if (locked) return
    pushHistory()
    setState((s) => ({ ...s, wires: s.wires.filter((w) => w.id !== id) }))
  }

  /** 오른쪽 클릭으로 이미 그은 전선의 색을 지금 고른 색(wireColor)으로 바꾼다.
   *  왼쪽 클릭은 선택(양 끝 손잡이 표시)이라 색 바꾸기는 이 자리에 그대로 둔다. */
  const recolorWire = (id: string, event: React.MouseEvent) => {
    event.preventDefault()
    if (locked) return
    pushHistory()
    setState((s) => ({ ...s, wires: s.wires.map((w) => (w.id === id ? { ...w, color: wireColor } : w)) }))
  }

  /** 회로를 통째로 비운다. 되돌리기로 살릴 수는 있지만 한 번에 다 날아가는 동작이라
   *  확인 모달은 그대로 둔다. 실제로 지우는 건
   *  confirmClearAll(모달의 "지우기" 버튼)이 한다. */
  const clearAll = () => {
    if (locked) return
    setConfirmingClearAll(true)
  }

  const confirmClearAll = () => {
    pushHistory()
    setState({ components: [], breadboards: [], wires: [] })
    setSelected(null)
    setConfirmingClearAll(false)
  }

  const addComponent = (type: ComponentType) => {
    if (locked) return
    pushHistory()
    const id = `${type.replace('-', '')}${Date.now().toString(36)}`
    setState((s) => ({
      ...s,
      components: [...s.components, { id, type, x: 560, y: 380 + ((s.components.length * 36) % 200) }],
    }))
  }

  const removeComponent = (id: string) => {
    if (locked) return
    pushHistory()
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

  /** 클릭할 때마다 시계 방향으로 90도씩 돈다 — 배치 방향에 맞게 몇 번 눌러서 맞춘다.
   *  브레드보드는 회전 대상에서 뺐다(칸이 많아 회전하면 줄/칸 계산을 다시 해야 해서
   *  범위 밖으로 남겨둠 — LED/버튼 같은 낱개 부품만 우선). */
  const rotateComponent = (id: string) => {
    if (locked) return
    pushHistory()
    setState((s) => ({
      ...s,
      components: s.components.map((c) =>
        c.id === id ? { ...c, rotation: (((c.rotation ?? 0) + 90) % 360) as PlacedComponent['rotation'] } : c,
      ),
    }))
  }

  /** 보드도 부품과 같은 방식(90도씩)으로 돈다 — 지울 수는 없지만 옮기고 돌리는 건
   *  된다(사용자 요청). */
  const rotateBoard = () => {
    if (locked) return
    pushHistory()
    setState((s) => {
      const current = s.board ?? DEFAULT_BOARD
      return { ...s, board: { ...current, rotation: (((current.rotation ?? 0) + 90) % 360) as PlacedBoard['rotation'] } }
    })
  }

  const addBreadboard = (size: BreadboardSize) => {
    if (locked) return
    pushHistory()
    const id = `bb${Date.now().toString(36)}`
    setState((s) => ({ ...s, breadboards: [...s.breadboards, { id, size, x: 24, y: 90 + s.breadboards.length * 40 }] }))
  }

  /** 부품/보드와 같은 방식(90도씩) — layoutBreadboard() 자체는 안 건드리고
   *  breadboardPivot(가로/세로 절반) 기준으로 렌더링·pinPoint 양쪽에서 한 번 더
   *  돌린다(BreadboardGlyph, pinPoint 참고). */
  const rotateBreadboard = (id: string) => {
    if (locked) return
    pushHistory()
    setState((s) => ({
      ...s,
      breadboards: s.breadboards.map((b) =>
        b.id === id ? { ...b, rotation: (((b.rotation ?? 0) + 90) % 360) as PlacedBreadboard['rotation'] } : b,
      ),
    }))
  }

  const removeBreadboard = (id: string) => {
    if (locked) return
    pushHistory()
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

  /** 선택된 항목(부품 또는 브레드보드) 하나를 지운다 — 팔레트의 휴지통 버튼과
   *  Delete/Backspace 키가 둘 다 이 함수를 부른다. 보드는 하나뿐이라 지우면 GPIO
   *  핀 자체가 없어져 회로가 성립하지 않으므로 삭제 대상에서 뺐다 — 팔레트도
   *  보드가 선택됐을 땐 휴지통 버튼을 아예 안 보여준다(Palette 참고). */
  const deleteSelected = () => {
    if (locked || !selected || selected.kind === 'board') return
    if (selected.kind === 'component') removeComponent(selected.id)
    else if (selected.kind === 'breadboard') removeBreadboard(selected.id)
    else removeWire(selected.id)
    setSelected(null)
  }

  /** 선택한 LED 의 알 색을 바꾼다. 전선 색과 달리 "지금 고른 색"을 들고 다니지 않고
   *  선택한 LED 에 바로 적용한다 — LED 는 놓은 뒤에 색을 정하는 게 자연스럽다. */
  /** 팔레트에서 색을 고를 때. 전선이 선택돼 있으면 그 전선 색을 바로 바꾸고, 아니면
   *  "앞으로 그을 전선" 의 색으로 삼는다 — 오른쪽 클릭이 없는 아이패드에서도 색을
   *  바꿀 수 있어야 해서 선택 기반 경로를 넣었다. */
  const pickWireColor = (color: string) => {
    setWireColor(color)
    if (locked || selected?.kind !== 'wire') return
    pushHistory()
    setState((s) => ({
      ...s,
      wires: s.wires.map((w) => (w.id === selected.id ? { ...w, color } : w)),
    }))
  }

  const setLedColor = (key: string) => {
    if (locked || !selectedLed) return
    pushHistory()
    setState((s) => ({
      ...s,
      components: s.components.map((c) => (c.id === selectedLed.id ? { ...c, color: key } : c)),
    }))
  }

  /** 선택한 부품을 좌우로 뒤집는다. 브레드보드·보드는 대상이 아니다 — 대칭이라
   *  뒤집어도 달라지는 게 없고, 핀 라벨만 거울로 보이게 된다. */
  const flipSelected = () => {
    if (locked || selected?.kind !== 'component') return
    pushHistory()
    setState((s) => ({
      ...s,
      components: s.components.map((c) => (c.id === selected.id ? { ...c, flipped: !c.flipped } : c)),
    }))
  }

  const rotateSelected = () => {
    if (!selected) return
    if (selected.kind === 'component') rotateComponent(selected.id)
    else if (selected.kind === 'board') rotateBoard()
    else if (selected.kind === 'breadboard') rotateBreadboard(selected.id)
  }

  // R = 선택한 항목(부품/보드) 90도 회전, Delete/Backspace = 선택한 항목 삭제.
  // 코드 에디터(Monaco) 등 다른 입력창에 포커스가 있을 때 여기서 가로채면 타이핑이
  // 막히므로(예: 변수명에 r이 들어가거나 코드를 지우려고 Delete를 누를 때)
  // input/textarea/contentEditable이면 무시한다.
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (locked || isTypingTarget(event.target)) return

      // 되돌리기는 선택된 게 없어도 된다 — 방금 지운 걸 살리는 게 주 용도라서
      // "지우고 나면 선택이 없다"는 상황이 오히려 기본이다.
      if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        timeTravel(event.shiftKey ? 'redo' : 'undo')
        return
      }

      if (!selected) return
      // 한글 입력 상태에서 r 을 누르면 'ㄱ', m 은 'ㅡ' 가 들어온다. 학생 컴퓨터는
      // 한영 상태가 제각각이라 둘 다 받아준다(실제로 자주 밟는다).
      if (event.key === 'r' || event.key === 'R' || event.key === 'ㄱ') {
        rotateSelected()
      } else if (event.key === 'm' || event.key === 'M' || event.key === 'ㅡ') {
        flipSelected()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, locked, timeTravel])

  // 버튼/스위치는 locked 여부와 무관하게 항상 된다 — 실행 중인 회로를 눌러보는 게
  // 이번 요청의 핵심이라 여기만 잠금에서 뺐다.
  const setInputActive = (componentId: string, active: boolean) => {
    setActiveInputs((prev) => {
      const next = new Set(prev)
      if (active) next.add(componentId)
      else next.delete(componentId)
      return next
    })
    // 버튼·스위치는 a/b, 조이스틱은 sw 로 나간다.
    const gpio =
      gpioForPin(componentId, 'a') ?? gpioForPin(componentId, 'b') ?? gpioForPin(componentId, 'sw')
    if (gpio !== undefined) onButtonChange(gpio, active)
  }

  const pinPoint = (ref: PinRef): Point => {
    if (ref.kind === 'board') {
      const pin = BOARD_PINS.find((p) => p.id === ref.pinId)
      if (!pin) return { x: 0, y: 0 }
      // 보드도 부품처럼 옮기고 돌릴 수 있다(사용자 요청) — pin.x/y는 이제 보드 기준
      // 로컬 좌표(board.ts 참고)라, 컴포넌트 핀과 같은 방식으로 보드의 위치·회전을
      // 적용해야 실제 화면 위치가 나온다. 회전 중심은 보드 왼쪽 위(0,0)가 아니라
      // 보드 한가운데(BOARD_PIVOT) — 안 그러면 보드가 모서리를 축으로 빙 돈다.
      const rotated = rotateAround(pin, BOARD_PIVOT, boardPos.rotation ?? 0)
      return { x: boardPos.x + rotated.x, y: boardPos.y + rotated.y }
    }
    if (ref.kind === 'breadboard' || ref.kind === 'breadboardRail') {
      const layout = breadboardLayouts.get(ref.boardId)
      const bb = breadboards.find((b) => b.id === ref.boardId)
      if (!layout || !bb) return { x: 0, y: 0 }
      // layoutBreadboard()가 이미 절대좌표(회전 안 된 상태 기준)로 계산해 둔 점을,
      // 브레드보드 한가운데(breadboardPivot)를 축으로 한 번 더 돌린다 — 부품/보드와
      // 같은 이유(회전 안 하면 칸이 실제로 보이는 자리와 안 맞는다).
      const raw = ref.kind === 'breadboard' ? breadboardAnchor(layout, ref.col, ref.side) : breadboardRailAnchor(layout, ref.rail, ref.col)
      return rotateAround(raw, breadboardPivot(layout), bb.rotation ?? 0)
    }
    const comp = components.find((c) => c.id === ref.componentId)
    const spec = comp ? COMPONENT_PINS[comp.type].find((p) => p.pin === ref.pin) : undefined
    if (!comp || !spec) return { x: 0, y: 0 }
    // 부품이 회전했으면 다리(리드선) 끝점도 같이 돌아간다 — ComponentGlyph가 몸통에
    // 거는 rotate()와 같은 중심·각도라야 전선이 실제로 보이는 핀 자리에 붙는다.
    // 회전 중심은 부품 로컬 원점(0,0)이 아니라 몸통 한가운데(COMPONENT_PIVOT) —
    // 안 그러면 몸통이 원점을 축으로 궤도를 그리며 돈다.
    const pivot = scaledPivot(comp.type)
    // 배율 → 반전 → 회전 순서다. ComponentGlyph 의 transform 목록과 같은 순서여야
    // 전선이 화면에 보이는 핀 자리에 붙는다(SVG 는 목록 오른쪽이 먼저 적용된다).
    const scaled = { x: spec.dx * COMPONENT_SCALE, y: spec.dy * COMPONENT_SCALE }
    const local = comp.flipped ? mirrorX(scaled, pivot.x) : scaled
    const rotated = rotateAround(local, pivot, comp.rotation ?? 0)
    return { x: comp.x + rotated.x, y: comp.y + rotated.y }
  }

  /** 부저를 실제로 울린다. PWM 이 걸렸으면 그 주파수로(패시브 부저), 그냥 전원만
   *  들어왔으면 기본음으로(액티브 부저) — 둘 다 실물에서 그렇게 동작한다.
   *  음소거는 여기서 한 번에 막는다. */
  useEffect(() => {
    for (const c of components) {
      if (c.type !== 'buzzer') continue
      const gpios = ['positive', 'negative'].map((pin) => gpioForPin(c.id, pin))
      const level = Math.max(...gpios.map((g) => levelOfGpio(g, gpioLevels, pwmLevels)))
      const pwm = gpios.map((g) => (g === undefined ? undefined : pwmLevels.get(g))).find(Boolean)
      buzzerAudio.set(c.id, pwm?.freq ?? DEFAULT_BUZZER_HZ, muted ? 0 : level)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, connectivity, gpioLevels, pwmLevels, muted])

  // 부저를 지웠거나 회로를 갈아끼웠을 때 소리가 남아 계속 울리면 안 된다.
  useEffect(() => () => buzzerAudio.stopAll(), [])

  /** 포인터 위치를 아날로그 입력값(0~1)으로 바꾼다. 가변저항은 노브 각도로,
   *  조도센서는 슬라이더의 가로 위치로 정해진다. */
  const analogValueAt = (component: PlacedComponent, p: Point): number =>
    component.type === 'ldr' ||
    component.type === 'dht' ||
    component.type === 'ultrasonic' ||
    component.type === 'pir' ||
    ANALOG_SENSORS[component.type]
      ? sliderValueAt(component, p)
      : knobValueAt(component, p)

  /** 포인터(모델 좌표)를 부품의 "원래 크기 기준" 로컬 좌표로 바꾼다. 화면에 건 것과
   *  정확히 반대 순서로 되돌린다 — 회전을 풀고, 반전을 풀고, 배율을 나눈다. 이렇게
   *  해두면 아래 값 계산들이 도형을 적은 좌표(배율 이전)를 그대로 쓸 수 있다. */
  const toComponentLocal = (component: PlacedComponent, p: Point): Point => {
    const pivot = scaledPivot(component.type)
    let q = rotateAround({ x: p.x - component.x, y: p.y - component.y }, pivot, -(component.rotation ?? 0))
    if (component.flipped) q = mirrorX(q, pivot.x)
    return { x: q.x / COMPONENT_SCALE, y: q.y / COMPONENT_SCALE }
  }

  /** 조작부를 잡은 채 포인터가 간 자리를 값으로 반영한다. pointerdown 과 pointermove
   *  가 같은 함수를 써야 "누르자마자 그 자리로 튀는" 동작이 어긋나지 않는다. */
  const applyAnalogAt = (target: { id: string; channel: AnalogChannel }, p: Point) => {
    const c = components.find((comp) => comp.id === target.id)
    if (!c) return
    if (c.type === 'joystick') {
      // 스틱은 가로·세로를 한 번에 잡는다 — 슬라이더(가로만)·노브(각도만)와 다르다.
      const { x, y } = joystickValueAt(c, p)
      setAnalogValues((prev) => new Map(prev).set(analogKey(c.id), x).set(analogKey(c.id, 'range'), y))
      return
    }
    setAnalogValues((prev) => new Map(prev).set(analogKey(c.id, target.channel), analogValueAt(c, p)))
  }

  /** 조이스틱 스틱 — 가운데를 0.5 로 두고 가로·세로를 각각 0~1 로 잡는다.
   *  화면 좌표는 y 가 아래로 갈수록 크므로, 위로 밀면 값이 커지도록 뒤집는다
   *  (실물 조이스틱도 위로 밀면 VRy 가 한쪽 끝으로 간다). */
  const joystickValueAt = (component: PlacedComponent, p: Point): { x: number; y: number } => {
    const local = toComponentLocal(component, p)
    const pivot = COMPONENT_PIVOT[component.type]
    const clamp = (v: number) => Math.max(0, Math.min(1, v))
    return {
      x: clamp((local.x + JOYSTICK_RADIUS) / (JOYSTICK_RADIUS * 2)),
      y: clamp((pivot.y - local.y + JOYSTICK_RADIUS) / (JOYSTICK_RADIUS * 2)),
    }
  }

  /** 조도센서·온습도·초음파 슬라이더 — 로컬 좌표의 가로 위치만 본다. */
  const sliderValueAt = (component: PlacedComponent, p: Point): number => {
    const local = toComponentLocal(component, p)
    const ratio = (local.x + LDR_TRACK_HALF_WIDTH) / (LDR_TRACK_HALF_WIDTH * 2)
    return Math.max(0, Math.min(1, ratio))
  }

  /** 포인터가 가리키는 방향을 노브 값(0~1)으로 바꾼다. 노브 "위쪽"이 가운데(50%)가
   *  아니라, 왼쪽 끝(-135도)이 0%이고 오른쪽 끝(+135도)이 100%다 — 실물 손잡이와 같다.
   *  회전·반전은 toComponentLocal 이 이미 풀어준다. */
  const knobValueAt = (component: PlacedComponent, p: Point): number => {
    const pivot = COMPONENT_PIVOT[component.type]
    const local = toComponentLocal(component, p)
    const deg = (Math.atan2(local.y - pivot.y, local.x - pivot.x) * 180) / Math.PI
    // atan2 의 0도는 오른쪽이라 +90 을 해서 "위"를 0도로 옮긴 뒤 -180~180 으로 정규화한다.
    const rel = (((deg + 90 + 180) % 360) + 360) % 360 - 180
    const half = KNOB_SWEEP_DEG / 2
    return (Math.max(-half, Math.min(half, rel)) + half) / KNOB_SWEEP_DEG
  }

  /** 배선할 수 있는 모든 구멍의 자리. 스냅(가까운 구멍에 맞추기)에 쓴다. */
  const snapTargets = useMemo(() => {
    const targets: { ref: PinRef; point: Point }[] = []
    for (const pin of BOARD_PINS) {
      const ref: PinRef = { kind: 'board', pinId: pin.id }
      targets.push({ ref, point: pinPoint(ref) })
    }
    for (const b of breadboards) {
      const layout = breadboardLayouts.get(b.id)
      if (!layout) continue
      for (let col = 0; col < layout.columns; col++) {
        for (const side of ['top', 'bottom'] as const) {
          const ref: PinRef = { kind: 'breadboard', boardId: b.id, col, side }
          targets.push({ ref, point: pinPoint(ref) })
        }
        for (const rail of ['plus', 'minus'] as const) {
          const ref: PinRef = { kind: 'breadboardRail', boardId: b.id, rail, col }
          targets.push({ ref, point: pinPoint(ref) })
        }
      }
    }
    for (const c of components) {
      for (const spec of COMPONENT_PINS[c.type]) {
        const ref: PinRef = { kind: 'component', componentId: c.id, pin: spec.pin }
        targets.push({ ref, point: pinPoint(ref) })
      }
    }
    return targets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, breadboards, breadboardLayouts, boardPos])

  /** 주어진 자리에서 가장 가까운 구멍. 반경 밖이면 없음. 지금 끌고 있는 전선의
   *  반대쪽 끝은 후보에서 뺀다(같은 핀끼리는 못 잇는다). */
  const nearestPin = useCallback(
    (p: Point, exclude?: PinRef): { ref: PinRef; point: Point } | null => {
      const excludeKey = exclude ? pinRefKey(exclude) : null
      let best: { ref: PinRef; point: Point } | null = null
      let bestDistance = PIN_SNAP_RADIUS
      for (const target of snapTargets) {
        if (excludeKey && pinRefKey(target.ref) === excludeKey) continue
        const distance = Math.hypot(target.point.x - p.x, target.point.y - p.y)
        if (distance <= bestDistance) {
          bestDistance = distance
          best = target
        }
      }
      return best
    },
    [snapTargets],
  )

  /** Tinkercad 처럼 전선이 부드러운 곡선(케이블)으로 처지게 그린다 — 직각 꺾임 대신. */
  const wirePath = (a: Point, b: Point) => {
    const dx = Math.max(30, Math.abs(b.x - a.x) * 0.55)
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
  }

  // 팔레트의 "선택 삭제" 버튼에 뭘 지우려는지 보여준다 — 부품은 COMPONENT_LIST의
  // 한글 이름을, 브레드보드는 고정 문구를 쓴다.
  /** 전선을 선택했으면 그 전선의 색을 팔레트에 켜 보여준다(지금 고른 색 대신). */
  const selectedWireColor =
    selected?.kind === 'wire'
      ? (wires.find((w) => w.id === selected.id)?.color ?? DEFAULT_WIRE_COLOR)
      : null

  // LED 를 선택했을 때만 팔레트에 색 고르는 자리가 나온다.
  const selectedLed =
    selected?.kind === 'component'
      ? components.find((c) => c.id === selected.id && c.type === 'led')
      : undefined

  const selectedLabel =
    selected?.kind === 'component'
      ? (COMPONENT_LIST.find((c) => c.type === components.find((comp) => comp.id === selected.id)?.type)?.label ?? '부품')
      : selected?.kind === 'breadboard'
        ? '브레드보드'
        : selected?.kind === 'wire'
          ? '전선'
          : null

  return (
    <div className="flex flex-col gap-2">
      {/* 높이는 여기(행)에 고정하고 팔레트·캔버스가 둘 다 h-full 로 따라간다.
          팔레트에만 스크롤을 걸어두면 안 된다 — 팔레트의 "내용 높이"가 그대로 행
          높이를 밀어올려서, 부품이 늘어나자 사이드바가 캔버스보다 142px 더 길어졌다
          (실제로 재서 찾았다: 사이드바 664px vs 캔버스 522px). */}
      <div className="flex h-[clamp(520px,58vh,660px)] items-stretch gap-2">
        <Palette
          addComponent={addComponent}
          addBreadboard={addBreadboard}
          locked={locked}
          wireColor={selectedWireColor ?? wireColor}
          setWireColor={pickWireColor}
          wireColorTarget={selected?.kind === 'wire' ? '선택 전선' : '새 전선'}
          onClearAll={clearAll}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          ledColor={selectedLed ? ledColorOf(selectedLed.color).key : null}
          onLedColor={setLedColor}
          selectedLabel={selectedLabel}
          canRotate={selected !== null && selected.kind !== 'wire'}
          canFlip={selected?.kind === 'component'}
          onRotateSelected={rotateSelected}
          onFlipSelected={flipSelected}
          onDeleteSelected={deleteSelected}
        />

        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
          className="h-full min-w-0 flex-1 touch-none rounded-xl border border-cream-deep bg-[#eef2ea] select-none"
          onPointerDownCapture={onPointerDownCapture}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => {
            releasePointer(event)
            onPointerUp()
          }}
          onLostPointerCapture={(event) => {
            // 브라우저가 캡처를 거둬가면 그 포인터는 더 못 따라간다 — 목록에서도 뺀다.
            releasePointer(event)
          }}
          onPointerCancel={(event) => {
            // 아이패드는 다른 제스처가 끼어들면 포인터를 취소해 버린다. 이걸 안 받으면
            // 끌던 부품이 손을 뗀 뒤에도 계속 붙어 다닌다(펜슬에서 특히 자주 났다).
            releasePointer(event)
            onPointerUp()
          }}
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
          <rect x={0} y={0} width={viewWidth} height={VIEW_HEIGHT} fill="url(#chico-grid)" onPointerDown={onBackgroundPointerDown} />

          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {breadboards.map((b) => {
              const layout = breadboardLayouts.get(b.id)
              if (!layout) return null
              return (
                <BreadboardGlyph
                  key={b.id}
                  layout={layout}
                  rotation={b.rotation ?? 0}
                  locked={locked}
                  selected={selected?.kind === 'breadboard' && selected.id === b.id}
                  onBodyPointerDown={(event) => {
                    if (locked) return
                    setSelected({ kind: 'breadboard', id: b.id })
                    const p = toModelPoint(event.clientX, event.clientY)
                    dragHistoryRef.current = snapshotNow()
                    setDragging({ id: b.id, kind: 'breadboard', dx: p.x - b.x, dy: p.y - b.y })
                  }}
                  onDotPointerDown={(ref) => startWire(ref, pinPoint(ref))}
                  onDotPointerUp={(ref) => finishWire(ref)}
                />
              )
            })}

            <PicoBoard
              board={boardPos}
              locked={locked}
              selected={selected?.kind === 'board'}
              ledOn={gpioLevels.get(ONBOARD_LED_PIN) === 1}
              onBodyPointerDown={(event) => {
                if (locked) return
                setSelected({ kind: 'board', id: BOARD_ID })
                const p = toModelPoint(event.clientX, event.clientY)
                dragHistoryRef.current = snapshotNow()
                setDragging({ id: BOARD_ID, kind: 'board', dx: p.x - boardPos.x, dy: p.y - boardPos.y })
              }}
              onPinPointerDown={(pin) => {
                startWire({ kind: 'board', pinId: pin.id }, pinPoint({ kind: 'board', pinId: pin.id }))
              }}
              onPinPointerUp={(pin) => finishWire({ kind: 'board', pinId: pin.id })}
            />

            {wires.map((w) => {
              if (rewiring?.wireId === w.id) return null
              const a = pinPoint(w.from)
              const b = pinPoint(w.to)
              return (
                <path
                  key={w.id}
                  d={wirePath(a, b)}
                  stroke={w.color ?? DEFAULT_WIRE_COLOR}
                  strokeWidth={selected?.kind === 'wire' && selected.id === w.id ? 5.5 : 3.5}
                  fill="none"
                  strokeLinecap="round"
                  className={locked ? '' : 'cursor-pointer hover:opacity-70'}
                  onClick={() => !locked && setSelected({ kind: 'wire', id: w.id })}
                  onContextMenu={(e) => recolorWire(w.id, e)}
                />
              )
            })}
            {/* 실제 선(3.5px)은 클릭하기 얇아서, 안 보이는 굵은 선을 하나 더 깔아 클릭 영역을 넓힌다. */}
            {!locked &&
              wires.map((w) => (
                rewiring?.wireId === w.id ? null : (
                <path
                  key={`${w.id}-hit`}
                  d={wirePath(pinPoint(w.from), pinPoint(w.to))}
                  stroke="transparent"
                  strokeWidth={14}
                  fill="none"
                  className="cursor-pointer"
                  onClick={() => setSelected({ kind: 'wire', id: w.id })}
                  onContextMenu={(e) => recolorWire(w.id, e)}
                />
                )
              ))}

            {/* 지금 놓으면 꽂힐 구멍. 손가락으로는 8px 짜리 핀을 정확히 짚기 어려워서,
                어디에 붙을지 미리 보여준다. */}
            {draft?.snap && (
              <circle
                cx={draft.to.x}
                cy={draft.to.y}
                r={9}
                fill="none"
                stroke="#2563eb"
                strokeWidth={2.5}
                opacity={0.9}
              />
            )}
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
                pwmLevels={pwmLevels}
                neopixelColors={neopixelColors}
                lcdLines={lcdLines}
                oledRows={oledRows}
                stepperAngle={stepperAngles.get(c.id) ?? 0}
                gpioForPin={(pin) => gpioForPin(c.id, pin)}
                active={activeInputs.has(c.id)}
                analogValue={
                  analogValues.get(analogKey(c.id)) ??
                  (c.type === 'ultrasonic'
                    ? ULTRASONIC_DEFAULT_RATIO
                    : c.type === 'pir'
                      ? PIR_DEFAULT_DISTANCE_RATIO
                      : c.type === 'joystick'
                        ? 0.5
                        : 0)
                }
                tempValue={analogValues.get(analogKey(c.id, 'temp')) ?? DHT_DEFAULT_TEMP_RATIO}
                humidityValue={analogValues.get(analogKey(c.id, 'hum')) ?? DHT_DEFAULT_HUMIDITY_RATIO}
                rangeValue={
                  analogValues.get(analogKey(c.id, 'range')) ??
                  (c.type === 'joystick' ? 0.5 : PIR_DEFAULT_RANGE_RATIO)
                }
                locked={locked}
                selected={selected?.kind === 'component' && selected.id === c.id}
                onBodyPointerDown={(event) => {
                  if (locked) return
                  setSelected({ kind: 'component', id: c.id })
                  const p = toModelPoint(event.clientX, event.clientY)
                  dragHistoryRef.current = snapshotNow()
                  setDragging({ id: c.id, kind: 'component', dx: p.x - c.x, dy: p.y - c.y })
                }}
                onPinPointerDown={(pin, event) => {
                  event.stopPropagation()
                  startWire({ kind: 'component', componentId: c.id, pin }, pinPoint({ kind: 'component', componentId: c.id, pin }))
                }}
                onPinPointerUp={(pin, event) => {
                  event.stopPropagation()
                  finishWire({ kind: 'component', componentId: c.id, pin })
                }}
                onInputActiveChange={(active) => setInputActive(c.id, active)}
                onKnobPointerDown={(event, channel = 'value') => {
                  event.stopPropagation()
                  setSelected({ kind: 'component', id: c.id })
                  setAnalogDrag({ id: c.id, channel })
                  applyAnalogAt({ id: c.id, channel }, toModelPoint(event.clientX, event.clientY))
                }}
              />
            ))}
            {/* 선택한 전선의 양 끝 손잡이. 부품 뒤에 그려서(=화면상 위) 핀보다 먼저
                잡히게 한다 — 평소엔 아예 안 그리므로 핀을 가리지 않는다(방식 B).
                끌면 그 끝이 떨어져 다른 핀으로 옮겨간다. */}
            {!locked &&
              selected?.kind === 'wire' &&
              (() => {
                const wire = wires.find((w) => w.id === selected.id)
                if (!wire) return null
                return (['from', 'to'] as const).map((end) => {
                  const p = pinPoint(wire[end])
                  const grabbed = rewiring?.wireId === wire.id && rewiring.end === end
                  return (
                    <circle
                      key={end}
                      cx={p.x}
                      cy={p.y}
                      r={7}
                      fill={grabbed ? '#2563eb' : '#ffffff'}
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      className="cursor-grab"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        startRewire(wire, end)
                      }}
                      onPointerUp={(event) => event.stopPropagation()}
                    />
                  )
                })
              })()}
          </g>

          {/* 되돌리기 / 다시 실행. 줌 컨트롤과 같은 이유로 transform 그룹 밖에 둬서
              확대/축소와 무관하게 항상 같은 자리에 있다. 팔레트가 아니라 캔버스 위에
              둔 건 자리가 없어서이기도 하지만, 되돌릴 대상이 캔버스라 여기가 맞다. */}
          <g data-canvas-control transform={`translate(16 ${VIEW_HEIGHT - 40})`}>
            <rect x={0} y={0} width={72} height={34} rx={17} fill="#ffffff" fillOpacity={0.9} stroke="#d9d2bd" />
            {[
              { dx: 20, label: '↶', onClick: () => timeTravel('undo'), aria: '되돌리기', enabled: canUndo },
              { dx: 52, label: '↷', onClick: () => timeTravel('redo'), aria: '다시 실행', enabled: canRedo },
            ].map((btn) => (
              // 글자만 두면 터치 영역이 10px 밖에 안 된다 — 손가락으로 못 누른다.
              // 안 보이는 사각형을 깔아 32px 짜리 과녁을 만든다.
              <g
                key={btn.aria}
                aria-label={btn.aria}
                className={btn.enabled && !locked ? 'cursor-pointer select-none' : 'select-none'}
                opacity={btn.enabled && !locked ? 1 : 0.25}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => btn.enabled && !locked && btn.onClick()}
              >
                <rect x={btn.dx - 16} y={1} width={32} height={32} rx={16} fill="transparent" />
                <text x={btn.dx} y={23} fontSize={17} fontWeight="bold" textAnchor="middle" fill="#57534e">
                  {btn.label}
                </text>
              </g>
            ))}
          </g>

          {/* 줌 컨트롤 — transform 그룹 밖에 그려서 확대/축소와 무관하게 항상 같은
              화면 위치·크기를 유지한다. 휠이 없는 아이패드 등 터치 기기에선 이 버튼이
              줌의 유일한 수단이라 꼭 있어야 한다. */}
          <g data-canvas-control transform={`translate(${viewWidth - 112} ${VIEW_HEIGHT - 40})`}>
            <rect x={0} y={0} width={104} height={34} rx={17} fill="#ffffff" fillOpacity={0.9} stroke="#d9d2bd" />
            {[
              { dx: 14, label: '−', onClick: zoomOut, aria: '축소' },
              { dx: 52, label: '⤢', onClick: resetView, aria: '전체 보기(100%)' },
              { dx: 90, label: '+', onClick: zoomIn, aria: '확대' },
            ].map((btn) => (
              <g
                key={btn.aria}
                aria-label={btn.aria}
                className="cursor-pointer select-none"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={btn.onClick}
              >
                <rect x={btn.dx - 16} y={1} width={32} height={32} rx={16} fill="transparent" />
                <text
                  x={btn.dx}
                  y={23}
                  fontSize={btn.label === '⤢' ? 13 : 17}
                  fontWeight="bold"
                  textAnchor="middle"
                  fill="#57534e"
                >
                  {btn.label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* 조작법 안내 — 예전엔 팔레트 안에 있었는데, 팔레트가 세로 사이드바가 되면서
          긴 문장이 들어갈 자리가 없어졌다. 캔버스 아래 한 줄로 뺀다. */}
      <p className="px-1 text-xs leading-relaxed text-ink-500">
        {locked
          ? '실행 중에는 배선을 편집할 수 없어요. 버튼/스위치는 눌러볼 수 있어요.'
          : '부품/브레드보드/Pico 보드는 클릭해서 선택한 뒤 끌어서 옮기고, R(또는 ㄱ)로 돌리고 M(또는 ㅡ)으로 좌우 반전합니다(보드는 삭제 불가). 핀(원)을 끌면 전선이 이어지고, 전선을 클릭하면 양 끝에 손잡이가 나와 다른 핀으로 옮길 수 있습니다(오른쪽 클릭은 색 바꾸기). 회전·반전·삭제는 팔레트 버튼으로도 됩니다. 되돌리기는 ⌘/Ctrl+Z 또는 캔버스 왼쪽 아래 버튼. 손가락 두 개로 벌리면 확대/축소됩니다.'}
      </p>

      {confirmingClearAll && (
        <Modal title="회로 전체 삭제" onClose={() => setConfirmingClearAll(false)}>
          <p className="text-sm text-ink-700">
            부품·브레드보드·전선이 모두 사라지고 되돌릴 수 없습니다. 정말 지울까요?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setConfirmingClearAll(false)}
              className="rounded-lg border border-cream-deep px-4 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300"
            >
              취소
            </button>
            <button
              onClick={confirmClearAll}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              지우기
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default forwardRef(CircuitCanvas)

/** 아이콘형 세로 사이드바 팔레트 — 캔버스 왼쪽에 붙는다.
 *
 *  예전엔 캔버스 위에 가로 막대(탭 3개 + "LED 추가" 같은 글자 버튼 + 세 줄짜리
 *  안내문)로 있었다. 캔버스 높이(520px)는 고정이라 그 막대만큼 회로 섹션 전체가
 *  길어졌고, 무엇보다 탭 때문에 "지금 안 보이는 부품"이 생겨서 뭐가 있는지 한눈에
 *  안 들어왔다. 팅커캐드처럼 아이콘 타일을 세로로 세우면 부품 7종이 전부 항상
 *  보이고, 대신 캔버스는 가로를 104px 내준다 — 이 화면에서 남는 건 가로 쪽이라
 *  맞바꿀 만하다.
 *
 *  타일 폭이 좁아 이름은 짧은 것(ComponentMeta.short)을 쓰고, 원래 이름
 *  ("버튼(누르는 동안)")은 title 툴팁에 남긴다 — 접근성 이름(버튼의 accessible
 *  name)도 이 title을 쓰므로 스크린리더에도 전체 이름이 그대로 읽힌다. */
function Palette({
  addComponent,
  addBreadboard,
  locked,
  wireColor,
  setWireColor,
  wireColorTarget,
  onClearAll,
  muted,
  onToggleMute,
  ledColor,
  onLedColor,
  selectedLabel,
  canRotate,
  canFlip,
  onRotateSelected,
  onFlipSelected,
  onDeleteSelected,
}: {
  addComponent: (type: ComponentType) => void
  addBreadboard: (size: BreadboardSize) => void
  locked: boolean
  wireColor: string
  setWireColor: (color: string) => void
  /** 지금 이 색이 어디에 쓰이는지 — 전선을 선택했으면 "선택 전선", 아니면 "새 전선". */
  wireColorTarget: string
  onClearAll: () => void
  /** 부저 음소거 상태. 소리는 수업 중에 꺼야 할 때가 있다. */
  muted: boolean
  onToggleMute: () => void
  /** 지금 선택된 LED 의 색 key. LED 를 선택하지 않았으면 null — 이때는 색 고르는
   *  자리를 아예 안 보여준다(전선 색과 달리 대상이 있어야 의미가 있다). */
  ledColor: string | null
  onLedColor: (key: string) => void
  /** 지금 선택된 부품/브레드보드의 한글 이름. 선택된 게 없으면 null — 이때는
   *  "선택 삭제" 버튼 자체를 안 보여준다(뭘 지울지 없으니). */
  selectedLabel: string | null
  /** 회전은 부품·브레드보드·보드에, 반전은 부품에만 있다. 아이패드처럼 키보드가 없는
   *  기기에서는 이 버튼이 유일한 수단이다(R/ㄱ, M/ㅡ 는 키보드 전용이었다). */
  canRotate: boolean
  canFlip: boolean
  onRotateSelected: () => void
  onFlipSelected: () => void
  onDeleteSelected: () => void
}) {
  const groups: { key: string; label: string; tiles: PaletteTile[] }[] = [
    {
      key: 'output',
      label: '출력',
      tiles: COMPONENT_LIST.filter((c) => c.category === 'output').map((c) => ({
        key: c.type,
        emoji: c.emoji,
        short: c.short,
        title: `${c.label} 추가`,
        onAdd: () => addComponent(c.type),
      })),
    },
    {
      key: 'input',
      label: '입력',
      tiles: COMPONENT_LIST.filter((c) => c.category === 'input').map((c) => ({
        key: c.type,
        emoji: c.emoji,
        short: c.short,
        title: `${c.label} 추가`,
        onAdd: () => addComponent(c.type),
      })),
    },
    {
      key: 'breadboard',
      label: '브레드보드',
      tiles: BREADBOARD_SIZES.map((b) => ({
        key: b.size,
        emoji: '🍞',
        short: b.short,
        title: `브레드보드 ${b.label} 추가`,
        onAdd: () => addBreadboard(b.size),
      })),
    },
  ]

  return (
    <aside className="flex h-full min-h-0 w-[104px] shrink-0 flex-col gap-2 rounded-xl border border-cream-deep bg-cream p-1.5">
      {/* 부품 목록만 스크롤한다. 부품이 늘어나도(계획 문서 3·4단계) 전선 색·음소거·
          삭제는 항상 같은 자리에 남아야 한다 — 예전엔 사이드바 전체가 스크롤이라
          부품을 몇 개만 더 넣어도 이 버튼들이 화면 밖으로 밀려났다.
          -mr-1 pr-1 은 스크롤바가 타일을 덮지 않게 하는 여백이다. */}
      <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          <PaletteHeading>{g.label}</PaletteHeading>
          <div className="grid grid-cols-2 gap-1">
            {g.tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={locked}
                title={t.title}
                onClick={t.onAdd}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-cream-deep bg-white py-1.5 transition-colors hover:border-cheese-300 hover:bg-cheese-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-cream-deep disabled:hover:bg-white"
              >
                <span className="text-lg leading-none">{t.emoji}</span>
                <span className="text-[10px] font-bold leading-none text-ink-700">{t.short}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      </div>

      {/* 전선 색 — 지금부터 새로 잇는 전선에 쓰인다. 이미 그은 전선은 오른쪽
          클릭으로 이 색을 입힌다(recolorWire). */}
      <div className="flex flex-col gap-1">
        <PaletteHeading>전선 색</PaletteHeading>
        <p className="px-0.5 text-[9px] leading-tight text-ink-500">{wireColorTarget}</p>
        <div className="flex flex-wrap justify-center gap-1 rounded-lg border border-cream-deep bg-white px-1 py-1.5">
          {WIRE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={locked}
              aria-label={c.name}
              title={c.name}
              onClick={() => setWireColor(c.value)}
              className={[
                'h-5 w-5 rounded-full border-2 transition-transform disabled:cursor-not-allowed disabled:opacity-40',
                wireColor === c.value ? 'scale-110 border-ink-900' : 'border-white/60 hover:scale-105',
              ].join(' ')}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      </div>

      {/* LED 를 선택했을 때만 나온다. 누르면 그 LED 알 색이 바로 바뀐다. */}
      {ledColor && (
        <div className="flex flex-col gap-1">
          <PaletteHeading>LED 색</PaletteHeading>
          <div className="flex flex-wrap justify-center gap-1 rounded-lg border border-cream-deep bg-white px-1 py-1.5">
            {LED_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={locked}
                aria-label={c.name}
                title={c.name}
                onClick={() => onLedColor(c.key)}
                className={[
                  'h-5 w-5 rounded-full border-2 transition-transform disabled:cursor-not-allowed disabled:opacity-40',
                  ledColor === c.key ? 'scale-110 border-ink-900' : 'border-white/60 hover:scale-105',
                ].join(' ')}
                style={{ backgroundColor: c.on }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 부저 소리 켜기/끄기. 실행 중에도 눌러야 하니 locked 와 무관하게 항상 활성. */}
      <button
        type="button"
        title={muted ? '부저 소리 켜기' : '부저 소리 끄기'}
        onClick={onToggleMute}
        className={[
          'flex items-center justify-center gap-1 rounded-lg border py-1.5 transition-colors',
          muted
            ? 'border-cream-deep bg-white text-ink-500 hover:border-cheese-300'
            : 'border-cheese-300 bg-cheese-50 text-ink-900',
        ].join(' ')}
      >
        <span className="text-sm leading-none">{muted ? '🔇' : '🔊'}</span>
        <span className="text-[10px] font-bold leading-none">{muted ? '소리 꺼짐' : '소리 켜짐'}</span>
      </button>

      {/* 삭제는 맨 아래에 둔다 — 추가 버튼 사이에 끼어 있으면 잘못 누르기 쉽다. */}
      <div className="flex flex-col gap-1">
        {(canRotate || canFlip) && (
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              disabled={locked || !canRotate}
              title="회전 (R 또는 ㄱ)"
              onClick={onRotateSelected}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-cream-deep bg-white py-1.5 transition-colors hover:border-cheese-300 hover:bg-cheese-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-sm leading-none">↻</span>
              <span className="text-[10px] leading-none font-bold text-ink-700">회전</span>
            </button>
            <button
              type="button"
              disabled={locked || !canFlip}
              title="좌우 반전 (M 또는 ㅡ)"
              onClick={onFlipSelected}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-cream-deep bg-white py-1.5 transition-colors hover:border-cheese-300 hover:bg-cheese-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-sm leading-none">⇄</span>
              <span className="text-[10px] leading-none font-bold text-ink-700">반전</span>
            </button>
          </div>
        )}
        {/* 부품/브레드보드를 클릭해 선택하면 나타난다 — 휴지통 버튼 하나로 지운다
            (부품마다 작은 삭제 글자를 따로 두던 것 대신, 사용자 요청으로 바꿈). */}
        {selectedLabel && (
          <button
            type="button"
            disabled={locked}
            title={`${selectedLabel} 삭제`}
            onClick={onDeleteSelected}
            className="flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 py-1.5 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-sm leading-none">🗑️</span>
            <span className="text-[10px] font-bold leading-none text-red-700">선택 삭제</span>
          </button>
        )}
        <button
          type="button"
          disabled={locked}
          title="회로 전체 삭제"
          onClick={onClearAll}
          className="flex items-center justify-center gap-1 rounded-lg border border-cream-deep bg-white py-1.5 text-ink-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-sm leading-none">🧹</span>
          <span className="text-[10px] font-bold leading-none">전체 삭제</span>
        </button>
      </div>
    </aside>
  )
}

interface PaletteTile {
  key: string
  emoji: string
  short: string
  /** 마우스를 올렸을 때 뜨는 전체 이름 — 타일엔 짧은 이름만 들어간다. */
  title: string
  onAdd: () => void
}

function PaletteHeading({ children }: { children: React.ReactNode }) {
  return <p className="px-0.5 text-[10px] font-bold tracking-wide text-ink-500">{children}</p>
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
  rotation,
  locked,
  selected,
  onBodyPointerDown,
  onDotPointerDown,
  onDotPointerUp,
}: {
  layout: BreadboardLayout
  rotation: number
  locked: boolean
  selected: boolean
  onBodyPointerDown: (e: React.PointerEvent<SVGRectElement>) => void
  onDotPointerDown: (ref: PinRef) => void
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
            onDotPointerDown(ref)
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
            onDotPointerDown(ref)
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
    // 구멍마다 다른 ref 다 — 선을 각각 다른 구멍에 꽂을 수 있어야 한다(전기적으로는
    // 같은 레일이면 한 노드, connectivity 에서 묶는다).
    const plusRef: PinRef = { kind: 'breadboardRail', boardId: l.id, rail: 'plus', col }
    const minusRef: PinRef = { kind: 'breadboardRail', boardId: l.id, rail: 'minus', col }
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
          onDotPointerDown(plusRef)
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
          onDotPointerDown(minusRef)
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

  const pivot = breadboardPivot(l)

  return (
    <g style={{ filter: 'url(#chico-shadow)' }}>
      {/* rotation은 몸통·칸·라벨을 전부 감싼 이 안쪽 그룹에만 건다. 회전 중심은
          브레드보드 한가운데(breadboardPivot) — pinPoint()의 breadboard/
          breadboardRail 분기가 rotateAround로 계산하는 것과 같은 중심·방향이라야
          전선이 실제 보이는 칸 위치에 붙는다(부품/보드와 같은 이유). 선택 표시도
          이 안에 둬서 몸통과 같이 돈다 — 칸이 많아 세로로 긴 모양이라, 돌아간
          채로 있는 게 자연스럽다(부품의 원형 선택 표시와 달리 회전에 영향받는
          모양이라 밖에 두면 몸통과 안 맞는다). */}
      <g transform={`rotate(${rotation} ${pivot.x} ${pivot.y})`}>
      {selected && (
        <rect
          x={l.x - 5}
          y={l.y - 5}
          width={l.width + 10}
          height={l.height + 10}
          rx={9}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="5 3"
        />
      )}
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
      {dots}
      </g>
    </g>
  )
}

function PicoBoard({
  board,
  locked,
  selected,
  ledOn,
  onBodyPointerDown,
  onPinPointerDown,
  onPinPointerUp,
}: {
  board: PlacedBoard
  locked: boolean
  selected: boolean
  /** 실행 중인 코드가 machine.Pin("LED") 를 켰는지. 보드 내장 LED 를 그리는 데 쓴다. */
  ledOn: boolean
  onBodyPointerDown: (e: React.PointerEvent<SVGRectElement>) => void
  onPinPointerDown: (pin: BoardPin) => void
  onPinPointerUp: (pin: BoardPin) => void
}) {
  const cx = BOARD_WIDTH / 2
  return (
    <g transform={`translate(${board.x} ${board.y})`}>
      {selected && (
        <rect
          x={-6}
          y={-6}
          width={BOARD_WIDTH + 12}
          height={BOARD_HEIGHT + 12}
          rx={13}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="5 3"
        />
      )}
      {/* rotation은 몸통·핀만 감싼 안쪽 그룹에만 건다. 회전 중심은 보드 한가운데
          (BOARD_PIVOT) — 선택 표시 사각형은 이미 그 중심에 맞춰져 있어서(위 rect가
          -6~206, -6~566로 대칭) 손 안 대도 되지만, rotate() 자체엔 중심을 명시
          안 하면 기본값인 왼쪽 위(0,0)를 축으로 돌아 보드가 궤도를 그리며 돈다.
          pinPoint()가 rotateAround(pin, BOARD_PIVOT, …)로 계산하는 것과 같은
          중심·방향이라야 전선이 실제 보이는 핀 위치에 붙는다. */}
      <g
        transform={`rotate(${board.rotation ?? 0} ${BOARD_WIDTH / 2} ${BOARD_HEIGHT / 2})`}
        style={{ filter: 'url(#chico-shadow)' }}
      >
        <rect x={0} y={0} width={BOARD_WIDTH} height={BOARD_HEIGHT} rx={10} fill="url(#chico-board-body)" stroke="#0f3d29" />
        {/* USB 커넥터 */}
        <rect x={cx - 18} y={-6} width={36} height={16} rx={2} fill="#c7cdd6" stroke="#8891a1" />
        {/* BOOTSEL 버튼 */}
        <rect x={cx - 12} y={60} width={24} height={24} rx={3} fill="#f8fafc" stroke="#cbd5e1" />
        <text x={cx} y={90} fontSize={6} fill="#bfe3d2" textAnchor="middle">
          BOOTSEL
        </text>
        {/* 내장(온보드) LED — 실제 보드에도 BOOTSEL 옆에 작은 초록 LED가 있다.
            보드 안쪽(회전 그룹)에 그리므로 보드를 옮기거나 돌리면 같이 움직이고,
            보드는 삭제 대상이 아니라서 "따로 삭제"할 방법도 없다 — 둘 다 사용자
            요청대로다. machine.Pin("LED") 로 실제로 켜고 끌 수 있다(board.ts 의
            ONBOARD_LED_PIN 참고). 부품 LED와 같은 방식으로, 꺼진 알을 항상 깔고
            켜졌을 때만 밝은 알을 덮는다 — 다만 PWM 이 안 걸리는 자리라 두 단계뿐이다.
            글자는 실물 실크스크린 그대로 'LED' 라고 적어둔다 — 코드에서 쓰는 이름이
            바로 이것이라, 학생이 화면만 보고도 Pin("LED") 를 떠올릴 수 있게. */}
        <circle cx={cx + 24} cy={72} r={4} fill="#166534" stroke="#0b2f1f" strokeWidth={1} />
        {ledOn && (
          <circle
            cx={cx + 24}
            cy={72}
            r={4}
            fill="#4ade80"
            stroke="#bbf7d0"
            strokeWidth={1}
            style={{ filter: 'drop-shadow(0 0 6px #4ade80)' }}
          />
        )}
        <text x={cx + 24} y={62} fontSize={6} fill="#bfe3d2" textAnchor="middle">
          LED
        </text>
        {/* 칩 */}
        <rect x={cx - 22} y={130} width={44} height={44} rx={2} fill="#111827" stroke="#000" />
        <text
          x={cx}
          y={BOARD_HEIGHT / 2 + 60}
          fontSize={13}
          fill="#bfe3d2"
          textAnchor="middle"
          transform={`rotate(90 ${cx} ${BOARD_HEIGHT / 2 + 60})`}
        >
          Pico 2 W
        </text>
        {/* 몸통 어디를 눌러도 드래그가 시작되도록, 장식(USB/BOOTSEL/칩) 위에 안
            보이는 히트 영역을 하나 더 깐다 — BreadboardGlyph와 같은 패턴이다.
            장식 도형 하나하나에 pointerdown을 달면 그 부분만 못 잡게 된다. */}
        <rect
          x={0}
          y={0}
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          rx={10}
          fill="transparent"
          className={locked ? '' : 'cursor-grab'}
          onPointerDown={locked ? undefined : onBodyPointerDown}
        />
        {BOARD_PINS.map((pin) => (
          <BoardPinDot
            key={pin.id}
            pin={pin}
            onPointerDown={(e) => {
              e.stopPropagation()
              onPinPointerDown(pin)
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              onPinPointerUp(pin)
            }}
          />
        ))}
      </g>
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
  pwmLevels,
  neopixelColors,
  lcdLines,
  oledRows,
  stepperAngle,
  gpioForPin,
  active,
  analogValue,
  tempValue,
  humidityValue,
  rangeValue,
  locked,
  selected,
  onBodyPointerDown,
  onPinPointerDown,
  onPinPointerUp,
  onInputActiveChange,
  onKnobPointerDown,
}: {
  component: PlacedComponent
  gpioLevels: Map<number, 0 | 1>
  pwmLevels: Map<number, { freq: number; duty: number }>
  neopixelColors: Map<number, string[]>
  lcdLines: Map<number, string[]>
  oledRows: Map<number, string[]>
  /** 스텝모터가 지금까지 돈 각도(도). 다른 부품에선 안 쓴다. */
  stepperAngle: number
  gpioForPin: (pin: string) => number | undefined
  active: boolean
  /** 가변저항 노브·조도센서 슬라이더 위치(0~1). 다른 부품에선 안 쓴다. */
  analogValue: number
  /** 온습도 센서의 두 슬라이더 위치(0~1). */
  tempValue: number
  humidityValue: number
  /** PIR 감지 범위 슬라이더 위치(0~1). 사람까지 거리는 analogValue 를 쓴다. */
  rangeValue: number
  locked: boolean
  selected: boolean
  onBodyPointerDown: (e: React.PointerEvent<SVGGElement>) => void
  onPinPointerDown: (pin: string, e: React.PointerEvent) => void
  onPinPointerUp: (pin: string, e: React.PointerEvent) => void
  onInputActiveChange: (active: boolean) => void
  onKnobPointerDown: (e: React.PointerEvent, channel?: AnalogChannel) => void
}) {
  const pins = COMPONENT_PINS[component.type]
  const pivot = COMPONENT_PIVOT[component.type]
/** 핀에 실제로 걸린 세기(0~1). 단순 on/off 면 0 또는 1이고, PWM 이 걸려 있으면
   *  duty 비율이다 — 그래야 LED 가 "켜짐/꺼짐" 두 단계가 아니라 밝기로 보인다. */
  const levelOf = (pin: string) => levelOfGpio(gpioForPin(pin), gpioLevels, pwmLevels)
  const isOn = (pin: string) => levelOf(pin) > 0
  /** 이 핀에 걸린 PWM(주파수/듀티). PWM 이 아니면 없음. */
  const pwmOf = (pin: string) => {
    const gpio = gpioForPin(pin)
    return gpio === undefined ? undefined : pwmLevels.get(gpio)
  }
  /** 이 핀에 걸린 PWM 주파수(Hz) — 부저가 음 높이를 보여줄 때 쓴다. */
  const freqOf = (pin: string) => {
    const pwm = pwmOf(pin)
    return pwm && pwm.duty > 0 ? pwm.freq : undefined
  }

  // LED 는 두 다리 중 어느 쪽에 신호가 와도 켜진 것으로 본다(극성까지 따지진 않는다).
  const ledLit = Math.max(levelOf('anode'), levelOf('cathode'))
  const ledColor = ledColorOf(component.color)
  const analogSensor = ANALOG_SENSORS[component.type]

  // DC 모터: ena 의 세기가 속도, in1/in2 가 방향. 둘이 같으면 브레이크(정지)다.
  const motorSpeed = levelOf('ena')
  const motorForward = isOn('in1') && !isOn('in2')
  const motorBackward = isOn('in2') && !isOn('in1')
  const motorRunning = motorSpeed > 0 && (motorForward || motorBackward)
  const motorSpin = motorRunning
    ? { seconds: Math.max(0.15, 1.2 - motorSpeed), reverse: motorBackward }
    : null
  const motorLabel = motorRunning
    ? `${Math.round(motorSpeed * 100)}% ${motorForward ? '정방향' : '역방향'}`
    : motorSpeed > 0
      ? '정지(브레이크)'
      : ''

  const coilOn = ['in1', 'in2', 'in3', 'in4'].map((pin) => isOn(pin))

  /** 부품을 반전하면 안쪽 글자까지 거울로 뒤집혀 읽을 수 없게 된다. 값 표시만 되돌린다.
   *  부품들의 값 글자가 전부 x=0(textAnchor middle)이라 scale(-1 1) 한 번이면 맞는다. */
  const Unflip = ({ children }: { children: React.ReactNode }) =>
    component.flipped ? <g transform="scale(-1 1)">{children}</g> : <>{children}</>
  // RGB 는 채널마다 세기가 다를 수 있다 — PWM 을 쓰면 실제로 색이 섞인다.
  const rgbChannel = (pin: string) => Math.round(90 + 165 * levelOf(pin))
  const buzzerFreq = freqOf('positive') ?? freqOf('negative')
  // OLED 화면도 sda 핀 기준. 행마다 '0'/'1' 문자열이라 그대로 찍으면 된다.
  const oledPixels = (() => {
    const gpio = gpioForPin('sda')
    return gpio === undefined ? undefined : oledRows.get(gpio)
  })()
  // LCD 화면 글자는 sda 핀 기준으로 온다. 아직 아무것도 안 찍었으면 빈 줄.
  const lcdText = (() => {
    const gpio = gpioForPin('sda')
    const lines = gpio === undefined ? undefined : lcdLines.get(gpio)
    return Array.from({ length: LCD_LINES }, (_, i) => (lines?.[i] ?? '').padEnd(LCD_COLUMNS, ' '))
  })()
  // 네오픽셀은 데이터 핀 하나로 칸 전체 색이 온다. write() 전에는 아무것도 안 온다.
  const pixels = (() => {
    const gpio = gpioForPin('din')
    return gpio === undefined ? [] : (neopixelColors.get(gpio) ?? [])
  })()
  // 서보는 신호선의 펄스 폭으로 각도가 정해진다. 신호가 없으면 null — 실물 서보는
  // 신호가 끊겨도 마지막 각도를 붙들고 있지만, 여기선 가운데(90도)로 두고 각도 표시를
  // 지운다. "지금 붙들고 있는 각도"를 흉내 내려면 부품마다 상태를 따로 들고 있어야
  // 하는데, 어차피 실행할 때마다 GPIO 가 초기화되는 시뮬레이터라 이득이 적다.
  const servoAngle = servoAngleFromPwm(pwmOf('signal'))

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
      {/* 선택 표시 — 몸통 중심(pivot)에 맞춘 원. 회전 그룹 밖에 둬서 부품이
          돌아가도 항상 같은 자리에 그대로 있다(부품이 이 안에서 도는 것처럼
          보여야 한다 — 중심이 어긋나 있으면 부품이 선택 링 밖으로 궤도를 그리며
          도는 것처럼 보인다, 실제로 지적받은 문제). */}
      {selected && (
        <circle
          cx={pivot.x * COMPONENT_SCALE}
          cy={pivot.y * COMPONENT_SCALE}
          r={26 * COMPONENT_SCALE}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="5 3"
        />
      )}
      {/* rotation은 이 안쪽 그룹에만 건다 — 바깥 그룹(선택 표시 원)까지 돌 이유는
          없다. 회전 중심을 몸통 중심(pivot)으로 명시해야 몸통이 제자리에서 돈다
          (기본값 rotate(각도)는 로컬 원점(0,0) 기준이라 몸통과 안 맞는다).
          pinPoint()가 rotateAround로 계산하는 것과 같은 중심·방향(시계 방향)
          이라야 전선이 실제 보이는 핀 위치에 붙는다. */}
      <g
        transform={[
          `rotate(${component.rotation ?? 0} ${pivot.x * COMPONENT_SCALE} ${pivot.y * COMPONENT_SCALE})`,
          component.flipped ? `translate(${2 * pivot.x * COMPONENT_SCALE} 0) scale(-1 1)` : '',
          `scale(${COMPONENT_SCALE})`,
        ]
          .filter(Boolean)
          .join(' ')}
      >
      {(component.type === 'led' ||
        component.type === 'rgb-led' ||
        component.type === 'buzzer' ||
        component.type === 'potentiometer' ||
        component.type === 'servo' ||
        component.type === 'ldr' ||
        component.type === 'traffic-light' ||
        component.type === 'relay' ||
        component.type === 'vibration' ||
        component.type === 'pir' ||
        component.type === 'tilt' ||
        component.type === 'reed' ||
        component.type === 'dht' ||
        component.type === 'seven-segment' ||
        component.type === 'neopixel' ||
        component.type === 'ultrasonic' ||
        component.type === 'lcd' ||
        component.type === 'oled' ||
        component.type === 'ir-obstacle' ||
        component.type === 'joystick' ||
        component.type === 'dc-motor' ||
        component.type === 'stepper' ||
        ANALOG_SENSORS[component.type]) && <Legs />}

      {component.type === 'potentiometer' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          {/* 실물 트리머처럼 사각 베이스 위에 둥근 노브가 얹혀 있다. 베이스는 평소처럼
              끌어서 옮기는 곳이고, 노브만 돌리기용으로 따로 받는다. 처음엔 베이스를
              원(r=17)으로 그렸는데 노브(r=13)와의 테두리가 4px 밖에 안 남아서 부품을
              잡아 옮길 데가 사실상 없었다 — 특히 손가락으로는. 사각으로 바꾸니 네
              귀퉁이가 잡을 자리로 남는다. */}
          <rect
            x={-19}
            y={-4}
            width={38}
            height={36}
            rx={4}
            fill="#1f2937"
            stroke="#111827"
            strokeWidth={1.5}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          <circle
            cx={0}
            cy={14}
            r={13}
            fill="#e7e5e4"
            stroke="#57534e"
            strokeWidth={1.5}
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
          {/* 지금 값이 가리키는 방향을 그리는 눈금 하나. 0%가 왼쪽 아래(-135도),
              100%가 오른쪽 아래(+135도) — knobValueAt() 과 같은 기준이다. */}
          <g transform={`rotate(${analogValue * KNOB_SWEEP_DEG - KNOB_SWEEP_DEG / 2} 0 14)`}>
            <line x1={0} y1={14} x2={0} y2={3} stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
          </g>
          <Unflip>
            <text x={0} y={-9} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {Math.round(analogValue * 100)}%
            </text>
          </Unflip>
        </g>
      )}

      {component.type === 'led' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <path d="M -13 20 A 13 13 0 1 1 13 20 L 13 26 L -13 26 Z" fill="#78716c" opacity={0.35} />
          {/* 꺼진 알을 항상 깔고, 켜진 알을 그 위에 세기만큼 투명도로 덮는다 — PWM 이
              걸리면 duty 에 따라 실제로 어둡게/밝게 보인다(켜짐·꺼짐 두 단계가 아니라). */}
          <circle cx={0} cy={18} r={14} fill={ledColor.off} stroke="#78716c" strokeWidth={1.5} />
          {ledLit > 0 && (
            <circle
              cx={0}
              cy={18}
              r={14}
              fill={ledColor.on}
              stroke={ledColor.glow}
              strokeWidth={2}
              opacity={0.25 + 0.75 * ledLit}
              style={{ filter: `drop-shadow(0 0 ${3 + 8 * ledLit}px ${ledColor.glow})` }}
            />
          )}
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
            fill={`rgb(${rgbChannel('r')}, ${rgbChannel('g')}, ${rgbChannel('b')})`}
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
          {/* PWM 으로 울릴 땐 몇 Hz 인지 같이 보여준다 — 음계 실습에서 "지금 무슨 음을
              내고 있는가"가 눈으로 보여야 한다. */}
          {buzzerFreq !== undefined && (
            <Unflip>
              <text x={0} y={-6} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#b91c1c" className="select-none">
                {buzzerFreq}Hz
              </text>
            </Unflip>
          )}
        </g>
      )}

      {component.type === 'ldr' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          {/* 모듈 보드는 평소처럼 끌어서 옮기고, 위쪽 슬라이더만 밝기 조절용으로 받는다. */}
          <rect
            x={-21}
            y={2}
            width={42}
            height={28}
            rx={3}
            fill="#14532d"
            stroke="#052e16"
            strokeWidth={1.5}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* CDS 알맹이 — 밝을수록 밝은 노랑으로. 실물도 빛을 받으면 하얗게 반짝인다. */}
          <circle
            cx={0}
            cy={16}
            r={9}
            fill={`rgb(${60 + 195 * analogValue}, ${55 + 190 * analogValue}, ${40 + 120 * analogValue})`}
            stroke="#052e16"
            strokeWidth={1.5}
          />
          <path d="M -5 12 Q 0 16 -5 20 Q 0 16 5 12 Q 0 16 5 20" fill="none" stroke="#1c1917" strokeWidth={1.2} opacity={0.7} />

          {/* 밝기 슬라이더. 눈금이 아니라 "지금 이 센서에 얼마나 빛이 오는가"를 학생이
              직접 정하는 손잡이다 — 실행 중에도 움직일 수 있어야 한다. */}
          <line
            x1={-LDR_TRACK_HALF_WIDTH}
            y1={-8}
            x2={LDR_TRACK_HALF_WIDTH}
            y2={-8}
            stroke="#a8a29e"
            strokeWidth={3}
            strokeLinecap="round"
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
          <circle
            cx={-LDR_TRACK_HALF_WIDTH + analogValue * LDR_TRACK_HALF_WIDTH * 2}
            cy={-8}
            r={6}
            fill="#fde047"
            stroke="#a16207"
            strokeWidth={1.5}
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
          <Unflip>
            <text x={0} y={-18} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {Math.round(analogValue * 100)}%
            </text>
          </Unflip>
        </g>
      )}

      {component.type === 'ultrasonic' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          {/* HC-SR04 특유의 눈 두 개(스피커·마이크). 몸통은 끄는 자리다. */}
          <rect
            x={-27}
            y={6}
            width={54}
            height={30}
            rx={3}
            fill="#1e3a8a"
            stroke="#172554"
            strokeWidth={1.5}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {[-13, 13].map((cx) => (
            <g key={cx} className="pointer-events-none">
              <circle cx={cx} cy={21} r={11} fill="#334155" stroke="#0f172a" strokeWidth={1.2} />
              <circle cx={cx} cy={21} r={7} fill="#1e293b" />
            </g>
          ))}
          <rect x={-4} y={16} width={8} height={10} rx={1.5} fill="#94a3b8" className="pointer-events-none" />

          <Unflip>
            <text x={0} y={-16} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {ultrasonicDistance(analogValue)}cm
            </text>
          </Unflip>
          {/* 앞에 있는 물체까지의 거리를 학생이 직접 정한다. */}
          <line
            x1={-LDR_TRACK_HALF_WIDTH}
            y1={-6}
            x2={LDR_TRACK_HALF_WIDTH}
            y2={-6}
            stroke="#a8a29e"
            strokeWidth={3}
            strokeLinecap="round"
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
          <circle
            cx={-LDR_TRACK_HALF_WIDTH + analogValue * LDR_TRACK_HALF_WIDTH * 2}
            cy={-6}
            r={6}
            fill="#38bdf8"
            stroke="#075985"
            strokeWidth={1.5}
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
        </g>
      )}

      {analogSensor && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          {/* 조도센서와 같은 짜임 — 모듈 보드는 끄는 자리, 위 슬라이더가 누르는 자리다.
              생김새와 눈금만 부품마다 다르다(ANALOG_SENSORS). */}
          <rect
            x={-21}
            y={2}
            width={42}
            height={28}
            rx={3}
            fill={analogSensor.board}
            stroke="#0c0a09"
            strokeWidth={1.5}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* 값이 커질수록 진해지는 알맹이 — 흙이 젖고, 비가 오고, 불이 세지는 것. */}
          <circle
            cx={0}
            cy={16}
            r={9}
            fill={analogSensor.accent}
            opacity={0.35 + 0.65 * analogValue}
            stroke="#0c0a09"
            strokeWidth={1.2}
            className="pointer-events-none"
          />
          <Unflip>
            <text x={0} y={-18} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {analogSensor.readingOf(analogValue)}
              {analogSensor.unit}
            </text>
          </Unflip>
          <line
            x1={-LDR_TRACK_HALF_WIDTH}
            y1={-8}
            x2={LDR_TRACK_HALF_WIDTH}
            y2={-8}
            stroke="#a8a29e"
            strokeWidth={3}
            strokeLinecap="round"
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
          <circle
            cx={-LDR_TRACK_HALF_WIDTH + analogValue * LDR_TRACK_HALF_WIDTH * 2}
            cy={-8}
            r={6}
            fill={analogSensor.accent}
            stroke="#0c0a09"
            strokeWidth={1.5}
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
        </g>
      )}

      {component.type === 'dc-motor' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          {/* 은색 몸통 + 축. 속도는 ena 의 PWM duty, 방향은 in1/in2 조합으로 정해진다. */}
          <rect x={-24} y={6} width={48} height={32} rx={6} fill="#94a3b8" stroke="#475569" strokeWidth={1.5} />
          <rect x={-30} y={16} width={6} height={12} rx={2} fill="#64748b" stroke="#334155" strokeWidth={1} />
          <g
            className={motorSpin ? 'animate-spin' : undefined}
            style={
              motorSpin
                ? {
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animationDuration: `${motorSpin.seconds}s`,
                    animationDirection: motorSpin.reverse ? 'reverse' : 'normal',
                  }
                : undefined
            }
          >
            <circle cx={0} cy={22} r={11} fill="#e2e8f0" stroke="#475569" strokeWidth={1.2} />
            <line x1={0} y1={22} x2={0} y2={13} stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" />
          </g>
          <Unflip>
            <text x={0} y={-2} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {motorLabel}
            </text>
          </Unflip>
        </g>
      )}

      {component.type === 'stepper' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          {/* 파란 드라이버 보드 + 그 위의 은색 모터. 코일 순서가 한 칸씩 넘어갈 때마다
              축이 한 칸 돈다 — 순서를 잘못 짜면 제자리에서 떠는 것도 그대로 보인다. */}
          <rect x={-28} y={26} width={56} height={16} rx={2} fill="#1d4ed8" stroke="#1e3a8a" strokeWidth={1.2} />
          {[0, 1, 2, 3].map((i) => (
            <circle
              key={i}
              cx={-21 + i * 14}
              cy={34}
              r={3}
              fill={coilOn[i] ? '#fca5a5' : '#1e3a8a'}
              className="pointer-events-none"
            />
          ))}
          <circle cx={0} cy={14} r={14} fill="#cbd5e1" stroke="#475569" strokeWidth={1.5} />
          <g transform={`rotate(${stepperAngle} 0 14)`}>
            <line x1={0} y1={14} x2={0} y2={2} stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" />
          </g>
          <circle cx={0} cy={14} r={3} fill="#64748b" className="pointer-events-none" />
          <Unflip>
            <text x={0} y={-6} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {Math.round(stepperAngle)}°
            </text>
          </Unflip>
        </g>
      )}

      {component.type === 'joystick' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          <rect
            x={-26}
            y={2}
            width={52}
            height={40}
            rx={3}
            fill="#1e293b"
            stroke="#0f172a"
            strokeWidth={1.5}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* 스틱이 움직이는 범위 */}
          <circle cx={0} cy={22} r={JOYSTICK_RADIUS + 4} fill="#0f172a" stroke="#334155" strokeWidth={1.2} className="pointer-events-none" />
          {/* 스틱 머리. 끌면 가로·세로가 한 번에 정해지고, 누르면 sw 핀이 켜진다. */}
          <circle
            cx={(analogValue - 0.5) * JOYSTICK_RADIUS * 2}
            cy={22 - (rangeValue - 0.5) * JOYSTICK_RADIUS * 2}
            r={9}
            fill={active ? '#fbbf24' : '#e2e8f0'}
            stroke="#0f172a"
            strokeWidth={1.5}
            className="cursor-pointer"
            onPointerDown={onKnobPointerDown}
          />
          {/* 누름(sw)은 따로 받는다 — 스틱 머리에 같이 걸면 방향을 조절할 때마다
              버튼이 눌린 것으로 처리된다. */}
          <rect
            x={-24}
            y={4}
            width={16}
            height={11}
            rx={2}
            fill={active ? '#fbbf24' : '#334155'}
            stroke="#0f172a"
            strokeWidth={1.2}
            className="cursor-pointer"
            onPointerDown={(e) => {
              e.stopPropagation()
              onInputActiveChange(!active)
            }}
          />
          <Unflip>
            <text x={-16} y={12.5} fontSize={7} fontWeight="bold" textAnchor="middle" fill={active ? '#78350f' : '#94a3b8'} className="pointer-events-none select-none">
              SW
            </text>
          </Unflip>
          <Unflip>
            <text x={0} y={-6} fontSize={8.5} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              X {Math.round(analogValue * 100)} · Y {Math.round(rangeValue * 100)}
            </text>
          </Unflip>
        </g>
      )}

      {component.type === 'ir-obstacle' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          <rect
            x={-21}
            y={2}
            width={42}
            height={28}
            rx={3}
            fill="#134e4a"
            stroke="#042f2e"
            strokeWidth={1.5}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* IR 은 눈이 두 개다 — 하나는 쏘고 하나는 받는다. 막히면 받는 쪽이 켜진다. */}
          {[-9, 9].map((cx) => (
            <circle
              key={cx}
              cx={cx}
              cy={16}
              r={7}
              fill={active ? '#5eead4' : '#1e293b'}
              stroke="#042f2e"
              strokeWidth={1.2}
              className="cursor-pointer"
              style={active ? { filter: 'drop-shadow(0 0 6px #2dd4bf)' } : undefined}
              onPointerDown={(e) => {
                e.stopPropagation()
                onInputActiveChange(!active)
              }}
            />
          ))}
          {active && (
            <Unflip>
              <text x={0} y={-6} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#0f766e" className="select-none">
                막힘
              </text>
            </Unflip>
          )}
        </g>
      )}

      {component.type === 'oled' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <rect x={-38} y={2} width={76} height={48} rx={3} fill="#0f172a" stroke="#020617" strokeWidth={1.5} />
          {/* 128x64 픽셀을 64x32 로 줄여 그린다 — 두 픽셀씩 묶으면 화면에서 알아볼 수
              있는 크기가 되고, 글자도 읽힌다. 원본 해상도 그대로면 점이 너무 작다. */}
          <g transform="translate(-32 6)">
            <rect x={0} y={0} width={64} height={32} fill="#020617" />
            {oledPixels &&
              Array.from({ length: OLED_HEIGHT / 2 }, (_, y) => {
                const top = oledPixels[y * 2] ?? ''
                const bottom = oledPixels[y * 2 + 1] ?? ''
                const spans: React.ReactNode[] = []
                for (let x = 0; x < OLED_WIDTH / 2; x++) {
                  const on =
                    top[x * 2] === '1' ||
                    top[x * 2 + 1] === '1' ||
                    bottom[x * 2] === '1' ||
                    bottom[x * 2 + 1] === '1'
                  if (on) spans.push(<rect key={x} x={x} y={y} width={1} height={1} fill="#7dd3fc" />)
                }
                return spans
              })}
          </g>
        </g>
      )}

      {component.type === 'lcd' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          {/* 파란 배경에 밝은 글자 — 시중 1602 모듈이 대부분 이 색이다. */}
          <rect x={-42} y={2} width={84} height={44} rx={3} fill="#1e3a8a" stroke="#172554" strokeWidth={1.5} />
          <rect x={-38} y={7} width={76} height={34} rx={2} fill="#1d4ed8" />
          {lcdText.map((line, row) => (
            <text
              key={row}
              x={-35}
              y={20 + row * 15}
              fontSize={9}
              fontFamily="'SF Mono', Menlo, Consolas, monospace"
              fill="#dbeafe"
              className="select-none"
              // 16칸이 항상 같은 폭을 차지해야 실물처럼 보인다.
              textLength={70}
              lengthAdjust="spacingAndGlyphs"
              xmlSpace="preserve"
            >
              {line}
            </text>
          ))}
        </g>
      )}

      {component.type === 'neopixel' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <rect x={-34} y={2} width={68} height={24} rx={3} fill="#0c0a09" stroke="#292524" strokeWidth={1.2} />
          {Array.from({ length: NEOPIXEL_COUNT }, (_, i) => {
            const color = pixels[i]
            // 검정(꺼짐)이면 알을 어둡게 둔다 — 실물도 (0,0,0) 은 그냥 안 켜진 것이다.
            const lit = !!color && color !== 'rgb(0, 0, 0)'
            return (
              <rect
                key={i}
                x={-31 + i * 8.2}
                y={7}
                width={6.4}
                height={14}
                rx={1.5}
                fill={lit ? color : '#292524'}
                stroke="#44403c"
                strokeWidth={0.8}
                style={lit ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined}
              />
            )
          })}
        </g>
      )}

      {component.type === 'seven-segment' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <rect x={-24} y={2} width={48} height={72} rx={3} fill="#1c1917" stroke="#0c0a09" strokeWidth={1.5} />
          {/* 꺼진 획도 옅게 그려둔다 — 실물도 안 켜진 획이 어렴풋이 보이고, 무엇보다
              어느 자리에 어떤 획이 있는지 알아야 배선을 할 수 있다. */}
          {SEVEN_SEGMENT_BARS.map((bar) => (
            <rect
              key={bar.pin}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              rx={2}
              fill={isOn(bar.pin) ? '#ef4444' : '#3f2b2b'}
              style={isOn(bar.pin) ? { filter: 'drop-shadow(0 0 5px #f87171)' } : undefined}
            />
          ))}
          <circle
            cx={21}
            cy={63}
            r={3}
            fill={isOn('dp') ? '#ef4444' : '#3f2b2b'}
            style={isOn('dp') ? { filter: 'drop-shadow(0 0 5px #f87171)' } : undefined}
          />
        </g>
      )}

      {component.type === 'dht' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          {/* 파란 DHT11 케이스. 몸통은 끄는 자리, 위 두 슬라이더가 누르는 자리다. */}
          <rect
            x={-22}
            y={4}
            width={44}
            height={34}
            rx={3}
            fill="#1d4ed8"
            stroke="#1e3a8a"
            strokeWidth={1.5}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* 실물 케이스의 격자 구멍 */}
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3].map((col) => (
              <circle
                key={`${row}-${col}`}
                cx={-13 + col * 8.5}
                cy={12 + row * 8}
                r={2.2}
                fill="#1e3a8a"
                className="pointer-events-none"
              />
            )),
          )}

          <Unflip>
            <text x={0} y={-24} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {dhtTemperature(tempValue)}°C · {dhtHumidity(humidityValue)}%
            </text>
          </Unflip>

          {/* 위가 온도(빨강), 아래가 습도(파랑). 조작부가 둘이라 채널을 같이 넘긴다. */}
          {[
            { channel: 'temp' as const, y: -14, value: tempValue, fill: '#ef4444', stroke: '#7f1d1d' },
            { channel: 'hum' as const, y: -3, value: humidityValue, fill: '#38bdf8', stroke: '#075985' },
          ].map((slider) => (
            <g key={slider.channel}>
              <line
                x1={-LDR_TRACK_HALF_WIDTH}
                y1={slider.y}
                x2={LDR_TRACK_HALF_WIDTH}
                y2={slider.y}
                stroke="#a8a29e"
                strokeWidth={3}
                strokeLinecap="round"
                className="cursor-pointer"
                onPointerDown={(e) => onKnobPointerDown(e, slider.channel)}
              />
              <circle
                cx={-LDR_TRACK_HALF_WIDTH + slider.value * LDR_TRACK_HALF_WIDTH * 2}
                cy={slider.y}
                r={5.5}
                fill={slider.fill}
                stroke={slider.stroke}
                strokeWidth={1.5}
                className="cursor-pointer"
                onPointerDown={(e) => onKnobPointerDown(e, slider.channel)}
              />
            </g>
          ))}
        </g>
      )}

      {component.type === 'servo' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          {/* SG90 처럼 파란 몸통 + 위쪽에 튀어나온 기어 박스, 그 위에 뿔(horn). */}
          <rect x={-18} y={2} width={36} height={28} rx={3} fill="#2563eb" stroke="#1e40af" strokeWidth={1.5} />
          <rect x={-11} y={-6} width={22} height={10} rx={2} fill="#1d4ed8" stroke="#1e3a8a" strokeWidth={1.2} />
          {/* 0도가 왼쪽, 180도가 오른쪽, 90도가 위. 신호가 없으면 가운데에 둔다. */}
          <g transform={`rotate(${(servoAngle ?? 90) - 90} 0 -1)`}>
            <line x1={0} y1={-1} x2={0} y2={-17} stroke="#f8fafc" strokeWidth={4} strokeLinecap="round" />
            <circle cx={0} cy={-17} r={2.5} fill="#f8fafc" />
          </g>
          <circle cx={0} cy={-1} r={4} fill="#e5e7eb" stroke="#64748b" strokeWidth={1.2} />
          {servoAngle !== null && (
            <Unflip>
              <text x={0} y={24} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#eff6ff" className="select-none">
                {servoAngle}°
              </text>
            </Unflip>
          )}
        </g>
      )}

      {component.type === 'pir' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          <rect
            x={-22}
            y={12}
            width={44}
            height={24}
            rx={2}
            fill="#14532d"
            stroke="#052e16"
            strokeWidth={1.2}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* 렌즈 돔. 사람이 감지 범위 안에 들어오면 초록으로 빛난다. */}
          <circle
            cx={0}
            cy={14}
            r={13}
            fill={active ? '#bbf7d0' : '#f5f5f4'}
            stroke="#a8a29e"
            strokeWidth={1.5}
            className="pointer-events-none"
            style={active ? { filter: 'drop-shadow(0 0 7px #4ade80)' } : undefined}
          />
          <path d="M -8 8 A 8 8 0 0 1 8 8" fill="none" stroke="#d6d3d1" strokeWidth={1.2} className="pointer-events-none" />
          {active && (
            <Unflip>
              <text x={0} y={18} fontSize={10} textAnchor="middle" className="pointer-events-none select-none">
                🚶
              </text>
            </Unflip>
          )}

          <Unflip>
            <text x={0} y={-26} fontSize={8.5} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              사람 {pirDistanceM(analogValue)}m · 범위 {pirRangeM(rangeValue)}m
            </text>
          </Unflip>
          {/* 위(파랑)가 사람까지 거리, 아래(빨강)가 이 센서의 감지 범위다.
              실물 HC-SR501 도 거리 조절용 가변저항이 달려 있다. */}
          {[
            { channel: 'value' as const, y: -18, value: analogValue, fill: '#38bdf8', stroke: '#075985' },
            { channel: 'range' as const, y: -6, value: rangeValue, fill: '#ef4444', stroke: '#7f1d1d' },
          ].map((slider) => (
            <g key={slider.channel}>
              <line
                x1={-LDR_TRACK_HALF_WIDTH}
                y1={slider.y}
                x2={LDR_TRACK_HALF_WIDTH}
                y2={slider.y}
                stroke="#a8a29e"
                strokeWidth={3}
                strokeLinecap="round"
                className="cursor-pointer"
                onPointerDown={(e) => onKnobPointerDown(e, slider.channel)}
              />
              <circle
                cx={-LDR_TRACK_HALF_WIDTH + slider.value * LDR_TRACK_HALF_WIDTH * 2}
                cy={slider.y}
                r={5.5}
                fill={slider.fill}
                stroke={slider.stroke}
                strokeWidth={1.5}
                className="cursor-pointer"
                onPointerDown={(e) => onKnobPointerDown(e, slider.channel)}
              />
            </g>
          ))}
        </g>
      )}

      {component.type === 'tilt' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          {/* 아래 받침이 끄는 자리, 위 유리관이 누르는 자리다(PIR 과 같은 규칙). */}
          <rect
            x={-16}
            y={20}
            width={32}
            height={10}
            rx={2}
            fill="#44403c"
            stroke="#292524"
            strokeWidth={1.2}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* 기울이면 안의 구슬이 굴러가 접점이 붙는다 — 실물 볼 스위치 그대로다. */}
          <g transform={`rotate(${active ? 28 : 0} 0 20)`}>
            <rect
              x={-11}
              y={0}
              width={22}
              height={20}
              rx={9}
              fill="#a8a29e"
              stroke="#57534e"
              strokeWidth={1.5}
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation()
                onInputActiveChange(!active)
              }}
            />
            <circle cx={0} cy={active ? 15 : 5} r={5} fill="#292524" className="pointer-events-none" />
          </g>
        </g>
      )}

      {component.type === 'reed' && (
        <g style={{ filter: 'url(#chico-shadow)' }}>
          <rect
            x={-16}
            y={20}
            width={32}
            height={10}
            rx={2}
            fill="#44403c"
            stroke="#292524"
            strokeWidth={1.2}
            onPointerDown={locked ? undefined : onBodyPointerDown}
            className={locked ? '' : 'cursor-grab'}
          />
          {/* 유리관 안의 두 조각이 자석을 대면 붙는다. */}
          <rect
            x={-14}
            y={4}
            width={28}
            height={14}
            rx={7}
            fill="#e7e5e4"
            fillOpacity={0.85}
            stroke="#78716c"
            strokeWidth={1.5}
            className="cursor-pointer"
            onPointerDown={(e) => {
              e.stopPropagation()
              onInputActiveChange(!active)
            }}
          />
          <line x1={-12} y1={active ? 11 : 8} x2={0} y2={active ? 11 : 8} stroke="#57534e" strokeWidth={2} className="pointer-events-none" />
          <line x1={0} y1={active ? 11 : 14} x2={12} y2={active ? 11 : 14} stroke="#57534e" strokeWidth={2} className="pointer-events-none" />
          {active && (
            <text x={0} y={-2} fontSize={11} textAnchor="middle" className="pointer-events-none select-none">
              🧲
            </text>
          )}
        </g>
      )}

      {component.type === 'relay' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          {/* 파란 상자 + 접점. 켜지면 접점이 붙고 표시등이 들어온다. */}
          <rect x={-17} y={2} width={34} height={28} rx={2} fill="#1d4ed8" stroke="#1e3a8a" strokeWidth={1.5} />
          <circle cx={-10} cy={9} r={3} fill={isOn('a') || isOn('b') ? '#fca5a5' : '#7f1d1d'} />
          <line x1={-2} y1={20} x2={8} y2={20} stroke="#e5e7eb" strokeWidth={2} />
          <line
            x1={-2}
            y1={20}
            x2={8}
            y2={isOn('a') || isOn('b') ? 20 : 13}
            stroke="#fbbf24"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Unflip>
            <text x={0} y={-3} fontSize={9} fontWeight="bold" textAnchor="middle" fill="#57534e" className="select-none">
              {isOn('a') || isOn('b') ? '딸깍' : ''}
            </text>
          </Unflip>
        </g>
      )}

      {component.type === 'vibration' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          {/* 코인형 진동모터. 돌면 옆으로 떨리는 선을 그린다 — 소리가 없으니 눈으로
              보여줘야 "지금 돌고 있다"를 알 수 있다. */}
          <circle cx={0} cy={14} r={13} fill="#57534e" stroke="#292524" strokeWidth={1.5} />
          <circle cx={0} cy={14} r={5} fill="#a8a29e" />
          {(isOn('a') || isOn('b')) && (
            <>
              <path d="M -20 8 q -4 6 0 12" fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
              <path d="M 20 8 q 4 6 0 12" fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
            </>
          )}
        </g>
      )}

      {component.type === 'traffic-light' && (
        <g
          onPointerDown={locked ? undefined : onBodyPointerDown}
          className={locked ? '' : 'cursor-grab'}
          style={{ filter: 'url(#chico-shadow)' }}
        >
          <rect x={-14} y={0} width={28} height={52} rx={5} fill="#292524" stroke="#1c1917" strokeWidth={1.5} />
          {[
            { pin: 'red', cy: 11, on: '#ef4444', off: '#7f1d1d' },
            { pin: 'yellow', cy: 26, on: '#facc15', off: '#713f12' },
            { pin: 'green', cy: 41, on: '#22c55e', off: '#14532d' },
          ].map((lamp) => (
            <circle
              key={lamp.pin}
              cx={0}
              cy={lamp.cy}
              r={6}
              fill={isOn(lamp.pin) ? lamp.on : lamp.off}
              style={isOn(lamp.pin) ? { filter: `drop-shadow(0 0 7px ${lamp.on})` } : undefined}
            />
          ))}
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
    </g>
  )
}
