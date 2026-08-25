/** 회로 캔버스의 데이터 모델. SVG 좌표계(px) 기준. */

export interface Point {
  x: number
  y: number
}

/** 배선 가능한 한 점을 가리키는 값 — 노드 id 로 바로 쓸 수 있게 문자열로 직렬화한다. */
export type PinRef =
  | { kind: 'board'; pinId: string }
  | { kind: 'breadboard'; boardId: string; col: number; side: 'top' | 'bottom' }
  /** 전원 레일. col 은 "몇 번째 구멍에 꽂았는가" 다 — 실제 레일도 구멍이 여러 개고,
   *  여러 선을 각각 다른 구멍에 꽂는 게 브레드보드를 쓰는 이유다. 전기적으로는 같은
   *  레일이면 전부 한 노드다(connectivity 에서 묶는다).
   *  없으면 0번 구멍 — 이 필드가 생기기 전 저장된 회로도 읽혀야 하니 optional. */
  | { kind: 'breadboardRail'; boardId: string; rail: 'plus' | 'minus'; col?: number }
  | { kind: 'component'; componentId: string; pin: string }

export function pinRefKey(ref: PinRef): string {
  switch (ref.kind) {
    case 'board':
      return `board:${ref.pinId}`
    case 'breadboard':
      return `bb:${ref.boardId}:${ref.col}:${ref.side}`
    case 'breadboardRail':
      return `bb:${ref.boardId}:rail:${ref.rail}:${ref.col ?? 0}`
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
export type ComponentType =
  | 'led'
  | 'rgb-led'
  | 'buzzer'
  | 'button'
  | 'switch'
  | 'potentiometer'
  | 'servo'
  | 'ldr'
  | 'pir'
  | 'tilt'
  | 'reed'
  | 'relay'
  | 'vibration'
  | 'traffic-light'
  | 'dht'
  | 'seven-segment'
  | 'neopixel'
  | 'ultrasonic'
  | 'lcd'
  | 'soil'
  | 'rain'
  | 'flame'
  | 'temp-analog'
  | 'ir-obstacle'
  | 'joystick'
  | 'dc-motor'
  | 'stepper'
  | 'oled'

export type ComponentCategory = 'output' | 'input'

export interface ComponentMeta {
  type: ComponentType
  category: ComponentCategory
  label: string
  /** 아이콘 사이드바 타일에 아이콘 밑에 붙는 짧은 이름 — 팔레트 폭이 좁아
   *  label("버튼(누르는 동안)")을 그대로 쓰면 줄이 접힌다. 괄호 안 설명은
   *  타일의 title(툴팁)에 남는다. */
  short: string
  emoji: string
}

export const COMPONENT_LIST: ComponentMeta[] = [
  { type: 'led', category: 'output', label: 'LED', short: 'LED', emoji: '💡' },
  { type: 'rgb-led', category: 'output', label: 'RGB LED', short: 'RGB', emoji: '🌈' },
  { type: 'buzzer', category: 'output', label: '부저', short: '부저', emoji: '🔔' },
  {
    type: 'dc-motor',
    category: 'output',
    label: 'DC 모터 + 드라이버(PWM 속도 · IN1/IN2 방향)',
    short: 'DC모터',
    emoji: '🌀',
  },
  {
    type: 'stepper',
    category: 'output',
    label: '스텝모터 28BYJ-48(디지털 4핀 시퀀스)',
    short: '스텝',
    emoji: '⚙',
  },
  {
    type: 'servo',
    category: 'output',
    label: '서보모터(PWM 50Hz · 0~180도)',
    short: '서보',
    emoji: '⚙️',
  },
  { type: 'button', category: 'input', label: '버튼(누르는 동안)', short: '버튼', emoji: '🔘' },
  { type: 'switch', category: 'input', label: '스위치(클릭해서 토글)', short: '스위치', emoji: '🔀' },
  {
    type: 'potentiometer',
    category: 'input',
    label: '가변저항(노브를 돌려서 조절 · GP26~28에만 연결)',
    short: '가변저항',
    emoji: '🎛️',
  },
  {
    type: 'relay',
    category: 'output',
    label: '릴레이(켜면 접점이 딸깍 붙는다)',
    short: '릴레이',
    emoji: '🔌',
  },
  {
    type: 'vibration',
    category: 'output',
    label: '진동모터',
    short: '진동',
    emoji: '📳',
  },
  {
    type: 'traffic-light',
    category: 'output',
    label: '신호등 LED(빨강·노랑·초록 3핀)',
    short: '신호등',
    emoji: '🚦',
  },
  {
    type: 'pir',
    category: 'input',
    label: 'PIR 인체감지(감지 범위 + 사람까지 거리)',
    short: 'PIR',
    emoji: '🚶',
  },
  {
    type: 'tilt',
    category: 'input',
    label: '틸트 센서(클릭해서 기울이기)',
    short: '틸트',
    emoji: '📐',
  },
  {
    type: 'reed',
    category: 'input',
    label: '리드 스위치(클릭해서 자석 대기)',
    short: '리드',
    emoji: '🧲',
  },
  {
    type: 'neopixel',
    category: 'output',
    label: '네오픽셀 8칸(write() 를 불러야 켜집니다)',
    short: '네오픽셀',
    emoji: '✨',
  },
  {
    type: 'oled',
    category: 'output',
    label: 'OLED SSD1306 128x64(I2C · 주소 0x3C)',
    short: 'OLED',
    emoji: '📺',
  },
  {
    type: 'lcd',
    category: 'output',
    label: 'I2C LCD 1602(16칸 2줄 · 주소 0x27)',
    short: 'LCD',
    emoji: '🖥️',
  },
  {
    type: 'seven-segment',
    category: 'output',
    label: '7세그먼트(획 7개 + 점, 핀 9개)',
    short: '7세그',
    emoji: '🔢',
  },
  {
    type: 'ultrasonic',
    category: 'input',
    label: '초음파 거리센서 HC-SR04(거리 슬라이더)',
    short: '초음파',
    emoji: '📡',
  },
  {
    type: 'dht',
    category: 'input',
    label: '온습도 센서 DHT11(온도·습도 슬라이더)',
    short: '온습도',
    emoji: '🌡️',
  },
  {
    type: 'soil',
    category: 'input',
    label: '토양 수분 센서(ADC · GP26~28)',
    short: '토양',
    emoji: '🪴',
  },
  {
    type: 'rain',
    category: 'input',
    label: '빗물 감지 센서(ADC · GP26~28)',
    short: '빗물',
    emoji: '🌧️',
  },
  {
    type: 'flame',
    category: 'input',
    label: '불꽃 감지 센서(ADC · GP26~28)',
    short: '불꽃',
    emoji: '🔥',
  },
  {
    type: 'temp-analog',
    category: 'input',
    label: '아날로그 온도센서 TMP36(ADC · GP26~28)',
    short: '온도',
    emoji: '🌡',
  },
  {
    type: 'joystick',
    category: 'input',
    label: '조이스틱(ADC 2개 + 누름 버튼)',
    short: '조이스틱',
    emoji: '🕹️',
  },
  {
    type: 'ir-obstacle',
    category: 'input',
    label: 'IR 장애물 감지(클릭해서 켜고 끄기)',
    short: 'IR',
    emoji: '🚧',
  },
  {
    type: 'ldr',
    category: 'input',
    label: '조도센서(밝기 슬라이더 · GP26~28에만 연결)',
    short: '조도',
    emoji: '🔆',
  },
]

export interface PlacedComponent {
  id: string
  type: ComponentType
  x: number
  y: number
  /** LED 알 색(LED_COLORS 의 key). LED 에만 쓴다. 없으면 기본색(빨강) — 이 필드가
   *  생기기 전 저장된 회로도 그대로 읽혀야 하니 optional. */
  color?: string
  /** 0/90/180/270도. 없으면 0(회전 없음)으로 취급 — 이 필드가 생기기 전 저장된
   *  회로(localStorage, EXAMPLES)도 그대로 읽혀야 하니 optional로 둔다. */
  rotation?: 0 | 90 | 180 | 270
  /** 좌우 반전. 다리 순서를 바꾸고 싶을 때 쓴다(예: LED 를 반대로 꽂기).
   *  회전보다 먼저 적용된다 — pinPoint 와 ComponentGlyph 가 같은 순서를 지켜야 한다. */
  flipped?: boolean
}

export type BreadboardSize = 'mini' | 'medium'

export const BREADBOARD_SIZES: { size: BreadboardSize; label: string; short: string; columns: number }[] = [
  { size: 'mini', label: '미니 (10칸)', short: '미니', columns: 10 },
  { size: 'medium', label: '중간 (20칸)', short: '중간', columns: 20 },
]

export interface PlacedBreadboard {
  id: string
  size: BreadboardSize
  x: number
  y: number
  rotation?: 0 | 90 | 180 | 270
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

/**
 * LED 알 색. 실물 LED 도 색마다 알맹이(꺼졌을 때) 색이 다르다 — 빨강 LED 는 분홍빛
 * 반투명, 초록은 연두빛이다. 그래서 꺼진 색과 켜진 색을 짝으로 둔다.
 *
 * 예전엔 LED 가 꺼지면 분홍(#fca5a5), 켜지면 노랑(#fde047) 이었다. 분홍 알에서 노란
 * 빛이 나오는 건 어느 색 LED 도 아니라서, 색을 고를 수 있게 하면서 기본값을 "빨강"
 * (분홍 알 → 빨간 빛)으로 바로잡았다.
 */
export const LED_COLORS: { key: string; name: string; off: string; on: string; glow: string }[] = [
  { key: 'red', name: '빨강', off: '#fca5a5', on: '#ef4444', glow: '#f87171' },
  { key: 'yellow', name: '노랑', off: '#fde68a', on: '#facc15', glow: '#fde047' },
  { key: 'green', name: '초록', off: '#bbf7d0', on: '#22c55e', glow: '#4ade80' },
  { key: 'blue', name: '파랑', off: '#bfdbfe', on: '#3b82f6', glow: '#60a5fa' },
  { key: 'white', name: '흰색', off: '#f5f5f4', on: '#fefce8', glow: '#fef08a' },
]

export function ledColorOf(key: string | undefined) {
  return LED_COLORS.find((c) => c.key === key) ?? LED_COLORS[0]
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

/** point를 pivot의 세로축(x = pivot.x) 기준으로 좌우 반전한다. 회전보다 먼저 건다 —
 *  SVG 쪽 transform 목록도 `rotate(...) scale(-1 1)` 순서라 안쪽(=먼저)이 반전이다. */
export function mirrorX(point: Point, pivotX: number): Point {
  return { x: 2 * pivotX - point.x, y: point.y }
}

/** point를 pivot 기준으로 돌린다(rotateOffset은 항상 원점(0,0) 기준이라, 부품
 *  로컬 원점이 몸통 중심과 다르면 몸통이 궤도를 그리며 빙 돌아버린다 — 실제로
 *  사용자가 "파란 선택 링은 가만있는데 부품이 그 밖으로 돌아나간다"고 지적해서
 *  찾은 문제다). ComponentGlyph/PicoBoard가 여는 SVG `rotate(각도, pivot.x,
 *  pivot.y)`와 정확히 같은 중심을 써야 화면에 보이는 자리와 전선이 붙는 자리가
 *  맞는다. */
export function rotateAround(point: Point, pivot: Point, rotation: number): Point {
  const offset = rotateOffset(point.x - pivot.x, point.y - pivot.y, rotation)
  return { x: pivot.x + offset.x, y: pivot.y + offset.y }
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

/** 가변저항 노브가 돌아가는 범위(도) — 실물 손잡이처럼 한 바퀴를 다 못 돌고
 *  좌우로 135도씩, 합쳐서 270도만 움직인다. 0%가 -135도, 100%가 +135도. */
export const KNOB_SWEEP_DEG = 270

/** 아날로그 입력의 최댓값 — MicroPython 의 ADC.read_u16() 이 0~65535 를 준다. */
export const ADC_MAX = 65535

/**
 * 부품을 그리는 배율. 부품 도형과 핀 좌표(COMPONENT_PINS)는 전부 "원래 크기" 로
 * 적어두고, 화면에 낼 때만 이 값을 곱한다 — 한 군데만 고치면 전 부품이 같이 커진다.
 *
 * 왜 필요했나: 보드가 200x560 인데 부품은 폭 20~64 라 나란히 두면 부품이 부스러기처럼
 * 보였다. 실물 비율로 따지면 오히려 부품이 훨씬 커야 한다 — HC-SR04(45x20mm)는 Pico
 * (51x21mm)와 거의 같은 크기다. 다만 실물 비율을 그대로 쓰면 모듈 하나가 캔버스를
 * 다 먹어서, 눈에 편한 선으로 1.5배를 골랐다.
 */
export const COMPONENT_SCALE = 1.5

/** 부품 종류별로 고정된 핀 이름 + 부품 기준 상대 좌표(원래 크기 기준). */
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
  // 버튼·스위치와 똑같이 "디지털 IN 한 개" 구조라 핀 배치도 같다 — 다른 건 생김새와
  // 조작 방식뿐이다(TOGGLE_INPUT_TYPES 참고).
  pir: [
    { pin: 'a', dx: -16, dy: 52 },
    { pin: 'b', dx: 16, dy: 52 },
  ],
  tilt: [
    { pin: 'a', dx: -14, dy: 46 },
    { pin: 'b', dx: 14, dy: 46 },
  ],
  reed: [
    { pin: 'a', dx: -16, dy: 46 },
    { pin: 'b', dx: 16, dy: 46 },
  ],
  relay: [
    { pin: 'a', dx: -16, dy: 34 },
    { pin: 'b', dx: 16, dy: 34 },
  ],
  vibration: [
    { pin: 'a', dx: -12, dy: 30 },
    { pin: 'b', dx: 12, dy: 30 },
  ],
  // 신호등은 색마다 핀이 하나씩, 접지는 공통이다(실물 3색 LED 모듈과 같다).
  'traffic-light': [
    { pin: 'red', dx: -18, dy: 62 },
    { pin: 'yellow', dx: -6, dy: 62 },
    { pin: 'green', dx: 6, dy: 62 },
    { pin: 'gnd', dx: 18, dy: 62 },
  ],
  // WS2812 스트립 모듈과 같은 3핀. 데이터는 din 한 가닥으로 전부 나간다 — 칸이
  // 여덟이어도 핀이 늘지 않는 게 네오픽셀의 요점이다.
  neopixel: [
    { pin: 'vcc', dx: -24, dy: 40 },
    { pin: 'din', dx: 0, dy: 40 },
    { pin: 'gnd', dx: 24, dy: 40 },
  ],
  // OLED 모듈과 같은 4핀. LCD 와 같은 I2C 버스에 함께 물릴 수도 있다(주소가 다르다).
  oled: [
    { pin: 'gnd', dx: -30, dy: 62 },
    { pin: 'vcc', dx: -10, dy: 62 },
    { pin: 'sda', dx: 10, dy: 62 },
    { pin: 'scl', dx: 30, dy: 62 },
  ],
  // I2C LCD 백팩과 같은 4핀. 선 두 가닥(sda/scl)으로 글자를 다 보낸다.
  lcd: [
    { pin: 'gnd', dx: -30, dy: 60 },
    { pin: 'vcc', dx: -10, dy: 60 },
    { pin: 'sda', dx: 10, dy: 60 },
    { pin: 'scl', dx: 30, dy: 60 },
  ],
  // 획 a~g + 소수점(dp) + 공통 음극. 실물은 핀이 위아래 두 줄이지만 여기선 아래
  // 한 줄로 폈다 — Legs 가 몸통 아래로만 다리를 그리기도 하고, 배선할 때 한쪽만
  // 보면 되는 게 학생한테 낫다.
  'seven-segment': [
    { pin: 'a', dx: -32, dy: 92 },
    { pin: 'b', dx: -24, dy: 92 },
    { pin: 'c', dx: -16, dy: 92 },
    { pin: 'd', dx: -8, dy: 92 },
    { pin: 'e', dx: 0, dy: 92 },
    { pin: 'f', dx: 8, dy: 92 },
    { pin: 'g', dx: 16, dy: 92 },
    { pin: 'dp', dx: 24, dy: 92 },
    { pin: 'common', dx: 32, dy: 92 },
  ],
  // HC-SR04 와 같은 4핀. trig 로 "재라" 신호를 넣고 echo 로 걸린 시간을 받는다.
  ultrasonic: [
    { pin: 'vcc', dx: -24, dy: 52 },
    { pin: 'trig', dx: -8, dy: 52 },
    { pin: 'echo', dx: 8, dy: 52 },
    { pin: 'gnd', dx: 24, dy: 52 },
  ],
  // DHT11 모듈과 같은 3핀(VCC/DATA/GND). 실물 알맹이는 4핀이지만 시중 모듈은 3핀이다.
  dht: [
    { pin: 'vcc', dx: -16, dy: 54 },
    { pin: 'out', dx: 0, dy: 54 },
    { pin: 'gnd', dx: 16, dy: 54 },
  ],
  // 아래 다섯은 전부 조도센서와 같은 3핀 모듈이다 — 시중 키트가 그런 모양으로 판다.
  soil: [
    { pin: 'vcc', dx: -14, dy: 46 },
    { pin: 'out', dx: 0, dy: 46 },
    { pin: 'gnd', dx: 14, dy: 46 },
  ],
  rain: [
    { pin: 'vcc', dx: -14, dy: 46 },
    { pin: 'out', dx: 0, dy: 46 },
    { pin: 'gnd', dx: 14, dy: 46 },
  ],
  flame: [
    { pin: 'vcc', dx: -14, dy: 46 },
    { pin: 'out', dx: 0, dy: 46 },
    { pin: 'gnd', dx: 14, dy: 46 },
  ],
  'temp-analog': [
    { pin: 'vcc', dx: -14, dy: 46 },
    { pin: 'out', dx: 0, dy: 46 },
    { pin: 'gnd', dx: 14, dy: 46 },
  ],
  'ir-obstacle': [
    { pin: 'vcc', dx: -14, dy: 46 },
    { pin: 'out', dx: 0, dy: 46 },
    { pin: 'gnd', dx: 14, dy: 46 },
  ],
  // 실물 조이스틱 모듈과 같은 5핀. VRx/VRy 는 ADC 핀 두 개를 각각 써야 한다 —
  // Pico 에 ADC 가 셋뿐이라는 걸 몸으로 배우는 부품이다.
  joystick: [
    { pin: 'gnd', dx: -32, dy: 52 },
    { pin: 'vcc', dx: -16, dy: 52 },
    { pin: 'vrx', dx: 0, dy: 52 },
    { pin: 'vry', dx: 16, dy: 52 },
    { pin: 'sw', dx: 32, dy: 52 },
  ],
  // 조도센서 모듈(CDS + 저항이 보드에 같이 붙은 형태)과 같은 3핀. 실물 CDS 알맹이만
  // 쓰면 분압 저항을 따로 달아야 하는데, 이 시뮬레이터엔 저항 부품 자체가 없다 —
  // 모듈 형태로 두는 게 학생이 실제로 사는 부품과도 맞고 거짓말도 아니다.
  ldr: [
    { pin: 'vcc', dx: -14, dy: 46 },
    { pin: 'out', dx: 0, dy: 46 },
    { pin: 'gnd', dx: 14, dy: 46 },
  ],
  // 모터 드라이버(L9110/TB6612 계열)와 같은 3핀. ENA 로 속도, IN1/IN2 로 방향.
  'dc-motor': [
    { pin: 'ena', dx: -20, dy: 52 },
    { pin: 'in1', dx: 0, dy: 52 },
    { pin: 'in2', dx: 20, dy: 52 },
  ],
  // 28BYJ-48 + ULN2003 드라이버. 코일 네 개를 순서대로 켜면 축이 한 칸씩 돈다.
  stepper: [
    { pin: 'in1', dx: -24, dy: 56 },
    { pin: 'in2', dx: -8, dy: 56 },
    { pin: 'in3', dx: 8, dy: 56 },
    { pin: 'in4', dx: 24, dy: 56 },
  ],
  // 실물 서보와 같은 3선: 신호(주황), 전원(빨강), 접지(갈색).
  servo: [
    { pin: 'signal', dx: -14, dy: 46 },
    { pin: 'vcc', dx: 0, dy: 46 },
    { pin: 'gnd', dx: 14, dy: 46 },
  ],
  // 실물 가변저항과 같은 3핀: 양끝이 전원/접지, 가운데가 읽어가는 값(와이퍼).
  potentiometer: [
    { pin: 'vcc', dx: -18, dy: 40 },
    { pin: 'out', dx: 0, dy: 40 },
    { pin: 'gnd', dx: 18, dy: 40 },
  ],
}

/** 부품 종류별 "몸통 중심"(회전 중심) — ComponentGlyph의 몸통 도형 좌표와 맞춰
 *  직접 눈으로 재서 정했다. LED/RGB LED/부저는 몸통 원(cy=18)의 중심, 버튼/
 *  스위치는 몸통 사각형(y 0~20)의 중심이다. 여기서 벗어나면 회전할 때 몸통이
 *  선택 링 밖으로 궤도를 그리며 돈다. */
export const COMPONENT_PIVOT: Record<ComponentType, Point> = {
  led: { x: 0, y: 18 },
  'rgb-led': { x: 0, y: 18 },
  buzzer: { x: 0, y: 18 },
  button: { x: 0, y: 10 },
  switch: { x: 0, y: 10 },
  potentiometer: { x: 0, y: 14 },
  servo: { x: 0, y: 14 },
  ldr: { x: 0, y: 16 },
  pir: { x: 0, y: 16 },
  tilt: { x: 0, y: 15 },
  reed: { x: 0, y: 15 },
  relay: { x: 0, y: 16 },
  vibration: { x: 0, y: 14 },
  'traffic-light': { x: 0, y: 28 },
  dht: { x: 0, y: 21 },
  'seven-segment': { x: 0, y: 38 },
  neopixel: { x: 0, y: 14 },
  ultrasonic: { x: 0, y: 20 },
  lcd: { x: 0, y: 24 },
  oled: { x: 0, y: 26 },
  soil: { x: 0, y: 16 },
  rain: { x: 0, y: 16 },
  flame: { x: 0, y: 16 },
  'temp-analog': { x: 0, y: 16 },
  'ir-obstacle': { x: 0, y: 16 },
  joystick: { x: 0, y: 22 },
  'dc-motor': { x: 0, y: 22 },
  stepper: { x: 0, y: 24 },
}

/**
 * 스텝모터가 한 칸(step) 돌 때의 각도. 28BYJ-48 은 감속비까지 합쳐 한 바퀴가 4096
 * 스텝이라 실제로는 훨씬 잘게 도는데, 그대로 그리면 화면에서 움직임이 안 보인다.
 * 여기선 "코일 시퀀스 한 칸 = 눈에 보이는 한 칸" 으로 잡았다 — 순서를 잘못 짜면
 * 안 도는 것을 눈으로 확인하는 게 이 부품의 수업 내용이라, 각도의 정확도보다
 * 그쪽이 중요하다.
 */
export const STEPPER_DEG_PER_STEP = 11.25

/** 코일 네 개 중 지금 켜진 조합이 시퀀스의 몇 번째인지. 아니면 null(잘못된 조합). */
export function stepperPhaseOf(on: boolean[]): number | null {
  const key = on.map((v) => (v ? '1' : '0')).join('')
  // 28BYJ-48 을 반스텝으로 돌릴 때 흔히 쓰는 8단계 순서.
  const sequence = ['1000', '1100', '0100', '0110', '0010', '0011', '0001', '1001']
  const index = sequence.indexOf(key)
  return index >= 0 ? index : null
}

/** 조이스틱 스틱이 움직이는 반경(부품 기준 상대 좌표). 가운데가 50%, 끝이 0%/100%. */
export const JOYSTICK_RADIUS = 15

/**
 * 슬라이더 하나로 ADC 값을 만드는 센서들. 생김새(보드 색·아이콘)와 눈금만 다르고
 * 구조는 전부 같다 — 조도센서를 만들 때 쓴 경로를 그대로 탄다.
 *
 * 온도센서만 값 변환이 다르다. 실물 TMP36 은 0도에서 0.5V, 1도 오를 때마다 10mV 를
 * 내놓는 아날로그 소자라 학생이 그 계산을 직접 해야 한다 — 그게 이 부품의 수업 내용이다.
 * 그래서 여기서도 "온도 → 전압 → ADC 값" 으로 바꿔서 내보낸다.
 */
export interface AnalogSensorMeta {
  /** 슬라이더 옆에 붙는 단위. */
  unit: string
  min: number
  max: number
  /** 보드 색과 센서 알맹이 색. */
  board: string
  accent: string
  /** 슬라이더 값(0~1)을 눈금 값으로. */
  readingOf: (ratio: number) => number
  /** 눈금 값을 실제 ADC 가 읽는 0~65535 로. */
  adcOf: (ratio: number) => number
}

const percentSensor = (board: string, accent: string): AnalogSensorMeta => ({
  unit: '%',
  min: 0,
  max: 100,
  board,
  accent,
  readingOf: (r) => Math.round(r * 100),
  adcOf: (r) => Math.round(r * 65535),
})

export const ANALOG_SENSORS: Partial<Record<ComponentType, AnalogSensorMeta>> = {
  soil: percentSensor('#78350f', '#a16207'),
  rain: percentSensor('#0c4a6e', '#38bdf8'),
  flame: percentSensor('#1c1917', '#f97316'),
  'temp-analog': {
    unit: '°C',
    min: -10,
    max: 50,
    board: '#292524',
    accent: '#f87171',
    readingOf: (r) => Math.round(-10 + r * 60),
    // TMP36: 0도에서 0.5V, 1도당 10mV. Pico ADC 는 3.3V 를 65535 로 읽는다.
    adcOf: (r) => {
      const celsius = -10 + r * 60
      const volts = 0.5 + 0.01 * celsius
      return Math.round(Math.max(0, Math.min(1, volts / 3.3)) * 65535)
    },
  },
}

/** I2C LCD 백팩의 주소. 시중 모듈은 0x27 아니면 0x3F 인데, 여기선 0x27 하나로 둔다. */
export const LCD_I2C_ADDR = 0x27
/** OLED 백팩 주소. 시중 모듈은 0x3C 가 기본이다. */
export const OLED_I2C_ADDR = 0x3c
export const OLED_WIDTH = 128
export const OLED_HEIGHT = 64
export const LCD_COLUMNS = 16
export const LCD_LINES = 2

/** 초음파 거리 슬라이더 범위(cm). 실물 HC-SR04 도 2cm 아래는 못 재고 400cm 쯤이 한계다. */
export const ULTRASONIC_MIN_CM = 2
export const ULTRASONIC_MAX_CM = 200
export function ultrasonicDistance(ratio: number): number {
  return Math.round(ULTRASONIC_MIN_CM + ratio * (ULTRASONIC_MAX_CM - ULTRASONIC_MIN_CM))
}
/** 슬라이더 기본값 — 30cm 쯤에서 시작한다. */
export const ULTRASONIC_DEFAULT_RATIO = (30 - ULTRASONIC_MIN_CM) / (ULTRASONIC_MAX_CM - ULTRASONIC_MIN_CM)

/** 시뮬레이터 네오픽셀 스트립의 칸 수. 코드에서 더 많이 잡아도 여기까지만 보인다. */
export const NEOPIXEL_COUNT = 8

/** 7세그먼트 획 하나하나의 도형. 실물처럼 비스듬히 깎인 막대 대신 둥근 사각형으로
 *  단순화했다 — 캔버스에서 이 크기(48x72)면 깎임은 거의 안 보이고, 좌표만 복잡해진다. */
export const SEVEN_SEGMENT_BARS: { pin: string; x: number; y: number; w: number; h: number }[] = [
  { pin: 'a', x: -12, y: 10, w: 24, h: 5 },
  { pin: 'f', x: -16, y: 14, w: 5, h: 23 },
  { pin: 'b', x: 11, y: 14, w: 5, h: 23 },
  { pin: 'g', x: -12, y: 35, w: 24, h: 5 },
  { pin: 'e', x: -16, y: 38, w: 5, h: 23 },
  { pin: 'c', x: 11, y: 38, w: 5, h: 23 },
  { pin: 'd', x: -12, y: 60, w: 24, h: 5 },
]

/**
 * 온습도 센서 슬라이더가 만드는 값의 범위. 교실에서 그럴듯한 폭으로 잡았다 —
 * 실물 DHT11 스펙은 0~50도 / 20~90% 인데, 영하도 만들어볼 수 있게 -10도까지 준다.
 */
export const DHT_TEMP_MIN = -10
export const DHT_TEMP_MAX = 50
/** 슬라이더 기본값(0~1). 켜자마자 23도 50% 쯤에서 시작하게 한다. */
export const DHT_DEFAULT_TEMP_RATIO = (23 - DHT_TEMP_MIN) / (DHT_TEMP_MAX - DHT_TEMP_MIN)
export const DHT_DEFAULT_HUMIDITY_RATIO = 0.5

export function dhtTemperature(ratio: number): number {
  return Math.round(DHT_TEMP_MIN + ratio * (DHT_TEMP_MAX - DHT_TEMP_MIN))
}
export function dhtHumidity(ratio: number): number {
  return Math.round(ratio * 100)
}

/** 아날로그 조작부가 여러 개인 부품(온습도)이 있어서, 값은 부품 id 가 아니라
 *  "부품 id + 채널" 로 저장한다. 조작부가 하나뿐인 부품은 채널이 'value' 다. */
export type AnalogChannel = 'value' | 'temp' | 'hum' | 'range'
export function analogKey(componentId: string, channel: AnalogChannel = 'value'): string {
  return `${componentId}:${channel}`
}

/**
 * 클릭해서 켜고 끄는 디지털 입력 부품들. 스위치와 회로상 완전히 같다 — 핀 두 개짜리
 * 디지털 IN 이고, 켜져 있는 동안 연결된 GPIO 가 1 로 읽힌다. 다른 건 생김새와 무슨
 * 상황을 흉내 내는지(사람이 지나감 / 기울어짐 / 자석이 붙음)뿐이다.
 */
export const TOGGLE_INPUT_TYPES: ComponentType[] = [
  'switch',
  'pir',
  'tilt',
  'reed',
  'ir-obstacle',
  'joystick',
]

/** 눌린 동안에만 켜지는 입력. 지금은 버튼뿐이지만 목록으로 두면 판단이 한 군데에 모인다. */
export const MOMENTARY_INPUT_TYPES: ComponentType[] = ['button']

export function isDigitalInput(type: ComponentType): boolean {
  return TOGGLE_INPUT_TYPES.includes(type) || MOMENTARY_INPUT_TYPES.includes(type)
}

/**
 * PIR 인체감지 센서. 실물 HC-SR501 에는 감지 거리를 조절하는 가변저항이 달려 있어서
 * 대략 3~7m 사이로 맞춘다. 그래서 여기도 슬라이더가 둘이다 — "이 센서가 얼마나 멀리
 * 까지 보는가(범위)" 와 "지금 사람이 얼마나 떨어져 있는가(거리)".
 * 사람이 범위 안에 들어오면 출력이 켜진다.
 */
export const PIR_MAX_RANGE_M = 7
export const PIR_MAX_DISTANCE_M = 10
/** 기본값: 범위 3m 에 사람은 5m — 켜자마자 "아직 감지 안 됨" 에서 시작한다. */
export const PIR_DEFAULT_RANGE_RATIO = 3 / PIR_MAX_RANGE_M
export const PIR_DEFAULT_DISTANCE_RATIO = 5 / PIR_MAX_DISTANCE_M

export function pirRangeM(ratio: number): number {
  return Math.round(ratio * PIR_MAX_RANGE_M * 10) / 10
}
export function pirDistanceM(ratio: number): number {
  return Math.round(ratio * PIR_MAX_DISTANCE_M * 10) / 10
}

/** 조도센서 밝기 슬라이더의 가로 범위(부품 기준 상대 좌표). */
export const LDR_TRACK_HALF_WIDTH = 18

/**
 * 서보가 알아듣는 펄스 폭(ms) → 각도. SG90 계열 기준으로 0.5ms 가 0도, 2.5ms 가 180도다.
 * 주파수가 아니라 "펄스 폭"으로 계산하는 게 실물과 같은 동작이다 — 그래서 50Hz 가
 * 아닌 주파수를 줘도 거짓말 없이 그 폭에 해당하는 각도(대개 0도에 붙는다)를 보여준다.
 */
export const SERVO_MIN_PULSE_MS = 0.5
export const SERVO_MAX_PULSE_MS = 2.5

/** PWM(주파수 Hz, duty 0~65535)이 서보를 몇 도로 돌리는지. 신호가 없으면 null. */
export function servoAngleFromPwm(pwm: { freq: number; duty: number } | undefined): number | null {
  if (!pwm || pwm.duty <= 0) return null
  const periodMs = 1000 / Math.max(1, pwm.freq)
  const pulseMs = (pwm.duty / 65535) * periodMs
  const ratio = (pulseMs - SERVO_MIN_PULSE_MS) / (SERVO_MAX_PULSE_MS - SERVO_MIN_PULSE_MS)
  return Math.round(Math.max(0, Math.min(1, ratio)) * 180)
}
