import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState } from 'react'

import ToggleSwitch from '../components/ToggleSwitch'
import type { ChunkedFileMeta } from '../lib/chunkedFile'
import {
  type LabActivity,
  type LabActivityInput,
  type LabActivitySection,
  type LabChecklistItem,
  type LabSeason,
  type LabSeasonInput,
  addActivity,
  addSeason,
  deleteActivity,
  deleteSeason,
  isChecklistSection,
  isSlidesSection,
  listActivities,
  listSeasons,
  makeChecklistSection,
  makeSlidesSection,
  updateActivity,
  updateSeason,
} from '../lib/labs'
import {
  SectionAttachmentError,
  deleteSectionAttachment,
  getSectionAttachmentMeta,
  uploadSectionAttachment,
} from '../lib/labSectionAttachments'
import {
  type LabSlideSet,
  SlideValidationError,
  deleteSlidePdf,
  deleteSlidePptx,
  getSlidePptxFile,
  getSlideSet,
  saveNotes,
  uploadSlidePdf,
  uploadSlidePptx,
} from '../lib/labSlides'
import { extractNotesFromPptx } from '../lib/pptxNotes'
import { extractYoutubeId } from '../lib/youtube'

/**
 * Lab의 시즌(로드맵)+활동 에디터 — 원래 TeacherLab.tsx 안에 있던 것을 그대로
 * 옮겼다. TeacherLab.tsx(Lab 전역, subjectId 없음)와 Teacher.tsx의 SubjectPanel
 * (특정 과목의 "수업목차"/"내용", subjectId 있음) 양쪽에서 재사용하려고
 * 분리했다 — 코드를 복제하는 대신 `subjectId`/`labels` prop 하나로 스코프와
 * 용어(시즌↔수업목차, 활동↔내용)만 바꿔 끼운다.
 *
 * `SectionsEditor` 이하(드래그 정렬·체크리스트·첨부·발표자료)는 이미
 * activityId/sectionId 단위로만 동작해서 subjectId 를 몰라도 된다 — labels도
 * 안 내려보낸다(SectionsEditor 제목 "구성 항목"은 두 맥락 모두에 쓰는
 * 고정 문구로 정함, "활동 내용"을 그대로 두면 수업자료에서 "내용 내용"으로
 * 겹쳐 보이는 문제가 있었다).
 */

const inputClass =
  'rounded-lg border border-cream-deep bg-white px-3 py-2 text-ink-900 focus:border-cheese-300 focus:outline-none'

/**
 * 활동을 시즌(로드맵) 순서대로 묶는다 — "활동 목록"과 "강조 활동" 선택 둘 다
 * 로드맵별로 구분해 달라는 요청으로 추가했다. seasons 는 이미 listSeasons()가
 * order asc로 정렬해서 주므로 그 순서를 그대로 따르면 된다. seasonId 가
 * 비어 있는(어느 시즌에도 안 속한) 활동은 "미지정" 그룹으로 모아 맨 끝에 둔다.
 *
 * TeacherLab.tsx의 HomeSettingsPanel(Lab 전역, 강조 활동 선택기)도 이 함수를
 * 쓰므로 export 유지.
 */
export function groupBySeason<T extends { seasonId: string }>(
  items: T[],
  seasons: LabSeason[],
): { id: string; title: string; items: T[] }[] {
  const bySeasonId = new Map<string, T[]>()
  for (const item of items) {
    const key = item.seasonId || ''
    const list = bySeasonId.get(key)
    if (list) list.push(item)
    else bySeasonId.set(key, [item])
  }

  const groups = seasons
    .map((season) => ({
      id: season.id,
      title: `${season.emoji ? `${season.emoji} ` : ''}${season.title}`,
      items: bySeasonId.get(season.id) ?? [],
    }))
    .filter((group) => group.items.length > 0)

  const unassigned = bySeasonId.get('') ?? []
  if (unassigned.length > 0) groups.push({ id: '', title: '미지정', items: unassigned })

  return groups
}

/** SeasonsPanel/ActivitiesPanel 이 화면에 쓰는 명사 — Lab 은 '시즌'/'활동',
 *  과목별 수업자료는 '수업목차'/'내용'. */
export interface LabBoardLabels {
  seasonNoun: string
  activityNoun: string
}

// ── 로드맵(시즌) / 수업목차 ──────────────────────────────────

type SeasonFormState = {
  title: string
  emoji: string
  status: LabSeason['status']
  order: string
  description: string
}

function emptySeasonForm(order = 0): SeasonFormState {
  return {
    title: '',
    emoji: '',
    status: '준비중',
    order: String(order),
    description: '',
  }
}

const SEASON_STATUSES: LabSeason['status'][] = ['준비중', '진행중', '완료']

/** 상태 버튼이 선택됐을 때의 색 — 준비중은 원래 쓰던 치즈색 그대로 두고,
 *  진행중/완료는 한눈에 구분되도록 초록/빨강을 새로 씀. */
function seasonStatusActiveClass(status: LabSeason['status']): string {
  switch (status) {
    case '진행중':
      return 'bg-green-500 text-white'
    case '완료':
      return 'bg-red-500 text-white'
    default:
      return 'bg-cheese-400 text-ink-900'
  }
}

export function SeasonsPanel({
  subjectId,
  labels,
}: {
  /** 있으면 이 과목(subjects/{id})의 수업목차만 다룬다. 없으면 Lab 전역 시즌. */
  subjectId?: string
  labels: LabBoardLabels
}) {
  const [seasons, setSeasons] = useState<LabSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SeasonFormState>(emptySeasonForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 목록에서 상태 버튼 하나를 누르는 동안만 그 행을 잠근다(활동 목록의
  // togglingId 와 같은 이유).
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  async function refresh() {
    setLoading(true)
    const list = await listSeasons(subjectId ? { subjectId } : undefined)
    setSeasons(list)
    setLoading(false)
    return list
  }

  function startEdit(season: LabSeason) {
    setEditingId(season.id)
    setForm({
      title: season.title,
      emoji: season.emoji,
      status: season.status,
      order: String(season.order),
      description: season.description,
    })
    setError(null)
  }

  function resetForm(nextOrder: number) {
    setEditingId(null)
    setForm(emptySeasonForm(nextOrder))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('제목을 입력해 주세요.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const input: LabSeasonInput = {
        title: form.title.trim(),
        emoji: form.emoji.trim(),
        status: form.status,
        order: Number(form.order) || 0,
        description: form.description.trim(),
        // Firestore 는 undefined 필드를 거부하므로 subjectId 없을 땐 아예 안 넣는다.
        ...(subjectId ? { subjectId } : {}),
      }
      if (editingId) await updateSeason(editingId, input)
      else await addSeason(input)
      const list = await refresh()
      resetForm(list.length)
    } catch (caught) {
      console.error(`${labels.seasonNoun} 저장 실패`, caught)
      setError('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(season: LabSeason) {
    if (!confirm(`"${season.title}" ${labels.seasonNoun}을(를) 삭제할까요?`)) return
    await deleteSeason(season.id)
    if (editingId === season.id) resetForm(seasons.length - 1)
    await refresh()
  }

  /** 목록에서 진행중/준비중/완료 버튼을 눌러 상태만 바로 바꾼다 — 예전엔
   *  "수정" 폼을 열어야만 바꿀 수 있었다. 활동 목록의 togglePublished 와
   *  같은 이유로 낙관적으로 먼저 바꾸고 실패하면 되돌린다. */
  async function changeStatus(season: LabSeason, status: LabSeason['status']) {
    if (season.status === status) return
    setStatusUpdatingId(season.id)
    setSeasons((current) =>
      current.map((item) => (item.id === season.id ? { ...item, status } : item)),
    )
    // 이 시즌을 지금 수정 폼에서 편집 중이었다면 폼 값도 같이 맞춰준다.
    if (editingId === season.id) setForm((current) => ({ ...current, status }))
    try {
      await updateSeason(season.id, { status })
    } catch (caught) {
      console.error(`${labels.seasonNoun} 상태 변경 실패`, caught)
      setSeasons((current) =>
        current.map((item) => (item.id === season.id ? { ...item, status: season.status } : item)),
      )
      alert('상태를 바꾸지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6"
      >
        <h2 className="font-bold text-ink-900">
          {editingId ? `${labels.seasonNoun} 수정` : `새 ${labels.seasonNoun} 추가`}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
            제목
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="예: Arduino RC CAR"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
            이모지
            <input
              value={form.emoji}
              onChange={(event) => setForm({ ...form, emoji: event.target.value })}
              placeholder="🚗"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
            상태
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as LabSeason['status'] })
              }
              className={inputClass}
            >
              <option value="진행중">진행중</option>
              <option value="준비중">준비중</option>
              <option value="완료">완료</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
            순서
            <input
              type="number"
              value={form.order}
              onChange={(event) => setForm({ ...form, order: event.target.value })}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          소개 (선택)
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="카드 안에 들어갈 한 줄 소개"
            className={inputClass}
          />
        </label>

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
            {busy ? '저장 중…' : editingId ? '수정 저장' : '추가'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => resetForm(seasons.length)}
              className="rounded-xl border border-cream-deep px-4 py-2.5 font-semibold text-ink-700 transition-colors hover:border-cheese-300"
            >
              취소
            </button>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-ink-900">
          {labels.seasonNoun} 목록 ({seasons.length})
        </h2>

        {loading ? (
          <p className="text-ink-500">불러오는 중…</p>
        ) : seasons.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
            아직 등록된 {labels.seasonNoun}이(가) 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-cream-deep overflow-hidden rounded-2xl border border-cream-deep bg-white/70">
            {seasons.map((season) => (
              <li
                key={season.id}
                className={[
                  'flex items-center gap-4 px-5 py-3.5',
                  season.status === '완료' ? 'grayscale opacity-60' : '',
                ].join(' ')}
              >
                <span className="text-2xl">{season.emoji || '🧪'}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">
                    {season.order}. {season.title}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {SEASON_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={statusUpdatingId === season.id}
                        onClick={() => changeStatus(season, status)}
                        aria-pressed={season.status === status}
                        className={[
                          'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                          season.status === status
                            ? seasonStatusActiveClass(status)
                            : 'border border-cream-deep text-ink-500 hover:border-cheese-300',
                        ].join(' ')}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  <button
                    onClick={() => startEdit(season)}
                    className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(season)}
                    className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ── 활동 / 내용 ────────────────────────────────────────────

type ActivityFormState = {
  title: string
  /** labSeasons/{id}. 비우면 로드맵의 어떤 시즌에도 속하지 않는다. */
  seasonId: string
  difficulty: string
  order: string
  sections: LabActivitySection[]
  materialUrl: string
}

/** 새 활동은 기존에 쓰던 8개 항목으로 시작한다 — 익숙한 기본값을 주고,
 *  거기서부터 이름을 바꾸거나 지우거나 새로 추가하게 한다. 발표자료 자리는
 *  맨 끝에 하나 있고(교사가 드래그로 옮길 수 있지만 지울 수는 없다), 그
 *  실제 업로드는 아래 별도 SlidesPanel 에서 한다. */
function defaultSections(): LabActivitySection[] {
  return [
    { id: crypto.randomUUID(), title: '오늘의 목표', content: '', isCode: false },
    { id: crypto.randomUUID(), title: '오늘 배울 것', content: '', isCode: false },
    { id: crypto.randomUUID(), title: '준비물', content: '', isCode: false },
    { id: crypto.randomUUID(), title: '회로', content: '', isCode: false },
    { id: crypto.randomUUID(), title: '코드', content: '', isCode: true },
    { id: crypto.randomUUID(), title: '실습', content: '', isCode: false },
    { id: crypto.randomUUID(), title: 'Mission', content: '', isCode: false },
    { id: crypto.randomUUID(), title: 'Challenge', content: '', isCode: false },
    makeSlidesSection(),
  ]
}

function emptyActivityForm(order = 0): ActivityFormState {
  return {
    title: '',
    seasonId: '',
    difficulty: '1',
    order: String(order),
    sections: defaultSections(),
    materialUrl: '',
  }
}

export function ActivitiesPanel({
  subjectId,
  labels,
  uploaderEmail,
}: {
  /** 있으면 이 과목(subjects/{id})의 내용만 다룬다. 없으면 Lab 전역 활동. */
  subjectId?: string
  labels: LabBoardLabels
  uploaderEmail: string
}) {
  const [activities, setActivities] = useState<LabActivity[]>([])
  const [seasons, setSeasons] = useState<LabSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ActivityFormState>(emptyActivityForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 목록에서 토글 하나를 누르는 동안만 그 행을 잠근다 — 여러 개를 동시에
  // 눌러도 서로 안 꼬이게.
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    refresh()
    listSeasons(subjectId ? { subjectId } : undefined).then(setSeasons)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  async function refresh() {
    setLoading(true)
    const list = await listActivities(subjectId ? { subjectId } : undefined)
    setActivities(list)
    setLoading(false)
    return list
  }

  function startEdit(activity: LabActivity) {
    setEditingId(activity.id)
    setForm({
      title: activity.title,
      seasonId: activity.seasonId,
      difficulty: String(activity.difficulty),
      order: String(activity.order),
      // labs.ts 가 예전 활동(고정 필드만 있던 시절)도 sections 로 채워서
      // 돌려준다 — 여기서 다시 변환할 필요 없이 그대로 편집기에 넣는다.
      sections: activity.sections,
      materialUrl: activity.materialUrl,
    })
    setError(null)
  }

  function resetForm(nextOrder: number) {
    setEditingId(null)
    setForm(emptyActivityForm(nextOrder))
  }

  async function save(published: boolean) {
    if (!form.title.trim()) {
      setError('제목을 입력해 주세요.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const input: LabActivityInput = {
        title: form.title.trim(),
        seasonId: form.seasonId,
        difficulty: Number(form.difficulty) || 1,
        order: Number(form.order) || 0,
        published,
        sections: form.sections.map((section) => ({
          ...section,
          title: section.title.trim() || '이름 없음',
          content: section.isCode ? section.content : section.content.trim(),
          // Firestore는 필드 값으로 undefined 를 허용하지 않는다(SDK가 던짐) —
          // 안 쓰면 그냥 빈 문자열로 저장한다(extractYoutubeId('') === null 이라
          // 렌더링 쪽에서 자동으로 무시됨).
          videoUrl: (section.videoUrl ?? '').trim(),
        })),
        materialUrl: form.materialUrl.trim(),
        updatedBy: uploaderEmail,
        // subjectId 도 같은 이유로 조건부로만 넣는다.
        ...(subjectId ? { subjectId } : {}),
      }
      if (editingId) await updateActivity(editingId, input)
      else await addActivity(input)
      const list = await refresh()
      resetForm(list.length)
    } catch (caught) {
      console.error(`${labels.activityNoun} 저장 실패`, caught)
      setError('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(activity: LabActivity) {
    if (!confirm(`"${activity.title}" ${labels.activityNoun}을(를) 삭제할까요?`)) return
    await deleteActivity(activity.id)
    if (editingId === activity.id) resetForm(activities.length - 1)
    await refresh()
  }

  /** 목록에서 바로 공개/비공개를 뒤집는다 — 예전엔 "수정" 들어가서 편집 폼
   *  맨 아래 "임시저장"/"학생에게 공개" 버튼을 눌러야만 바꿀 수 있었다.
   *  화면은 낙관적으로 먼저 바꾸고, 실패하면 되돌린다(전체 refresh 를
   *  기다리면 토글 한 번에 깜빡임이 생겨서). */
  async function togglePublished(activity: LabActivity) {
    const next = !activity.published
    setTogglingId(activity.id)
    setActivities((current) =>
      current.map((item) => (item.id === activity.id ? { ...item, published: next } : item)),
    )
    try {
      await updateActivity(activity.id, { published: next })
    } catch (caught) {
      console.error('공개 상태 변경 실패', caught)
      setActivities((current) =>
        current.map((item) => (item.id === activity.id ? { ...item, published: !next } : item)),
      )
      alert('공개 상태를 바꾸지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6">
        <h2 className="font-bold text-ink-900">
          {editingId ? `${labels.activityNoun} 수정` : `새 ${labels.activityNoun} 만들기`}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700 lg:col-span-2">
            제목
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="예: RC카 모터 제어"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
            {labels.seasonNoun} (선택)
            <select
              value={form.seasonId}
              onChange={(event) => setForm({ ...form, seasonId: event.target.value })}
              className={inputClass}
            >
              <option value="">미지정</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.title}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-ink-500">
              고르면 {labels.seasonNoun} 카드를 눌렀을 때 이 {labels.activityNoun}이 보입니다.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
            난이도 (1~5)
            <input
              type="number"
              min={1}
              max={5}
              value={form.difficulty}
              onChange={(event) => setForm({ ...form, difficulty: event.target.value })}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex max-w-[10rem] flex-col gap-1.5 text-sm font-semibold text-ink-700">
          순서
          <input
            type="number"
            value={form.order}
            onChange={(event) => setForm({ ...form, order: event.target.value })}
            className={inputClass}
          />
        </label>

        <SectionsEditor
          sections={form.sections}
          onChange={(sections) => setForm({ ...form, sections })}
          activityId={editingId}
        />

        <FormField
          label="자료 링크 (선택)"
          value={form.materialUrl}
          onChange={(v) => setForm({ ...form, materialUrl: v })}
          placeholder="https://..."
        />

        {editingId ? (
          <SlidesPanel activityId={editingId} />
        ) : (
          <p className="text-xs text-ink-500">
            발표자료(PPT)는 {labels.activityNoun}을(를) 한 번 저장한 뒤에 첨부할 수 있습니다.
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => save(false)}
            className="rounded-xl border border-cream-deep px-5 py-2.5 font-bold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '저장 중…' : '임시저장'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save(true)}
            className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '저장 중…' : '학생에게 공개'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => resetForm(activities.length)}
              className="rounded-xl px-4 py-2.5 font-semibold text-ink-500 transition-colors hover:text-ink-900"
            >
              취소하고 새로 만들기
            </button>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-ink-900">
          {labels.activityNoun} 목록 ({activities.length})
        </h2>

        {loading ? (
          <p className="text-ink-500">불러오는 중…</p>
        ) : activities.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
            아직 만든 {labels.activityNoun}이(가) 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {groupBySeason(activities, seasons).map((group) => (
              <div key={group.id || '미지정'} className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-ink-700">
                  {group.title} ({group.items.length})
                </h3>
                <ul className="divide-y divide-cream-deep overflow-hidden rounded-2xl border border-cream-deep bg-white/70">
                  {group.items.map((activity) => (
                    <li key={activity.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{activity.title}</p>
                        <p className="truncate text-xs text-ink-500">난이도 {activity.difficulty}</p>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                          <ToggleSwitch
                            checked={activity.published}
                            disabled={togglingId === activity.id}
                            onChange={() => togglePublished(activity)}
                            label={`${activity.title} 공개 여부`}
                          />
                          {activity.published ? (
                            <span className="font-semibold text-cheese-600">공개됨</span>
                          ) : (
                            <span>임시저장</span>
                          )}
                        </label>
                        <button
                          onClick={() => startEdit(activity)}
                          className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(activity)}
                          className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * 활동 본문(예전의 goal/learn/prep/circuit/... 고정 필드)을 교사가 직접
 * 이름 짓고, 추가·삭제하고, 드래그로 순서를 바꿀 수 있는 목록 편집기.
 *
 * 드래그는 @dnd-kit 을 썼다 — 브라우저 기본 HTML5 드래그(dragstart/dragover)는
 * 데스크톱에서만 되고 터치(태블릿)에서는 아예 안 먹는다. 이 Lab 화면을
 * 실제로 갤럭시 탭 브라우저에서 쓰는 걸 이미 확인했기 때문에, 터치까지
 * 되는 라이브러리가 필수였다. PointerSensor(마우스) + TouchSensor(터치,
 * 살짝 눌러야 시작되게 delay를 줘서 화면 스크롤과 안 헷갈리게 함) 둘 다 둔다.
 *
 * 제목("구성 항목")은 Lab/수업자료 어느 쪽에서 쓰든 고정이다 — "활동 내용"을
 * 그대로 두면 수업자료 맥락(활동→내용)에서 "내용 내용"으로 겹쳐 보이는
 * 문제가 있어서, labels 를 더 내려받지 않고 스코프 중립적인 문구로 정했다.
 */
function SectionsEditor({
  sections,
  onChange,
  activityId,
}: {
  sections: LabActivitySection[]
  onChange: (sections: LabActivitySection[]) => void
  /** 첨부파일 업로드에 필요하다 — 새 활동은 한 번 저장하기 전엔 id가 없어서
   *  그동안은 각 항목의 첨부 UI에 "먼저 저장해 주세요" 안내만 보여준다. */
  activityId: string | null
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sections.findIndex((section) => section.id === active.id)
    const newIndex = sections.findIndex((section) => section.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(sections, oldIndex, newIndex))
  }

  function updateSection(id: string, patch: Partial<LabActivitySection>) {
    onChange(sections.map((section) => (section.id === id ? { ...section, ...patch } : section)))
  }

  function removeSection(id: string) {
    const target = sections.find((section) => section.id === id)
    if (target && isSlidesSection(target)) return // 방어적 체크 — 버튼 자체를 안 보여주지만 혹시 몰라서.
    if (!confirm('이 항목을 삭제할까요?')) return
    onChange(sections.filter((section) => section.id !== id))
  }

  function addSection() {
    onChange([...sections, { id: crypto.randomUUID(), title: '새 항목', content: '', isCode: false }])
  }

  function addChecklistSection() {
    onChange([...sections, makeChecklistSection()])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-ink-900">구성 항목</h3>
        <span className="text-xs text-ink-500">⠿ 을 눌러서 드래그하면 순서가 바뀝니다</span>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-cream-deep px-4 py-6 text-center text-sm text-ink-500">
          아직 항목이 없습니다. 아래에서 추가해 주세요.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={sections.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {sections.map((section) => (
                <SortableSectionRow
                  key={section.id}
                  section={section}
                  activityId={activityId}
                  onChange={(patch) => updateSection(section.id, patch)}
                  onRemove={() => removeSection(section.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addSection}
          className="self-start rounded-lg border border-dashed border-cream-deep px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          + 항목 추가
        </button>
        <button
          type="button"
          onClick={addChecklistSection}
          className="self-start rounded-lg border border-dashed border-cream-deep px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          + 체크리스트 추가
        </button>
      </div>
    </div>
  )
}

function SortableSectionRow({
  section,
  activityId,
  onChange,
  onRemove,
}: {
  section: LabActivitySection
  activityId: string | null
  onChange: (patch: Partial<LabActivitySection>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // 발표자료 자리는 이름만 바꿀 수 있고(학생 화면에 보일 제목), 내용은 아래
  // "발표자료" 업로드 영역에서 관리한다 — 여기서 텍스트로 쓸 수 있는 게
  // 아니라서 내용 칸·코드 체크박스·삭제 버튼을 안 보여준다.
  if (isSlidesSection(section)) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 rounded-xl border border-dashed border-cheese-300 bg-cheese-50/60 p-3"
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="순서 변경(드래그)"
          className="shrink-0 touch-none rounded px-1.5 py-1 text-lg text-ink-400 hover:bg-cream active:cursor-grabbing"
        >
          ⠿
        </button>
        <input
          value={section.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="예: 수업 자료"
          className="min-w-0 flex-1 rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-sm font-semibold text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
        <span className="shrink-0 text-xs text-ink-500">📎 발표자료 자리 — 업로드는 아래에서</span>
      </div>
    )
  }

  // 체크리스트 — 항목마다 텍스트 + 체크 여부. 체크 상태는 교사가 여기서
  // 직접 켜고 끄는 것이고, 학생 화면(LabActivityDetail)에는 그 상태 그대로
  // 읽기 전용으로 보인다(labs.ts 의 kind: 'checklist' 설명 참고).
  if (isChecklistSection(section)) {
    const items = section.items ?? []

    function updateItem(itemId: string, patch: Partial<LabChecklistItem>) {
      onChange({ items: items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) })
    }

    function removeItem(itemId: string) {
      onChange({ items: items.filter((item) => item.id !== itemId) })
    }

    function addItem() {
      onChange({ items: [...items, { id: crypto.randomUUID(), text: '', checked: false }] })
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-col gap-2 rounded-xl border border-cream-deep bg-white p-3"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="순서 변경(드래그)"
            className="shrink-0 touch-none rounded px-1.5 py-1 text-lg text-ink-400 hover:bg-cream active:cursor-grabbing"
          >
            ⠿
          </button>
          <input
            value={section.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="항목 이름 (예: 준비물 체크리스트)"
            className="min-w-0 flex-1 rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-sm font-semibold text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
          <span className="shrink-0 text-xs text-ink-500">✅ 체크리스트</span>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            삭제
          </button>
        </div>

        <div className="flex flex-col gap-1.5 pl-1">
          {items.length === 0 ? (
            <p className="text-xs text-ink-500">아직 항목이 없습니다. 아래에서 추가해 주세요.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(event) => updateItem(item.id, { checked: event.target.checked })}
                />
                <input
                  value={item.text}
                  onChange={(event) => updateItem(item.id, { text: event.target.value })}
                  placeholder="예: 브레드보드 준비"
                  className="min-w-0 flex-1 rounded-lg border border-cream-deep bg-white px-2.5 py-1 text-sm text-ink-900 focus:border-cheese-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 rounded px-1.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="self-start rounded-lg border border-dashed border-cream-deep px-3 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          + 체크리스트 항목 추가
        </button>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-xl border border-cream-deep bg-white p-3"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="순서 변경(드래그)"
          className="shrink-0 touch-none rounded px-1.5 py-1 text-lg text-ink-400 hover:bg-cream active:cursor-grabbing"
        >
          ⠿
        </button>
        <input
          value={section.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="항목 이름 (예: 오늘의 목표)"
          className="min-w-0 flex-1 rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-sm font-semibold text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-600">
          <input
            type="checkbox"
            checked={section.isCode}
            onChange={(event) => onChange({ isCode: event.target.checked })}
          />
          코드로 표시
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
        >
          삭제
        </button>
      </div>
      <textarea
        value={section.content}
        onChange={(event) => onChange({ content: event.target.value })}
        rows={section.isCode ? 6 : 3}
        placeholder="내용"
        className={`rounded-lg border border-cream-deep bg-white px-3 py-2 text-sm text-ink-900 focus:border-cheese-300 focus:outline-none ${section.isCode ? 'font-mono' : ''}`}
      />

      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-600">
        <input
          type="checkbox"
          checked={section.hasAttachment ?? false}
          onChange={(event) => onChange({ hasAttachment: event.target.checked })}
        />
        이미지·동영상(mp4)·PDF·PPT·엑셀·CSV 파일 첨부
      </label>
      {section.hasAttachment && (
        <SectionAttachmentUploader activityId={activityId} sectionId={section.id} />
      )}

      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-600">
        유튜브 영상 링크 (선택 — 긴 영상은 파일 첨부 대신 이쪽을 추천합니다)
        <input
          value={section.videoUrl ?? ''}
          onChange={(event) => onChange({ videoUrl: event.target.value })}
          placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..."
          className="rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-sm font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
        {section.videoUrl && !extractYoutubeId(section.videoUrl) && (
          <span className="font-normal text-red-600">
            유튜브 링크로 인식하지 못했습니다. 링크를 다시 확인해 주세요.
          </span>
        )}
      </label>
    </div>
  )
}

/** 항목 하나에 딸린 첨부파일 업로드/삭제. "발표자료" SlidesPanel과 같은
 *  이유로 activityId(첫 저장 전엔 없음)가 있어야 동작한다. */
function SectionAttachmentUploader({
  activityId,
  sectionId,
}: {
  activityId: string | null
  sectionId: string
}) {
  const [meta, setMeta] = useState<ChunkedFileMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!activityId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getSectionAttachmentMeta(activityId, sectionId)
      .then(setMeta)
      .finally(() => setLoading(false))
  }, [activityId, sectionId])

  if (!activityId) {
    return (
      <p className="rounded-lg border border-dashed border-cream-deep bg-cream/40 px-3 py-2 text-xs text-ink-500">
        활동을 한 번 저장한 뒤에 첨부할 수 있습니다.
      </p>
    )
  }

  async function handleFile(file: File) {
    if (!activityId) return
    setBusy(true)
    setError(null)
    try {
      setMeta(await uploadSectionAttachment(activityId, sectionId, file))
    } catch (caught) {
      setError(
        caught instanceof SectionAttachmentError
          ? caught.message
          : '업로드에 실패했습니다. 다시 시도해 주세요.',
      )
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete() {
    if (!activityId || !confirm('첨부파일을 삭제할까요?')) return
    await deleteSectionAttachment(activityId, sectionId)
    setMeta(null)
  }

  if (loading) return null

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-cream-deep bg-cream/40 p-2.5">
      {meta ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-ink-700">
            📎 {meta.filename} · {(meta.size / 1024 / 1024).toFixed(1)}MB
          </span>
          <button
            type="button"
            onClick={handleDelete}
            className="shrink-0 font-semibold text-red-600 hover:underline"
          >
            삭제
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.gif,.webp,.mp4,.pdf,.ppt,.pptx,.xls,.xlsx,.csv"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
          }}
          className="text-xs text-ink-700 file:mr-2 file:rounded-md file:border-0 file:bg-cheese-200 file:px-2.5 file:py-1 file:text-xs file:font-bold file:text-ink-900"
        />
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/**
 * 활동에 딸린 발표자료(PPT) 업로드/삭제. 활동 본문 폼과 저장 버튼이 분리된
 * 이유는 Materials 의 SubjectPanel과 같다 — 파일은 activityId 가 있어야
 * 붙일 수 있는데(chunk 경로가 activityId 기준), 새 활동은 첫 저장 전엔
 * id 가 없다.
 *
 * onChange는 원래(Lab 활동) 쓰임에는 필요 없었다 — 이 컴포넌트가 자기 상태를
 * 그대로 그려서 끝이었으니까. OtPresentationPanel(교사 페이지 OT 탭)이 업로드
 * 직후 미리보기/발표 시작 버튼을 새 파일로 갱신해야 해서 추가했다 — 있으면
 * slides가 바뀔 때마다 부모에 최신값을 흘려준다.
 */
export function SlidesPanel({
  activityId,
  onChange,
}: {
  activityId: string
  onChange?: (slides: LabSlideSet) => void
}) {
  const [slides, setSlidesState] = useState<LabSlideSet>({ pptx: null, pdf: null })
  function setSlides(next: LabSlideSet) {
    setSlidesState(next)
    onChange?.(next)
  }
  const [pptxFile, setPptxFile] = useState<File | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pptxInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    // 최초 로드는 onChange를 안 울린다 — 부모(OtPresentationPanel)가 이미 자기
    // 몫으로 한 번 불러오므로, 여기서도 알리면 마운트 시점에 같은 파일을 두 번
    // 내려받게 된다. onChange는 "그 뒤에 실제로 뭔가 바뀌었을 때"만 쓴다.
    getSlideSet(activityId)
      .then(setSlidesState)
      .finally(() => setLoading(false))
  }, [activityId])

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault()
    if (!pptxFile && !pdfFile) return

    setBusy(true)
    setError(null)
    try {
      if (pptxFile) {
        await uploadSlidePptx(activityId, pptxFile)
        // PPT 안의 발표자 노트를 대본으로 자동으로 가져온다 — 교사가 발표
        // 화면에서 직접 고칠 수 있으니, 여기선 그냥 최초값을 채워두는 것뿐이다.
        try {
          const notes = await extractNotesFromPptx(pptxFile)
          await saveNotes(activityId, notes)
        } catch (caught) {
          console.error('발표자 노트 추출 실패 — 대본 없이 진행합니다', caught)
        }
      }
      if (pdfFile) await uploadSlidePdf(activityId, pdfFile)
      setSlides(await getSlideSet(activityId))
      setPptxFile(null)
      setPdfFile(null)
      if (pptxInputRef.current) pptxInputRef.current.value = ''
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    } catch (caught) {
      setError(
        caught instanceof SlideValidationError
          ? caught.message
          : '업로드에 실패했습니다. 다시 시도해 주세요.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDeletePptx() {
    if (!confirm('PPT 원본을 삭제할까요?')) return
    await deleteSlidePptx(activityId)
    setSlides(await getSlideSet(activityId))
  }

  async function handleDeletePdf() {
    if (!confirm('PDF 버전을 삭제할까요?')) return
    await deleteSlidePdf(activityId)
    setSlides(await getSlideSet(activityId))
  }

  /**
   * "대본 자동 추출"이 생기기 전에 올라간 PPT는 대본이 비어 있다 — 추출은
   * 업로드하는 순간에만 일어나기 때문이다. 그런 활동을 다시 채울 수 있도록
   * 이미 저장된 PPT를 다시 읽어서 추출한다(파일을 다시 고를 필요 없음).
   */
  async function handleReextractNotes() {
    setBusy(true)
    setError(null)
    try {
      const blob = await getSlidePptxFile(activityId)
      if (!blob) throw new Error('PPT 파일을 찾을 수 없습니다.')
      const notes = await extractNotesFromPptx(blob)
      await saveNotes(activityId, notes)
      alert(
        notes.some((note) => note.trim())
          ? '대본을 다시 추출했습니다. 발표 화면에서 확인해 주세요.'
          : '이 PPT에는 발표자 노트가 없습니다. 발표 화면에서 직접 입력해 주세요.',
      )
    } catch (caught) {
      console.error('대본 재추출 실패', caught)
      setError('대본을 다시 추출하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-cream-deep bg-cream/40 p-4">
      <div>
        <h3 className="font-bold text-ink-900">발표자료 (PPT)</h3>
        <p className="mt-1 text-xs text-ink-500">
          학생 화면엔 뷰어로만 보이고 다운로드는 안 됩니다. pptx 렌더링이 파일에 따라 깨질 수
          있어서, PDF 버전을 함께 올려두면 pptx가 안 열릴 때 자동으로 PDF를 대신 보여줍니다.
          PPT의 발표자 노트는 대본으로 자동으로 가져오고, 발표 화면에서 직접 고칠 수 있습니다.
          <strong className="font-semibold text-ink-700"> "발표 시작"(실시간 진행) 기능은 PDF가 있어야 켤 수 있습니다.</strong>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SlideSlot label="PPT 원본 (.pptx)" meta={slides.pptx} onDelete={handleDeletePptx} />
        <SlideSlot label="PDF 버전 (발표 모드에 필수)" meta={slides.pdf} onDelete={handleDeletePdf} />
      </div>

      {slides.pptx && (
        <button
          type="button"
          onClick={handleReextractNotes}
          disabled={busy}
          className="self-start text-xs font-semibold text-cheese-600 hover:underline disabled:opacity-50"
        >
          대본 다시 추출하기 — PPT를 새로 올리기 전엔 이 기능으로 노트를 채웠는지 확인하세요
        </button>
      )}

      <form onSubmit={handleUpload} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          {slides.pptx ? 'PPT 새로 올리기' : 'PPT 올리기'}
          <input
            ref={pptxInputRef}
            type="file"
            accept=".pptx"
            onChange={(event) => setPptxFile(event.target.files?.[0] ?? null)}
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 file:mr-3 file:rounded-md file:border-0 file:bg-cheese-200 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-ink-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          {slides.pdf ? 'PDF 새로 올리기' : 'PDF 올리기 (권장)'}
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 file:mr-3 file:rounded-md file:border-0 file:bg-cheese-200 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-ink-900"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || (!pptxFile && !pdfFile)}
          className="self-start rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
        >
          {busy ? '올리는 중…' : '업로드'}
        </button>
      </form>
    </div>
  )
}

function SlideSlot({
  label,
  meta,
  onDelete,
}: {
  label: string
  meta: ChunkedFileMeta | null
  onDelete: () => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-cream-deep bg-white/70 p-3 text-sm">
      <p className="font-semibold text-ink-700">{label}</p>
      {meta ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-ink-900">
            {meta.filename} · {(meta.size / 1024 / 1024).toFixed(1)}MB
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
          >
            삭제
          </button>
        </div>
      ) : (
        <p className="mt-1 text-ink-500">아직 없음</p>
      )}
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  multiline,
  mono,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  mono?: boolean
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={mono ? 6 : 3}
          placeholder={placeholder}
          className={`${inputClass} ${mono ? 'font-mono' : ''}`}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </label>
  )
}
