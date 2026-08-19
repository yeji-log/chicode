/**
 * CHICODE LAB(동아리 활동) 데이터 계층.
 *
 * 세 컬렉션으로 나눈다 — `CHICODE_LAB_설계안.md` 10·15절 기준.
 *
 *   labs/{labId}         활동 하나 (예: "RC카 모터 제어")
 *   labSeasons/{id}       Roadmap 카드 하나 (예: "Arduino RC CAR")
 *   labSettings/home      Lab 홈 화면 설정 — 문서 하나만 쓰는 싱글턴
 *
 * ── Arduino/Pico/IoT/AI/Project 같은 고정 카테고리를 두지 않는다 ──
 * 처음엔 이 다섯 개를 미리 정해둔 enum(LAB_CATEGORIES)으로 만들었다가 뺐다.
 * 교사가 시즌을 직접 만들며 로드맵을 채워나가야 하는데, 앱에 고정된 분류가
 * 있으면 그 다섯 칸 밖의 활동을 못 넣는다. 그래서 Season 자체가 곧 분류다 —
 * 교사가 새 시즌을 만들면 그게 새 카테고리가 된다. Activity 는 `seasonId` 로
 * 시즌 하나를 가리키거나(로드맵에 올라감), 비워두면(아직 어떤 시즌에도
 * 속하지 않음) 활동 목록에만 보인다.
 *
 * subjects.ts / materials.ts 와 같은 얇은 데이터 계층이다. 화면(pages/*)은
 * 이 파일의 함수만 호출한다.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import { db } from './firebase'

/**
 * 활동 본문을 이루는 항목 하나(예: "오늘의 목표", "회로"). 예전엔 goal/learn/
 * prep/circuit/code/practice/mission/challenge 가 고정된 필드였는데, 교사가
 * 이름을 바꾸고 새로 추가하고 순서를 드래그로 바꿀 수 있어야 해서 배열로
 * 바꿨다. isCode 만 true 로 켜면 CodeBlock(구문 강조 + 복사 버튼)으로,
 * 아니면 일반 문단(줄바꿈 유지 + URL 자동 링크)으로 그려진다 — 예전의 "코드"
 * 필드가 하던 역할을 이 플래그 하나로 옮긴 것뿐이다.
 *
 * kind: 'slides' 는 발표자료(PPT/PDF) 자리를 표시하는 특수 항목이다. 내용은
 * 여기 content 가 아니라 labSlides.ts 에 따로 저장되지만(업로드 파일이라
 * 문자열이 아님), "몇 번째 순서에 보일지"는 다른 항목과 똑같이 이 배열 안
 * 위치로 정해진다 — 그래야 드래그로 발표자료 위치도 옮길 수 있다. 활동마다
 * 정확히 하나만 있고(교사가 지울 수 없음), 없으면 normalizeActivity 가
 * 맨 끝에 자동으로 채워 넣는다.
 *
 * kind: 'checklist' 는 체크박스 목록 항목이다(예: "준비물 체크리스트").
 * 체크 상태는 교사가 만들 때 직접 켜고 끄는 것이고 학생은 못 바꾼다 —
 * 학생마다 다른 체크 상태를 저장할 로그인/서버 저장소가 없어서, 교사가
 * 미리 정해둔 상태를 그대로 안내판처럼 보여주는 용도다. content 는 안 쓰고
 * items 배열을 쓴다.
 */
export interface LabActivitySection {
  id: string
  title: string
  content: string
  isCode: boolean
  kind?: 'slides' | 'checklist'
  /** kind === 'checklist' 일 때만 쓴다. */
  items?: LabChecklistItem[]
  /** 이 항목에 이미지·동영상(mp4)·PDF·PPT·엑셀 파일을 하나 붙였는지. 실제 파일은
   *  labSectionAttachments.ts 가 activityId+section.id 를 키로 따로
   *  저장한다 — 문자열이 아니라 여기 담을 수가 없어서다. */
  hasAttachment?: boolean
  /** 유튜브 영상 링크(선택). hasAttachment 의 mp4 업로드와 달리 파일 자체를
   *  안 갖고 있고 URL 문자열만 여기 저장한다 — lib/youtube.ts 가 이 문자열에서
   *  영상 ID를 뽑아 iframe으로 스트리밍한다. 긴 영상은 Firestore 조각
   *  저장(용량 제한·스트리밍 불가)으로 못 올리니 그 대안으로 추가했다. */
  videoUrl?: string
}

export interface LabChecklistItem {
  id: string
  text: string
  checked: boolean
}

const SLIDES_SECTION_ID = 'slides'

export function isSlidesSection(section: LabActivitySection): boolean {
  return section.kind === 'slides'
}

export function isChecklistSection(section: LabActivitySection): boolean {
  return section.kind === 'checklist'
}

export function makeSlidesSection(): LabActivitySection {
  return { id: SLIDES_SECTION_ID, title: '수업 자료', content: '', isCode: false, kind: 'slides' }
}

export function makeChecklistSection(): LabActivitySection {
  return {
    id: crypto.randomUUID(),
    title: '체크리스트',
    content: '',
    isCode: false,
    kind: 'checklist',
    items: [],
  }
}

export interface LabActivity {
  id: string
  title: string
  /** 이 활동이 속한 시즌(labSeasons/{id}). 비어 있으면 아직 어느 시즌에도 안 속함. */
  seasonId: string
  difficulty: number
  /** 목록 정렬 순서. 교사가 직접 숫자를 입력한다(드래그 정렬 없음). */
  order: number
  /** false 면 교사 페이지에서만 보인다("임시저장"). */
  published: boolean
  sections: LabActivitySection[]
  /** 외부 자료(노션·PDF 등) 링크. 설계안 11절대로 파일 자체는 저장하지 않는다. */
  materialUrl: string
  createdAt: number
  updatedAt: number
  updatedBy: string
  /** 이 활동이 Lab이 아니라 수업자료의 특정 과목(subjects/{id})에 속한 "내용"일 때만
   *  있는 필드. 없으면(undefined) Lab 전역 활동이다 — subjects.ts 의 pinRequired/
   *  published 와 같은 "필드 없으면 기존 동작" 패턴. listActivities 의 subjectId
   *  스코프 필터링 기준이 된다. Firestore 는 undefined 필드 값을 거부하므로 쓸 때는
   *  항상 조건부로 스프레드해야 한다(절대 subjectId: undefined 로 넣지 말 것). */
  subjectId?: string
}

export type LabActivityInput = Omit<LabActivity, 'id' | 'createdAt' | 'updatedAt'>

/**
 * sections 이 생기기 전(예: 이미 올라가 있던 "1차시_Pico2W_입문" 등)에 만들어진
 * 활동은 문서에 goal/learn/prep/circuit/... 고정 필드만 있고 sections 가 없다.
 * 읽을 때 그 필드들로 sections 를 만들어 채운다 — 교사가 다시 입력할 필요
 * 없이 바로 드래그로 순서를 바꾸고 이름을 고칠 수 있게 하기 위해서다.
 * 한 번이라도 저장하면 그 뒤로는 진짜 sections 필드가 생긴다.
 */
const LEGACY_SECTION_DEFS: { key: string; title: string; isCode?: boolean }[] = [
  { key: 'goal', title: '오늘의 목표' },
  { key: 'learn', title: '오늘 배울 것' },
  { key: 'prep', title: '준비물' },
  { key: 'circuit', title: '회로' },
  { key: 'code', title: '코드', isCode: true },
  { key: 'practice', title: '실습' },
  { key: 'mission', title: 'Mission' },
  { key: 'challenge', title: 'Challenge' },
]

function normalizeActivity(id: string, data: Record<string, unknown>): LabActivity {
  const sections = Array.isArray(data.sections)
    ? (data.sections as LabActivitySection[])
    : LEGACY_SECTION_DEFS.map((def) => ({
        id: `legacy-${def.key}`,
        title: def.title,
        content: typeof data[def.key] === 'string' ? (data[def.key] as string) : '',
        isCode: def.isCode ?? false,
      }))

  // 발표자료 자리가 sections 안에 아예 없는 활동(이 기능이 생기기 전 활동)은
  // 맨 끝에 하나 채워 넣는다 — 예전에도 항상 맨 아래에 있었으니 위치도 그대로.
  const withSlides = sections.some(isSlidesSection) ? sections : [...sections, makeSlidesSection()]

  return { ...(data as Omit<LabActivity, 'id' | 'sections'>), id, sections: withSlides }
}

export interface LabSeason {
  id: string
  title: string
  emoji: string
  status: '진행중' | '준비중' | '완료'
  order: number
  description: string
  /** LabActivity.subjectId 와 같은 이유·같은 규칙 — 없으면 Lab 전역 시즌. */
  subjectId?: string
}

export type LabSeasonInput = Omit<LabSeason, 'id'>

export interface LabHomeSettings {
  todayMissionText: string
  /** 강조해서 "활동 이어가기" 버튼으로 보여줄 활동들. 여러 개 고를 수 있다
   *  (예전엔 하나만 되던 featuredActivityId 단수 필드였다 — 아래
   *  getHomeSettings 의 마이그레이션 참고). 비어 있으면 버튼 자체를 숨긴다. */
  featuredActivityIds: string[]
  /** /lab 전체를 잠그는 핀번호. subjects.ts 와 같은 "가벼운 잠금"이다 — 진짜
   *  보안 장치가 아니라 화면 진입을 막는 안내판이다(자세한 설명은 subjects.ts). */
  pin: string
  updatedAt: number
}

const LABS = 'labs'
const SEASONS = 'labSeasons'
const SETTINGS = 'labSettings'
const HOME_SETTINGS_ID = 'home'

// ── Activities ──────────────────────────────────────────────

/**
 * `where` 와 `orderBy(다른 필드)` 를 함께 쓰면 복합 색인이 필요하므로,
 * seasonId 로 거른 뒤에는 정렬을 코드에서 한다 (materials.ts 와 같은 이유).
 */
export async function listActivities(opts?: {
  seasonId?: string
  publishedOnly?: boolean
  /** 로드맵에서 "준비중" 시즌 카드를 눌러 그 시즌으로 딱 집어 들어온 경우처럼,
   *  활동에 들어가지는 못해도 어떤 활동이 있는지 미리보기 목록은 보여주고
   *  싶을 때 true로 넘긴다. seasonId 를 함께 넘겼을 때만 의미가 있다 —
   *  seasonId 없이 전체 목록을 볼 때는 준비중 시즌 활동을 계속 숨긴다. */
  includePreparingSeason?: boolean
  /** 수업자료의 특정 과목으로 스코프를 좁힌다. seasonId 가 이미 주어졌으면
   *  그 시즌 하나로 충분히 스코프되므로 이 필드는 무시한다(where 를 두 개
   *  AND 하면 복합 색인이 필요해지는 걸 피하려는 것). seasonId 없이
   *  subjectId 도 없으면 Lab 전역 활동만(subjectId 없는 문서만) 돌려준다. */
  subjectId?: string
}): Promise<LabActivity[]> {
  const snapshot = opts?.seasonId
    ? await getDocs(query(collection(db, LABS), where('seasonId', '==', opts.seasonId)))
    : opts?.subjectId
      ? await getDocs(query(collection(db, LABS), where('subjectId', '==', opts.subjectId)))
      : await getDocs(collection(db, LABS))

  let activities = snapshot.docs.map((entry) => normalizeActivity(entry.id, entry.data()))

  // seasonId/subjectId 둘 다 없는 "전체 조회"는 Lab 전역 컬렉션 전체를 그대로
  // 받아오므로, 과목에 속한 활동이 섞여 들어오지 않도록 여기서 걸러낸다 —
  // subjectId 를 스코프로 준 경우엔 이미 쿼리로 걸러졌으니 다시 거를 필요 없다.
  if (!opts?.seasonId && !opts?.subjectId) {
    activities = activities.filter((activity) => !activity.subjectId)
  }

  if (opts?.publishedOnly) {
    activities = activities.filter((activity) => activity.published)

    if (!(opts.seasonId && opts.includePreparingSeason)) {
      // 활동 자체는 published여도, 그 활동이 속한 시즌이 로드맵에서 아직
      // "준비중"이면 학생에게는 같이 숨긴다 — 로드맵에 안 보이는 시즌인데
      // 활동 목록/직접 링크로는 열리는 건 앞뒤가 안 맞는다는 지적을 받았다.
      // listSeasons 도 같은 스코프(subjectId)로 불러야 한다 — 안 그러면
      // 과목 스코프에서 이 필터가 Lab 전역 시즌만 보고 조용히 무력화된다.
      const preparingSeasonIds = new Set(
        (await listSeasons(opts.subjectId ? { subjectId: opts.subjectId } : undefined))
          .filter((season) => season.status === '준비중')
          .map((season) => season.id),
      )
      activities = activities.filter((activity) => !preparingSeasonIds.has(activity.seasonId))
    }
  }

  return activities.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export async function getActivity(id: string): Promise<LabActivity | null> {
  const snapshot = await getDoc(doc(db, LABS, id))
  return snapshot.exists() ? normalizeActivity(snapshot.id, snapshot.data()) : null
}

export async function addActivity(input: LabActivityInput): Promise<LabActivity> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const activity: Omit<LabActivity, 'id'> = { ...input, createdAt: now, updatedAt: now }
  await setDoc(doc(db, LABS, id), activity)
  return { id, ...activity }
}

export async function updateActivity(
  id: string,
  patch: Partial<LabActivityInput>,
): Promise<void> {
  await updateDoc(doc(db, LABS, id), { ...patch, updatedAt: Date.now() })
}

export async function deleteActivity(id: string): Promise<void> {
  await deleteDoc(doc(db, LABS, id))
}

// ── Roadmap 시즌 ─────────────────────────────────────────────

/**
 * subjectId 를 주면 그 과목의 시즌(수업자료에서는 "수업목차")만 가져온다 —
 * listActivities 의 subjectId 스코프와 같은 이유·같은 방식(단일 where + 클라이언트
 * 정렬, 복합 색인 회피). 안 주면 Lab 전역 시즌만(subjectId 없는 문서만) 돌려준다 —
 * 과목 시즌이 같은 컬렉션에 함께 저장되므로 이 필터가 없으면 Lab 쪽에도 섞여 보인다.
 */
export async function listSeasons(opts?: { subjectId?: string }): Promise<LabSeason[]> {
  if (opts?.subjectId) {
    const snapshot = await getDocs(
      query(collection(db, SEASONS), where('subjectId', '==', opts.subjectId)),
    )
    const seasons = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as LabSeason)
    return seasons.sort((a, b) => a.order - b.order)
  }

  const snapshot = await getDocs(query(collection(db, SEASONS), orderBy('order', 'asc')))
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }) as LabSeason)
    .filter((season) => !season.subjectId)
}

export async function getSeason(id: string): Promise<LabSeason | null> {
  const snapshot = await getDoc(doc(db, SEASONS, id))
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as LabSeason) : null
}

export async function addSeason(input: LabSeasonInput): Promise<LabSeason> {
  const id = crypto.randomUUID()
  await setDoc(doc(db, SEASONS, id), input)
  return { id, ...input }
}

export async function updateSeason(id: string, patch: Partial<LabSeasonInput>): Promise<void> {
  await updateDoc(doc(db, SEASONS, id), patch)
}

export async function deleteSeason(id: string): Promise<void> {
  await deleteDoc(doc(db, SEASONS, id))
}

// ── Lab 홈 설정 (싱글턴 문서) ─────────────────────────────────

const DEFAULT_HOME_SETTINGS: LabHomeSettings = {
  todayMissionText: '',
  featuredActivityIds: [],
  pin: '0000',
  updatedAt: 0,
}

export async function getHomeSettings(): Promise<LabHomeSettings> {
  const snapshot = await getDoc(doc(db, SETTINGS, HOME_SETTINGS_ID))
  if (!snapshot.exists()) return DEFAULT_HOME_SETTINGS

  // 문서가 pin 필드 추가 이전에 만들어졌을 수도 있으므로 기본값과 합쳐서 채운다.
  const data = snapshot.data()
  const merged = { ...DEFAULT_HOME_SETTINGS, ...data } as LabHomeSettings & {
    featuredActivityId?: string
  }

  // 강조 활동이 하나만 되던 시절(featuredActivityId 단수 문자열) 문서를
  // 배열 필드로 옮겨 읽는다 — 한 번 저장하면 그 뒤로는 featuredActivityIds만 쓴다.
  if (!Array.isArray(data.featuredActivityIds) && data.featuredActivityId) {
    merged.featuredActivityIds = [data.featuredActivityId]
  }

  return merged
}

export async function updateHomeSettings(
  patch: Partial<Pick<LabHomeSettings, 'todayMissionText' | 'featuredActivityIds' | 'pin'>>,
): Promise<void> {
  // 문서가 아직 없을 수 있으므로(최초 저장) merge 로 만들면서 갱신한다.
  await setDoc(
    doc(db, SETTINGS, HOME_SETTINGS_ID),
    { ...patch, updatedAt: Date.now() },
    { merge: true },
  )
}

// ── Lab 전체 잠금 (핀 통과 여부) ──────────────────────────────

const LAB_UNLOCK_KEY = 'chicode:lab-unlocked'

/** subjects.ts 의 isSubjectUnlocked 와 같은 이유로 sessionStorage 를 쓴다 —
 *  탭/브라우저를 닫으면 사라지므로 공용 컴퓨터에서 다음 학생이 다시 핀을 입력한다. */
export function isLabUnlocked(): boolean {
  return sessionStorage.getItem(LAB_UNLOCK_KEY) === '1'
}

export function unlockLab(): void {
  sessionStorage.setItem(LAB_UNLOCK_KEY, '1')
}
