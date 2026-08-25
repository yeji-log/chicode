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

/**
 * GND 를 모으는 브레드보드. 부품이 둘 이상인 예제에서만 쓴다 — 여러 부품의 접지를
 * − 레일 한 줄에 모으고, 레일에서 보드로 한 줄만 나간다. 이게 브레드보드의 본래
 * 용도이고 "같은 줄 = 같은 노드" 규칙을 눈으로 보여주는 자리다.
 *
 * 부품이 하나뿐인 예제에는 아예 안 놓는다. 예전엔 모든 예제에 브레드보드를 깔아뒀는데
 * 정작 전선이 하나도 안 붙어 있어서, 쓰는 것처럼 보이기만 하고 실제로는 장식이었다.
 */
const SHARED_BREADBOARD = { id: 'bb1', size: 'mini', x: 150, y: 330 } as const
/** 브레드보드 − 레일의 col 번째 구멍. 부품마다 다른 구멍에 꽂는다 — 실제 레일도
 *  구멍이 여러 개고, 한 구멍에 여러 선을 몰아 꽂으면 보기도 어렵고 배선을 배우는
 *  의미도 없다(전기적으로는 같은 레일이면 어느 구멍이든 한 노드다). */
const minusRail = (col: number) =>
  ({ kind: 'breadboardRail', boardId: 'bb1', rail: 'minus', col }) as const

// 보드 핀 id 는 web/src/pico/circuit/board.ts 참고 — L20=GP15, L19=GP14, L18=GND.
const GP15 = 'L20'
const GP14 = 'L19'
const GND = 'L18'
// 아래 예제들이 쓰는 나머지 핀. 왼쪽 열은 L1~L20(위→아래), 오른쪽 열은 R21~R40
// (아래→위)이다 — board.ts 의 라벨 배열과 같은 순서다.
const GP0 = 'L1'
const GP1 = 'L2'
const GP2 = 'L4'
const GP3 = 'L5'
const GP4 = 'L6'
const GP5 = 'L7'
const GP6 = 'L9'
const GP13 = 'L17'
const GP16 = 'R21'
const GP17 = 'R22'
// GP26 은 오른쪽 열이다 — 아래에서 위로 세는 자리라 id 가 R31 이다(board.ts 참고).
const GP26 = 'R31'
const GP27 = 'R32'

function ledOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'led1', type: 'led', x: PART_X, y: 120 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'led1', pin: 'cathode' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'led1', pin: 'anode' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function ledAndButton(): CircuitSnapshot {
  return {
    components: [
      { id: 'led1', type: 'led', x: PART_X, y: 120 },
      { id: 'button1', type: 'button', x: PART_X, y: 260 },
    ],
    breadboards: [SHARED_BREADBOARD],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'led1', pin: 'cathode' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'led1', pin: 'anode' }, to: minusRail(1), color: '#1f2937' },
      { id: 'w3', from: { kind: 'component', componentId: 'button1', pin: 'a' }, to: { kind: 'board', pinId: GP14 } },
      { id: 'w4', from: { kind: 'component', componentId: 'button1', pin: 'b' }, to: minusRail(4), color: '#1f2937' },
      { id: 'w5', from: minusRail(8), to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function buzzerOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'buzzer1', type: 'buzzer', x: PART_X, y: 140 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'buzzer1', pin: 'positive' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'buzzer1', pin: 'negative' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function servoOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'servo1', type: 'servo', x: PART_X, y: 150 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'servo1', pin: 'signal' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'servo1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function ldrAndLed(): CircuitSnapshot {
  return {
    components: [
      { id: 'ldr1', type: 'ldr', x: PART_X, y: 90 },
      { id: 'led1', type: 'led', x: PART_X, y: 240 },
    ],
    breadboards: [SHARED_BREADBOARD],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'ldr1', pin: 'out' }, to: { kind: 'board', pinId: GP26 } },
      { id: 'w2', from: { kind: 'component', componentId: 'ldr1', pin: 'gnd' }, to: minusRail(1), color: '#1f2937' },
      { id: 'w3', from: { kind: 'component', componentId: 'led1', pin: 'anode' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w4', from: { kind: 'component', componentId: 'led1', pin: 'cathode' }, to: minusRail(4), color: '#1f2937' },
      { id: 'w5', from: minusRail(8), to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function potAndLed(): CircuitSnapshot {
  return {
    components: [
      { id: 'pot1', type: 'potentiometer', x: PART_X, y: 90 },
      { id: 'led1', type: 'led', x: PART_X, y: 250 },
    ],
    breadboards: [SHARED_BREADBOARD],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'pot1', pin: 'out' }, to: { kind: 'board', pinId: GP26 } },
      { id: 'w2', from: { kind: 'component', componentId: 'pot1', pin: 'gnd' }, to: minusRail(1), color: '#1f2937' },
      { id: 'w3', from: { kind: 'component', componentId: 'led1', pin: 'anode' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w4', from: { kind: 'component', componentId: 'led1', pin: 'cathode' }, to: minusRail(4), color: '#1f2937' },
      { id: 'w5', from: minusRail(8), to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function trafficLight(): CircuitSnapshot {
  return {
    components: [{ id: 'tl1', type: 'traffic-light', x: PART_X, y: 110 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'tl1', pin: 'red' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w2', from: { kind: 'component', componentId: 'tl1', pin: 'yellow' }, to: { kind: 'board', pinId: GP16 } },
      { id: 'w3', from: { kind: 'component', componentId: 'tl1', pin: 'green' }, to: { kind: 'board', pinId: GP17 } },
      { id: 'w4', from: { kind: 'component', componentId: 'tl1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function pirAndRelay(): CircuitSnapshot {
  return {
    components: [
      { id: 'pir1', type: 'pir', x: PART_X, y: 90 },
      { id: 'relay1', type: 'relay', x: PART_X, y: 250 },
    ],
    breadboards: [SHARED_BREADBOARD],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'pir1', pin: 'a' }, to: { kind: 'board', pinId: GP14 } },
      { id: 'w2', from: { kind: 'component', componentId: 'pir1', pin: 'b' }, to: minusRail(1), color: '#1f2937' },
      { id: 'w3', from: { kind: 'component', componentId: 'relay1', pin: 'a' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w4', from: { kind: 'component', componentId: 'relay1', pin: 'b' }, to: minusRail(4), color: '#1f2937' },
      { id: 'w5', from: minusRail(8), to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function rgbLed(): CircuitSnapshot {
  return {
    components: [{ id: 'rgb1', type: 'rgb-led', x: PART_X, y: 130 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'rgb1', pin: 'r' }, to: { kind: 'board', pinId: GP13 } },
      { id: 'w2', from: { kind: 'component', componentId: 'rgb1', pin: 'g' }, to: { kind: 'board', pinId: GP14 } },
      { id: 'w3', from: { kind: 'component', componentId: 'rgb1', pin: 'b' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w4', from: { kind: 'component', componentId: 'rgb1', pin: 'common' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function tiltAndBuzzer(): CircuitSnapshot {
  return {
    components: [
      { id: 'tilt1', type: 'tilt', x: PART_X, y: 90 },
      { id: 'buzzer1', type: 'buzzer', x: PART_X, y: 250 },
      { id: 'vib1', type: 'vibration', x: PART_X + 130, y: 250 },
    ],
    breadboards: [SHARED_BREADBOARD],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'tilt1', pin: 'a' }, to: { kind: 'board', pinId: GP14 } },
      { id: 'w2', from: { kind: 'component', componentId: 'tilt1', pin: 'b' }, to: minusRail(1), color: '#1f2937' },
      { id: 'w3', from: { kind: 'component', componentId: 'buzzer1', pin: 'positive' }, to: { kind: 'board', pinId: GP15 } },
      { id: 'w4', from: { kind: 'component', componentId: 'buzzer1', pin: 'negative' }, to: minusRail(3), color: '#1f2937' },
      { id: 'w5', from: { kind: 'component', componentId: 'vib1', pin: 'a' }, to: { kind: 'board', pinId: GP16 } },
      { id: 'w6', from: { kind: 'component', componentId: 'vib1', pin: 'b' }, to: minusRail(5), color: '#1f2937' },
      { id: 'w7', from: minusRail(8), to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function dhtOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'dht1', type: 'dht', x: PART_X, y: 130 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'dht1', pin: 'out' }, to: { kind: 'board', pinId: GP14 } },
      { id: 'w2', from: { kind: 'component', componentId: 'dht1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function sevenSegment(): CircuitSnapshot {
  // 획 7개를 GP0~GP6 에 하나씩. 배선이 8줄이라 예제로 미리 이어둔다 — 손으로 다
  // 긋게 하면 그것만 한 시간이다(틀린 줄은 전선 끝을 끌어서 옮기면 된다).
  const segments: [string, string][] = [
    ['a', GP0],
    ['b', GP1],
    ['c', GP2],
    ['d', GP3],
    ['e', GP4],
    ['f', GP5],
    ['g', GP6],
  ]
  return {
    components: [{ id: 'seg1', type: 'seven-segment', x: PART_X, y: 110 }],
    breadboards: [],
    wires: [
      ...segments.map(([pin, boardPin], i) => ({
        id: `w${i + 1}`,
        from: { kind: 'component' as const, componentId: 'seg1', pin },
        to: { kind: 'board' as const, pinId: boardPin },
        color: '#dc2626',
      })),
      {
        id: 'w8',
        from: { kind: 'component', componentId: 'seg1', pin: 'common' },
        to: { kind: 'board', pinId: GND },
        color: '#1f2937',
      },
    ],
  }
}

function neopixelStrip(): CircuitSnapshot {
  return {
    components: [{ id: 'np1', type: 'neopixel', x: PART_X, y: 140 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'np1', pin: 'din' }, to: { kind: 'board', pinId: GP0 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'np1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function ultrasonicOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'us1', type: 'ultrasonic', x: PART_X, y: 130 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'us1', pin: 'trig' }, to: { kind: 'board', pinId: GP3 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'us1', pin: 'echo' }, to: { kind: 'board', pinId: GP2 }, color: '#eab308' },
      { id: 'w3', from: { kind: 'component', componentId: 'us1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function lcdOnly(): CircuitSnapshot {
  return {
    components: [{ id: 'lcd1', type: 'lcd', x: PART_X, y: 120 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'lcd1', pin: 'sda' }, to: { kind: 'board', pinId: GP0 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'lcd1', pin: 'scl' }, to: { kind: 'board', pinId: GP1 }, color: '#eab308' },
      { id: 'w3', from: { kind: 'component', componentId: 'lcd1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function soilAndBuzzer(): CircuitSnapshot {
  return {
    components: [
      { id: 'soil1', type: 'soil', x: PART_X, y: 90 },
      { id: 'buzzer1', type: 'buzzer', x: PART_X, y: 250 },
    ],
    breadboards: [SHARED_BREADBOARD],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'soil1', pin: 'out' }, to: { kind: 'board', pinId: GP26 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'soil1', pin: 'gnd' }, to: minusRail(1), color: '#1f2937' },
      { id: 'w3', from: { kind: 'component', componentId: 'buzzer1', pin: 'positive' }, to: { kind: 'board', pinId: GP15 }, color: '#dc2626' },
      { id: 'w4', from: { kind: 'component', componentId: 'buzzer1', pin: 'negative' }, to: minusRail(4), color: '#1f2937' },
      { id: 'w5', from: minusRail(8), to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function tempAnalog(): CircuitSnapshot {
  return {
    components: [{ id: 'temp1', type: 'temp-analog', x: PART_X, y: 130 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'temp1', pin: 'out' }, to: { kind: 'board', pinId: GP26 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'temp1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function joystick(): CircuitSnapshot {
  return {
    components: [{ id: 'joy1', type: 'joystick', x: PART_X, y: 130 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'joy1', pin: 'vrx' }, to: { kind: 'board', pinId: GP26 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'joy1', pin: 'vry' }, to: { kind: 'board', pinId: GP27 }, color: '#eab308' },
      { id: 'w3', from: { kind: 'component', componentId: 'joy1', pin: 'sw' }, to: { kind: 'board', pinId: GP15 }, color: '#16a34a' },
      { id: 'w4', from: { kind: 'component', componentId: 'joy1', pin: 'gnd' }, to: { kind: 'board', pinId: GND }, color: '#1f2937' },
    ],
  }
}

function dcMotor(): CircuitSnapshot {
  return {
    components: [{ id: 'dc1', type: 'dc-motor', x: PART_X, y: 130 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'dc1', pin: 'ena' }, to: { kind: 'board', pinId: GP15 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'dc1', pin: 'in1' }, to: { kind: 'board', pinId: GP16 }, color: '#eab308' },
      { id: 'w3', from: { kind: 'component', componentId: 'dc1', pin: 'in2' }, to: { kind: 'board', pinId: GP17 }, color: '#16a34a' },
    ],
  }
}

function stepper(): CircuitSnapshot {
  return {
    components: [{ id: 'st1', type: 'stepper', x: PART_X, y: 120 }],
    breadboards: [],
    wires: [
      { id: 'w1', from: { kind: 'component', componentId: 'st1', pin: 'in1' }, to: { kind: 'board', pinId: GP0 }, color: '#dc2626' },
      { id: 'w2', from: { kind: 'component', componentId: 'st1', pin: 'in2' }, to: { kind: 'board', pinId: GP1 }, color: '#eab308' },
      { id: 'w3', from: { kind: 'component', componentId: 'st1', pin: 'in3' }, to: { kind: 'board', pinId: GP2 }, color: '#16a34a' },
      { id: 'w4', from: { kind: 'component', componentId: 'st1', pin: 'in4' }, to: { kind: 'board', pinId: GP3 }, color: '#2563eb' },
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
  {
    name: '6. 어두우면 불 켜기 (조도센서)',
    circuit: ldrAndLed(),
    code: `from machine import Pin, ADC
import time

cds = ADC(Pin(26))   # 조도센서는 ADC 핀(GP26~28)에만 연결된다
led = Pin(15, Pin.OUT)

while True:
    light = cds.read_u16()      # 0(어두움) ~ 65535(밝음)
    percent = light * 100 // 65535
    print('밝기', percent, '%')

    if percent < 30:            # 어두우면
        led.on()
    else:
        led.off()

    time.sleep(0.3)
`,
  },
  {
    name: '7. 가변저항으로 LED 밝기 조절',
    circuit: potAndLed(),
    code: `from machine import Pin, ADC, PWM
import time

knob = ADC(Pin(26))    # 가변저항 - 노브를 돌려서 값을 바꾼다
led = PWM(Pin(15))     # LED - 켜고 끄는 게 아니라 밝기로
led.freq(1000)

while True:
    value = knob.read_u16()   # 0 ~ 65535
    led.duty_u16(value)       # 읽은 값을 그대로 밝기로
    print('노브', value * 100 // 65535, '%')
    time.sleep(0.1)
`,
  },
  {
    name: '8. 신호등 만들기',
    circuit: trafficLight(),
    code: `from machine import Pin
import time

red = Pin(15, Pin.OUT)
yellow = Pin(16, Pin.OUT)
green = Pin(17, Pin.OUT)

while True:
    # 초록 5초
    green.on()
    print('초록 - 건너세요')
    time.sleep(5)
    green.off()

    # 노랑 2초 (깜빡깜빡)
    print('노랑 - 곧 바뀝니다')
    for i in range(4):
        yellow.on()
        time.sleep(0.25)
        yellow.off()
        time.sleep(0.25)

    # 빨강 5초
    red.on()
    print('빨강 - 멈추세요')
    time.sleep(5)
    red.off()
`,
  },
  {
    name: '9. 사람이 오면 불 켜기 (PIR + 릴레이)',
    circuit: pirAndRelay(),
    code: `from machine import Pin
import time

pir = Pin(14, Pin.IN)       # 인체감지 센서
                            # 파란 슬라이더로 사람을 가까이/멀리,
                            # 빨간 슬라이더로 센서의 감지 범위를 바꿔 보세요
relay = Pin(15, Pin.OUT)    # 릴레이 - 진짜 전등을 켜는 스위치

while True:
    if pir.value():
        relay.on()
        print('사람 발견! 불 켬')
    else:
        relay.off()
        print('아무도 없음')
    time.sleep(0.3)
`,
  },
  {
    name: '10. RGB LED로 색 섞기',
    circuit: rgbLed(),
    code: `from machine import Pin
import time

red = Pin(13, Pin.OUT)
green = Pin(14, Pin.OUT)
blue = Pin(15, Pin.OUT)

# 빨강+초록=노랑, 빨강+파랑=분홍, 초록+파랑=하늘색, 셋 다=흰색
colors = [
    ('빨강', 1, 0, 0), ('초록', 0, 1, 0), ('파랑', 0, 0, 1),
    ('노랑', 1, 1, 0), ('분홍', 1, 0, 1), ('하늘색', 0, 1, 1),
    ('흰색', 1, 1, 1),
]

while True:
    for name, r, g, b in colors:
        red.value(r)
        green.value(g)
        blue.value(b)
        print(name)
        time.sleep(0.7)
`,
  },
  {
    name: '11. 기울이면 알려주기 (틸트 + 부저 + 진동)',
    circuit: tiltAndBuzzer(),
    code: `from machine import Pin, PWM
import time

tilt = Pin(14, Pin.IN)       # 기울기 센서 (눌러서 기울이기)
buzzer = PWM(Pin(15))
buzzer.freq(880)
motor = Pin(16, Pin.OUT)     # 진동모터

while True:
    if tilt.value():
        buzzer.duty_u16(20000)   # 소리 켜기
        motor.on()
        print('기울어졌어요!')
    else:
        buzzer.duty_u16(0)       # 소리 끄기
        motor.off()
        print('똑바로')
    time.sleep(0.2)
`,
  },
  {
    name: '12. 온습도 재기 (DHT11)',
    circuit: dhtOnly(),
    code: `import dht
from machine import Pin
import time

sensor = dht.DHT11(Pin(14))   # 센서의 빨간·파란 슬라이더를 움직여 보세요

while True:
    sensor.measure()                # 센서에게 "지금 재줘" 라고 시킨다
    t = sensor.temperature()        # 섭씨 온도
    h = sensor.humidity()           # 습도 %

    print(t, '도 /', h, '%')

    if t >= 28:
        print('  더워요!')
    elif t <= 10:
        print('  추워요!')

    time.sleep(1)
`,
  },
  {
    name: '13. 7세그먼트로 숫자 세기',
    circuit: sevenSegment(),
    code: `from machine import Pin
import time

# 획 하나에 핀 하나씩. a b c d e f g 순서로 GP0~GP6 에 이어져 있다
pins = [Pin(0, Pin.OUT), Pin(1, Pin.OUT), Pin(2, Pin.OUT), Pin(3, Pin.OUT),
        Pin(4, Pin.OUT), Pin(5, Pin.OUT), Pin(6, Pin.OUT)]
names = 'abcdefg'

# 숫자마다 켜야 할 획들 (0 은 가운데 g 만 빼고 전부)
shapes = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg',
          'acdefg', 'abc', 'abcdefg', 'abcdfg']

while True:
    for n in range(10):
        shape = shapes[n]
        for i in range(7):
            pins[i].value(1 if names[i] in shape else 0)
        print(n)
        time.sleep(0.8)
`,
  },
  {
    name: '14. 네오픽셀 무지개',
    circuit: neopixelStrip(),
    code: `import neopixel
from machine import Pin
import time

np = neopixel.NeoPixel(Pin(0), 8)   # 선 한 가닥으로 8칸을 다 다룬다

rainbow = [
    (255, 0, 0), (255, 100, 0), (255, 255, 0), (0, 255, 0),
    (0, 255, 255), (0, 0, 255), (150, 0, 255), (255, 0, 150),
]

step = 0
while True:
    for i in range(8):
        np[i] = rainbow[(i + step) % 8]
    np.write()          # 이걸 불러야 실제로 색이 나간다!
    print('무지개', step)
    step = step + 1
    time.sleep(0.3)
`,
  },
  {
    name: '15. 초음파로 거리 재기',
    circuit: ultrasonicOnly(),
    code: `from machine import Pin, time_pulse_us
import time

trig = Pin(3, Pin.OUT)
echo = Pin(2, Pin.IN)

while True:
    # 1) trig 에 10us 짜리 짧은 펄스를 넣어 "재라" 고 시킨다
    trig.value(0)
    time.sleep_us(2)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)

    # 2) echo 가 HIGH 인 시간을 잰다 (소리가 갔다 오는 시간)
    us = time_pulse_us(echo, 1, 30000)

    if us < 0:
        print('신호를 못 받았어요 (배선을 확인하세요)')
    else:
        cm = us / 58          # 소리는 1cm 왕복에 58us 걸린다
        print(round(cm), 'cm')
        if cm < 15:
            print('  너무 가까워요!')

    time.sleep(0.4)
`,
  },
  {
    name: '16. LCD 화면에 글자 띄우기',
    circuit: lcdOnly(),
    code: `from machine import Pin, I2C
from pico_i2c_lcd import I2cLcd
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
print('찾은 주소:', [hex(a) for a in i2c.scan()])

lcd = I2cLcd(i2c, 0x27, 2, 16)   # 2줄 16칸

lcd.putstr('Hello CHICODE!')
lcd.move_to(0, 1)                # 둘째 줄 맨 앞으로
lcd.putstr('Pico 2 W')
time.sleep(2)

count = 0
while True:
    lcd.clear()
    lcd.putstr('count = ' + str(count))
    lcd.move_to(0, 1)
    lcd.putstr('*' * (count % 16))
    print('count', count)
    count = count + 1
    time.sleep(0.6)
`,
  },
  {
    name: '17. 흙이 마르면 알려주기 (토양 수분)',
    circuit: soilAndBuzzer(),
    code: `from machine import Pin, ADC, PWM
import time

soil = ADC(Pin(26))       # 토양 수분 센서 - 슬라이더로 흙을 적셔 보세요
buzzer = PWM(Pin(15))
buzzer.freq(660)

while True:
    wet = soil.read_u16() * 100 // 65535
    print('수분', wet, '%')

    if wet < 30:
        print('  목말라요! 물 주세요')
        buzzer.duty_u16(15000)
    else:
        buzzer.duty_u16(0)

    time.sleep(0.5)
`,
  },
  {
    name: '18. 아날로그 온도센서 읽기 (TMP36)',
    circuit: tempAnalog(),
    code: `from machine import Pin, ADC
import time

sensor = ADC(Pin(26))

while True:
    raw = sensor.read_u16()          # 0 ~ 65535
    volts = raw * 3.3 / 65535        # 몇 볼트인지로 바꾸고
    celsius = (volts - 0.5) * 100    # TMP36 은 0도에서 0.5V, 1도당 10mV

    print(raw, '->', round(volts, 2), 'V ->', round(celsius, 1), '도')
    time.sleep(0.5)
`,
  },
  {
    name: '19. 조이스틱으로 방향 읽기',
    circuit: joystick(),
    code: `from machine import Pin, ADC
import time

# 축 하나에 ADC 핀 하나씩. Pico 의 ADC 는 GP26, GP27, GP28 세 개뿐이다
x_axis = ADC(Pin(26))
y_axis = ADC(Pin(27))
button = Pin(15, Pin.IN)

while True:
    x = x_axis.read_u16() * 100 // 65535   # 0(왼쪽) ~ 100(오른쪽)
    y = y_axis.read_u16() * 100 // 65535   # 0(아래)  ~ 100(위)

    방향 = ''
    if y > 70:
        방향 = '위'
    elif y < 30:
        방향 = '아래'
    elif x > 70:
        방향 = '오른쪽'
    elif x < 30:
        방향 = '왼쪽'
    else:
        방향 = '가운데'

    if button.value():
        방향 = 방향 + ' + 누름'

    print(x, y, 방향)
    time.sleep(0.3)
`,
  },
  {
    name: '20. DC 모터 속도와 방향',
    circuit: dcMotor(),
    code: `from machine import Pin, PWM
import time

speed = PWM(Pin(15))    # ENA - 얼마나 빠르게
speed.freq(1000)
in1 = Pin(16, Pin.OUT)  # IN1, IN2 - 어느 쪽으로
in2 = Pin(17, Pin.OUT)

while True:
    # 정방향으로 천천히 → 빠르게
    in1.on()
    in2.off()
    for duty in (20000, 40000, 65535):
        speed.duty_u16(duty)
        print('정방향', duty * 100 // 65535, '%')
        time.sleep(1)

    # 역방향
    in1.off()
    in2.on()
    speed.duty_u16(40000)
    print('역방향')
    time.sleep(2)

    # 둘 다 켜면 브레이크
    in1.on()
    in2.on()
    print('정지')
    time.sleep(1)
`,
  },
  {
    name: '21. 스텝모터 한 칸씩 돌리기',
    circuit: stepper(),
    code: `from machine import Pin
import time

coils = [Pin(0, Pin.OUT), Pin(1, Pin.OUT), Pin(2, Pin.OUT), Pin(3, Pin.OUT)]

# 코일을 이 순서대로 켜면 축이 한 칸씩 돈다. 순서를 뒤집으면 반대로 돈다
sequence = [
    [1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0],
    [0, 0, 1, 0], [0, 0, 1, 1], [0, 0, 0, 1], [1, 0, 0, 1],
]

step = 0
while True:
    pattern = sequence[step % 8]
    for i in range(4):
        coils[i].value(pattern[i])
    print('step', step)
    step = step + 1
    time.sleep(0.15)
`,
  },
]
