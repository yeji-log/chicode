import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Link } from 'react-router-dom'

import SupportNote from '../components/SupportNote'
import { EDITOR_OPTIONS } from '../lib/monaco'
import { usePico } from '../pico/usePico'
import { EXAMPLES } from '../pico/examples'
import CircuitCanvas, { type CircuitCanvasHandle } from '../pico/circuit/CircuitCanvas'

const CODE_KEY = 'chicode.pico.code'

/** 처음 들어왔을 때(저장된 코드가 없을 때) 보여줄 최소 코드 — 예제를 불러오기 전엔
 * 빈 회로에 맞게 이거 하나만 있어야 한다. EXAMPLES[0] 을 기본값으로 쓰면 회로 없이
 * 코드만 "1. LED 켜고 끄기"로 시작해서 앞뒤가 안 맞는다. */
const STARTER_CODE = 'from machine import Pin\n'

export default function PicoLab() {
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? STARTER_CODE)

  const { status, output, elapsedMs, bootError, gpio, run, stop, clearOutput, setButton } = usePico()
  const outputRef = useRef<HTMLDivElement>(null)
  const circuitRef = useRef<CircuitCanvasHandle>(null)

  useEffect(() => {
    localStorage.setItem(CODE_KEY, code)
  }, [code])

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [output])

  const running = status === 'running'
  const booting = status === 'booting'

  // 최신 code 를 단축키 핸들러가 보게 하려고 ref 로 들고 있는다.
  const latest = useRef({ code, running, booting })
  latest.current = { code, running, booting }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      const { code: c, running: r, booting: b } = latest.current
      if (!r && !b) run(c)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [run])

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <Link
            to="/practice"
            className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-900"
          >
            ← 실습
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Pico 2 W 시뮬레이터</h1>
          <p className="text-sm text-ink-500">
            코드는 내 브라우저 안에서 실행됩니다. 서버로 보내지 않습니다.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <StatusPill status={status} />

          <select
            className="rounded-lg border border-cream-deep bg-white/70 px-3 py-2 text-sm font-semibold text-ink-700"
            value=""
            onChange={(event) => {
              const example = EXAMPLES.find((item) => item.name === event.target.value)
              if (!example) return
              setCode(example.code)
              circuitRef.current?.loadCircuit(example.circuit)
              clearOutput()
            }}
          >
            <option value="">예제 불러오기…</option>
            {EXAMPLES.map((example) => (
              <option key={example.name} value={example.name}>
                {example.name}
              </option>
            ))}
          </select>

          {running ? (
            <button
              onClick={stop}
              className="rounded-xl bg-red-500 px-5 py-2.5 font-bold text-white transition-colors hover:bg-red-600"
            >
              ■ 중지
            </button>
          ) : (
            <button
              onClick={() => run(code)}
              disabled={booting || status === 'error'}
              className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ▶ 실행
            </button>
          )}
        </div>
      </header>

      {bootError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Pico 실행 환경을 불러오지 못했습니다: {bootError}
        </p>
      )}

      <SupportNote>
        <li>machine.Pin(디지털 입출력)만 지원합니다 — ADC/PWM/I2C/SPI/UART는 아직입니다</li>
        <li>
          함수(def)를 쓰지 않고 코드를 그대로 최상위(또는 while 문 안)에 적으면 실행 중에도
          버튼을 눌러 바로 반응을 볼 수 있습니다. 함수를 쓰면 실행이 끝난 뒤 결과만 볼 수
          있습니다
        </li>
        <li>실행할 때마다 GPIO 상태가 초기화됩니다 (회로 연결은 그대로 남아있어요)</li>
        <li>브레드보드는 10칸 + 전원 레일만 있는 축소판입니다</li>
      </SupportNote>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-cream-deep bg-white">
          <div className="flex items-center justify-between border-b border-cream-deep px-4 py-2.5">
            <h2 className="text-sm font-bold text-ink-700">코드</h2>
            <span className="text-xs text-ink-500">⌘/Ctrl + Enter 로 실행</span>
          </div>

          <div className="h-[300px]">
            <Editor
              language="python"
              theme="vs"
              value={code}
              onChange={(value) => setCode(value ?? '')}
              options={EDITOR_OPTIONS}
              loading={<span className="text-sm text-ink-500">에디터 준비 중…</span>}
            />
          </div>

          <div className="flex flex-1 flex-col overflow-hidden border-t border-cream-deep bg-board">
            <div className="flex items-center justify-between px-4 py-2.5">
              <h2 className="text-sm font-bold text-cheese-200">콘솔</h2>
              <div className="flex items-center gap-3">
                {elapsedMs !== null && (
                  <span className="text-xs text-cheese-200/70">{elapsedMs}ms</span>
                )}
                <button
                  onClick={clearOutput}
                  className="text-xs font-semibold text-cheese-200/70 hover:text-cheese-200"
                >
                  지우기
                </button>
              </div>
            </div>

            <div
              ref={outputRef}
              className="h-[180px] overflow-auto p-4 font-mono text-sm leading-relaxed"
            >
              {output.length === 0 && !running && (
                <p className="text-cheese-200/50">실행 버튼을 누르면 여기에 결과가 나옵니다.</p>
              )}
              {running && output.length === 0 && (
                <p className="text-cheese-200/60">실행 중…</p>
              )}
              {output.map((line) => (
                <pre
                  key={line.id}
                  className={[
                    'whitespace-pre-wrap break-words',
                    line.stream === 'err'
                      ? 'text-red-300'
                      : line.stream === 'sys'
                        ? 'text-cheese-300 italic'
                        : 'text-cream',
                  ].join(' ')}
                >
                  {line.text}
                </pre>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-cream-deep bg-white p-3">
          <h2 className="mb-2 px-1 text-sm font-bold text-ink-700">회로</h2>
          <CircuitCanvas ref={circuitRef} gpioLevels={gpio} onButtonChange={setButton} />
        </section>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: ReturnType<typeof usePico>['status'] }) {
  const map = {
    booting: { text: 'Pico 준비 중…', className: 'bg-cheese-100 text-cheese-600' },
    ready: { text: '준비됨', className: 'bg-emerald-100 text-emerald-700' },
    running: { text: '실행 중', className: 'bg-cheese-200 text-ink-900' },
    error: { text: '오류', className: 'bg-red-100 text-red-700' },
  } as const

  const { text, className } = map[status]
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${className}`}>{text}</span>
  )
}
