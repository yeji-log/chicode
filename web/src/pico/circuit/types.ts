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

export interface Wire {
  id: string
  from: PinRef
  to: PinRef
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
