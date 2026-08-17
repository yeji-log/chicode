import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Link } from 'react-router-dom'

import SupportNote from '../components/SupportNote'
import { EDITOR_OPTIONS } from '../lib/monaco'
import { useC } from '../c/useC'
import { EXAMPLES } from '../c/examples'

const CODE_KEY = 'chicode.c.code'
const STDIN_KEY = 'chicode.c.stdin'

export default function CLab() {
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? EXAMPLES[0].code)
  const [stdin, setStdin] = useState(() => localStorage.getItem(STDIN_KEY) ?? '')
  const [showStdin, setShowStdin] = useState(() => (localStorage.getItem(STDIN_KEY) ?? '') !== '')

  const { status, output, stage, elapsedMs, bootError, run, stop, clearOutput } = useC()
  const outputRef = useRef<HTMLDivElement>(null)

  // 새로고침해도 쓰던 코드가 남아 있도록 (아직 서버 저장은 없다)
  useEffect(() => {
    localStorage.setItem(CODE_KEY, code)
  }, [code])
  useEffect(() => {
    localStorage.setItem(STDIN_KEY, stdin)
  }, [stdin])

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [output])

  const running = status === 'running'
  const booting = status === 'booting'

  // 최신 code/stdin 을 단축키 핸들러가 보게 하려고 ref 로 들고 있는다.
  const latest = useRef({ code, stdin, running, booting })
  latest.current = { code, stdin, running, booting }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      const { code: c, stdin: s, running: r, booting: b } = latest.current
      if (!r && !b) run(c, s)
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
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">C언어 실습</h1>
          <p className="text-sm text-ink-500">
            컴파일도 실행도 내 브라우저 안에서 이뤄집니다. 서버로 보내지 않습니다.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <StatusPill status={status} stage={stage} />

          <select
            className="rounded-lg border border-cream-deep bg-white/70 px-3 py-2 text-sm font-semibold text-ink-700"
            value=""
            onChange={(event) => {
              const example = EXAMPLES.find((item) => item.name === event.target.value)
              if (!example) return
              setCode(example.code)
              setStdin(example.stdin)
              setShowStdin(example.stdin !== '')
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
              onClick={() => run(code, stdin)}
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
          C 실행 환경을 불러오지 못했습니다: {bootError}
        </p>
      )}

      <SupportNote>
        <li>C++는 지원하지 않습니다 (#include &lt;iostream&gt; 등 불가)</li>
        <li>파일 하나로만 작성할 수 있습니다 (직접 만든 헤더 파일을 나눠서 불러올 수 없습니다)</li>
        <li>인터넷에 요청을 보낼 수 없습니다</li>
        <li>저장한 파일은 실행이 끝나면 사라집니다 (다음 실행에 남지 않습니다)</li>
      </SupportNote>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-cream-deep bg-white">
          <div className="flex items-center justify-between border-b border-cream-deep px-4 py-2.5">
            <h2 className="text-sm font-bold text-ink-700">코드</h2>
            <span className="text-xs text-ink-500">⌘/Ctrl + Enter 로 실행</span>
          </div>

          <div className="h-[380px] lg:h-[460px]">
            <Editor
              language="c"
              theme="vs"
              value={code}
              onChange={(value) => setCode(value ?? '')}
              options={EDITOR_OPTIONS}
              loading={<span className="text-sm text-ink-500">에디터 준비 중…</span>}
            />
          </div>

          <div className="border-t border-cream-deep">
            <button
              onClick={() => setShowStdin((prev) => !prev)}
              className="w-full px-4 py-2.5 text-left text-sm font-bold text-ink-700 hover:bg-cheese-50"
            >
              {showStdin ? '▾' : '▸'} 입력값 (scanf 로 읽을 내용)
            </button>
            {showStdin && (
              <div className="px-4 pb-4">
                <textarea
                  value={stdin}
                  onChange={(event) => setStdin(event.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder={'한 줄에 하나씩 적어두면\nscanf 가 위에서부터 읽어갑니다.'}
                  className="w-full resize-y rounded-lg border border-cream-deep bg-cream/50 p-3 font-mono text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-cheese-300 focus:outline-none"
                />
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-2xl border border-cream-deep bg-board">
          <div className="flex items-center justify-between border-b border-board-light px-4 py-2.5">
            <h2 className="text-sm font-bold text-cheese-200">실행 결과</h2>
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
            className="h-[380px] overflow-auto p-4 font-mono text-sm leading-relaxed lg:h-[522px]"
          >
            {output.length === 0 && !running && (
              <p className="text-cheese-200/50">
                실행 버튼을 누르면 여기에 결과가 나옵니다.
              </p>
            )}
            {running && output.length === 0 && (
              <p className="text-cheese-200/60">{stage ?? '실행 중…'}</p>
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
        </section>
      </div>
    </div>
  )
}

function StatusPill({ status, stage }: { status: ReturnType<typeof useC>['status']; stage: string | null }) {
  const map = {
    booting: { text: 'C 준비 중…', className: 'bg-cheese-100 text-cheese-600' },
    ready: { text: '준비됨', className: 'bg-emerald-100 text-emerald-700' },
    running: { text: stage ?? '실행 중', className: 'bg-cheese-200 text-ink-900' },
    error: { text: '오류', className: 'bg-red-100 text-red-700' },
  } as const

  const { text, className } = map[status]
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${className}`}>{text}</span>
  )
}
