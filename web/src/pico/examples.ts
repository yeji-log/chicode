import type { CircuitSnapshot } from './circuit/types'

/** 수업에서 바로 쓰는 예제 코드. 실제 Pico 2 W 보드에서도 그대로 도는 문법을 쓴다. */
export interface Example {
  name: string
  code: string
  /** "예제 불러오기" 를 누르면 코드와 함께 이 회로도 같이 구성된다. */
  circuit: CircuitSnapshot
}

// 보드 핀 id 는 web/src/pico/circuit/board.ts 참고 — L20=GP15, L19=GP14, L18=GND.
const GP15 = 'L20'
const GP14 = 'L19'
const GND = 'L18'

function ledOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'led1', type: 'led', x: 700, y: 90 }],
    breadboards: [{ id: 'bb1', size: 'mini', x: 24, y: 90 }],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'led1', pin: 'cathode' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'led1', pin: 'anode' }, to: { kind: 'board', pinId: GND } },
    ],
  }
}

function ledAndButton(): CircuitSnapshot {
  return {
    components: [
      { id: 'led1', type: 'led', x: 700, y: 90 },
      { id: 'button1', type: 'button', x: 700, y: 200 },
    ],
    breadboards: [{ id: 'bb1', size: 'mini', x: 24, y: 90 }],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'led1', pin: 'cathode' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'led1', pin: 'anode' }, to: { kind: 'board', pinId: GND } },
      { id: 'w3', from: { kind: 'component', componentId: 'button1', pin: 'a' }, to: { kind: 'board', pinId: GP14 } },
      { id: 'w4', from: { kind: 'component', componentId: 'button1', pin: 'b' }, to: { kind: 'board', pinId: GND } },
    ],
  }
}

export const EXAMPLES: Example[] = [
  {
    name: '1. LED 켜고 끄기',
    circuit: ledOnly(),
    code: `from machine import Pin

led = Pin(15, Pin.OUT)

led.value(1)   # 켜기
led.value(0)   # 끄기
`,
  },
  {
    name: '2. LED 깜빡이기',
    circuit: ledOnly(),
    code: `from machine import Pin
import time

led = Pin(15, Pin.OUT)

while True:
    led.toggle()
    time.sleep(0.5)
`,
  },
  {
    name: '3. 버튼 누르면 LED (실시간 반응)',
    circuit: ledAndButton(),
    code: `from machine import Pin
import time

led = Pin(15, Pin.OUT)
button = Pin(14, Pin.IN)

while True:
    if button.value():
        led.on()
    else:
        led.off()
    time.sleep(0.05)
`,
  },
]
