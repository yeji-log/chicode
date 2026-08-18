/**
 * Lab 활동 항목에 붙일 수 있는 유튜브 영상 링크 파싱.
 *
 * mp4 파일 첨부(labSectionAttachments.ts)는 Firestore 문서 조각 저장 방식
 * 특성상 스트리밍이 안 되고(재생 전 전체 다운로드) 용량도 50MB로 제한된다.
 * 긴 영상은 애초에 그 방식으로 못 올리므로, 유튜브에 올린 영상의 링크만
 * 저장해두고 iframe 임베드로 유튜브 서버에서 직접 스트리밍하게 한다 —
 * Firestore에는 URL 문자열 하나만 남는다.
 */

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'])

/** 다양한 유튜브 URL 형태에서 영상 ID를 뽑아낸다. 못 알아보면 null —
 *  호출하는 쪽에서 "링크를 다시 확인해 주세요" 같은 안내에 쓴다.
 *
 *  지원: watch?v=, youtu.be/, /embed/, /shorts/ (www./m. 유무, 쿼리스트링
 *  (재생목록·타임스탬프 등) 무관하게 동작한다). */
export function extractYoutubeId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0]
    return id || null
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v')
    const match = parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)
    if (match) return match[1]
  }

  return null
}

/** youtube-nocookie.com 도메인을 쓴다 — 영상을 재생하기 전까지는 추적
 *  쿠키를 안 남긴다는 유튜브 쪽 안내를 따른 것(학생은 로그인도 없는데
 *  괜히 쿠키를 남기고 싶지 않아서). */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}
