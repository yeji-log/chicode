import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { useLabScope } from '../lib/labScope'
import { listActivities, listSeasons, type LabActivity, type LabSeason } from '../lib/labs'

/**
 * /lab/activities — 활동 목록. `/materials/:subjectId/content` 아래에도
 * 마운트되어 과목별 "내용" 화면으로 재사용된다(useLabScope 참고).
 *
 * 탭은 고정 카테고리가 아니라 교사가 만든 시즌 목록을 그대로 불러와서 만든다
 * (lib/labs.ts 상단 설명 참고 — 로드맵이 곧 이 탭의 출처다).
 * ?season= 으로 초기 필터를 받는다 (Roadmap 카드에서 넘어옴).
 *
 * "전체" 탭은 없다 — 교사가 만든 로드맵(시즌) 안에서만 활동을 보게 한다.
 * ?season= 없이 들어오면(예: Lab 홈의 "활동" 카드) 첫 번째 시즌으로 자동
 * 이동시킨다 — 시즌 목록을 불러오기 전까지는 activeSeasonId 가 비어 있을
 * 수밖에 없어서, 그 사이엔 activities 를 불러오지 않고 기다린다.
 */
export default function LabActivities() {
  const scope = useLabScope()
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSeasonId = searchParams.get('season') ?? ''

  const [seasons, setSeasons] = useState<LabSeason[]>([])
  const [seasonsLoaded, setSeasonsLoaded] = useState(false)
  const [activities, setActivities] = useState<LabActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listSeasons(scope.subjectId ? { subjectId: scope.subjectId } : undefined)
      .then(setSeasons)
      .finally(() => setSeasonsLoaded(true))
  }, [scope.subjectId])

  // season 파라미터 없이 들어온 경우, 시즌 목록이 로드되는 대로 첫 시즌으로
  // 보정한다. (예: 시즌이 아예 없으면 그대로 둔다 — 아래에서 안내 문구만 보임.)
  useEffect(() => {
    if (!seasonsLoaded || requestedSeasonId || seasons.length === 0) return
    setSearchParams({ season: seasons[0].id }, { replace: true })
  }, [seasonsLoaded, requestedSeasonId, seasons, setSearchParams])

  const activeSeasonId = requestedSeasonId || (seasons.length > 0 ? seasons[0].id : '')

  // publishedOnly 로 거르지 않고 이 시즌의 활동을 전부 받아온다 — 비공개
  // (임시저장) 활동도 목록에서 아예 숨기지 않고 "준비중" 카드로 보여주기
  // 위해서다(아래 렌더링의 isLocked 참고). 시즌 자체가 "준비중"이든, 활동
  // 하나만 아직 비공개든 학생 입장에선 똑같이 "아직 못 들어감"이라 카드
  // 모양을 통일했다.
  useEffect(() => {
    if (!activeSeasonId) {
      // 시즌 목록을 아직 못 불러왔거나(로딩 중), 교사가 시즌을 하나도 안
      // 만든 경우 — 둘 다 activities 를 부를 게 없다. 후자는 로딩을 멈추고
      // 안내 문구를 보여준다.
      if (seasonsLoaded) {
        setActivities([])
        setLoading(false)
      }
      return
    }
    setLoading(true)
    listActivities({ seasonId: activeSeasonId, subjectId: scope.subjectId })
      .then(setActivities)
      .finally(() => setLoading(false))
  }, [activeSeasonId, seasonsLoaded, scope.subjectId])

  const activeSeason = seasons.find((season) => season.id === activeSeasonId)
  const isPreparingSeason = activeSeason?.status === '준비중'
  // 완료된 시즌은 잠그진 않는다(계속 들어가서 볼 수 있어야 함) — Roadmap
  // 카드와 같은 이유로 grayscale 만 덧씌워서 "지난 활동"임을 표시한다.
  const isCompletedSeason = activeSeason?.status === '완료'

  function selectSeason(id: string) {
    setSearchParams({ season: id })
  }

  const seasonTitle = (seasonId: string) =>
    seasons.find((season) => season.id === seasonId)?.title ?? ''

  return (
    <div className="flex flex-col gap-6">
      <header>
        {/* 과목 스코프에서는 Lab 홈 대신 수업목차(로드맵)로 돌아가는 게 더
            쓸모 있다 — 여기가 이미 특정 과목 안이라 Lab 홈으로 튈 이유가 없다. */}
        <Link
          to={scope.subjectId ? scope.roadmapPath : '/lab'}
          className="text-sm font-semibold text-ink-500 underline"
        >
          {scope.subjectId ? `← ${scope.seasonNoun}` : '← Lab 홈'}
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{scope.activityNoun}</h1>
      </header>

      {seasons.length > 0 && (
        <nav className="flex flex-wrap gap-2">
          {seasons.map((season) => (
            <button
              key={season.id}
              onClick={() => selectSeason(season.id)}
              className={tabClass(activeSeasonId === season.id)}
            >
              {season.emoji} {season.title}
            </button>
          ))}
        </nav>
      )}

      {isPreparingSeason && !loading && activities.length > 0 && (
        <p className="rounded-xl bg-cream-deep/60 px-4 py-3 text-sm text-ink-500">
          {isTeacherViewer ? (
            <>
              🚧 아직 준비 중인 {scope.seasonNoun}입니다. 교사로 로그인해 있어 그대로 들어가
              확인할 수 있고, 학생 화면에는 제목만 잠긴 카드로 보입니다.
            </>
          ) : (
            <>
              🔒 아직 준비 중인 {scope.seasonNoun}예요. 어떤 {scope.activityNoun}이 있는지만 미리
              볼 수 있고, 열리면 들어갈 수 있습니다.
            </>
          )}
        </p>
      )}

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : seasonsLoaded && seasons.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 등록된 {scope.seasonNoun}가 없습니다.
        </p>
      ) : activities.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 등록된 {scope.activityNoun}이 없습니다.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) => {
            // 시즌 자체가 "준비중"이거나, 시즌은 열렸어도 이 활동만 아직
            // 비공개(임시저장)면 학생에게는 아직 열지 않은 항목이다.
            const hiddenFromStudents = isPreparingSeason || !activity.published
            // 교사는 그 항목도 그대로 들어간다 — 공개 전에 학생이 볼 화면을
            // 그대로 확인하려면 들어가져야 하고, 자기가 만들어 둔 자료를
            // 자기가 못 여는 것도 앞뒤가 안 맞는다(Materials.tsx 의 준비중
            // 과목, LabGate 의 핀 건너뛰기와 같은 판단). 대신 아래 배지로
            // "아직 학생에게는 안 보인다"를 항상 붙인다 — 안 그러면 이미
            // 공개된 것으로 착각한 채 수업에 들어갈 수 있다.
            //
            // 학생에게는 제목만 미리 보여주고 링크를 아예 안 건다(직접 URL로
            // 들어가더라도 LabActivityDetail 이 같은 검사로 다시 막는다 —
            // 이중 방어).
            const isLocked = hiddenFromStudents && !isTeacherViewer

            return isLocked ? (
              <li
                key={activity.id}
                className="flex h-full cursor-not-allowed flex-col gap-2 rounded-2xl border border-dashed border-cream-deep bg-white/40 p-5 opacity-70"
              >
                <h2 className="font-bold text-ink-900">{activity.title}</h2>
                <span className="mt-auto pt-2 text-xs font-semibold text-ink-500">
                  🔒 준비중
                </span>
              </li>
            ) : (
              <li key={activity.id}>
                <Link
                  to={scope.activityDetailPath(activity.id)}
                  className={[
                    'flex h-full flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-5 transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md',
                    isCompletedSeason ? 'grayscale opacity-60 hover:opacity-100' : '',
                  ].join(' ')}
                >
                  {activity.seasonId && seasonTitle(activity.seasonId) && (
                    <span className="text-xs font-semibold text-cheese-600">
                      {seasonTitle(activity.seasonId)}
                    </span>
                  )}
                  <h2 className="font-bold text-ink-900">{activity.title}</h2>
                  {/* 미리보기 한 줄 — 예전엔 "오늘의 목표" 필드였는데, 이제 항목
                      이름은 교사가 자유롭게 바꾸므로 순서상 첫 항목 내용을 쓴다. */}
                  {activity.sections[0]?.content && (
                    <p className="line-clamp-2 text-sm text-ink-700">
                      {activity.sections[0].content}
                    </p>
                  )}
                  <span className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-ink-500">
                    {difficultyStars(activity.difficulty)}
                    {/* 여기까지 왔다는 건 교사라는 뜻이다 — isLocked 가 아니면서
                        학생에게 안 보이는 경우는 교사뿐이다(위 isLocked 계산 참고). */}
                    {hiddenFromStudents && (
                      <span className="rounded-full bg-cream-deep px-2 py-0.5 font-semibold text-ink-500">
                        🚧 학생에게 비공개
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function difficultyStars(difficulty: number): string {
  const filled = Math.max(0, Math.min(5, difficulty))
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}

function tabClass(active: boolean): string {
  return [
    'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
    active
      ? 'bg-cheese-400 text-ink-900'
      : 'border border-cream-deep text-ink-700 hover:border-cheese-300',
  ].join(' ')
}
