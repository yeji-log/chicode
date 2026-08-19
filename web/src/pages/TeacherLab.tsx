import { useEffect, useState } from 'react'

import { type LabActivity, type LabSeason, getHomeSettings, listActivities, listSeasons, updateHomeSettings } from '../lib/labs'
import { ActivitiesPanel, SeasonsPanel, groupBySeason } from './LabBoardEditor'

/**
 * 교사 페이지의 Lab 관리 섹션 (Teacher.tsx 에서 불러 쓴다).
 *
 * 시즌(로드맵)/활동 에디터 본체는 LabBoardEditor.tsx 로 옮겼다 — Teacher.tsx의
 * 과목별 "수업목차"/"내용" 탭도 같은 에디터를 subjectId 만 다르게 줘서 재사용
 * 하기 위해서다(복제 대신 일반화). 여기 남은 건 Lab 전역에만 있는
 * HomeSettingsPanel(미션 문구·강조 활동·Lab 전체 핀 — 과목에는 자체 핀이
 * 이미 있어서 이식 대상이 아니다)과 최상위 탭 전환뿐이다.
 */

const inputClass =
  'rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900 focus:border-cheese-300 focus:outline-none'

const LAB_TABS = [
  { key: 'settings', label: '홈 설정' },
  { key: 'roadmap', label: '로드맵' },
  { key: 'activities', label: '활동' },
] as const

type LabTabKey = (typeof LAB_TABS)[number]['key']

const LAB_LABELS = { seasonNoun: '시즌', activityNoun: '활동' }

export default function TeacherLab({ uploaderEmail }: { uploaderEmail: string }) {
  const [tab, setTab] = useState<LabTabKey>('settings')

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2">
        {LAB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
              tab === key
                ? 'bg-cheese-400 text-ink-900'
                : 'border border-cream-deep text-ink-700 hover:border-cheese-300',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'settings' && <HomeSettingsPanel />}
      {tab === 'roadmap' && <SeasonsPanel labels={LAB_LABELS} />}
      {tab === 'activities' && <ActivitiesPanel labels={LAB_LABELS} uploaderEmail={uploaderEmail} />}
    </div>
  )
}

// ── 홈 설정 ───────────────────────────────────────────────────

function HomeSettingsPanel() {
  const [todayMissionText, setTodayMissionText] = useState('')
  const [featuredActivityIds, setFeaturedActivityIds] = useState<string[]>([])
  const [pin, setPin] = useState('')
  const [publishedActivities, setPublishedActivities] = useState<LabActivity[]>([])
  const [seasons, setSeasons] = useState<LabSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([getHomeSettings(), listActivities({ publishedOnly: true }), listSeasons()])
      .then(([settings, activities, seasonList]) => {
        setTodayMissionText(settings.todayMissionText)
        setFeaturedActivityIds(settings.featuredActivityIds)
        setPin(settings.pin)
        setPublishedActivities(activities)
        setSeasons(seasonList)
      })
      .finally(() => setLoading(false))
  }, [])

  // 종료된 시즌(로드맵에서 "완료" 처리한 시즌)의 활동은 강조 활동으로 새로
  // 고를 이유가 없으니 선택 목록에서 뺀다. 로드맵별로 묶어서 보여주면
  // 교사가 어떤 시즌의 활동인지 한눈에 파악하기 쉽다는 요청도 함께 반영.
  const endedSeasonIds = new Set(
    seasons.filter((season) => season.status === '완료').map((season) => season.id),
  )
  const selectableActivities = publishedActivities.filter(
    (activity) => !endedSeasonIds.has(activity.seasonId),
  )
  const groupedSelectableActivities = groupBySeason(selectableActivities, seasons)

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const trimmedPin = pin.trim()
    if (!trimmedPin) {
      setError('핀번호는 비워둘 수 없습니다.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await updateHomeSettings({
        todayMissionText: todayMissionText.trim(),
        featuredActivityIds,
        pin: trimmedPin,
      })
      setSavedAt(Date.now())
    } catch (caught) {
      console.error('Lab 홈 설정 저장 실패', caught)
      setError('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  function toggleFeatured(activityId: string) {
    setFeaturedActivityIds((current) =>
      current.includes(activityId)
        ? current.filter((id) => id !== activityId)
        : [...current, activityId],
    )
  }

  if (loading) return <p className="text-ink-500">불러오는 중…</p>

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6"
    >
      <h2 className="font-bold text-ink-900">Lab 홈 설정</h2>

      <label className="flex max-w-[10rem] flex-col gap-1.5 text-sm font-semibold text-ink-700">
        핀번호
        <input
          value={pin}
          onChange={(event) => {
            setPin(event.target.value)
            setError(null)
          }}
          placeholder="예: 0000"
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-500">
          학생이 Lab 탭에 들어올 때 입력합니다. 기본값 0000.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
        오늘의 미션
        <textarea
          value={todayMissionText}
          onChange={(event) => {
            setTodayMissionText(event.target.value)
            setError(null)
          }}
          rows={3}
          placeholder="예: 장애물을 감지하고 RC카를 멈춰보세요."
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-500">
          비워두면 Lab 홈에서 미션 카드 자체가 보이지 않습니다.
        </span>
      </label>

      <div className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
        강조 활동 (선택, 여러 개 가능)
        {selectableActivities.length === 0 ? (
          <p className="rounded-lg border border-dashed border-cream-deep px-3 py-2 text-xs font-normal text-ink-500">
            아직 공개된 활동이 없습니다.
          </p>
        ) : (
          <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-lg border border-cream-deep bg-white p-2">
            {groupedSelectableActivities.map((group) => (
              <div key={group.id || '미지정'} className="flex flex-col gap-1">
                <p className="px-1.5 text-xs font-bold text-ink-500">{group.title}</p>
                {group.items.map((activity) => (
                  <label
                    key={activity.id}
                    className="flex items-center gap-2 rounded px-1.5 py-1 text-sm font-normal text-ink-900 hover:bg-cream"
                  >
                    <input
                      type="checkbox"
                      checked={featuredActivityIds.includes(activity.id)}
                      onChange={() => toggleFeatured(activity.id)}
                    />
                    {activity.title}
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        <span className="text-xs font-normal text-ink-500">
          Lab 홈에 &quot;활동 이어가기&quot; 버튼으로 각각 표시됩니다. 공개된 활동 중 로드맵이
          &quot;완료&quot; 상태인 시즌의 활동은 뺐습니다.
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
        {savedAt && <span className="text-sm text-ink-500">저장했습니다.</span>}
      </div>
    </form>
  )
}
