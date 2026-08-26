import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_EXERCISES } from '../exercises/defaultExercises'
import { useGrader } from '../exercises/useGrader'
import {
  createExercise,
  deleteExercise,
  listExercises,
  seedExercises,
  updateExercise,
  type Exercise,
  type ExerciseDraft,
  type ExerciseTest,
} from '../lib/exercises'

/**
 * 교사용 연습문제 관리.
 *
 * 핵심은 **기대 출력을 손으로 적지 않는 것**이다. 교사가 모범답안과 입력만 넣고
 * "기대 출력 채우기" 를 누르면, 그 답안을 브라우저에서 실제로 실행해 출력을 받아
 * 적는다. 손으로 옮겨 적으면 공백·줄바꿈 하나 때문에 정답인 학생이 오답 판정을
 * 받는 사고가 반드시 나고, 그 사고는 수업 중에 여러 명에게 동시에 터진다.
 *
 * 실행기는 학생 채점과 똑같은 것(useGrader)을 쓴다 — 교사 화면에서 맞게 채워진
 * 값은 학생 화면에서도 반드시 맞는다.
 */
export default function TeacherExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setExercises(await listExercises())
  }, [])

  useEffect(() => {
    reload()
      .catch((caught) => console.error('연습문제 목록 불러오기 실패', caught))
      .finally(() => setLoading(false))
  }, [reload])

  const handleSeed = async () => {
    setBusyMessage('기본 문제를 넣는 중…')
    try {
      const added = await seedExercises(DEFAULT_EXERCISES)
      await reload()
      setBusyMessage(added > 0 ? `${added}개를 넣었습니다.` : '이미 문제가 있어 넣지 않았습니다.')
    } catch (caught) {
      console.error(caught)
      setBusyMessage('넣지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  const togglePublished = async (exercise: Exercise) => {
    await updateExercise(exercise.id, { published: !exercise.published })
    await reload()
  }

  const remove = async (exercise: Exercise) => {
    if (!confirm(`"${exercise.title}" 문제를 지울까요? 되돌릴 수 없습니다.`)) return
    await deleteExercise(exercise.id)
    await reload()
  }

  if (loading) return <p className="text-ink-500">불러오는 중…</p>

  if (editing) {
    return (
      <ExerciseEditor
        exercise={editing === 'new' ? null : editing}
        nextOrder={exercises.reduce((max, e) => Math.max(max, e.order), 0) + 1}
        onDone={async () => {
          setEditing(null)
          await reload()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-extrabold text-ink-900">연습문제</h2>
        <span className="text-sm text-ink-500">{exercises.length}개</span>
        <div className="ml-auto flex gap-2">
          {exercises.length === 0 && (
            <button
              onClick={handleSeed}
              className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300"
            >
              기본 문제 {DEFAULT_EXERCISES.length}개 불러오기
            </button>
          )}
          <button
            onClick={() => setEditing('new')}
            className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 hover:bg-cheese-300"
          >
            + 새 문제
          </button>
        </div>
      </div>

      {busyMessage && <p className="text-sm text-ink-500">{busyMessage}</p>}

      {exercises.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
          아직 문제가 없습니다. 수업 진도에 맞춰 만들어 둔 기본 문제를 먼저 넣어 보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {exercises.map((exercise) => (
            <li
              key={exercise.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-cream-deep bg-white/70 px-4 py-3"
            >
              <span className="w-8 text-sm font-bold text-ink-500">{exercise.order}</span>
              <span className="font-bold text-ink-900">{exercise.title}</span>
              <span className="text-sm text-ink-500">{exercise.concept}</span>
              <span className="text-xs text-ink-500">테스트 {exercise.tests.length}개</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => togglePublished(exercise)}
                  className={[
                    'rounded-full px-3 py-1 text-xs font-bold',
                    exercise.published
                      ? 'bg-cheese-100 text-ink-900'
                      : 'bg-ink-100 text-ink-500',
                  ].join(' ')}
                >
                  {exercise.published ? '학생에게 공개됨' : '준비중'}
                </button>
                <button
                  onClick={() => setEditing(exercise)}
                  className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 hover:border-cheese-300"
                >
                  편집
                </button>
                <button
                  onClick={() => remove(exercise)}
                  className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-700 hover:border-red-300"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const EMPTY: ExerciseDraft = {
  order: 1,
  title: '',
  concept: '',
  body: '',
  io: '',
  hint: '',
  answer: '',
  tests: [{ stdin: '', expected: '', hidden: false }],
  published: false,
}

function ExerciseEditor({
  exercise,
  nextOrder,
  onDone,
  onCancel,
}: {
  exercise: Exercise | null
  nextOrder: number
  onDone: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ExerciseDraft>(
    exercise ?? { ...EMPTY, order: nextOrder },
  )
  const [filling, setFilling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { runOnce, status } = useGrader()

  const patch = (part: Partial<ExerciseDraft>) => setDraft((prev) => ({ ...prev, ...part }))
  const patchTest = (index: number, part: Partial<ExerciseTest>) =>
    setDraft((prev) => ({
      ...prev,
      tests: prev.tests.map((test, i) => (i === index ? { ...test, ...part } : test)),
    }))

  /** 모범답안을 실제로 돌려 기대 출력을 채운다. 이 화면의 존재 이유다. */
  const fillExpected = async () => {
    if (!draft.answer.trim()) {
      setMessage('먼저 모범답안을 적어 주세요.')
      return
    }
    setFilling(true)
    setMessage(null)
    const filled: ExerciseTest[] = []
    for (const test of draft.tests) {
      const { output, error } = await runOnce(draft.answer, test.stdin)
      if (error) {
        setFilling(false)
        setMessage(`모범답안이 오류로 멈췄습니다 (입력: ${test.stdin || '없음'}) — ${error}`)
        return
      }
      filled.push({ ...test, expected: output.replace(/\n+$/, '') })
    }
    patch({ tests: filled })
    setFilling(false)
    setMessage(`기대 출력 ${filled.length}개를 채웠습니다.`)
  }

  const save = async () => {
    if (!draft.title.trim()) {
      setMessage('제목을 적어 주세요.')
      return
    }
    if (draft.tests.some((test) => test.expected === '')) {
      setMessage('기대 출력이 빈 테스트가 있습니다. "기대 출력 채우기" 를 먼저 눌러 주세요.')
      return
    }
    if (exercise) await updateExercise(exercise.id, draft)
    else await createExercise(draft)
    onDone()
  }

  const field = 'w-full rounded-lg border border-cream-deep bg-white p-2.5 text-sm text-ink-900 focus:border-cheese-300 focus:outline-none'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-extrabold text-ink-900">
          {exercise ? '문제 편집' : '새 문제'}
        </h2>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-cream-deep px-4 py-2 text-sm font-semibold text-ink-700"
          >
            취소
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 hover:bg-cheese-300"
          >
            저장
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-ink-700">
          제목
          <input
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-sm font-bold text-ink-700">
          배우는 것
          <input
            value={draft.concept}
            onChange={(e) => patch({ concept: e.target.value })}
            placeholder="예: for, range, 누적"
            className={field}
          />
        </label>
      </div>

      <label className="text-sm font-bold text-ink-700">
        문제 설명
        <textarea
          value={draft.body}
          onChange={(e) => patch({ body: e.target.value })}
          rows={3}
          className={field}
        />
      </label>

      <label className="text-sm font-bold text-ink-700">
        입력·출력 형식
        <textarea
          value={draft.io}
          onChange={(e) => patch({ io: e.target.value })}
          rows={2}
          placeholder={'- 입력: 첫째 줄에 …\n- 출력: …'}
          className={field}
        />
      </label>

      <label className="text-sm font-bold text-ink-700">
        모범답안 (학생은 2번 틀린 뒤에 볼 수 있습니다)
        <textarea
          value={draft.answer}
          onChange={(e) => patch({ answer: e.target.value })}
          rows={8}
          spellCheck={false}
          className={`${field} font-mono`}
        />
      </label>

      <div className="rounded-xl border border-cream-deep bg-cream/40 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-ink-900">테스트</h3>
          <span className="text-xs text-ink-500">
            기대 출력은 직접 적지 마세요 — 모범답안을 실행해서 채웁니다.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => patch({ tests: [...draft.tests, { stdin: '', expected: '', hidden: true }] })}
              className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-sm font-semibold text-ink-700"
            >
              + 테스트
            </button>
            <button
              onClick={fillExpected}
              disabled={filling || status === 'booting'}
              className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-bold text-cheese-100 disabled:opacity-50"
            >
              {filling ? '실행 중…' : status === 'booting' ? '준비 중…' : '▶ 기대 출력 채우기'}
            </button>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {draft.tests.map((test, index) => (
            <li key={index} className="grid gap-2 rounded-lg bg-white p-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-ink-500">
                입력
                <textarea
                  value={test.stdin}
                  onChange={(e) => patchTest(index, { stdin: e.target.value })}
                  rows={2}
                  spellCheck={false}
                  className={`${field} font-mono`}
                />
              </label>
              <div className="text-xs font-bold text-ink-500">
                기대 출력 (자동)
                <pre className="min-h-[2.5rem] whitespace-pre-wrap rounded-lg bg-cream/60 p-2.5 font-mono text-sm text-ink-900">
                  {test.expected || '— 아직 비어 있음'}
                </pre>
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={test.hidden}
                    onChange={(e) => patchTest(index, { hidden: e.target.checked })}
                  />
                  숨김 (학생에게 통과 여부만 보임)
                </label>
                <button
                  onClick={() =>
                    patch({ tests: draft.tests.filter((_, i) => i !== index) })
                  }
                  className="ml-auto text-sm font-semibold text-red-700"
                >
                  이 테스트 삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-ink-700">
          힌트
          <textarea
            value={draft.hint}
            onChange={(e) => patch({ hint: e.target.value })}
            rows={2}
            className={field}
          />
        </label>
        <label className="text-sm font-bold text-ink-700">
          덧붙임 (선택)
          <textarea
            value={draft.note ?? ''}
            onChange={(e) => patch({ note: e.target.value })}
            rows={2}
            placeholder="더 짧게 쓰는 방법, 채점의 한계 같은 것"
            className={field}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
        <input
          type="checkbox"
          checked={draft.published}
          onChange={(e) => patch({ published: e.target.checked })}
        />
        학생에게 공개
      </label>

      {message && <p className="text-sm text-ink-700">{message}</p>}
    </div>
  )
}
