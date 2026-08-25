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

type LabTab = 'circuit' | 'code'

export default function PicoLab() {
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? STARTER_CODE)
  // 회로가 기본 화면이고 코드는 탭을 열어서 본다 — 나란히 놓으면 회로가 가로 절반밖에
  // 못 써서, 캔버스를 넓혀도 남는 폭이 전부 빈 띠가 됐다(CircuitCanvas의
  // MIN_VIEW_WIDTH 주석에 실측값). 콘솔은 탭 밖에 둬서 어느 탭에서든 보인다.
  const [tab, setTab] = useState<LabTab>('circuit')

  const { status, output, elapsedMs, bootError, gpio, pwm, neopixel, run, stop, clearOutput, setButton, setAnalog, setDht, setUltrasonic } =
    usePico()
  const outputRef = useRef<HTMLDivElement>(null)
  const circuitRef = useRef<CircuitCanvasHandle>(null)

  useEffect(() => {
    localStorage.setItem(CODE_KEY, code)
  }, [code])

  // tab 도 의존성에 넣는다 — 코드 탭이 숨겨진(display:none) 동안엔 scrollHeight 가 0
  // 이라 자동 스크롤이 안 먹어서, 탭을 다시 열면 예전 위치에 멈춰 있게 된다.
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [output, tab])

  const running = status === 'running'
  const booting = status === 'booting'
  // 회로 탭 탭바에 한 줄로 띄울 콘솔 마지막 줄(ConsolePeek 참고).
  const lastLine = output.length > 0 ? output[output.length - 1] : null

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
            disabled={running}
            className="rounded-lg border border-cream-deep bg-white/70 px-3 py-2 text-sm font-semibold text-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
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

      <section className="overflow-hidden rounded-2xl border border-cream-deep bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-deep px-3 py-2">
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
                  tab === t.key ? 'bg-cheese-100 text-ink-900' : 'text-ink-500 hover:text-ink-700',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'code' ? (
            <span
              className={[
                'px-1 text-xs',
                running ? 'font-semibold text-cheese-600' : 'text-ink-500',
              ].join(' ')}
            >
              {running ? '실행 중에는 수정할 수 없어요 — 중지를 누르세요' : '⌘/Ctrl + Enter 로 실행'}
            </span>
          ) : (
            <ConsolePeek line={lastLine} running={running} onOpenConsole={() => setTab('code')} />
          )}
        </div>

        <TabPanel active={tab === 'circuit'}>
          <div className="p-3">
            <CircuitCanvas
              ref={circuitRef}
              gpioLevels={gpio}
              pwmLevels={pwm}
              neopixelColors={neopixel}
              onButtonChange={setButton}
              onAnalogChange={setAnalog}
              onDhtChange={setDht}
              onUltrasonicChange={setUltrasonic}
              locked={running}
            />
          </div>
        </TabPanel>

        <TabPanel active={tab === 'code'}>
          <div className="h-[360px]">
            <Editor
              language="python"
              theme="vs"
              value={code}
              onChange={(value) => setCode(value ?? '')}
              options={{ ...EDITOR_OPTIONS, readOnly: running }}
              loading={<span className="text-sm text-ink-500">에디터 준비 중…</span>}
            />
          </div>

          {/* 콘솔은 코드 탭 안에 둔다 — 예제 코드가 print() 를 안 써서 회로를 보는
              동안 콘솔이 실제로 보여줄 건 오류뿐인데, 그것 때문에 220px 를 상시로
              깔면 회로 탭이 한 화면에 안 들어간다(실측: 콘솔 있으면 1080px,
              빼면 842px). 대신 회로 탭에선 위 ConsolePeek 이 마지막 한 줄을 보여준다. */}
          <div className="flex flex-col overflow-hidden border-t border-cream-deep bg-board">
            <div className="flex items-center justify-between px-4 py-2.5">
              <h2 className="text-sm font-bold text-cheese-200">콘솔</h2>
              <div className="flex items-center gap-3">
                {elapsedMs !== null && <span className="text-xs text-cheese-200/70">{elapsedMs}ms</span>}
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
              {running && output.length === 0 && <p className="text-cheese-200/60">실행 중…</p>}
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
        </TabPanel>
      </section>
    </div>
  )
}

const TABS: { key: LabTab; label: string }[] = [
  { key: 'circuit', label: '회로' },
  { key: 'code', label: '코드' },
]

/** 회로 탭의 탭바 오른쪽 한 줄 — 콘솔이 코드 탭 안으로 들어갔으니, 회로를 보는 동안
 *  에도 마지막 출력(특히 오류)은 여기서 보이게 한다. 누르면 콘솔 전문이 있는 코드
 *  탭으로 넘어간다.
 *
 *  실행 중 안내("배선은 중지 후에")는 여기 안 쓴다 — 회로 캔버스가 자기 아래에 이미
 *  같은 말을 띄우고 있어서 두 번 나오게 된다. */
function ConsolePeek({
  line,
  running,
  onOpenConsole,
}: {
  line: { text: string; stream: 'out' | 'err' | 'sys' } | null
  running: boolean
  onOpenConsole: () => void
}) {
  if (!line) {
    return (
      <span className="px-1 text-xs text-ink-500">
        {running ? '실행 중…' : '⌘/Ctrl + Enter 로 실행'}
      </span>
    )
  }
  // 오류는 여러 줄짜리 traceback 한 덩어리로 들어온다. 한 줄만 보여줄 자리라
  // 첫 줄("Traceback (most recent call last):")을 쓰면 정작 원인이 잘려 나가므로,
  // 마지막 비어있지 않은 줄(= 실제 오류 메시지)을 고른다.
  const summary = line.text.split('\n').filter((t) => t.trim()).pop() ?? line.text

  return (
    <button
      onClick={onOpenConsole}
      title={`${line.text}\n(눌러서 콘솔 전체 보기)`}
      className={[
        'max-w-[46ch] truncate rounded-lg px-2 py-1 text-left font-mono text-xs transition-colors',
        line.stream === 'err'
          ? 'bg-red-50 font-bold text-red-700 hover:bg-red-100'
          : line.stream === 'sys'
            ? 'text-ink-500 italic hover:bg-cream'
            : 'text-ink-700 hover:bg-cream',
      ].join(' ')}
    >
      {summary}
    </button>
  )
}

/** 안 보이는 탭도 unmount 하지 않고 hidden(display:none)으로 숨기기만 한다 — Monaco는
 *  다시 mount 하면 실행 취소 기록과 커서 위치가 날아가고, 회로 캔버스는 선택·줌/팬
 *  상태가 초기화된다(회로 자체는 localStorage에 남지만 보던 자리가 튄다). 둘 다 다시
 *  보이는 순간 스스로 크기를 다시 잡는다 — Monaco는 automaticLayout, 회로는
 *  ResizeObserver. */
function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={active ? '' : 'hidden'}>{children}</div>
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
