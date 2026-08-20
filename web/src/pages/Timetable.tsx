import { useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthProvider'
import PolicyModal from '../components/PolicyModal'
import ToggleSwitch from '../components/ToggleSwitch'
import { asset } from '../lib/asset'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  DEFAULT_PERIODS,
  MAX_PERIODS,
  MIN_PERIODS,
  TIMETABLE_DAYS,
  cellKey,
  clearCell,
  getTimetable,
  isEmptyCell,
  saveCell,
  setPeriods,
  type TimetableCell,
  type TimetableData,
} from '../lib/timetable'
import { Centered, GoogleMark } from './Teacher'

/**
 * 교사 시간표.
 *
 * Teacher.tsx 와 같은 인증 게이트 4단계(loading/anonymous/not-allowed/teacher)를
 * 그대로 따른다 — Centered/GoogleMark 를 그쪽에서 가져다 쓴다(중복 방지).
 * 교사 페이지 안의 탭이 아니라 네비게이션 최상단(Lab 옆)에 독립된 탭으로 두므로
 * 이 페이지 자체가 게이트를 갖는다.
 */
export default function Timetable() {
  const { user, state, error, signIn, signOutTeacher } = useAuth()

  if (!isFirebaseConfigured) {
    return (
      <Centered>
        <h1 className="text-xl font-extrabold text-ink-900">Firebase 설정이 없습니다</h1>
        <p className="text-sm text-ink-700">
          <code className="rounded bg-cream-deep px-1.5 py-0.5">web/.env.local</code> 에 설정값을
          넣고 개발 서버를 다시 시작해 주세요.
        </p>
      </Centered>
    )
  }

  if (state === 'loading') {
    return (
      <Centered>
        <p className="text-ink-500">확인 중…</p>
      </Centered>
    )
  }

  if (state === 'anonymous') {
    return (
      <Centered>
        <img
          src={asset('chicode.png')}
          alt=""
          className="size-20 rounded-full ring-2 ring-cheese-300"
        />
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">교사 로그인</h1>
        <p className="max-w-sm text-sm text-ink-700">
          시간표는 로그인한 교사만 볼 수 있습니다.
        </p>

        <button
          onClick={signIn}
          className="mt-2 flex items-center gap-2.5 rounded-xl border border-cream-deep bg-white px-5 py-3 font-bold text-ink-900 shadow-sm transition-colors hover:border-cheese-300"
        >
          <GoogleMark />
          Google 계정으로 로그인
        </button>

        {error && <p className="max-w-sm text-sm text-red-700">{error}</p>}
      </Centered>
    )
  }

  if (state === 'not-allowed') {
    return (
      <Centered>
        <span className="text-4xl">🚫</span>
        <h1 className="text-xl font-extrabold text-ink-900">접근 권한이 없습니다</h1>
        <p className="max-w-sm text-sm text-ink-700">
          <strong className="font-semibold">{user?.email}</strong> 은(는) 허용된 교사 계정이
          아닙니다. 다른 계정으로 로그인하거나 관리자에게 등록을 요청해 주세요.
        </p>
        <button
          onClick={signOutTeacher}
          className="rounded-xl border border-cream-deep px-4 py-2.5 font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          로그아웃
        </button>
      </Centered>
    )
  }

  return <TimetableBoard />
}

function TimetableBoard() {
  const [data, setData] = useState<TimetableData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [periodsInput, setPeriodsInput] = useState(DEFAULT_PERIODS)
  const [periodsBusy, setPeriodsBusy] = useState(false)
  const [selected, setSelected] = useState<{ dayIndex: number; period: number } | null>(null)
  // 칸 하나를 복사해뒀다가 다른 칸에 붙여넣기 위한 클립보드(사용자 요청) —
  // 매주 반복되는 같은 수업을 여러 칸에 옮겨 적을 때 매번 다시 타이핑하지
  // 않아도 되게 한다. 브라우저 클립보드가 아니라 이 페이지를 벗어나면
  // 사라지는 컴포넌트 상태일 뿐이다 — 새로고침하면 비워진다.
  const [clipboard, setClipboard] = useState<TimetableCell | null>(null)
  // 기본은 보기 전용이다 — 그리드를 훑어보다 실수로 칸을 눌러 값이 바뀌는 걸
  // 막으려고, 실제로 고치려면 이 스위치를 먼저 켜야 칸이 눌리게 했다(사용자
  // 요청). 새로고침하면 다시 꺼지는 편이 안전해서 페이지를 벗어나도 기억하지
  // 않는다 — sessionStorage 등에 남기지 않음.
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    getTimetable()
      .then((loaded) => {
        setData(loaded)
        setPeriodsInput(loaded.periods)
      })
      .catch((caught) => {
        console.error('시간표 불러오기 실패', caught)
        setLoadError(true)
      })
  }, [])

  async function applyPeriods(next: number) {
    const clamped = Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, next))
    setPeriodsInput(clamped)
    if (!data || clamped === data.periods) return
    setPeriodsBusy(true)
    try {
      await setPeriods(clamped)
      setData({ ...data, periods: clamped })
    } catch (caught) {
      console.error('교시 수 변경 실패', caught)
      setPeriodsInput(data.periods)
      alert('교시 수를 바꾸지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setPeriodsBusy(false)
    }
  }

  function handleSaved(key: string, cell: TimetableCell) {
    setData((prev) => (prev ? { ...prev, cells: { ...prev.cells, [key]: cell } } : prev))
    setSelected(null)
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        시간표를 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!data) {
    return <p className="text-ink-500">불러오는 중…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">시간표</h1>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-700">편집 모드</span>
            <ToggleSwitch checked={editMode} onChange={() => setEditMode((prev) => !prev)} label="시간표 편집 모드" />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="periods" className="font-semibold text-ink-700">
              교시 수
            </label>
            <input
              id="periods"
              type="number"
              min={MIN_PERIODS}
              max={MAX_PERIODS}
              value={periodsInput}
              disabled={!editMode || periodsBusy}
              onChange={(event) => setPeriodsInput(Number(event.target.value))}
              onBlur={(event) => applyPeriods(Number(event.target.value))}
              className="w-16 rounded-lg border border-cream-deep bg-white px-2 py-1.5 text-center text-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-cream-deep bg-white/70">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-16 border-b border-cream-deep px-2 py-3 text-xs font-semibold text-ink-500">
                교시
              </th>
              {TIMETABLE_DAYS.map((day) => (
                <th
                  key={day}
                  className="border-b border-l border-cream-deep px-2 py-3 font-bold text-ink-900"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: data.periods }, (_, index) => index + 1).map((period) => (
              <tr key={period}>
                <th className="border-b border-cream-deep px-2 py-3 text-xs font-semibold text-ink-500">
                  {period}
                </th>
                {TIMETABLE_DAYS.map((_day, dayIndex) => {
                  const key = cellKey(dayIndex, period)
                  const cell = data.cells[key]
                  const empty = isEmptyCell(cell)
                  const content = empty ? (
                    editMode && <span className="m-auto text-lg">+</span>
                  ) : (
                    <>
                      <span className="w-full truncate font-bold text-ink-900">
                        {cell!.subject || '—'}
                      </span>
                      <span className="w-full truncate text-xs text-ink-600">
                        {[cell!.className, cell!.room].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  )
                  const cellClass = [
                    'flex h-16 w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                    empty ? 'text-ink-300' : 'bg-cheese-100',
                    editMode && (empty ? 'hover:bg-cheese-100' : 'hover:bg-cheese-200'),
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <td key={key} className="border-b border-l border-cream-deep p-1.5 align-top">
                      {editMode ? (
                        <button onClick={() => setSelected({ dayIndex, period })} className={cellClass}>
                          {content}
                        </button>
                      ) : (
                        <div className={cellClass}>{content}</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <CellEditor
          dayIndex={selected.dayIndex}
          period={selected.period}
          cell={data.cells[cellKey(selected.dayIndex, selected.period)]}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          clipboard={clipboard}
          onCopy={setClipboard}
        />
      )}
    </div>
  )
}

function CellEditor({
  dayIndex,
  period,
  cell,
  onClose,
  onSaved,
  clipboard,
  onCopy,
}: {
  dayIndex: number
  period: number
  cell: TimetableCell | undefined
  onClose: () => void
  onSaved: (key: string, cell: TimetableCell) => void
  clipboard: TimetableCell | null
  onCopy: (cell: TimetableCell) => void
}) {
  const key = cellKey(dayIndex, period)
  const [subject, setSubject] = useState(cell?.subject ?? '')
  const [className, setClassName] = useState(cell?.className ?? '')
  const [room, setRoom] = useState(cell?.room ?? '')
  const [note, setNote] = useState(cell?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const next: TimetableCell = {
      subject: subject.trim(),
      className: className.trim(),
      room: room.trim(),
      note: note.trim(),
    }
    setBusy(true)
    setSaveError(null)
    try {
      await saveCell(key, next)
      onSaved(key, next)
    } catch (caught) {
      console.error('시간표 칸 저장 실패', caught)
      setSaveError('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    setBusy(true)
    setSaveError(null)
    try {
      await clearCell(key)
      onSaved(key, { subject: '', className: '', room: '', note: '' })
    } catch (caught) {
      console.error('시간표 칸 비우기 실패', caught)
      setSaveError('비우지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  // 지금 입력창에 있는 값을 그대로 복사해둔다 — 저장 여부와 무관하게, 눈에
  // 보이는 값을 그대로 가져가는 게 직관적이라고 판단함. 실제 저장은 붙여넣은
  // 뒤 다른 칸에서 "저장"을 눌러야 반영된다(자동 저장 안 함 — 붙여넣고 나서
  // 값을 확인·수정할 여지를 남겨두려고).
  function handleCopy() {
    onCopy({ subject: subject.trim(), className: className.trim(), room: room.trim(), note: note.trim() })
  }

  function handlePaste() {
    if (!clipboard) return
    setSubject(clipboard.subject)
    setClassName(clipboard.className)
    setRoom(clipboard.room)
    setNote(clipboard.note)
  }

  return (
    <PolicyModal title={`${TIMETABLE_DAYS[dayIndex]}요일 ${period}교시`} onClose={onClose}>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-ink-700">반</span>
          <input
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            placeholder="예: 2-3반"
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-ink-700">교실</span>
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            placeholder="예: 컴퓨터실1"
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-ink-700">과목</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="예: 정보"
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-ink-700">메모</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="준비물, 특이사항 등"
            rows={2}
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900"
          />
        </label>

        {saveError && <p className="text-sm text-red-700">{saveError}</p>}

        {clipboard && !isEmptyCell(clipboard) && (
          <p className="text-xs text-ink-500">
            복사해둔 내용:{' '}
            <span className="font-semibold text-ink-700">
              {[clipboard.className, clipboard.room, clipboard.subject].filter(Boolean).join(' · ')}
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-cheese-400 px-4 py-2 font-bold text-ink-900 transition-colors hover:bg-cheese-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '저장 중…' : '저장'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={busy}
            className="rounded-lg border border-cream-deep px-4 py-2 font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            복사
          </button>
          <button
            type="button"
            onClick={handlePaste}
            disabled={busy || !clipboard}
            className="rounded-lg border border-cream-deep px-4 py-2 font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            붙여넣기
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="rounded-lg border border-cream-deep px-4 py-2 font-semibold text-ink-700 transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            비우기
          </button>
        </div>
      </form>
    </PolicyModal>
  )
}
