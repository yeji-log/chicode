import type { CircuitSnapshot } from './circuit/types'

/** 수업에서 바로 쓰는 예제 코드. 실제 Pico 2 W 보드에서도 그대로 도는 문법을 쓴다. */
export interface Example {
  name: string
  code: string
  /** "예제 불러오기" 를 누르면 코드와 함께 이 회로도 같이 구성된다. */
  circuit: CircuitSnapshot
}

/**
 * 부품을 놓을 자리. 미니 브레드보드(x 24~354)와 Pico 보드(x 640~840) 사이의 빈 칸이다.
 * 예전엔 부품을 보드 몸통 한가운데(x 700)에 뒀는데, 그러면 부품이 보드에 겹쳐 그려진다
 * — 부저 예제를 만들면서 눈으로 보고 알았다. 기존 예제도 전부 그랬다.
 */
const PART_X = 450

// 보드 핀 id 는 web/src/pico/circuit/board.ts 참고 — L20=GP15, L19=GP14, L18=GND.
const GP15 = 'L20'
const GP14 = 'L19'
const GND = 'L18'

function ledOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'led1', type: 'led', x: PART_X, y: 120 }],
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
      { id: 'led1', type: 'led', x: PART_X, y: 120 },
      { id: 'button1', type: 'button', x: PART_X, y: 260 },
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

function buzzerOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'buzzer1', type: 'buzzer', x: PART_X, y: 140 }],
    breadboards: [{ id: 'bb1', size: 'mini', x: 24, y: 90 }],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'buzzer1', pin: 'positive' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'buzzer1', pin: 'negative' }, to: { kind: 'board', pinId: GND } },
    ],
  }
}

function servoOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'servo1', type: 'servo', x: PART_X, y: 150 }],
    breadboards: [{ id: 'bb1', size: 'mini', x: 24, y: 90 }],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'servo1', pin: 'signal' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'servo1', pin: 'gnd' }, to: { kind: 'board', pinId: GND } },
    ],
  }
}

export const EXAMPLES: Example[] = [
  {
    name: '1. LED 켜고 끄기',
    circuit: ledOnly(),
    code: `from machine import Pin
import time

led = Pin(15, Pin.OUT)

led.value(1)   # 켜기
time.sleep(1)  # 1초 기다리기 — 이게 없으면 눈에 안 보인다
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
  {
    name: '4. 부저로 도레미 연주하기',
    circuit: buzzerOnly(),
    code: `from machine import Pin, PWM
import time

buzzer = PWM(Pin(15))

# 도레미파솔라시도 - 음마다 주파수(Hz)가 정해져 있다
notes = [
    ('도', 262), ('레', 294), ('미', 330), ('파', 349),
    ('솔', 392), ('라', 440), ('시', 494), ('높은 도', 523),
]

for name, hz in notes:
    print(name, hz, 'Hz')
    buzzer.freq(hz)        # 음 높이
    buzzer.duty_u16(20000) # 소리 크기 (0이면 무음)
    time.sleep(0.4)

buzzer.deinit()  # 소리 끄기
`,
  },
  {
    name: '5. 서보모터 움직이기',
    circuit: servoOnly(),
    code: `from machine import Pin, PWM
import time

servo = PWM(Pin(15))
servo.freq(50)  # 서보는 50Hz 로 신호를 받는다 (20ms 마다 한 번)

# 함수(def)를 쓰지 않는다 - 함수를 쓰면 실행이 끝난 뒤에야 결과를 볼 수 있어서
# 팔이 움직이는 게 안 보인다 (아래 '무엇이 안 되나요?' 참고)
while True:
    for angle in (0, 90, 180, 90):
        # 0도 = 0.5ms, 180도 = 2.5ms 짜리 펄스
        pulse_ms = 0.5 + (angle / 180) * 2.0
        servo.duty_ns(int(pulse_ms * 1000000))
        print(angle, '도')
        time.sleep(0.8)
`,
  },
]
