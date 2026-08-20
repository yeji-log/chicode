/**
 * 오늘의 AI·IT 이슈 — 매일 아침 GitHub Actions(daily-news.yml)가 이 스크립트를 돌린다.
 *
 * ── 이 스크립트가 "하지 않는" 것 ──
 * 요약을 쓰지 않는다. "왜 중요한가"를 판단하지 않는다. 3~5개를 고르지도 않는다.
 * 그건 전부 교사가 Teacher 페이지에서 직접 한다. LLM 요약 비용(Anthropic API 등)을
 * 쓰지 않기로 했기 때문에 — 그 판단을 기계 대신 사람이 하는 게 이번 설계의 핵심
 * 트레이드오프다. 이 스크립트는 "후보를 추려서 newsCandidates 에 쌓아두는 것"까지만
 * 한다: RSS 수집 → 최근 것만 → 키워드로 분야 태깅(안 맞으면 버림) → 한글 번역 →
 * 명백한 제외 신호 거르기 → 같은 사건 이슈 단위로 묶기 → 중복 제거 → 중요도 점수
 * 계산(정렬용 힌트일 뿐, 자동 제외 기준 아님).
 *
 * 번역은 MyMemory 무료 공개 API를 쓴다(가입·키 불필요, curl로 300자 넘는 문장까지
 * 실제로 번역되는 걸 확인함) — 기계번역이라 완벽하진 않지만, 교사가 후보를 볼 때부터
 * "항상" 한글이어야 한다는 요구사항과 "LLM 비용 없이 무료 유지" 결정을 함께 만족시킨다.
 * 교사는 이 번역문을 그대로 쓰거나 다듬어서 발행하면 된다.
 *
 * ── 중요도 점수(score)에 대해 ──
 * 팀에서 받은 수집 가이드라인(chicode_ai_it_news_collection_guidelines.md) 4번은
 * "학생에게 중요한 기술인가/미래 산업과 관련 있는가/새로운가/사회적 영향이 큰가/
 * 생활과 연결되는가/설명하기 쉬운가" 6개 항목을 사람이 읽고 100점 만점으로 채점하라고
 * 한다. 이건 문맥을 이해해야 하는 판단이라 LLM 없이는 못 한다(LLM은 안 쓰기로
 * 했다). 그래서 각 항목을 "관측 가능한 대체 신호"로 근사했다 — 키워드 등급,
 * 카테고리, 게시 후 경과 시간, 같은 사건을 보도한 소스 수, 생활 연결 키워드 매칭,
 * 발췌 길이. 정답이 아니라 "교사가 후보 목록에서 뭐부터 볼지 정하는 힌트"다.
 * 그래서 가이드라인의 "70점 미만은 제외" 조항은 적용하지 않았다 — 자동으로
 * 버리면 오탐(false negative)으로 진짜 중요한 기사가 조용히 사라질 수 있고, 최종
 * 판단은 여전히 교사 몫이라는 이 프로젝트의 원칙과 맞지 않는다.
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
 *
 * 국내 기업 소스(lang: 'ko')도 같은 방식으로 검증 후 추가했다 — SOCAR(tech.socar.kr,
 * 404)와 컬리(helloworld.kurly.com, 403)는 확인 시점에 없거나 막혀 있어 뺐다. 이후
 * 삼성·SK hynix·왓챠·무신사·하이퍼커넥트·NHN Cloud·원티드도 같은 방식으로 추가했다
 * (LG는 뉴스룸 여러 주소를 시도했지만 RSS가 아니라 HTML 페이지만 나와서 뺐다,
 * lgcns.com/blog/feed 는 301만 반복돼서 실제 목적지를 못 찾음).
 * 소스마다 lang 을 붙여둔 이유는 아래에서 설명한다(번역·태깅·지역 태그가 언어별로
 * 갈리기 때문).
 *
 * 우아한형제들 기술블로그는 로컬 curl 로는 200이 나왔는데, 실제 GitHub Actions
 * 워크플로에서 돌려보니 403이 났다 — 아마 러너의 공유 IP 대역이 막힌 것으로
 * 보인다. 소스 목록엔 그대로 남겨뒀다: 이 스크립트는 소스 하나가 실패해도
 * 나머지로 계속 진행하도록 만들었으니(1번 수집 단계 참고) 없어도 그만이고,
 * 나중에 IP가 풀리면 다시 잡힐 수도 있다. 계속 403이면 빼는 걸 고려할 것.
 */
import { createHash } from 'node:crypto'

// firebase-admin 12+ 는 ESM에서 admin.credential.cert() 같은 옛 네임스페이스 방식이
// 통하지 않는다(default export에 credential/firestore가 안 얹혀 있음 — 실제로
// 돌려서 "Cannot read properties of undefined (reading 'cert')" 로 확인했다).
// 모듈형 API(firebase-admin/app, firebase-admin/firestore)로 써야 한다.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import Parser from 'rss-parser'

// lang 이 없으면 영어 소스로 취급한다(기본값 'en'). 번역 단계(3번)에서 'ko' 소스는
// 이미 한글이므로 건너뛴다 — MyMemory에 한글을 en|ko 로 다시 넣으면 오히려 망가진다.
// 지역 태그(region)도 이 값으로 정한다: 'ko' → 국내, 그 외 → 해외. 가이드라인 7번은
// 미국/중국/유럽처럼 국가 단위 태그를 추천하지만, 지금 해외 소스가 전부 미국
// 기업이라 국가별로 나눌 실익이 없어 국내/해외 2단계로만 뒀다 — 유럽·중국 소스가
// 생기면 그때 세분화한다.
const SOURCES = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Google AI Blog', url: 'https://blog.google/innovation-and-ai/technology/ai/rss/' },
  { name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/' },
  { name: 'Meta', url: 'https://about.fb.com/news/feed/' },
  { name: 'Amazon Science', url: 'https://www.amazon.science/index.rss' },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/' },
  // 국내 기업 기술 블로그.
  { name: '네이버 D2', url: 'https://d2.naver.com/d2.atom', lang: 'ko' },
  { name: '카카오 기술블로그', url: 'https://tech.kakao.com/feed', lang: 'ko' },
  { name: '우아한형제들 기술블로그', url: 'https://techblog.woowahan.com/feed/', lang: 'ko' },
  { name: '쿠팡 엔지니어링', url: 'https://medium.com/feed/coupang-engineering', lang: 'ko' },
  { name: '토스 기술블로그', url: 'https://toss.tech/rss.xml', lang: 'ko' },
  { name: '뱅크샐러드 기술블로그', url: 'https://blog.banksalad.com/rss.xml', lang: 'ko' },
  { name: 'LY Corp(LINE) 기술블로그', url: 'https://techblog.lycorp.co.jp/ko/feed/index.xml', lang: 'ko' },
  { name: '삼성 뉴스룸', url: 'https://news.samsung.com/kr/feed', lang: 'ko' },
  { name: 'SK hynix 뉴스룸', url: 'https://news.skhynix.co.kr/feed/', lang: 'ko' },
  { name: '왓챠', url: 'https://medium.com/feed/watcha', lang: 'ko' },
  { name: '무신사 기술블로그', url: 'https://medium.com/feed/musinsa-tech', lang: 'ko' },
  { name: '하이퍼커넥트', url: 'https://hyperconnect.github.io/feed.xml', lang: 'ko' },
  { name: 'NHN Cloud Meetup', url: 'https://meetup.nhncloud.com/rss', lang: 'ko' },
  { name: '원티드', url: 'https://medium.com/feed/wantedjobs', lang: 'ko' },
]

// 기획서 4번 "뉴스 수집 분야"와 수집 가이드라인 5번 "우선적으로 수집할 뉴스"를
// 합쳐서 사전으로 옮긴 것 — 영어·한글 키워드를 같이 넣어 소스 언어에 상관없이 한
// 사전으로 태깅한다. 이건 LLM 없이 하는 1차 필터라 정교하지 않다 — 교사가 후보를
// 보고 최종 판단한다는 전제로 "일단 거르는" 역할만 한다. tagCategory 는 단어 경계
// lookaround 로 매칭하므로(아래 함수 설명 참고) "ai" 처럼 짧은 키워드를 넣어도
// "chair" 안의 ai 같은 데서 오탐하지 않는다 — 단, "it"(대명사)은 여전히 뺐다,
// 영어 문장 어디에나 나오는 단어라 짧은 키워드로 넣기엔 너무 위험하다.
//
// 가이드라인 5번의 "미래기술"(AR/VR/XR, 양자컴퓨팅, 우주기술, 임베디드·IoT)과
// "산업"(AI 투자 등) 항목 중 지금 7개 카테고리 어디에도 정확히 안 맞는 것들은
// 범용 카테고리인 it 에 넣었다 — robotics 는 로봇·자율주행처럼 "몸이 있는 AI"를
// 뜻하는 카테고리라 AR/VR/양자컴퓨팅을 억지로 넣으면 의미가 흐려진다고 판단했다.
// 전용 카테고리(예: "미래기술")가 필요하면 카테고리 체계 자체를 바꿔야 하니 별도
// 논의가 필요하다.
const CATEGORY_KEYWORDS = {
  ai: [
    'ai',
    'generative ai',
    'gpt',
    'llm',
    'large language model',
    'multimodal',
    'ai agent',
    'reasoning model',
    'open weight',
    'open-source model',
    'foundation model',
    'on-device ai',
    '생성형 AI',
    '멀티모달',
    'AI 에이전트',
    '거대언어모델',
    '초거대 AI',
    '오픈소스 AI',
    'AI 모델',
    'AI 추론',
    'AI 학습',
    'AI 경량화',
    '온디바이스 AI',
  ],
  'ai-coding': [
    'coding agent',
    'ai coding',
    'copilot',
    'code generation',
    'developer tool',
    'debugging',
    'AI 코딩',
    '코딩 에이전트',
    '개발자 도구',
  ],
  'ai-science': [
    'alphafold',
    'protein',
    'drug discovery',
    'materials science',
    'astronomy',
    'scientific research',
    '신약 개발',
    '과학 연구',
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
    '반도체',
    '데이터센터',
    'AI 가속기',
    'AI 반도체',
  ],
  robotics: [
    'humanoid',
    'robot',
    'self-driving',
    'autonomous vehicle',
    'embodied ai',
    'vision-language-action',
    '휴머노이드',
    '자율주행',
    '로봇',
  ],
  'ai-safety': [
    'ai safety',
    'jailbreak',
    'prompt injection',
    'hallucination',
    'deepfake',
    'red team',
    'responsible ai',
    'privacy',
    'copyright',
    'AI 안전',
    '프롬프트 인젝션',
    '딥페이크',
    'AI 규제',
    'AI 윤리',
    '개인정보',
    '저작권',
    'AI 일자리',
  ],
  it: [
    'cloud computing',
    'cybersecurity',
    'security vulnerability',
    'infrastructure',
    'quantum computing',
    'iot',
    '클라우드',
    '사이버보안',
    '개발자 콘퍼런스',
    '소프트웨어',
    '컴퓨팅',
    '인터넷',
    '플랫폼',
    '양자컴퓨팅',
    '우주기술',
    '임베디드',
  ],
}

// 수집 가이드라인 6번 "우선 제외할 내용" 중 문자열만으로 판단 가능한 것만 옮겼다
// (단순 기업 홍보·기술적 의미 없는 광고처럼 문맥을 읽어야 하는 항목은 문자열
// 매칭으로 안전하게 거를 수 없어 뺐다). 아주 명백한 신호만 넣은 이유: 오탐으로
// 진짜 중요한 기사를 조용히 지우는 게, 걸러야 할 기사 하나를 후보 목록에 남겨서
// 교사가 "건너뛰기"를 한 번 더 누르게 하는 것보다 나쁘다고 판단했기 때문이다.
// 번역 후(항상 한글인) 텍스트를 기준으로 검사한다.
const EXCLUDE_PATTERNS = [
  /주가|급등락|상한가|하한가|시가총액|목표주가|매수 추천|매도 추천/,
  /루머|미확인 정보|~라는 설/,
  /경품 이벤트|할인 프로모션/,
]

function isExcluded(text) {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(text))
}

// 중요도 점수(computeScore)에서 "학생에게 중요한 기술인가"를 근사할 때 쓰는
// 상위 키워드 — 수집 가이드라인 5번에서 각 분야의 핵심으로 꼽은 것들만 추렸다.
// 여기 들어가면 25점, 아니면(그래도 카테고리 태깅엔 걸렸으므로 관련은 있는)
// 15점을 준다.
const CORE_KEYWORDS = new Set([
  'llm',
  'gpt',
  'ai agent',
  'foundation model',
  '생성형 ai',
  '거대언어모델',
  '초거대 ai',
  '반도체',
  '로봇',
  '휴머노이드',
  '자율주행',
  '양자컴퓨팅',
  'ai 안전',
  '딥페이크',
])

// "우리 생활과 어떤 관계가 있나요?"(가이드라인 16번)에서 예시로 든 연결고리들 —
// 본문에 이 단어가 있으면 학생 생활과 닿아 있다고 근사한다.
const STUDENT_LIFE_KEYWORDS = [
  '스마트폰',
  '학교',
  '공부',
  '게임',
  '유튜브',
  'sns',
  '프로그래밍',
  '진로',
  '직업',
  '자동차',
  '로봇',
  '개인정보',
]

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 영→한 번역. MyMemory(api.mymemory.translated.net)의 무료 공개 API를 쓴다 — 가입도
 * API 키도 필요 없어서 "완전 무료 유지" 결정과 맞는다(회원가입해서 키를 받아야 하는
 * DeepL 등은 제외했다). 기계번역이라 품질은 LLM만 못 하지만, 교사가 발행 전에
 * 다듬는다는 전제라 초안으로는 충분하다 — curl로 300자 넘는 문장까지 실제로
 * 번역되는 걸 확인했다.
 *
 * 실패해도(네트워크 오류, 일일 무료 한도 초과 등) 전체 실행을 죽이지 않고 원문을
 * 그대로 돌려준다 — 그러면 교사가 그 하나만 직접 번역하면 된다.
 */
async function translateToKorean(text) {
  if (!text.trim()) return text
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`,
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const translated = data?.responseData?.translatedText
    return translated && data.responseStatus === 200 ? translated : text
  } catch (caught) {
    console.warn('[fetch-news] 번역 실패 — 원문 유지:', caught.message)
    return text
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 단어 경계 매칭. 처음엔 정규식 \b 를 썼는데, \b 는 [A-Za-z0-9_](\w) 기준이라
 * 한글은 애초에 \w 가 아니다 — "AI 에이전트"처럼 한글로 끝나는 키워드는 앞뒤가
 * 전부 \w 가 아니라서 \b 가 단 한 번도 안 걸렸다(직접 돌려보고 전부 null 나오는
 * 걸 보고서야 알았다). 그래서 "앞뒤가 로마자·숫자가 아니면 경계로 친다"는
 * lookaround 로 바꿨다 — 한글은 경계로 인정하고, "chair"의 h 처럼 로마자가
 * 붙어 있을 때만 막는다. "AI모델"처럼 공백 없이 붙어도(뒤가 한글) 정상 매칭된다.
 *
 * 카테고리는 "가장 먼저 매칭된 것"이 아니라 "가장 구체적인 키워드로 매칭된 것"을
 * 고른다. 처음엔 Object.entries 순서대로 첫 매칭 카테고리를 즉시 반환했는데,
 * ai 카테고리의 범용 키워드 'ai' 가 사전에서 제일 먼저 오다 보니 "AI 반도체",
 * "AI 윤리"처럼 뒤에 오는 카테고리(ai-hardware, ai-safety)의 구체적인 키워드가
 * 있어도 전부 그냥 'ai'로만 태깅되는 걸 직접 테스트로 확인했다(스크래치패드에서
 * "AI 반도체" 문장을 넣고 돌려봤더니 ai-hardware가 아니라 ai가 나옴). 그래서 각
 * 카테고리에서 매칭된 키워드 중 "가장 긴"(=가장 구체적인) 것의 길이로 카테고리
 * 간 우선순위를 매긴다 — 짧고 범용적인 'ai' 보다 길고 구체적인 'AI 반도체'가
 * 이긴다. 길이가 같으면 사전에 먼저 나온 카테고리를 유지한다.
 */
function tagCategory(text) {
  const lower = text.toLowerCase()
  let best = null
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = keywords.filter((keyword) => {
      const escaped = escapeRegExp(keyword.toLowerCase())
      const pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i')
      return pattern.test(lower)
    })
    if (matched.length === 0) continue
    const specificity = Math.max(...matched.map((keyword) => keyword.length))
    if (!best || specificity > best.specificity) {
      best = { category, keywords: matched.slice(0, 5), specificity }
    }
  }
  return best ? { category: best.category, keywords: best.keywords } : null
}

/**
 * 수집 가이드라인 4.1 "중요도 평가"를 LLM 없이 근사한다. 파일 맨 위 주석 "중요도
 * 점수에 대해"에서 각 항목을 어떤 신호로 대체했는지 설명한다. sourceCount 는 같은
 * 사건을 보도한 소스 수(이슈 그룹 크기) — 4번의 "같은 발표를 반복 보도"를 오히려
 * "여러 매체가 다뤘다 = 사회적 영향이 크다"는 신호로 뒤집어 쓴 것이다.
 */
function computeScore(item, sourceCount) {
  const lowerText = `${item.title} ${item.excerpt}`.toLowerCase()

  const hasCoreKeyword = item.keywords.some((keyword) => CORE_KEYWORDS.has(keyword.toLowerCase()))
  const techImportance = hasCoreKeyword ? 25 : 15 // 학생에게 중요한 기술인가?

  const futureIndustry = ['ai-hardware', 'robotics', 'ai-science'].includes(item.category) ? 20 : 10 // 미래 산업과 관련 있는가?

  const ageHours = (Date.now() - item.publishedAt) / (1000 * 60 * 60)
  const novelty = ageHours <= 24 ? 20 : 10 // 새로운 기술·연구인가? (근사: 게시 후 24시간 이내)

  const socialImpact = sourceCount >= 2 ? 15 : 5 // 사회적 영향이 큰가? (근사: 여러 소스가 같은 사건을 보도)

  const studentLife = STUDENT_LIFE_KEYWORDS.some((keyword) => lowerText.includes(keyword)) ? 10 : 0 // 학생 생활과 연결되는가?

  const excerptLength = item.excerpt.length
  const easyToExplain = excerptLength >= 60 && excerptLength <= 250 ? 10 : 5 // 설명하기 쉬운가? (근사: 발췌가 너무 짧지도 길지도 않음)

  return techImportance + futureIndustry + novelty + socialImpact + studentLife + easyToExplain
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
          lang: source.lang ?? 'en',
        })
      }
      console.log(`[fetch-news] ${source.name}: ${items.length}건 중 최근 게시물 확인`)
    } catch (caught) {
      console.warn(`[fetch-news] ${source.name} 수집 실패 — 건너뜀:`, caught.message)
    }
  }

  // 2) 분야 태깅 — 안 맞으면(=학생 적합성 1차 필터 통과 못 하면) 버린다. 키워드
  // 사전이 영어라 원문(번역 전) 텍스트로 판단해야 한다.
  const tagged = []
  for (const item of rawItems) {
    const tag = tagCategory(`${item.title} ${item.excerpt}`)
    if (!tag) continue
    tagged.push({ ...item, ...tag })
  }

  // 3) 번역 — 교사가 매번 영어를 한글로 옮겨 쓰지 않도록, 후보를 보여줄 때부터
  // 한글이게 만든다. 국내 소스(lang: 'ko')는 이미 한글이라 건너뛴다 — 한글을 다시
  // en|ko 번역기에 넣으면 오히려 문장이 망가진다. dedup보다 먼저 해야 한다 —
  // 이후 비교 대상인 newsIssues.title 은 교사가 이미 한글로 써서 발행한 것이라,
  // 영어 원문과 비교하면 겹치는 단어가 없어 유사도 비교가 무의미해진다.
  for (const item of tagged) {
    if (item.lang === 'ko') continue
    item.title = await translateToKorean(item.title)
    item.excerpt = await translateToKorean(item.excerpt)
    await sleep(300) // 무료 API 라 짧게 텀을 둔다
  }

  // 3.5) 명백한 제외 신호 거르기(가이드라인 6번, 위 EXCLUDE_PATTERNS 주석 참고).
  // 번역까지 끝나 항상 한글인 상태에서 검사한다.
  const excluded = tagged.filter((item) => isExcluded(`${item.title} ${item.excerpt}`))
  const survivors = tagged.filter((item) => !isExcluded(`${item.title} ${item.excerpt}`))

  // 4) 같은 사건을 보도한 항목을 하나의 이슈로 묶는다(가이드라인 18번, "같은 사건을
  // 여러 언론사가 보도하면 하나의 이슈로 묶는다"). 대표 항목(최신순 정렬 기준
  // 가장 앞선 것)의 title/excerpt를 그대로 쓰고, 나머지는 sources 배열에 출처만
  // 더한다 — 소스마다 번역 품질이 달라 본문 자체를 합치지는 않는다. sources 배열
  // 길이는 중요도 점수의 "사회적 영향" 근사에도 쓴다.
  const groups = []
  for (const item of survivors.sort((a, b) => b.publishedAt - a.publishedAt)) {
    const existing = groups.find(
      (group) => group.link === item.link || titleSimilarity(group.title, item.title) > 0.6,
    )
    if (existing) {
      existing.sources.push({ name: item.sourceName, url: item.link })
      continue
    }
    groups.push({ ...item, sources: [{ name: item.sourceName, url: item.link }] })
  }

  // 5) 최근 14일 안에 이미 발행한 이슈와 대조해 재중복 제거.
  const historyCutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000
  const historySnapshot = await db
    .collection('newsIssues')
    .where('issuedAt', '>=', historyCutoff)
    .get()
  const historyTitles = historySnapshot.docs.map((entry) => entry.data().title ?? '')

  const fresh = groups
    .filter((item) => !historyTitles.some((title) => titleSimilarity(title, item.title) > 0.6))
    .map((item) => ({
      ...item,
      score: computeScore(item, item.sources.length),
      region: item.lang === 'ko' ? '국내' : '해외',
    }))
    // 점수 높은 순으로 정렬해둔다 — MAX_CANDIDATES 로 자를 때 중요도 낮은 것부터
    // 잘리게, 그리고 교사 화면에서도 위에서부터 보이게. 단, 이건 정렬 순서일
    // 뿐이지 자동 제외 기준이 아니다(파일 맨 위 주석 참고).
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)

  // 6) 오래된 후보 정리 — 교사가 며칠 손 못 댄 후보가 쌓이지 않도록.
  const staleCutoff = Date.now() - RECENT_HOURS * 60 * 60 * 1000
  const staleSnapshot = await db.collection('newsCandidates').where('fetchedAt', '<', staleCutoff).get()
  const cleanupBatch = db.batch()
  staleSnapshot.docs.forEach((entry) => cleanupBatch.delete(entry.ref))
  if (staleSnapshot.size > 0) await cleanupBatch.commit()

  // 7) 새 후보 기록.
  const writeBatch = db.batch()
  const fetchedAt = Date.now()
  for (const item of fresh) {
    const ref = db.collection('newsCandidates').doc(idOf(item.link))
    writeBatch.set(ref, {
      title: item.title,
      excerpt: item.excerpt,
      sourceName: item.sourceName,
      sourceUrl: item.link,
      sources: item.sources,
      publishedAt: item.publishedAt,
      fetchedAt,
      category: item.category,
      keywords: item.keywords,
      score: item.score,
      region: item.region,
    })
  }
  if (fresh.length > 0) await writeBatch.commit()

  console.log(
    `[fetch-news] 수집 ${rawItems.length}건 → 분야 태깅 통과 ${tagged.length}건 → 제외 신호 ${excluded.length}건 걸러냄 → 이슈 단위로 묶어 ${groups.length}건 → 최근 발행분과 대조 후 신규 후보 ${fresh.length}건 기록 (오래된 후보 ${staleSnapshot.size}건 정리)`,
  )
}

main().catch((caught) => {
  console.error('[fetch-news] 실패:', caught)
  process.exit(1)
})
