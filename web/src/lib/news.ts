/**
 * 오늘의 AI·IT 이슈 — 데이터 계층.
 *
 * ── 왜 이런 2단계 구조인가 ──
 * 매일 아침 GitHub Actions가 공식 블로그 RSS를 모아 `newsCandidates`에 원문 그대로
 * 써넣는다(scripts/fetch-news.mjs). 이건 아직 "검증 전 후보"다. 요약도, "왜
 * 중요한가"도 없다 — LLM 비용을 쓰지 않기로 했으므로(서버 비용 0원 유지) 그 판단은
 * 교사가 직접 한다. 교사가 Teacher 페이지에서 후보 중 몇 개를 골라 직접 문장을 써서
 * 승인하면 그제서야 `newsIssues`로 옮겨지고, 그때부터 학생 홈 화면에 보인다.
 *
 *   newsCandidates/{id}   ← 자동 수집. 원문 제목·링크·자동 태그만. 교사만 읽음.
 *   newsIssues/{id}       ← 교사가 쓴 요약·왜 중요한가. 공개, 학생이 보는 것.
 *
 * candidateId 와 issueId 는 같은 값(원문 링크의 해시)을 쓴다 — 승인 시 후보를
 * 지우고 같은 id로 발행본을 만들기 때문에, 같은 기사가 두 번 올라오는 걸 막는다.
 */

import {
  type QueryConstraint,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { db } from './firebase'

export type NewsCategory =
  | 'ai'
  | 'ai-coding'
  | 'ai-science'
  | 'ai-hardware'
  | 'robotics'
  | 'ai-safety'
  | 'it'

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  ai: 'AI',
  'ai-coding': 'AI × 코딩',
  'ai-science': 'AI × 과학',
  'ai-hardware': 'AI × 하드웨어',
  robotics: '로보틱스',
  'ai-safety': 'AI 안전·보안',
  it: 'IT',
}

export const CATEGORY_LIST = Object.keys(CATEGORY_LABELS) as NewsCategory[]

/** 자동 수집된 후보. summary/whyImportant 가 없다 — 교사가 아직 쓰지 않았기 때문. */
export interface NewsCandidate {
  id: string
  title: string
  excerpt: string
  sourceName: string
  sourceUrl: string
  /** sourceName/sourceUrl과 같은 사건을 보도한 출처 전체(대표 출처 포함, 1개 이상). fetch-news.mjs가 이슈 단위로 묶는다. */
  sources: { name: string; url: string }[]
  publishedAt: number
  fetchedAt: number
  category: NewsCategory
  keywords: string[]
  /** 0~100 근사 중요도 점수 — 정답이 아니라 검토 순서를 정하는 힌트. LLM 없이 키워드·경과시간·보도 소스 수 등으로 근사했다(fetch-news.mjs의 computeScore 참고). 자동 제외 기준으로 쓰지 않는다. */
  score: number
  /** 출처 소재지 근사 — 소스가 국내(lang: 'ko')인지 아닌지로만 구분한다. */
  region: '국내' | '해외'
}

/** 교사가 승인해 학생 화면에 실제로 뜨는 카드. */
export interface NewsIssue {
  id: string
  title: string
  summary: string
  whyImportant: string
  category: NewsCategory
  keywords: string[]
  sourceName: string
  sourceUrl: string
  publishedAt: number
  /** CHICODE에 발행(승인)된 시각 — 홈 화면 정렬 기준. 원 기사 발행 시각과 다를 수 있다. */
  issuedAt: number
  issuedBy: string
}

const CANDIDATES = 'newsCandidates'
const ISSUES = 'newsIssues'

/** 교사 페이지에서 검토 대기 중인 후보 전체를 중요도 점수 높은 순으로(참고용 힌트, TeacherNews.tsx 안내문 참고). */
export async function listCandidates(): Promise<NewsCandidate[]> {
  const snapshot = await getDocs(query(collection(db, CANDIDATES), orderBy('score', 'desc')))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as NewsCandidate)
}

/**
 * 학생 페이지(/news) · 교사 페이지 관리 목록에서 공통으로 쓰는 발행본 조회.
 *
 * sinceDays 를 주면 그보다 오래된 카드는 DB에서 안 지우고(교사가 나중에 다시
 * 찾을 수 있게) 조회에서만 뺀다 — "오늘의 이슈"인데 몇 주 전 카드가 계속 떠
 * 있으면 안 되니까. 학생 화면(News.tsx)은 이 값을 주고, 교사 관리 화면
 * (TeacherNews.tsx)은 최근에 지운 게 맞는지 확인해야 하니 기간 제한 없이 부른다.
 */
export async function listPublishedNews(
  limitCount = 5,
  options?: { sinceDays?: number },
): Promise<NewsIssue[]> {
  const constraints: QueryConstraint[] = [orderBy('issuedAt', 'desc'), limit(limitCount)]
  if (options?.sinceDays) {
    const cutoff = Date.now() - options.sinceDays * 24 * 60 * 60 * 1000
    constraints.unshift(where('issuedAt', '>=', cutoff))
  }
  const snapshot = await getDocs(query(collection(db, ISSUES), ...constraints))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as NewsIssue)
}

/** 학생 화면에 발행된 카드가 남아있는 기간. News.tsx 에서만 쓴다. */
export const STUDENT_VISIBLE_DAYS = 3

/**
 * 후보를 교사가 쓴 내용으로 발행한다. newsIssues에 쓰기 + newsCandidates에서
 * 지우기를 한 번에 묶는다 — 중간에 실패해서 같은 기사가 후보에도, 발행본에도
 * 동시에 남는 상태를 막기 위해서다.
 */
export async function publishNews(
  candidateId: string,
  fields: Pick<
    NewsIssue,
    'title' | 'summary' | 'whyImportant' | 'category' | 'keywords' | 'sourceName' | 'sourceUrl' | 'publishedAt'
  >,
  issuedBy: string,
): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(db, ISSUES, candidateId), { ...fields, issuedAt: Date.now(), issuedBy })
  batch.delete(doc(db, CANDIDATES, candidateId))
  await batch.commit()
}

/** 교사가 이 후보는 쓸 만하지 않다고 판단해 목록에서 지운다("건너뛰기"). */
export async function discardCandidate(candidateId: string): Promise<void> {
  await deleteDoc(doc(db, CANDIDATES, candidateId))
}

/** 이미 발행한 카드를 내린다 — 오탈자·잘못된 판단을 바로잡을 때. */
export async function deleteNewsIssue(issueId: string): Promise<void> {
  await deleteDoc(doc(db, ISSUES, issueId))
}

/** 이미 발행한 카드의 내용을 고친다 — 내렸다 다시 발행할 필요 없이 제자리에서 수정. */
export async function updateNewsIssue(
  issueId: string,
  fields: Pick<NewsIssue, 'title' | 'summary' | 'whyImportant' | 'category' | 'keywords'>,
): Promise<void> {
  await updateDoc(doc(db, ISSUES, issueId), { ...fields })
}

/** "6시간 전" 처럼 짧게. 하루가 넘어가면 날짜로 바꿔 보여준다. */
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const hours = Math.floor(diffMs / (1000 * 60 * 60))

  if (hours < 1) return '방금 전'
  if (hours < 24) return `${hours}시간 전`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`

  return (
    new Date(timestamp).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }) + ' 업데이트'
  )
}
