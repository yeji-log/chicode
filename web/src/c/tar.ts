/**
 * clang sysroot(clang-fs.tar.gz)를 풀기 위한 최소한의 tar 리더.
 *
 * gzip 해제는 브라우저에 내장된 DecompressionStream 을 쓰므로 압축 라이브러리가
 * 따로 필요 없다. tar 는 512바이트 헤더가 반복되는 단순한 형식이라 직접 읽는다.
 */

export interface TarEntry {
  name: string
  data: Uint8Array
  isDir: boolean
}

const BLOCK = 512

export async function gunzip(compressed: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Response(compressed).body!.pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function readTar(bytes: Uint8Array): TarEntry[] {
  const decoder = new TextDecoder()
  const entries: TarEntry[] = []
  let offset = 0

  const field = (start: number, length: number) =>
    decoder.decode(bytes.subarray(offset + start, offset + start + length)).replace(/\0.*$/, '')

  while (offset + BLOCK <= bytes.length) {
    const name = field(0, 100)
    // 이름이 비어 있는 블록이 나오면 아카이브 끝이다.
    if (!name) break

    const size = parseInt(field(124, 12).trim() || '0', 8)
    const typeFlag = field(156, 1)
    // GNU tar 가 긴 경로를 나눠 담는 prefix 필드
    const prefix = field(345, 155)
    const fullName = prefix ? `${prefix}/${name}` : name

    offset += BLOCK

    // '5' = 디렉터리, '0'/'' = 일반 파일. 나머지(심볼릭 링크 등)는 건너뛴다.
    if (typeFlag === '5') {
      entries.push({ name: fullName, data: new Uint8Array(0), isDir: true })
    } else if (typeFlag === '0' || typeFlag === '') {
      entries.push({
        name: fullName,
        data: bytes.subarray(offset, offset + size),
        isDir: false,
      })
    }

    // 본문은 512바이트 단위로 채워져 있다.
    offset += Math.ceil(size / BLOCK) * BLOCK
  }

  return entries
}
