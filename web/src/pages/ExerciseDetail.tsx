import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Link, useParams } from 'react-router-dom'

import { EDITOR_OPTIONS } from '../lib/monaco'
import {
  failCount,
  getExercise,
  loadDraftCode,
  markSolved,
  recordFailure,
  saveDraftCode,
  type Exercise,
} from '../lib/exercises'
import { usesInputPrompt } from '../exercises/grade'
import { useGrader, type GradeResult } from '../exercises/useGrader'

/** 모범답안이 열리는 실패 횟수. 사용자가 정한 값이다. */
const ANSWER_AFTER_FAILS = 2

const STARTER = '# 여기에 코드를 작성하세요\n'

/**
 * 문제 설명·힌트 안의 `백틱` 을 코드 조각으로 보여준다.
 *
 * 마크다운 전체를 렌더링하지는 않는다 — 필요한 건 `range(1, n)` 같은 코드 조각
 * 강조 하나뿐인데, 그것 때문에 마크다운 라이브러리를 들이면 번들만 커진다
 * (외부 CDN 을 안 쓰는 프로젝트라 무게가 그대로 학생 네트워크로 간다).
 * 백틱 개수가 홀수여도 그냥 글자로 남을 뿐 깨지지 않는다.
 */
function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap ${className ?? ''}`}>
      {text.split('`').map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rounded bg-cream-deep/70 px-1 py-0.5 font-mono text-[0.9em]">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </p>
  )
}

export default function ExerciseDetail() {
  const { id = '' } = useParams()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [loading, setLoading] = useState(true)

  const [code, setCode] = useState(STARTER)
  const [stdin, setStdin] = useState('')
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [result, setResult] = useState<GradeResult | null>(null)
  const [fails, setFails] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)

  const { status, bootError, progress, grade, runOnce } = useGrader()
  const busy = status === 'running' || status === 'booting'

  useEffect(() => {
    let cancelled = false
    getExercise(id)
      .then((found) => {
        if (cancelled) return
        setExercise(found)
        setCode(loadDraftCode(id) ?? STARTER)
        setFails(failCount(id))
        // 자유 실행 칸은 첫 공개 테스트의 입력으로 채워둔다 — 학생이 예시를 그대로
        // 한 번 돌려보는 것이 가장 흔한 첫 행동이라, 직접 옮겨 적게 두지 않는다.
        setStdin(found?.tests.find((test) => !test.hidden)?.stdin ?? '')
      })
      .catch((caught) => console.error('문제 불러오기 실패', caught))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (exercise) saveDraftCode(id, code)
  }, [code, id, exercise])

  const handleGrade = useCallback(async () => {
    if (!exercise) return
    setRunOutput(null)
    const graded = await grade(code, exercise.tests)
    setResult(graded)
    if (graded.allPassed) {
      markSolved(exercise.id)
    } else {
      setFails(recordFailure(exercise.id))
    }
  }, [code, exercise, grade])

  const handleRun = useCallback(async () => {
    setResult(null)
    const { output, error } = await runOnce(code, stdin)
    setRunOutput(error ? `${output}${output ? '\n' : ''}${error}` : output || '(출력 없음)')
  }, [code, runOnce, stdin])

  // ⌘/Ctrl + Enter 로 채점 — Python 실습의 실행 단축키와 같은 자리에 둔다.
  const latest = useRef({ handleGrade, busy })
  latest.current = { handleGrade, busy }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      if (!latest.current.busy) void latest.current.handleGrade()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (loading) return <p className="text-ink-500">불러오는 중…</p>
  if (!exercise) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="text-4xl">🔍</span>
        <p className="text-ink-500">문제를 찾을 수 없습니다.</p>
        <Link to="/exercises" className="text-sm font-semibold text-cheese-600 underline">
          문제 목록으로
        </Link>
      </div>
    )
  }

  const openTests = exercise.tests.filter((test) => !test.hidden)
  const answerUnlocked = fails >= ANSWER_AFTER_FAILS
  const promptWarning = result && !result.allPassed && usesInputPrompt(code)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/exercises"
            className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-900"
          >
            ← 연습문제
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
            {exercise.order}. {exercise.title}
          </h1>
          <p className="text-sm text-ink-500">{exercise.concept}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={busy}
            className="rounded-xl border border-cream-deep bg-white px-4 py-2.5 text-sm font-bold text-ink-700 transition-colors hover:bg-cheese-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            실행
          </button>
          <button
            onClick={handleGrade}
            disabled={busy}
            className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'running' && progress
              ? `채점 중… ${progress.done}/${progress.total}`
              : status === 'booting'
                ? '준비 중…'
                : '채점하기'}
          </button>
        </div>
      </header>

      {bootError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Python 실행 환경을 불러오지 못했습니다: {bootError}
        </p>
      )}

      <section className="rounded-2xl border border-cream-deep bg-white/70 p-5">
        <RichText text={exercise.body} className="text-ink-900" />
        <RichText text={exercise.io} className="mt-3 text-sm text-ink-700" />

        {openTests.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {openTests.map((test, index) => (
              <div key={index} className="rounded-xl border border-cream-deep bg-cream/40 p-3">
                <div className="mb-1 text-xs font-bold text-ink-500">예시</div>
                <div className="flex gap-4 font-mono text-sm">
                  <div>
                    <div className="text-xs text-ink-500">입력</div>
                    <pre className="whitespace-pre-wrap text-ink-900">{test.stdin || '(없음)'}</pre>
                  </div>
                  <div>
                    <div className="text-xs text-ink-500">출력</div>
                    <pre className="whitespace-pre-wrap text-ink-900">{test.expected}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 rounded-lg bg-cheese-50 px-3 py-2 text-xs text-ink-700">
          입력은 <code className="font-mono">input()</code> 안에 안내 문구 없이 받으세요.
          <code className="font-mono"> input(&quot;숫자&gt;&gt; &quot;)</code> 처럼 쓰면 그 문구까지
          출력에 섞여 나가 오답으로 채점됩니다.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setShowHint((prev) => !prev)}
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-cheese-50"
          >
            {showHint ? '힌트 접기' : '💡 힌트 보기'}
          </button>
          <button
            onClick={() => setShowAnswer((prev) => !prev)}
            disabled={!answerUnlocked}
            title={
              answerUnlocked
                ? undefined
                : `채점해서 ${ANSWER_AFTER_FAILS}번 틀리면 열립니다 (지금 ${fails}번)`
            }
            className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-cheese-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {answerUnlocked
              ? showAnswer
                ? '모범답안 접기'
                : '📄 모범답안 보기'
              : `🔒 모범답안 (${fails}/${ANSWER_AFTER_FAILS})`}
          </button>
        </div>

        {showHint && (
          <RichText
            text={exercise.hint}
            className="mt-3 rounded-xl border border-cheese-200 bg-cheese-50 px-4 py-3 text-sm text-ink-900"
          />
        )}

        {showAnswer && answerUnlocked && (
          <div className="mt-3">
            <pre className="overflow-x-auto rounded-xl bg-board px-4 py-3 font-mono text-sm text-cheese-100">
              {exercise.answer}
            </pre>
            {exercise.note && <RichText text={exercise.note} className="mt-2 text-xs text-ink-500" />}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-cream-deep bg-white">
          <div className="flex items-center justify-between border-b border-cream-deep px-4 py-2.5">
            <h2 className="text-sm font-bold text-ink-700">코드</h2>
            <span className="text-xs text-ink-500">⌘/Ctrl + Enter 로 채점</span>
          </div>
          <div className="h-[360px] lg:h-[420px]">
            <Editor
              language="python"
              theme="vs"
              value={code}
              onChange={(value) => setCode(value ?? '')}
              options={EDITOR_OPTIONS}
              loading={<span className="text-sm text-ink-500">에디터 준비 중…</span>}
            />
          </div>
          <div className="border-t border-cream-deep px-4 py-3">
            <label className="mb-1 block text-xs font-bold text-ink-500">
              직접 실행해 볼 입력값
            </label>
            <textarea
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
              rows={2}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-cream-deep bg-cream/50 p-2.5 font-mono text-sm text-ink-900 focus:border-cheese-300 focus:outline-none"
            />
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-2xl border border-cream-deep bg-white">
          <div className="border-b border-cream-deep px-4 py-2.5">
            <h2 className="text-sm font-bold text-ink-700">결과</h2>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {runOutput !== null && (
              <div>
                <div className="mb-1 text-xs font-bold text-ink-500">실행 결과</div>
                <pre className="whitespace-pre-wrap rounded-xl bg-board px-4 py-3 font-mono text-sm text-cheese-100">
                  {runOutput}
                </pre>
              </div>
            )}

            {result && (
              <div className="flex flex-col gap-3">
                <div
                  className={[
                    'rounded-xl px-4 py-3 text-sm font-bold',
                    result.allPassed
                      ? 'bg-cheese-100 text-ink-900'
                      : 'bg-red-50 text-red-700',
                  ].join(' ')}
                >
                  {result.allPassed
                    ? '🎉 모두 통과했어요!'
                    : `${result.total}개 중 ${result.passedCount}개 통과`}
                </div>

                {result.stoppedEarly && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    시간이 너무 오래 걸려 멈췄습니다. 반복문이 끝나지 않는 건 아닌지
                    확인해 보세요 — 남은 테스트는 건너뛰었습니다.
                  </p>
                )}

                {promptWarning && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <b>혹시 이것 때문일까요?</b> 코드에{' '}
                    <code className="font-mono">input(&quot;…&quot;)</code> 처럼 안내 문구가
                    들어 있습니다. 그 문구도 출력에 섞여 나가서, 계산이 맞아도 오답이 됩니다.
                    <code className="font-mono"> input()</code> 으로 바꿔 보세요.
                  </p>
                )}

                {result.results.map((test) => (
                  <div
                    key={test.index}
                    className={[
                      'rounded-xl border px-4 py-3 text-sm',
                      test.passed ? 'border-cream-deep bg-cream/40' : 'border-red-200 bg-red-50',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-ink-900">
                        {test.passed ? '✅' : '❌'} {test.hidden ? '숨김 테스트' : '공개 테스트'}
                      </span>
                      {test.timedOut && (
                        <span className="text-xs font-semibold text-red-700">
                          시간 초과 — 무한 반복일 수 있어요
                        </span>
                      )}
                    </div>

                    {/* 숨김 테스트는 통과 여부만 알려준다 — 입력을 보여주면 숨긴 의미가
                        없어진다. 대신 오류 메시지는 보여준다(어디서 멈췄는지는 알아야
                        고칠 수 있고, 그것만으로 답을 유추할 수는 없다). */}
                    {!test.passed && !test.hidden && (
                      <div className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-3">
                        <div>
                          <div className="text-ink-500">입력</div>
                          <pre className="whitespace-pre-wrap text-ink-900">
                            {test.stdin || '(없음)'}
                          </pre>
                        </div>
                        <div>
                          <div className="text-ink-500">기대한 출력</div>
                          <pre className="whitespace-pre-wrap text-ink-900">{test.expected}</pre>
                        </div>
                        <div>
                          <div className="text-ink-500">내 출력</div>
                          <pre className="whitespace-pre-wrap text-red-700">
                            {test.actual || '(없음)'}
                          </pre>
                        </div>
                      </div>
                    )}

                    {test.error && !test.timedOut && (
                      <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-red-700">
                        {test.error}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}

            {runOutput === null && !result && (
              <p className="text-sm text-ink-500">
                코드를 쓰고 <b>채점하기</b> 를 누르세요. 그냥 돌려보고 싶으면 <b>실행</b> 을
                누르면 됩니다.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
