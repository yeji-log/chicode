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
  goal: string
  learn: string
  prep: string
  circuit: string
  code: string
  practice: string
  mission: string
  challenge: string
  /** 외부 자료(노션·PDF 등) 링크. 설계안 11절대로 파일 자체는 저장하지 않는다. */
  materialUrl: string
  createdAt: number
  updatedAt: number
  updatedBy: string
}

export type LabActivityInput = Omit<LabActivity, 'id' | 'createdAt' | 'updatedAt'>

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

  let activities = snapshot.docs.map(
    (entry) => ({ id: entry.id, ...entry.data() }) as LabActivity,
  )
  if (opts?.publishedOnly) activities = activities.filter((activity) => activity.published)
  return activities.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export async function getActivity(id: string): Promise<LabActivity | null> {
  const snapshot = await getDoc(doc(db, LABS, id))
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as LabActivity) : null
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
