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
  run: (code: string) => void
  stop: () => void
  clearOutput: () => void
  /** 버튼 부품을 누르고/뗄 때 호출한다 — 실행 중인 코드가 실시간으로 볼 수 있다. */
  setButton: (pin: number, pressed: boolean) => void
}

/**
 * usePython/useC 와 같은 모양을 유지한다. 다른 점은 GPIO 상태(gpio)와 버튼 입력(setButton) —
 * Pico 는 "실행하고 결과만 보기"가 아니라 실행 도중에도 상호작용해야 하기 때문이다.
 */
export function usePico(): UsePico {
  const workerRef = useRef<Worker | null>(null)
  const lineId = useRef(0)

  const [status, setStatus] = useState<PicoStatus>('booting')
  const [output, setOutput] = useState<OutputLine[]>([])
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [gpio, setGpio] = useState<Map<number, 0 | 1>>(new Map())

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
          setGpio((prev) => new Map(prev).set(message.pin, message.value))
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
      setStatus('running')

      const request: WorkerRequest = { type: 'run', code }
      worker.postMessage(request)
    },
    [status],
  )

  /** 무한 루프는 안에서 멈출 방법이 없다. 워커째로 끊고 새로 띄운다(Python/C 랩과 동일). */
  const stop = useCallback(() => {
    workerRef.current?.terminate()
    append('sys', '실행을 중지했습니다.')
    setStatus('booting')
    spawnWorker()
  }, [append, spawnWorker])

  const clearOutput = useCallback(() => {
    setOutput([])
    setElapsedMs(null)
  }, [])

  const setButton = useCallback((pin: number, pressed: boolean) => {
    const request: WorkerRequest = { type: 'button', pin, pressed }
    workerRef.current?.postMessage(request)
  }, [])

  return { status, output, elapsedMs, bootError, gpio, run, stop, clearOutput, setButton }
}
