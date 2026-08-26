import { useCallback, useEffect, useRef, useState } from 'react'

import type { ExerciseTest } from '../lib/exercises'
import type { WorkerRequest, WorkerResponse } from '../python/pyodide.worker'
import { outputMatches } from './grade'

/**
 * 연습문제 채점기.
 *
 * usePython 과 같은 Pyodide 워커를 쓰지만 성격이 다르다 — usePython 은 "한 번
 * 실행하고 출력을 화면에 흘려보내는" 훅이라 결과를 state 로만 내보내는데,
 * 채점은 테스트를 여러 번 **차례로** 돌리고 각 실행의 출력을 통째로 모아
 * 비교해야 한다. 그래서 실행 하나를 Promise 로 감싸는 이 훅을 따로 둔다.
 * (usePython 을 고쳐서 겸용하게 만들면 Python 실습 화면까지 영향을 받는다.)
 *
 * 워커는 하나만 띄워 테스트 전체가 재사용한다 — Pyodide 부팅이 몇 초 걸려서,
 * 테스트마다 새로 띄우면 채점 한 번에 수십 초가 든다.
 */

/** 한 테스트에 허용하는 시간. 넘으면 워커를 끊고 다시 띄운다.
 *  무한 루프(`while True` 에서 조건을 안 바꾸는 실수)가 흔해서 반드시 필요하다 —
 *  없으면 채점 버튼을 누른 학생의 화면이 영영 "채점 중" 에 머문다. */
const TIMEOUT_MS = 6000

export interface TestResult {
  index: number
  hidden: boolean
  passed: boolean
  stdin: string
  expected: string
  actual: string
  /** 코드가 오류로 멈춘 경우의 메시지(파이썬 오류 그대로). */
  error?: string
  timedOut?: boolean
}

export interface GradeResult {
  results: TestResult[]
  passedCount: number
  total: number
  allPassed: boolean
  /** 시간 초과로 남은 테스트를 건너뛰었는지. */
  stoppedEarly: boolean
}

export type GraderStatus = 'booting' | 'ready' | 'running' | 'error'

interface Pending {
  resolve: (value: { output: string; error?: string }) => void
  chunks: string[]
  timer: number
}

export function useGrader() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const [status, setStatus] = useState<GraderStatus>('booting')
  const [bootError, setBootError] = useState<string | null>(null)
  /** 채점 진행 표시용 — "3개 중 2번째" 처럼 보여준다. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const settle = useCallback((value: { output: string; error?: string }) => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    window.clearTimeout(pending.timer)
    pending.resolve(value)
  }, [])

  const spawn = useCallback(() => {
    const worker = new Worker(new URL('../python/pyodide.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      switch (message.type) {
        case 'ready':
          setStatus((prev) => (prev === 'booting' ? 'ready' : prev))
          break
        case 'boot-error':
          setStatus('error')
          setBootError(message.message)
          break
        case 'stdout':
        case 'stderr':
          // 채점은 stdout/stderr 를 구분하지 않는다 — 실물 파이썬도 둘 다 화면에
          // 나오고, 학생이 print 한 것은 전부 stdout 이다. 오류 메시지는 done 의
          // error 로 따로 온다.
          pendingRef.current?.chunks.push(message.text)
          break
        case 'done':
          settle({
            output: pendingRef.current?.chunks.join('') ?? '',
            error: message.ok ? undefined : message.error,
          })
          break
      }
    }
    workerRef.current = worker
    return worker
  }, [settle])

  useEffect(() => {
    const worker = spawn()
    return () => {
      worker.terminate()
      workerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 실행 하나. 시간을 넘기면 워커를 끊고 새로 띄운 뒤 '시간 초과'로 돌려준다. */
  const runOnce = useCallback(
    (code: string, stdin: string): Promise<{ output: string; error?: string }> =>
      new Promise((resolve) => {
        const worker = workerRef.current
        if (!worker) {
          resolve({ output: '', error: '실행 환경이 준비되지 않았습니다.' })
          return
        }
        const timer = window.setTimeout(() => {
          // 끊긴 워커는 더 못 쓴다 — 다음 테스트를 위해 새로 띄운다.
          workerRef.current?.terminate()
          setStatus('booting')
          spawn()
          settle({ output: '', error: '시간 초과' })
        }, TIMEOUT_MS)

        pendingRef.current = { resolve, chunks: [], timer }
        // echoInput: false — 채점은 진짜 CPython 처럼 돌아야 한다. 실습 화면이
        // 쓰는 기본 모드는 입력값을 결과창에 되풀이해서, 정답 코드도 기대 출력과
        // 절대 같아지지 않는다(pyodide.worker.ts 의 _chicode_input 참고).
        const request: WorkerRequest = { type: 'run', code, stdin, echoInput: false }
        worker.postMessage(request)
      }),
    [settle, spawn],
  )

  const grade = useCallback(
    async (code: string, tests: ExerciseTest[]): Promise<GradeResult> => {
      setStatus('running')
      setProgress({ done: 0, total: tests.length })

      const results: TestResult[] = []
      for (let i = 0; i < tests.length; i++) {
        const test = tests[i]
        const { output, error } = await runOnce(code, test.stdin)
        results.push({
          index: i,
          hidden: test.hidden,
          // 오류로 멈춘 실행은 출력이 우연히 맞아도 통과가 아니다.
          passed: !error && outputMatches(output, test.expected),
          stdin: test.stdin,
          expected: test.expected,
          actual: output,
          error,
          timedOut: error === '시간 초과',
        })
        setProgress({ done: i + 1, total: tests.length })

        // 시간 초과가 한 번 나면 남은 테스트도 같은 이유로 초과할 가능성이 크다.
        // 6초씩 더 기다리게 두면 채점 한 번에 20초가 넘어가는데, 그 시간 동안
        // 학생이 얻는 정보는 없다. 여기서 멈추고 "무한 반복일 수 있다"만 알려준다.
        if (results[results.length - 1].timedOut) break
      }

      setStatus('ready')
      setProgress(null)
      const passedCount = results.filter((r) => r.passed).length
      return {
        results,
        passedCount,
        total: tests.length,
        allPassed: passedCount === tests.length && tests.length > 0,
        stoppedEarly: results.length < tests.length,
      }
    },
    [runOnce],
  )

  return { status, bootError, progress, grade, runOnce }
}
