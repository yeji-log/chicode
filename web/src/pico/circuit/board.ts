/**
 * Pico 2 W 핀 배치. 데이터시트를 직접 대조하진 못했다 — 표준 Pico/Pico W 40핀 배치를
 * 기억에 의존해 적었다(GP23~25/29 는 무선 칩이 내부적으로 쓰는 핀이라 헤더에 안 나오는
 * 것까지 반영함). 다음에 실제 핀맵과 한 번 더 맞춰보면 좋다(계획 문서 6절 참고).
 *
 * 왼쪽 1~20(위→아래), 오른쪽 21~40(아래→위) — 실제 실크스크린 순서와 같다.
 */
export interface BoardPin {
  id: string
  label: string
  /** GP 로 시작하는, machine.Pin 에 실제로 쓸 수 있는 핀. */
  gpio: number | null
  x: number
  y: number
  side: 'left' | 'right'
}

const LEFT_LABELS = [
  'GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND',
  'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12',
  'GP13', 'GND', 'GP14', 'GP15',
]

const RIGHT_LABELS_BOTTOM_TO_TOP = [
  'GP16', 'GP17', 'GND', 'GP18', 'GP19', 'GP20', 'GP21', 'GND',
  'GP22', 'RUN', 'GP26', 'GP27', 'GND', 'GP28', 'ADC_VREF', '3V3',
  '3V3_EN', 'GND', 'VSYS', 'VBUS',
]

export const BOARD_X = 640
export const BOARD_Y = 70
export const BOARD_WIDTH = 200
export const BOARD_HEIGHT = 560
const PIN_MARGIN_TOP = 26
const PIN_GAP = (BOARD_HEIGHT - PIN_MARGIN_TOP * 2) / (LEFT_LABELS.length - 1)

function gpioOf(label: string): number | null {
  return label.startsWith('GP') ? Number(label.slice(2)) : null
}

export const BOARD_PINS: BoardPin[] = [
  ...LEFT_LABELS.map((label, i): BoardPin => ({
    id: `L${i + 1}`,
    label,
    gpio: gpioOf(label),
    x: BOARD_X,
    y: BOARD_Y + PIN_MARGIN_TOP + i * PIN_GAP,
    side: 'left',
  })),
  ...RIGHT_LABELS_BOTTOM_TO_TOP.map((label, i): BoardPin => ({
    id: `R${21 + i}`,
    label,
    gpio: gpioOf(label),
    x: BOARD_X + BOARD_WIDTH,
    y: BOARD_Y + BOARD_HEIGHT - PIN_MARGIN_TOP - i * PIN_GAP,
    side: 'right',
  })),
]
