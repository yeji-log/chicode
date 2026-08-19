/** 수업에서 바로 쓰는 예제 코드. 실제 Pico 2 W 보드에서도 그대로 도는 문법을 쓴다. */
export interface Example {
  name: string
  code: string
}

export const EXAMPLES: Example[] = [
  {
    name: '1. LED 켜고 끄기',
    code: `from machine import Pin

led = Pin(15, Pin.OUT)

led.value(1)   # 켜기
led.value(0)   # 끄기
`,
  },
  {
    name: '2. LED 깜빡이기',
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
