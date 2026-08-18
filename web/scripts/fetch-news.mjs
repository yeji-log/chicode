/**
 * 오늘의 AI·IT 이슈 — 매일 아침 GitHub Actions(daily-news.yml)가 이 스크립트를 돌린다.
 *
 * ── 이 스크립트가 "하지 않는" 것 ──
 * 요약을 쓰지 않는다. "왜 중요한가"를 판단하지 않는다. 3~5개를 고르지도 않는다.
 * 그건 전부 교사가 Teacher 페이지에서 직접 한다. LLM 요약 비용(Anthropic API 등)을
 * 쓰지 않기로 했기 때문에 — 그 판단을 기계 대신 사람이 하는 게 이번 설계의 핵심
 * 트레이드오프다. 이 스크립트는 "후보를 추려서 newsCandidates 에 쌓아두는 것"까지만
 * 한다: RSS 수집 → 최근 것만 → 키워드로 분야 태깅(안 맞으면 버림) → 중복 제거.
 *
 * ── 인증 ──
 * Firestore 규칙은 newsCandidates 클라이언트 write를 항상 막아둔다(교사도 못 씀,
 * delete만 가능). 이 스크립트는 Firebase Admin SDK로 규칙 자체를 우회해서 쓴다 —
 * 서비스 계정 키를 GitHub Secret(FIREBASE_SERVICE_ACCOUNT_KEY)에서 읽는다.
 *
 * ── 소스 목록에 대해 ──
 * 아래 SOURCES 는 이 스크립트를 만들 때 실제로 curl 로 하나하나 fetch 해서 살아있는
 * 걸 확인한 것만 남긴 목록이다("될 것 같다"로 넣지 않았다). Anthropic 공식
 * 블로그(anthropic.com/rss.xml 등 여러 경로)와 Microsoft AI 블로그
 * (blogs.microsoft.com/ai/feed/, blogs.microsoft.com/feed/)는 확인 시점에
 * RSS가 없거나(404) 막혀 있었다(403/410). 나중에 다시 확인해서 추가할 수 있다.
 */
import { createHash } from 'node:crypto'

// firebase-admin 12+ 는 ESM에서 admin.credential.cert() 같은 옛 네임스페이스 방식이
// 통하지 않는다(default export에 credential/firestore가 안 얹혀 있음 — 실제로
// 돌려서 "Cannot read properties of undefined (reading 'cert')" 로 확인했다).
// 모듈형 API(firebase-admin/app, firebase-admin/firestore)로 써야 한다.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import Parser from 'rss-parser'

const SOURCES = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Google AI Blog', url: 'https://blog.google/innovation-and-ai/technology/ai/rss/' },
  { name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/' },
  { name: 'Meta', url: 'https://about.fb.com/news/feed/' },
  { name: 'Amazon Science', url: 'https://www.amazon.science/index.rss' },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/' },
]

// 기획서 4번 "뉴스 수집 분야"를 그대로 사전으로 옮긴 것. 소스가 전부 영어 블로그라
// 키워드도 영어 위주다. 이건 LLM 없이 하는 1차 필터라 정교하지 않다 — 교사가 후보를
// 보고 최종 판단한다는 전제로 "일단 거르는" 역할만 한다.
const CATEGORY_KEYWORDS = {
  ai: [
    'generative ai',
    'gpt',
    'llm',
    'large language model',
    'multimodal',
    'agent',
    'reasoning model',
    'open weight',
    'open-source model',
    'foundation model',
  ],
  'ai-coding': [
    'coding agent',
    'ai coding',
    'copilot',
    'code generation',
    'developer tool',
    'debugging',
  ],
  'ai-science': [
    'alphafold',
    'protein',
    'drug discovery',
    'materials science',
    'astronomy',
    'mathematics',
    'physics',
    'chemistry',
    'biology',
    'scientific research',
  ],
  'ai-hardware': [
    'gpu',
    'npu',
    'tpu',
    'accelerator',
    'hbm',
    'data center',
    'datacenter',
    'semiconductor',
    'chip',
  ],
  robotics: [
    'humanoid',
    'robot',
    'self-driving',
    'autonomous vehicle',
    'embodied ai',
    'vision-language-action',
  ],
  'ai-safety': [
    'ai safety',
    'jailbreak',
    'prompt injection',
    'hallucination',
    'deepfake',
    'red team',
    'responsible ai',
  ],
  it: ['cloud computing', 'cybersecurity', 'security vulnerability', 'infrastructure'],
}

const RECENT_HOURS = 48
const HISTORY_DAYS = 14
const MAX_CANDIDATES = 20

function idOf(link) {
  return createHash('sha1').update(link).digest('hex').slice(0, 16)
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 단어 집합 기준 Jaccard 유사도. 완전히 같은 문장이 아니어도 같은 사건 보도면 걸린다. */
function titleSimilarity(a, b) {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(Boolean))
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const word of wordsA) if (wordsB.has(word)) overlap += 1
  return overlap / new Set([...wordsA, ...wordsB]).size
}

function tagCategory(text) {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = keywords.filter((keyword) => lower.includes(keyword))
    if (matched.length > 0) return { category, keywords: matched.slice(0, 5) }
  }
  return null
}

async function fetchSource(parser, source) {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CHICODEBot/1.0)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const xml = await response.text()
  const feed = await parser.parseString(xml)
  return feed.items ?? []
}

async function main() {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!serviceAccountKey) {
    console.error('[fetch-news] FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 없습니다.')
    process.exit(1)
  }

  const serviceAccount = JSON.parse(serviceAccountKey)
  initializeApp({ credential: cert(serviceAccount) })
  const db = getFirestore()

  const parser = new Parser()
  const cutoff = Date.now() - RECENT_HOURS * 60 * 60 * 1000

  // 1) 수집 — 소스 하나가 실패해도 나머지는 계속 진행한다.
  const rawItems = []
  for (const source of SOURCES) {
    try {
      const items = await fetchSource(parser, source)
      for (const item of items) {
        if (!item.link || !item.title) continue
        const publishedAt = new Date(item.isoDate ?? item.pubDate ?? '').getTime()
        if (!Number.isFinite(publishedAt) || publishedAt < cutoff) continue
        rawItems.push({
          title: item.title.trim(),
          link: item.link,
          excerpt: (item.contentSnippet ?? item.summary ?? '').trim().slice(0, 300),
          publishedAt,
          sourceName: source.name,
        })
      }
      console.log(`[fetch-news] ${source.name}: ${items.length}건 중 최근 게시물 확인`)
    } catch (caught) {
      console.warn(`[fetch-news] ${source.name} 수집 실패 — 건너뜀:`, caught.message)
    }
  }

  // 2) 분야 태깅 — 안 맞으면(=학생 적합성 1차 필터 통과 못 하면) 버린다.
  const tagged = []
  for (const item of rawItems) {
    const tag = tagCategory(`${item.title} ${item.excerpt}`)
    if (!tag) continue
    tagged.push({ ...item, ...tag })
  }

  // 3) 이번 배치 안에서 같은 사건 중복 제거 (링크 동일 또는 제목 유사도 높음).
  const deduped = []
  for (const item of tagged.sort((a, b) => b.publishedAt - a.publishedAt)) {
    const isDuplicate = deduped.some(
      (kept) => kept.link === item.link || titleSimilarity(kept.title, item.title) > 0.6,
    )
    if (!isDuplicate) deduped.push(item)
  }

  // 4) 최근 14일 안에 이미 발행한 이슈와 대조해 재중복 제거.
  const historyCutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000
  const historySnapshot = await db
    .collection('newsIssues')
    .where('issuedAt', '>=', historyCutoff)
    .get()
  const historyTitles = historySnapshot.docs.map((entry) => entry.data().title ?? '')

  const fresh = deduped
    .filter((item) => !historyTitles.some((title) => titleSimilarity(title, item.title) > 0.6))
    .slice(0, MAX_CANDIDATES)

  // 5) 오래된 후보 정리 — 교사가 며칠 손 못 댄 후보가 쌓이지 않도록.
  const staleCutoff = Date.now() - RECENT_HOURS * 60 * 60 * 1000
  const staleSnapshot = await db.collection('newsCandidates').where('fetchedAt', '<', staleCutoff).get()
  const cleanupBatch = db.batch()
  staleSnapshot.docs.forEach((entry) => cleanupBatch.delete(entry.ref))
  if (staleSnapshot.size > 0) await cleanupBatch.commit()

  // 6) 새 후보 기록.
  const writeBatch = db.batch()
  const fetchedAt = Date.now()
  for (const item of fresh) {
    const ref = db.collection('newsCandidates').doc(idOf(item.link))
    writeBatch.set(ref, {
      title: item.title,
      excerpt: item.excerpt,
      sourceName: item.sourceName,
      sourceUrl: item.link,
      publishedAt: item.publishedAt,
      fetchedAt,
      category: item.category,
      keywords: item.keywords,
    })
  }
  if (fresh.length > 0) await writeBatch.commit()

  console.log(
    `[fetch-news] 수집 ${rawItems.length}건 → 분야 태깅 통과 ${tagged.length}건 → 중복 제거 후 ${deduped.length}건 → 최근 발행분과 대조 후 신규 후보 ${fresh.length}건 기록 (오래된 후보 ${staleSnapshot.size}건 정리)`,
  )
}

main().catch((caught) => {
  console.error('[fetch-news] 실패:', caught)
  process.exit(1)
})
