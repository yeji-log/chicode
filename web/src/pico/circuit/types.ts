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

export type ComponentType = 'led' | 'button'

export interface PlacedComponent {
  id: string
  type: ComponentType
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
  button: [
    { pin: 'a', dx: -16, dy: 18 },
    { pin: 'b', dx: 16, dy: 18 },
  ],
}
