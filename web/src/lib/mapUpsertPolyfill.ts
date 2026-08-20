/**
 * Map.prototype.getOrInsert / getOrInsertComputed 폴리필.
 *
 * 갤럭시 탭(Chrome 140)에서 발표 화면이 에러 문구도 없이 완전히 빈 채로
 * 남는 걸 실제 기기 로그로 확인해서 찾은 원인이다 — pdf.js(pdfjs-dist)가
 * 내부적으로 Map.prototype.getOrInsertComputed 를 16곳에서 쓰는데, 이
 * 메서드는 TC39 "Upsert" 제안이 2026년 1월에야 정식 표준(Stage 4)이 된
 * 아주 최근 기능이라 그보다 오래된 브라우저에는 없다. pdf.js 는 있다고
 * 가정하고 그냥 호출해버려서 `TypeError: ...getOrInsertComputed is not a
 * function` 이 렌더링 도중(우리 try/catch 밖의 비동기 경로)에서 나고,
 * 잡히지 않은 채로 캔버스만 비워진 채 남는다.
 *
 * pdf.js 버전을 낮추면 이후에 고친 다른 버그들이 되돌아올 수 있어서,
 * 대신 표준 스펙 그대로 폴리필 하나만 앱 시작 시 채워 넣는다 — 이미
 * 네이티브로 지원하는 브라우저(최신 Chrome/Firefox/Safari)에서는
 * typeof 검사에 걸려 아무 일도 안 한다.
 *
 * 스펙: https://github.com/tc39/proposal-upsert
 */
export function installMapUpsertPolyfill(): void {
  const proto = Map.prototype as Map<unknown, unknown> & {
    getOrInsert?: (key: unknown, value: unknown) => unknown
    getOrInsertComputed?: (key: unknown, callbackfn: (key: unknown) => unknown) => unknown
  }

  if (typeof proto.getOrInsert !== 'function') {
    proto.getOrInsert = function (this: Map<unknown, unknown>, key, value) {
      if (!this.has(key)) this.set(key, value)
      return this.get(key)
    }
  }

  if (typeof proto.getOrInsertComputed !== 'function') {
    proto.getOrInsertComputed = function (this: Map<unknown, unknown>, key, callbackfn) {
      if (!this.has(key)) this.set(key, callbackfn(key))
      return this.get(key)
    }
  }
}
