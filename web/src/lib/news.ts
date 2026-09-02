/**
 * 오늘의 AI·IT 이슈 — 데이터 계층.
 *
 * ── 왜 이런 2단계 구조인가 ──
 * 매일 아침 GitHub Actions가 공식 블로그 RSS를 모아 `newsCandidates`에 원문 그대로
 * 써넣는다(scripts/fetch-news.mjs). 요약도, "왜 중요한가"도 없다 — LLM 비용을 쓰지
 * 않기로 했으므로(서버 비용 0원 유지) 그 판단은 교사가 직접 한다.
 *
 *   newsCandidates/{id}   ← 자동 수집. 원문 제목·발췌·링크·자동 태그만.
 *   newsIssues/{id}       ← 교사가 쓴 요약·왜 중요한가.
 *
 * ── 2026-09-02 변경: 후보를 학생에게도 보여준다 ──
 * 원래 후보는 교사만 읽을 수 있었고, 교사가 요약을 직접 써서 승인해야만 학생 화면에
 * 떴다. 그런데 그 타이핑이 매일 부담이 되어 실제로 발행이 끊겼다(8/24 이후 9일간 0건 →
 * STUDENT_VISIBLE_DAYS 때문에 학생 화면이 통째로 비었다). 그래서 학생 화면(/news)을
 * 두 칸으로 나눴다:
 *
 *   위 칸 — 교사가 발행한 이슈(`newsIssues`). 있으면 뜨고, 없으면 그냥 안 뜬다.
 *   아래 칸 — 자동 수집 새소식(`newsCandidates`). 교사가 손대지 않아도 매일 채워진다.
 *
 * 즉 교사가 아무것도 안 해도 화면이 비지 않고, 시간이 날 때 발행하면 위 칸이 더해지는
 * 구조다. 아래 칸은 사람이 검증하지 않은 자동 수집물이라 키워드 태깅 오탐이 가끔 섞인다
 * — 교사가 "건너뛰기"로 지울 수 있다. (처음엔 학생 화면에 "자동으로 모았다"는 안내
 * 문구를 달았지만 사용자 요청으로 뺐다. 카드마다 출처 이름과 원문 링크는 그대로 있다.)
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

/**
 * RSS 제목·발췌에 섞여 들어온 HTML 을 걷어낸다.
 *
 * 실제로 헬로디디 제목에 `<br>` 이 들어 있어서 학생 화면에 그대로 "<br>" 이라고
 * 찍혔다(2026-09-02 확인). 수집 스크립트에서 막을 수도 있지만 여기서 하는 이유는
 * 이미 저장된 문서까지 함께 고쳐지기 때문이다 — 수집은 하루 한 번뿐이라 스크립트만
 * 고치면 다음 날 아침까지 깨진 채로 남는다.
 *
 * 태그를 빈칸으로 바꾸는 건 `A<br>B` 가 `AB` 로 붙어버리지 않게 하려는 것이고,
 * 마지막에 연속 공백을 하나로 줄인다. 엔티티는 RSS 에서 실제로 본 것만 푼다.
 */
function stripHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Firestore 문서 → NewsCandidate. 제목·발췌를 항상 이 문을 거쳐 받도록 한 곳에 모았다. */
function toCandidate(id: string, data: Record<string, unknown>): NewsCandidate {
  const candidate = { id, ...data } as NewsCandidate
  return {
    ...candidate,
    title: stripHtml(candidate.title),
    excerpt: stripHtml(candidate.excerpt),
  }
}

/** 교사 페이지에서 검토 대기 중인 후보 전체를 중요도 점수 높은 순으로(참고용 힌트, TeacherNews.tsx 안내문 참고). */
export async function listCandidates(): Promise<NewsCandidate[]> {
  const snapshot = await getDocs(query(collection(db, CANDIDATES), orderBy('score', 'desc')))
  return snapshot.docs.map((entry) => toCandidate(entry.id, entry.data()))
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

/**
 * 학생 화면에 발행된 카드가 남아있는 기간. News.tsx 에서만 쓴다.
 *
 * 3일이었는데 7일로 늘렸다 — 교사가 며칠 못 들어가면 위 칸이 통째로 비었기 때문이다.
 * 아래 칸(자동 수집)이 매일 채워지므로 화면 자체가 비지는 않지만, 교사가 공들여 쓴
 * 카드가 사흘 만에 사라지는 건 아까웠다.
 */
export const STUDENT_VISIBLE_DAYS = 7

/**
 * 학생 화면(/news) 아래 칸 — 자동 수집 새소식.
 *
 * 교사 화면의 listCandidates()와 같은 컬렉션을 읽지만 정렬이 다르다. 교사는 "무엇부터
 * 검토할까"라서 중요도 점수 순이고, 학생은 "새 소식"이라 최신순이다. 점수는 어차피
 * 참고용 근사치라 학생 화면에서는 쓰지 않는다(화면에도 안 보여준다 — 자동 계산한
 * 숫자를 학생이 권위 있는 값으로 오해할 이유가 없다).
 *
 * ── 왜 소스마다 상한을 두나 ──
 * 그냥 최신순으로 12건을 뽑았더니 12건 중 10건이 한 곳(헬로디디)이었다(2026-09-02
 * 실측: 후보 27건 중 17건이 그 소스). 기사를 많이 올리는 매체가 있으면 어떤 정렬을
 * 써도 피드를 독점한다 — 점수순으로 바꿔봐도 똑같이 10건이었다. 그래서 정렬이 아니라
 * 상한으로 푼다.
 *
 * 상한 때문에 limitCount 를 못 채우면 그냥 적게 보여준다. 남는 자리를 독점 매체로
 * 도로 채우면 상한을 둔 의미가 없어지고, "그날 실제로 다양한 소식이 적었다"는 게
 * 사실이기도 하다.
 *
 * 상한을 적용하려면 limitCount 보다 넉넉히 읽어와야 한다. 하루 최대 20건씩 쌓이고
 * 48시간 지난 건 수집 스크립트가 지우므로(fetch-news.mjs) 60건이면 충분하다.
 *
 * publishedAt 단일 필드 정렬이라 Firestore 복합 색인이 필요 없다.
 */
export async function listNewsFeed(limitCount = 12, maxPerSource = 3): Promise<NewsCandidate[]> {
  const snapshot = await getDocs(
    query(collection(db, CANDIDATES), orderBy('publishedAt', 'desc'), limit(60)),
  )

  const usedBySource = new Map<string, number>()
  const picked: NewsCandidate[] = []

  for (const entry of snapshot.docs) {
    if (picked.length >= limitCount) break
    const candidate = toCandidate(entry.id, entry.data())
    const used = usedBySource.get(candidate.sourceName) ?? 0
    if (used >= maxPerSource) continue
    usedBySource.set(candidate.sourceName, used + 1)
    picked.push(candidate)
  }

  return picked
}

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
