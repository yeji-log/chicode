import { useEffect, useRef, useState } from 'react'

import { useAuth } from '../auth/AuthProvider'
import PolicyModal from '../components/PolicyModal'
import ToggleSwitch from '../components/ToggleSwitch'
import { asset } from '../lib/asset'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  AUTO_PALETTE,
  DEFAULT_PERIODS,
  MAX_PERIODS,
  MIN_PERIODS,
  TIMETABLE_DAYS,
  cellKey,
  classColorFor,
  clearCell,
  getTimetable,
  isEmptyCell,
  saveCell,
  setClassColor,
  setPeriodTime,
  setPeriods,
  type TimetableCell,
  type TimetableData,
} from '../lib/timetable'
import ClassRecords from './ClassRecords'
import { Centered, GoogleMark } from './Teacher'

/**
 * "일정" 탭 — 시간표(요일 x 교시 그리드) + 기록(반별 학생 명단과 참여 기록)
 * 두 섹션을 하나의 탭 안에 둔다(사용자 요청 — 원래 "시간표"였던 최상단
 * 내비게이션 탭 이름도 "일정"으로 바꿈, App.tsx의 TEACHER_TABS 참고).
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

  return <ScheduleTabs />
}

function ScheduleTabs() {
  const [section, setSection] = useState<'grid' | 'records'>('grid')

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-2 border-b border-cream-deep pb-3">
        <button
          onClick={() => setSection('grid')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            section === 'grid' ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          🗓️ 시간표
        </button>
        <button
          onClick={() => setSection('records')}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            section === 'records' ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          📝 기록
        </button>
      </nav>

      {section === 'grid' ? <TimetableBoard /> : <ClassRecords />}
    </div>
  )
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

  // 반 색상은 칸 저장과 별개로 즉시 반영한다(사용자 요청 — 색 지정 가능) —
  // 다른 즉시-반영 토글들(SubjectSettings의 공개 여부 등)과 같은 이유로,
  // "저장" 버튼까지 기다리지 않고 눌러본 그 자리에서 바로 확인하고 싶을
  // 때가 많다고 판단했다.
  async function handleColorChange(className: string, color: string | null) {
    try {
      await setClassColor(className, color)
      setData((prev) => {
        if (!prev) return prev
        const nextColors = { ...prev.classColors }
        if (color === null) delete nextColors[className]
        else nextColors[className] = color
        return { ...prev, classColors: nextColors }
      })
    } catch (caught) {
      console.error('반 색상 변경 실패', caught)
      alert('색상을 바꾸지 못했습니다. 다시 시도해 주세요.')
    }
  }

  // 입력창에 타이핑하는 동안은 로컬 상태만 바꾸고(즉시 화면에 반영), 포커스를
  // 벗어날 때만 실제로 저장한다 — 교시 수 입력(applyPeriods)과 같은 패턴.
  // 여기선 교시마다 입력칸이 여러 개라 별도 로컬 state 대신 data.periodTimes를
  // 그대로 controlled value로 쓰고, 포커스 시점 값을 ref에 담아뒀다가 실패하면
  // 그 값으로 되돌린다.
  const periodTimeBeforeEdit = useRef<Record<number, string>>({})

  function handlePeriodTimeFocus(period: number, value: string) {
    periodTimeBeforeEdit.current[period] = value
  }

  function handlePeriodTimeInput(period: number, value: string) {
    setData((prev) =>
      prev ? { ...prev, periodTimes: { ...prev.periodTimes, [period]: value } } : prev,
    )
  }

  async function handlePeriodTimeBlur(period: number) {
    if (!data) return
    const previous = (periodTimeBeforeEdit.current[period] ?? '').trim()
    const value = (data.periodTimes[period] ?? '').trim()
    if (value === previous) return
    try {
      await setPeriodTime(period, value)
    } catch (caught) {
      console.error('교시 시간 저장 실패', caught)
      setData((prev) =>
        prev ? { ...prev, periodTimes: { ...prev.periodTimes, [period]: previous } } : prev,
      )
      alert('시간을 저장하지 못했습니다. 다시 시도해 주세요.')
    }
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
                  <div className="flex flex-col items-center gap-1">
                    <span>{period}</span>
                    {editMode ? (
                      <input
                        type="text"
                        value={data.periodTimes[period] ?? ''}
                        placeholder="시간"
                        onFocus={(event) => handlePeriodTimeFocus(period, event.target.value)}
                        onChange={(event) => handlePeriodTimeInput(period, event.target.value)}
                        onBlur={() => handlePeriodTimeBlur(period)}
                        className="w-14 rounded border border-cream-deep bg-white px-1 py-0.5 text-center text-[10px] font-normal text-ink-700"
                      />
                    ) : (
                      data.periodTimes[period] && (
                        <span className="font-normal text-ink-400">{data.periodTimes[period]}</span>
                      )
                    )}
                  </div>
                </th>
                {TIMETABLE_DAYS.map((_day, dayIndex) => {
                  const key = cellKey(dayIndex, period)
                  const cell = data.cells[key]
                  const empty = isEmptyCell(cell)
                  // 반이 과목 자리(굵고 큰 헤드라인)를, 과목이 반 자리(작은
                  // 보조 텍스트)를 대신한다(사용자 요청) — 실제로 칸을 훑어볼
                  // 때는 "몇 반 수업인지"가 먼저 눈에 들어와야 한다고 판단.
                  const content = empty ? (
                    editMode && <span className="m-auto text-lg">+</span>
                  ) : (
                    <>
                      <span className="w-full truncate text-base font-bold text-ink-900">
                        {cell!.className || '—'}
                      </span>
                      <span className="w-full truncate text-xs text-ink-600">
                        {[cell!.room, cell!.subject].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  )
                  // 반 이름이 있으면 그 반의 색(직접 지정했거나, 없으면 이름에서
                  // 결정론적으로 뽑은 자동 색)을 칸 배경에 쓴다 — 같은 반은 항상
                  // 같은 색으로 보이게 하려는 목적(사용자 요청)이라 Tailwind
                  // bg-* 유틸이 아니라 인라인 style로 칠한다(임의의 hex를 써야
                  // 해서 정적 클래스로는 못 만든다). hover는 밝기만 살짝
                  // 낮추는 필터를 써서 어떤 배경색에도 똑같이 먹힌다.
                  const cellColor =
                    !empty && cell!.className.trim() ? classColorFor(data, cell!.className) : null
                  const cellClass = [
                    'flex h-16 w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition-[filter]',
                    empty ? 'text-ink-300' : '',
                    !cellColor && !empty ? 'bg-cheese-100' : '',
                    editMode && (cellColor ? 'hover:brightness-95' : empty ? 'hover:bg-cheese-100' : 'hover:bg-cheese-200'),
                  ]
                    .filter(Boolean)
                    .join(' ')
                  const cellStyle = cellColor ? { backgroundColor: cellColor } : undefined

                  return (
                    <td key={key} className="border-b border-l border-cream-deep p-1.5 align-top">
                      {editMode ? (
                        <button
                          onClick={() => setSelected({ dayIndex, period })}
                          className={cellClass}
                          style={cellStyle}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className={cellClass} style={cellStyle}>
                          {content}
                        </div>
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
          classColors={data.classColors}
          onColorChange={handleColorChange}
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
  classColors,
  onColorChange,
}: {
  dayIndex: number
  period: number
  cell: TimetableCell | undefined
  onClose: () => void
  onSaved: (key: string, cell: TimetableCell) => void
  clipboard: TimetableCell | null
  onCopy: (cell: TimetableCell) => void
  classColors: Record<string, string>
  onColorChange: (className: string, color: string | null) => Promise<void>
}) {
  const key = cellKey(dayIndex, period)
  const [subject, setSubject] = useState(cell?.subject ?? '')
  const [className, setClassName] = useState(cell?.className ?? '')
  const [room, setRoom] = useState(cell?.room ?? '')
  const [note, setNote] = useState(cell?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [colorBusy, setColorBusy] = useState(false)

  const trimmedClassName = className.trim()
  const hasManualColor = trimmedClassName in classColors
  const effectiveColor = trimmedClassName ? classColorFor({ classColors }, trimmedClassName) : null

  async function handlePickColor(color: string | null) {
    if (!trimmedClassName) return
    setColorBusy(true)
    try {
      await onColorChange(trimmedClassName, color)
    } finally {
      setColorBusy(false)
    }
  }

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

        {/* 반 색상 — 같은 반 이름은 항상 같은 색으로 보이도록 이름에서 자동으로
            색을 뽑아 쓰지만(lib/timetable.ts의 autoClassColor), 여기서 직접
            지정해 그 자동 색을 덮어쓸 수도 있다(사용자 요청). 반 이름을 아직
            안 썼으면 어떤 반에 지정하는 건지 알 수 없으니 숨긴다. 색은
            저장 버튼과 무관하게 고르는 즉시 반영된다. */}
        {trimmedClassName && (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-ink-700">반 색상</span>
            <div className="flex flex-wrap items-center gap-2">
              {AUTO_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${trimmedClassName} 색상을 ${color}로 지정`}
                  disabled={colorBusy}
                  onClick={() => handlePickColor(color)}
                  className={[
                    'size-7 shrink-0 rounded-full ring-offset-2 transition-shadow disabled:cursor-not-allowed',
                    effectiveColor === color ? 'ring-2 ring-ink-900' : 'ring-1 ring-cream-deep',
                  ].join(' ')}
                  style={{ backgroundColor: color }}
                />
              ))}

              <input
                type="color"
                aria-label={`${trimmedClassName} 색상 직접 선택`}
                value={effectiveColor ?? '#ffffff'}
                disabled={colorBusy}
                onChange={(event) => handlePickColor(event.target.value)}
                className="size-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 disabled:cursor-not-allowed"
              />

              {hasManualColor && (
                <button
                  type="button"
                  disabled={colorBusy}
                  onClick={() => handlePickColor(null)}
                  className="rounded-lg border border-cream-deep px-2.5 py-1 text-xs font-semibold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  자동으로
                </button>
              )}
            </div>
          </div>
        )}

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
