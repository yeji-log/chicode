import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkerRequest, WorkerResponse } from './pyodide.worker'

export type PythonStatus = 'booting' | 'ready' | 'running' | 'error'

export interface OutputLine {
  id: number
  stream: 'out' | 'err' | 'sys'
  text: string
}

export interface UsePython {
  status: PythonStatus
  output: OutputLine[]
  elapsedMs: number | null
  bootError: string | null
  run: (code: string, stdin: string) => void
  stop: () => void
  clearOutput: () => void
}

export function usePython(): UsePython {
  const workerRef = useRef<Worker | null>(null)
  const lineId = useRef(0)

  const [status, setStatus] = useState<PythonStatus>('booting')
  const [output, setOutput] = useState<OutputLine[]>([])
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  const append = useCallback((stream: OutputLine['stream'], text: string) => {
    setOutput((prev) => [...prev, { id: lineId.current++, stream, text }])
  }, [])

  const spawnWorker = useCallback(() => {
    const worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), {
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
        case 'done':
          if (!message.ok && message.error) append('err', message.error)
          setElapsedMs(message.elapsedMs)
          setStatus('ready')
          break
      }
    }

    workerRef.current = worker
    return worker
  }, [append])

  useEffect(() => {
    spawnWorker()
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [spawnWorker])

  const run = useCallback(
    (code: string, stdin: string) => {
      const worker = workerRef.current
      if (!worker || status === 'running' || status === 'error') return

      setOutput([])
      setElapsedMs(null)
      setStatus('running')

      const request: WorkerRequest = { type: 'run', code, stdin }
      worker.postMessage(request)
    },
    [status],
  )

  /**
   * 무한 루프에 빠진 코드는 안에서 멈출 방법이 없다. 워커째로 끊고 새로 띄운다.
   * 그래서 중지 직후에는 다시 준비될 때까지 몇 초가 걸린다.
   */
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

  return { status, output, elapsedMs, bootError, run, stop, clearOutput }
}
