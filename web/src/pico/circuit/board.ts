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

/** 보드를 옮기고 돌릴 수 있게 되면서(사용자 요청), 핀 좌표는 더는 캔버스 절대
 *  좌표가 아니라 보드 자기 자신 기준 로컬 좌표(왼쪽 위를 0,0)로 둔다 — 실제
 *  화면 위치는 CircuitCanvas가 보드의 x/y/rotation을 적용해서 계산한다
 *  (컴포넌트 dx/dy와 같은 방식, pinPoint 참고). DEFAULT_BOARD_X/Y는 회로를
 *  처음 열었을 때(또는 board 필드가 없는 예전 저장 회로) 쓰는 기본 위치다.
 */
export const BOARD_WIDTH = 200
export const BOARD_HEIGHT = 560
export const DEFAULT_BOARD_X = 640
export const DEFAULT_BOARD_Y = 70
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
    x: 0,
    y: PIN_MARGIN_TOP + i * PIN_GAP,
    side: 'left',
  })),
  ...RIGHT_LABELS_BOTTOM_TO_TOP.map((label, i): BoardPin => ({
    id: `R${21 + i}`,
    label,
    gpio: gpioOf(label),
    x: BOARD_WIDTH,
    y: BOARD_HEIGHT - PIN_MARGIN_TOP - i * PIN_GAP,
    side: 'right',
  })),
]

/**
 * 보드 내장 LED 를 나타내는 "핀 번호". 헤더에 나오는 핀이 아니라서 GP 번호가 없다 —
 * Pico 2 W 는 이 LED 가 GPIO 가 아니라 무선 칩(CYW43) 쪽에 달려 있어서, 진짜 보드에서도
 * machine.Pin(25) 가 아니라 machine.Pin("LED") 처럼 이름으로 연다.
 *
 * 그래도 워커↔UI 사이를 오가는 GPIO 메시지는 전부 숫자 하나로 되어 있어서(gpio/pwm),
 * 내장 LED 만 따로 길을 내는 대신 실제 핀과 겹치지 않는 음수를 배정해 같은 길로 보낸다.
 * 배선(전선)은 이 번호를 절대 만들어내지 않으므로 부품 쪽과 부딪히지 않는다.
 */
export const ONBOARD_LED_PIN = -1
