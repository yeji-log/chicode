/**
 * 실습 코드(+회로)를 URL 하나에 통째로 담아 주고받는다.
 *
 * ── 왜 서버가 아니라 URL 인가 ──
 * firestore.rules 는 학생(비로그인) 쓰기를 전 컬렉션에서 막는다. 공유를 서버로
 * 하려면 아무나 쓸 수 있는 컬렉션을 열어야 하는데, 그러면 무료 플랜 할당량이
 * 스팸에 그대로 노출된다(exercises.ts 가 학생 풀이 기록을 서버에 안 남긴 이유와
 * 같은 판단). URL 방식은 서버 비용 0원이고, 데이터가 해시(#) 뒤에 있어 서버
 * 액세스 로그에도 안 남는다.
 *
 * ── 형식 ──
 *   버전(1자) + 인코딩(1자) + payload
 *   - 버전 '1'. 엔벨로프가 바뀌면 올린다 — 옛 링크를 잘못 해석하지 않게.
 *   - 인코딩 'z' = deflate-raw 후 base64url, 'r' = 그냥 base64url.
 *     둘 다 만들어 보고 짧은 쪽을 쓴다(짧은 코드는 압축이 오히려 커진다).
 *
 * 실측(scratchpad, 2026-08-31): 7세그먼트 회로 예제가 raw 1928자 → deflate 568자,
 * 부품 15개짜리 무거운 회로가 raw 9530자 → deflate 1134자. 압축이 크게 이긴다.
 */
import type { CircuitSnapshot } from '../pico/circuit/types'

export type PracticeKind = 'python' | 'c' | 'pico'

export interface SharePayload {
  v: 1
  kind: PracticeKind
  code: string
  /** python·c 에서 input()/scanf 로 읽을 내용. */
  stdin?: string
  /** pico 회로. */
  circuit?: CircuitSnapshot
}

/** 엔벨로프 버전. 형식이 바뀌면 올린다. */
const VERSION = '1'

export const KIND_PATH: Record<PracticeKind, string> = {
  python: 'practice/python',
  c: 'practice/c',
  pico: 'practice/pico',
}

export const KIND_LABEL: Record<PracticeKind, string> = {
  python: 'Python',
  c: 'C언어',
  pico: 'Pico',
}

// ── base64url ──────────────────────────────────────────────────────────────

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── deflate (브라우저 내장, 없으면 raw 로 떨어진다) ─────────────────────────

async function pipe(bytes: Uint8Array, stream: TransformStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    return await pipe(bytes, new CompressionStream('deflate-raw'))
  } catch {
    return null
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    return await pipe(bytes, new DecompressionStream('deflate-raw'))
  } catch {
    return null
  }
}

// ── 인코딩 / 디코딩 ────────────────────────────────────────────────────────

/** payload 를 `#s=` 뒤에 들어갈 토큰 문자열로. */
export async function encodeShare(payload: SharePayload): Promise<string> {
  const utf8 = new TextEncoder().encode(JSON.stringify(payload))
  const raw = toB64Url(utf8)
  const z = await deflate(utf8)
  if (z) {
    const zb = toB64Url(z)
    if (zb.length < raw.length) return `${VERSION}z${zb}`
  }
  return `${VERSION}r${raw}`
}

function isCircuitSnapshot(value: unknown): value is CircuitSnapshot {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return Array.isArray(c.components) && Array.isArray(c.wires)
}

/** 낯선/깨진 토큰이면 null. 자동 실행은 절대 없고, 여기서는 모양만 검증한다. */
export async function decodeShare(token: string): Promise<SharePayload | null> {
  if (!token || token[0] !== VERSION) return null
  const encoding = token[1]
  const body = token.slice(2)

  let utf8: Uint8Array | null
  try {
    const bytes = fromB64Url(body)
    if (encoding === 'z') utf8 = await inflate(bytes)
    else if (encoding === 'r') utf8 = bytes
    else return null
  } catch {
    return null
  }
  if (!utf8) return null

  let obj: unknown
  try {
    obj = JSON.parse(new TextDecoder().decode(utf8))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null

  const p = obj as Record<string, unknown>
  if (p.v !== 1) return null
  if (p.kind !== 'python' && p.kind !== 'c' && p.kind !== 'pico') return null
  if (typeof p.code !== 'string') return null
  if (p.stdin !== undefined && typeof p.stdin !== 'string') return null
  if (p.circuit !== undefined && !isCircuitSnapshot(p.circuit)) return null

  return {
    v: 1,
    kind: p.kind,
    code: p.code,
    stdin: typeof p.stdin === 'string' ? p.stdin : undefined,
    circuit: isCircuitSnapshot(p.circuit) ? p.circuit : undefined,
  }
}

/** 실습 경로 + `#s=토큰` 을 붙인 절대 URL. GitHub Pages 의 base 경로(/chicode/)를 따른다. */
export async function buildShareUrl(payload: SharePayload): Promise<string> {
  const token = await encodeShare(payload)
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${location.origin}${base}/${KIND_PATH[payload.kind]}#s=${token}`
}

/** 지금 주소의 `#s=` 토큰. 없으면 null. */
export function readShareToken(): string | null {
  const hash = location.hash.replace(/^#/, '')
  if (!hash) return null
  return new URLSearchParams(hash).get('s')
}

/** 주소창에서 `#s=...` 만 지운다(경로·쿼리는 그대로). */
export function stripShareToken(): void {
  history.replaceState(null, '', location.pathname + location.search)
}
