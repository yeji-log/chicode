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
 */
export interface LabActivitySection {
  id: string
  title: string
  content: string
  isCode: boolean
  kind?: 'slides'
  /** 이 항목에 이미지·PDF·PPT·엑셀 파일을 하나 붙였는지. 실제 파일은
   *  labSectionAttachments.ts 가 activityId+section.id 를 키로 따로
   *  저장한다 — 문자열이 아니라 여기 담을 수가 없어서다. */
  hasAttachment?: boolean
}

const SLIDES_SECTION_ID = 'slides'

export function isSlidesSection(section: LabActivitySection): boolean {
  return section.kind === 'slides'
}

export function makeSlidesSection(): LabActivitySection {
  return { id: SLIDES_SECTION_ID, title: '수업 자료', content: '', isCode: false, kind: 'slides' }
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
}

export type LabSeasonInput = Omit<LabSeason, 'id'>

export interface LabHomeSettings {
  todayMissionText: string
  /** 강조해서 "활동 이어가기" 버튼으로 보여줄 활동. 비어 있으면 버튼을 숨긴다. */
  featuredActivityId: string
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
}): Promise<LabActivity[]> {
  const snapshot = opts?.seasonId
    ? await getDocs(query(collection(db, LABS), where('seasonId', '==', opts.seasonId)))
    : await getDocs(collection(db, LABS))

  let activities = snapshot.docs.map((entry) => normalizeActivity(entry.id, entry.data()))

  if (opts?.publishedOnly) {
    activities = activities.filter((activity) => activity.published)
    // 활동 자체는 published여도, 그 활동이 속한 시즌이 로드맵에서 아직
    // "준비중"이면 학생에게는 같이 숨긴다 — 로드맵에 안 보이는 시즌인데
    // 활동 목록/직접 링크로는 열리는 건 앞뒤가 안 맞는다는 지적을 받았다.
    const preparingSeasonIds = new Set(
      (await listSeasons())
        .filter((season) => season.status === '준비중')
        .map((season) => season.id),
    )
    activities = activities.filter((activity) => !preparingSeasonIds.has(activity.seasonId))
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

export async function listSeasons(): Promise<LabSeason[]> {
  const snapshot = await getDocs(query(collection(db, SEASONS), orderBy('order', 'asc')))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as LabSeason)
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
  featuredActivityId: '',
  pin: '0000',
  updatedAt: 0,
}

export async function getHomeSettings(): Promise<LabHomeSettings> {
  const snapshot = await getDoc(doc(db, SETTINGS, HOME_SETTINGS_ID))
  if (!snapshot.exists()) return DEFAULT_HOME_SETTINGS
  // 문서가 pin 필드 추가 이전에 만들어졌을 수도 있으므로 기본값과 합쳐서 채운다.
  return { ...DEFAULT_HOME_SETTINGS, ...snapshot.data() } as LabHomeSettings
}

export async function updateHomeSettings(
  patch: Partial<Pick<LabHomeSettings, 'todayMissionText' | 'featuredActivityId' | 'pin'>>,
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
