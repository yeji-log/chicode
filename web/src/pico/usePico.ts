import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkerRequest, WorkerResponse } from './pico.worker'

export type PicoStatus = 'booting' | 'ready' | 'running' | 'error'

export interface OutputLine {
  id: number
  stream: 'out' | 'err' | 'sys'
  text: string
}

export interface UsePico {
  status: PicoStatus
  output: OutputLine[]
  elapsedMs: number | null
  bootError: string | null
  /** 실행 중인 코드가 GPIO 에 쓴 마지막 값. LED 등을 그릴 때 쓴다. */
  gpio: Map<number, 0 | 1>
  /** PWM 이 걸린 핀의 주파수/듀티. LED 밝기, 부저 음, 서보 각도를 그리는 데 쓴다. */
  pwm: Map<number, { freq: number; duty: number }>
  /** 네오픽셀 핀별 색 목록(CSS 색 문자열). write() 를 부른 시점의 값이다. */
  neopixel: Map<number, string[]>
  /** I2C LCD 화면 글자(sda 핀 → 줄 목록). */
  lcd: Map<number, string[]>
  /** OLED 화면(sda 핀 → 행마다 '0'/'1' 문자열). */
  oled: Map<number, string[]>
  run: (code: string) => void
  stop: () => void
  clearOutput: () => void
  /** 버튼 부품을 누르고/뗄 때 호출한다 — 실행 중인 코드가 실시간으로 볼 수 있다. */
  setButton: (pin: number, pressed: boolean) => void
  /** 가변저항 노브·조도센서 슬라이더를 움직일 때 호출한다(0~65535). setButton 과 같은 경로. */
  setAnalog: (pin: number, value: number) => void
  /** 온습도 센서 슬라이더를 움직일 때 호출한다(온도 ℃, 습도 %). */
  setDht: (pin: number, temperature: number, humidity: number) => void
  /** I2C LCD 목록을 알려준다. scan() 이 무엇을 돌려줘야 하는지 워커가 알아야 한다. */
  setLcdConfig: (screens: { sda: number; addr: number }[]) => void
  /** OLED 목록. LCD 와 같은 이유로 UI 가 알려준다. */
  setOledConfig: (screens: { sda: number; addr: number }[]) => void
  /** 초음파 센서 배선·거리를 알려준다. 워커가 trig 를 보고 echo 펄스를 만들어야 해서
   *  값 하나가 아니라 목록 통째로 보낸다. */
  setUltrasonic: (sensors: { trig: number; echo: number; distanceCm: number }[]) => void
}

/**
 * usePython/useC 와 같은 모양을 유지한다. 다른 점은 GPIO 상태(gpio)와 버튼 입력(setButton) —
 * Pico 는 "실행하고 결과만 보기"가 아니라 실행 도중에도 상호작용해야 하기 때문이다.
 */
export function usePico(): UsePico {
  const workerRef = useRef<Worker | null>(null)
  const lineId = useRef(0)

  /**
   * 워커에 보낸 "장치 상태" 를 마지막 것만 들고 있다가, 워커가 새로 생기면 다시 보낸다.
   *
   * 두 가지를 고친다.
   * 1) 첫 렌더에서 회로 쪽 effect 가 워커 생성 effect 보다 먼저 돈다(자식 effect 가
   *    부모보다 먼저다). 그래서 배선 설정이 workerRef.current === null 인 채로 나가
   *    조용히 버려졌다 — LCD 가 scan() 에서 빈 배열을 받은 게 이것 때문이다.
   * 2) 중지하면 워커를 통째로 새로 띄우는데, 그때도 배선·슬라이더 값이 전부 날아갔다.
   *    다음에 슬라이더를 건드릴 때까지 센서가 죽은 것처럼 보인다.
   *
   * 키는 "같은 대상의 최신 값만 남기면 되는" 단위로 잡는다(핀별 버튼/아날로그,
   * 그리고 목록 통째로 오는 초음파·LCD).
   */
  const deviceStateRef = useRef(new Map<string, WorkerRequest>())

  const send = useCallback((key: string, request: WorkerRequest) => {
    deviceStateRef.current.set(key, request)
    workerRef.current?.postMessage(request)
  }, [])

  const [status, setStatus] = useState<PicoStatus>('booting')
  const [output, setOutput] = useState<OutputLine[]>([])
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [gpio, setGpio] = useState<Map<number, 0 | 1>>(new Map())
  const [pwm, setPwm] = useState<Map<number, { freq: number; duty: number }>>(new Map())
  const [neopixel, setNeopixel] = useState<Map<number, string[]>>(new Map())
  const [lcd, setLcd] = useState<Map<number, string[]>>(new Map())
  const [oled, setOled] = useState<Map<number, string[]>>(new Map())

  const append = useCallback((stream: OutputLine['stream'], text: string) => {
    setOutput((prev) => [...prev, { id: lineId.current++, stream, text }])
  }, [])

  const spawnWorker = useCallback(() => {
    const worker = new Worker(new URL('./pico.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      switch (message.type) {
        case 'ready':
          setStatus('ready')
          break
        case 'boot-error':
          setStatus('error')
          setBootError(message.message)
          break
        case 'stdout':
          append('out', message.text)
          break
        case 'stderr':
          append('err', message.text)
          break
        case 'gpio':
          // 같은 핀에 PWM 이 걸려 있었다면 그건 이제 무효다(반대 방향은 워커의
          // pwm_set 이 gpioOut 을 지우는 것으로 처리한다).
          setPwm((prev) => {
            if (!prev.has(message.pin)) return prev
            const next = new Map(prev)
            next.delete(message.pin)
            return next
          })
          setGpio((prev) => new Map(prev).set(message.pin, message.value))
          break
        case 'pwm':
          setGpio((prev) => {
            if (!prev.has(message.pin)) return prev
            const next = new Map(prev)
            next.delete(message.pin)
            return next
          })
          setPwm((prev) => new Map(prev).set(message.pin, { freq: message.freq, duty: message.duty }))
          break
        case 'neopixel':
          setNeopixel((prev) => new Map(prev).set(message.pin, message.colors))
          break
        case 'lcd':
          setLcd((prev) => new Map(prev).set(message.sda, message.lines))
          break
        case 'oled':
          setOled((prev) => new Map(prev).set(message.sda, message.rows))
          break
        case 'done':
          if (!message.ok && message.error) append('err', message.error)
          if (!message.interactive) {
            append(
              'sys',
              '이 코드는 함수(def)를 사용해서, 실행 중 버튼 반응은 보장되지 않습니다. (실행 결과만 확인할 수 있어요)',
            )
          }
          setElapsedMs(message.elapsedMs)
          setStatus('ready')
          break
      }
    }

    workerRef.current = worker
    // 새 워커는 아무것도 모르는 상태다 — 지금까지의 배선·슬라이더 값을 다시 알려준다.
    for (const request of deviceStateRef.current.values()) worker.postMessage(request)
    return worker
  }, [append])

  useEffect(() => {
    const worker = spawnWorker()
    return () => {
      worker.terminate()
      workerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = useCallback(
    (code: string) => {
      const worker = workerRef.current
      if (!worker || status === 'running' || status === 'error') return

      setOutput([])
      setElapsedMs(null)
      setGpio(new Map())
      setPwm(new Map())
      setNeopixel(new Map())
      setLcd(new Map())
      setOled(new Map())
      setStatus('running')

      const request: WorkerRequest = { type: 'run', code }
      worker.postMessage(request)
    },
    [status],
  )

  /** 무한 루프는 안에서 멈출 방법이 없다. 워커째로 끊고 새로 띄운다(Python/C 랩과 동일). */
  const stop = useCallback(() => {
    workerRef.current?.terminate()
    // 워커를 끊으면 코드는 멈추지만 마지막 GPIO/PWM 값은 그대로 남아 있었다 — LED 가
    // 켜진 채로 굳고, PWM 부저는 소리가 계속 울린다. 보드를 끈 것과 같으니 여기서 비운다.
    setGpio(new Map())
    setPwm(new Map())
    setNeopixel(new Map())
    setLcd(new Map())
    setOled(new Map())
    append('sys', '실행을 중지했습니다.')
    setStatus('booting')
    spawnWorker()
  }, [append, spawnWorker])

  const clearOutput = useCallback(() => {
    setOutput([])
    setElapsedMs(null)
  }, [])

  const setButton = useCallback(
    (pin: number, pressed: boolean) => send(`button:${pin}`, { type: 'button', pin, pressed }),
    [send],
  )

  const setAnalog = useCallback(
    (pin: number, value: number) => send(`analog:${pin}`, { type: 'analog', pin, value }),
    [send],
  )

  const setDht = useCallback(
    (pin: number, temperature: number, humidity: number) =>
      send(`dht:${pin}`, { type: 'dht', pin, temperature, humidity }),
    [send],
  )

  const setUltrasonic = useCallback(
    (sensors: { trig: number; echo: number; distanceCm: number }[]) =>
      send('ultrasonic', { type: 'ultrasonic', sensors }),
    [send],
  )

  const setLcdConfig = useCallback(
    (screens: { sda: number; addr: number }[]) => send('lcd-config', { type: 'lcd-config', screens }),
    [send],
  )

  const setOledConfig = useCallback(
    (screens: { sda: number; addr: number }[]) => send('oled-config', { type: 'oled-config', screens }),
    [send],
  )

  return {
    status,
    output,
    elapsedMs,
    bootError,
    gpio,
    pwm,
    neopixel,
    lcd,
    oled,
    run,
    stop,
    clearOutput,
    setButton,
    setAnalog,
    setDht,
    setUltrasonic,
    setLcdConfig,
    setOledConfig,
  }
}
