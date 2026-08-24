/** 회로 캔버스의 데이터 모델. SVG 좌표계(px) 기준. */

export interface Point {
  x: number
  y: number
}

/** 배선 가능한 한 점을 가리키는 값 — 노드 id 로 바로 쓸 수 있게 문자열로 직렬화한다. */
export type PinRef =
  | { kind: 'board'; pinId: string }
  | { kind: 'breadboard'; boardId: string; col: number; side: 'top' | 'bottom' }
  | { kind: 'breadboardRail'; boardId: string; rail: 'plus' | 'minus' }
  | { kind: 'component'; componentId: string; pin: string }

export function pinRefKey(ref: PinRef): string {
  switch (ref.kind) {
    case 'board':
      return `board:${ref.pinId}`
    case 'breadboard':
      return `bb:${ref.boardId}:${ref.col}:${ref.side}`
    case 'breadboardRail':
      return `bb:${ref.boardId}:rail:${ref.rail}`
    case 'component':
      return `comp:${ref.componentId}:${ref.pin}`
  }
}

/**
 * machine.Pin(디지털 입출력)만 있으면 되는 부품만 넣는다 — ADC/PWM 이 아직 없어서
 * 가변저항/LDR/서보처럼 아날로그가 필요한 부품은 "회로에 놓을 순 있는데 실제로 동작은
 * 안 하는" 상태가 된다. 그건 이 프로젝트가 제일 싫어하는 종류의 거짓말이라 뺐다
 * (계획 문서 4절 "우선 구현할 부품" 참고 — ADC/PWM 은 다음 단계).
 */
export type ComponentType = 'led' | 'rgb-led' | 'buzzer' | 'button' | 'switch'

export type ComponentCategory = 'output' | 'input'

export interface ComponentMeta {
  type: ComponentType
  category: ComponentCategory
  label: string
  emoji: string
}

export const COMPONENT_LIST: ComponentMeta[] = [
  { type: 'led', category: 'output', label: 'LED', emoji: '💡' },
  { type: 'rgb-led', category: 'output', label: 'RGB LED', emoji: '🌈' },
  { type: 'buzzer', category: 'output', label: '부저', emoji: '🔔' },
  { type: 'button', category: 'input', label: '버튼(누르는 동안)', emoji: '🔘' },
  { type: 'switch', category: 'input', label: '스위치(클릭해서 토글)', emoji: '🔀' },
]

export interface PlacedComponent {
  id: string
  type: ComponentType
  x: number
  y: number
  /** 0/90/180/270도. 없으면 0(회전 없음)으로 취급 — 이 필드가 생기기 전 저장된
   *  회로(localStorage, EXAMPLES)도 그대로 읽혀야 하니 optional로 둔다. */
  rotation?: 0 | 90 | 180 | 270
}

export type BreadboardSize = 'mini' | 'medium'

export const BREADBOARD_SIZES: { size: BreadboardSize; label: string; columns: number }[] = [
  { size: 'mini', label: '미니 (10칸)', columns: 10 },
  { size: 'medium', label: '중간 (20칸)', columns: 20 },
]

export interface PlacedBreadboard {
  id: string
  size: BreadboardSize
  x: number
  y: number
}

/** Pico 2 W 보드 하나뿐이라(컴포넌트/브레드보드와 달리 여러 개를 추가·삭제할 수
 *  없음) id가 없다 — CircuitCanvas가 선택/드래그를 다룰 때 고정 문자열
 *  하나("pico-board")를 그 대신 쓴다. 옮기고 돌릴 수는 있지만(사용자 요청)
 *  지울 수는 없다 — 이게 없으면 GPIO 핀 자체가 없어져 회로가 성립하지 않는다. */
export interface PlacedBoard {
  x: number
  y: number
  rotation?: 0 | 90 | 180 | 270
}

/** 점퍼선 색 — 실제 브레드보드 배선 관례(전원=빨강, 접지=검정 등)를 그대로 옵션으로
 *  준다. 새로 잇는 전선은 팔레트에서 고른 색을 쓰고, 이미 그은 전선은 오른쪽 클릭으로
 *  바꾼다(왼쪽 클릭은 기존처럼 삭제 — 의미를 안 바꿨다). */
export const WIRE_COLORS: { name: string; value: string }[] = [
  { name: '빨강', value: '#dc2626' },
  { name: '검정', value: '#1f2937' },
  { name: '파랑', value: '#2563eb' },
  { name: '노랑', value: '#eab308' },
  { name: '초록', value: '#16a34a' },
]
export const DEFAULT_WIRE_COLOR = WIRE_COLORS[0].value

export interface Wire {
  id: string
  from: PinRef
  to: PinRef
  /** 없으면 DEFAULT_WIRE_COLOR(빨강) — 이 필드가 생기기 전 저장된 회로도 그대로
   *  읽혀야 하니 optional. */
  color?: string
}

/** dx/dy(부품 기준 상대 좌표)를 부품의 rotation만큼 원점 기준으로 돌린다.
 *  ComponentGlyph가 부품 몸통을 그릴 때 쓰는 SVG rotate()와 같은 방향(시계 방향,
 *  화면 좌표계라 y가 아래로 갈수록 증가)이라야 전선이 실제로 눈에 보이는 핀 위치에
 *  붙는다. */
export function rotateOffset(dx: number, dy: number, rotation: number): Point {
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}

/** 회로 캔버스가 통째로 저장/불러오는 상태 — 예제마다 이 모양으로 회로를 같이 들고 있는다. */
export interface CircuitSnapshot {
  components: PlacedComponent[]
  breadboards: PlacedBreadboard[]
  wires: Wire[]
  /** optional — 이 필드가 생기기 전 저장된 회로(localStorage, EXAMPLES)는 없을 수
   *  있다. 없으면 CircuitCanvas가 board.ts의 DEFAULT_BOARD_X/Y로 채운다. */
  board?: PlacedBoard
}

/** 부품 종류별로 고정된 핀 이름 + 부품 기준 상대 좌표. */
export const COMPONENT_PINS: Record<ComponentType, { pin: string; dx: number; dy: number }[]> = {
  led: [
    { pin: 'anode', dx: -10, dy: 46 },
    { pin: 'cathode', dx: 10, dy: 46 },
  ],
  'rgb-led': [
    { pin: 'r', dx: -24, dy: 46 },
    { pin: 'g', dx: -8, dy: 46 },
    { pin: 'b', dx: 8, dy: 46 },
    { pin: 'common', dx: 24, dy: 46 },
  ],
  buzzer: [
    { pin: 'positive', dx: -12, dy: 40 },
    { pin: 'negative', dx: 12, dy: 40 },
  ],
  button: [
    { pin: 'a', dx: -16, dy: 18 },
    { pin: 'b', dx: 16, dy: 18 },
  ],
  switch: [
    { pin: 'a', dx: -16, dy: 18 },
    { pin: 'b', dx: 16, dy: 18 },
  ],
}
