import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { listExercises, solvedIds, type Exercise } from '../lib/exercises'

/**
 * 연습문제 목록(학생 화면).
 *
 * 푼 표시(✅)는 그 브라우저의 localStorage 에서 읽는다 — 학생 로그인이 없어서
 * 서버에는 아무 기록도 남지 않는다(exercises.ts 머리말 참고). 그래서 컴퓨터를
 * 바꾸면 표시가 사라지는데, 그 사실을 화면에도 적어둔다. 안 적으면 "내가 푼 게
 * 왜 사라졌냐"는 질문이 반드시 나온다.
 */
export default function Exercises() {
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [solved, setSolved] = useState<Set<string>>(() => solvedIds())

  useEffect(() => {
    listExercises()
      .then(setExercises)
      .catch((caught) => {
        console.error('연습문제 목록 불러오기 실패', caught)
        setLoadError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  // 문제를 풀고 뒤로 돌아왔을 때 목록의 ✅ 가 바로 갱신되도록 다시 읽는다.
  useEffect(() => {
    const onFocus = () => setSolved(solvedIds())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // 준비 중인 문제는 교사에게만 보인다(과목·Lab 활동과 같은 방식).
  const visible = exercises.filter((exercise) => isTeacherViewer || exercise.published)
  const solvedCount = visible.filter((exercise) => solved.has(exercise.id)).length

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">연습문제</h1>
        <p className="text-sm text-ink-500">
          문제를 읽고 직접 풀어 보세요. 채점 버튼을 누르면 바로 맞았는지 알려줍니다.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : loadError ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          문제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 등록된 문제가 없습니다.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-deep">
              <div
                className="h-full rounded-full bg-cheese-400 transition-all"
                style={{ width: `${(solvedCount / visible.length) * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold text-ink-700">
              {solvedCount} / {visible.length}
            </span>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((exercise) => {
              const done = solved.has(exercise.id)
              return (
                <li key={exercise.id}>
                  <Link
                    to={`/exercises/${exercise.id}`}
                    className={[
                      'flex h-full items-start gap-3 rounded-2xl border bg-white/70 p-5 transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md',
                      done ? 'border-cheese-300 bg-cheese-50/60' : 'border-cream-deep',
                    ].join(' ')}
                  >
                    <span className="text-xl">{done ? '✅' : '📝'}</span>
                    <span className="flex flex-col gap-1">
                      <span className="font-bold text-ink-900">
                        {exercise.order}. {exercise.title}
                      </span>
                      <span className="text-sm text-ink-500">{exercise.concept}</span>
                      {isTeacherViewer && !exercise.published && (
                        <span className="mt-1 w-fit rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-500">
                          준비중 (학생에게 안 보임)
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <p className="text-xs text-ink-500">
            푼 기록은 지금 쓰는 브라우저에만 저장됩니다 — 다른 컴퓨터에서 열면 표시가
            남아 있지 않습니다.
          </p>
        </>
      )}
    </div>
  )
}
