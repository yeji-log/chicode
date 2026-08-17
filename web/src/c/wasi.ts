/**
 * clang / wasm-ld / 학생이 컴파일한 프로그램을 브라우저에서 돌리기 위한
 * 최소한의 WASI 구현과 메모리 파일시스템.
 *
 * ── 왜 직접 만들었는가 ──
 * 이 세 wasm 은 모두 구형 `wasi_unstable`(snapshot_0) ABI 를 쓴다. 널리 쓰이는
 * WASI 라이브러리는 `wasi_snapshot_preview1` 을 제공하는데, 둘은 구조체 배치가
 * 다르다 — 특히 filestat 의 st_nlink 가 u32(56바이트) 대 u64(64바이트)이고,
 * fd_seek 의 whence 값 순서가 정반대다. 그대로 쓰면 clang 이 파일 크기를 엉뚱하게
 * 읽어 조용히 실패한다.
 *
 * ── SharedArrayBuffer 를 쓰지 않는 이유 ──
 * 기성 런타임(runno 등)은 stdin 을 블로킹으로 읽으려고 SharedArrayBuffer 를 쓰는데,
 * 그러면 COOP/COEP 헤더가 필요해진다. 그 헤더는 GitHub Pages 에서 설정할 수 없고,
 * Google 로그인 팝업도 막아버린다. 우리는 Python 실습과 똑같이 입력을 미리 받아두는
 * 방식이라 블로킹이 필요 없고, 따라서 특별한 헤더 없이 어디서든 돌아간다.
 */

// ---------- WASI 상수 (snapshot_0) ----------
const ESUCCESS = 0
const EBADF = 8
const EEXIST = 20
const EINVAL = 28
const EISDIR = 31
const ENOENT = 44
const ENOSYS = 52
const ENOTDIR = 54

const FILETYPE_DIRECTORY = 3
const FILETYPE_REGULAR_FILE = 4

const OFLAGS_CREAT = 1
const OFLAGS_DIRECTORY = 2
const OFLAGS_EXCL = 4
const OFLAGS_TRUNC = 8

/** snapshot_0 의 whence 는 preview1 과 순서가 다르다: 0=CUR, 1=END, 2=SET */
const WHENCE_CUR = 0
const WHENCE_END = 1

/** 프로그램이 proc_exit 을 부르면 이 예외로 실행을 빠져나온다. */
export class WasiExit extends Error {
  readonly code: number

  constructor(code: number) {
    super(`exit(${code})`)
    this.code = code
  }
}

interface MemFile {
  data: Uint8Array
  /** data 중 실제로 쓰인 길이. 쓰기를 할 때 버퍼를 넉넉히 잡고 이 값만 늘린다. */
  size: number
}

interface OpenFile {
  path: string
  offset: number
  /** 디렉터리를 연 경우 */
  isDir: boolean
  append: boolean
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** 경로를 정규화한다. 항상 '/' 로 시작하고 끝의 '/' 는 없앤다. */
function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

export class MemFS {
  private files = new Map<string, MemFile>()
  private dirs = new Set<string>(['/'])

  /**
   * 경로마다 고유한 inode 번호.
   *
   * clang(LLVM)은 (장치번호, inode)로 두 파일이 같은 파일인지 판단하고 그 결과로
   * 읽은 내용을 캐시한다. 모두 0 으로 주면 서로 다른 파일을 같은 파일로 착각해서,
   * stdio.h 를 열었는데 앞서 읽은 main.c 내용이 나오는 일이 벌어진다.
   */
  private inodes = new Map<string, number>()
  private nextInode = 1

  inodeOf(path: string): number {
    const full = normalize(path)
    let inode = this.inodes.get(full)
    if (inode === undefined) {
      inode = this.nextInode++
      this.inodes.set(full, inode)
    }
    return inode
  }

  writeFile(path: string, data: Uint8Array): void {
    const full = normalize(path)
    this.ensureParentDirs(full)
    this.files.set(full, { data, size: data.length })
  }

  readFile(path: string): Uint8Array | null {
    const file = this.files.get(normalize(path))
    return file ? file.data.subarray(0, file.size) : null
  }

  exists(path: string): boolean {
    const full = normalize(path)
    return this.files.has(full) || this.dirs.has(full)
  }

  isDir(path: string): boolean {
    return this.dirs.has(normalize(path))
  }

  mkdir(path: string): void {
    const full = normalize(path)
    this.ensureParentDirs(full)
    this.dirs.add(full)
  }

  unlink(path: string): void {
    this.files.delete(normalize(path))
  }

  /** 어떤 디렉터리의 바로 아래 항목들 */
  entries(dir: string): { name: string; isDir: boolean }[] {
    const base = normalize(dir)
    const prefix = base === '/' ? '/' : base + '/'
    const seen = new Map<string, boolean>()

    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (rest.includes('/')) seen.set(rest.split('/')[0], true)
      else seen.set(rest, false)
    }
    for (const path of this.dirs) {
      if (path === base || !path.startsWith(prefix)) continue
      seen.set(path.slice(prefix.length).split('/')[0], true)
    }

    return [...seen].map(([name, isDir]) => ({ name, isDir }))
  }

  getFile(path: string): MemFile | undefined {
    return this.files.get(normalize(path))
  }

  /** 파일에 쓸 때 필요하면 버퍼를 키운다. */
  writeAt(path: string, offset: number, chunk: Uint8Array): number {
    const full = normalize(path)
    let file = this.files.get(full)
    if (!file) {
      this.ensureParentDirs(full)
      file = { data: new Uint8Array(Math.max(1024, offset + chunk.length)), size: 0 }
      this.files.set(full, file)
    }

    const needed = offset + chunk.length
    if (needed > file.data.length) {
      const grown = new Uint8Array(Math.max(needed, file.data.length * 2))
      grown.set(file.data.subarray(0, file.size))
      file.data = grown
    }
    file.data.set(chunk, offset)
    if (needed > file.size) file.size = needed
    return chunk.length
  }

  private ensureParentDirs(path: string): void {
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    let current = ''
    for (const part of parts) {
      current += '/' + part
      this.dirs.add(current)
    }
  }
}

export interface WasiOptions {
  args: string[]
  env?: Record<string, string>
  fs: MemFS
  /** 프로그램이 읽어갈 표준 입력 (미리 준비해 둔다) */
  stdin?: string
  onStdout?: (text: string) => void
  onStderr?: (text: string) => void
}

/**
 * wasm 인스턴스 하나를 돌리기 위한 WASI 환경.
 * 실행할 때마다 새로 만든다 (fd 테이블과 파일 오프셋이 실행마다 초기화되어야 한다).
 */
export class Wasi {
  private memory!: WebAssembly.Memory
  private view!: DataView
  private bytes!: Uint8Array

  private readonly fds = new Map<number, OpenFile>()
  private nextFd = 4
  private stdinBytes: Uint8Array
  private stdinOffset = 0

  /** stdout/stderr 는 줄 단위로 모아서 내보낸다. */
  private outBuffer = ''
  private errBuffer = ''

  private readonly options: WasiOptions

  constructor(options: WasiOptions) {
    this.options = options
    this.stdinBytes = encoder.encode(options.stdin ?? '')
    // fd 3 은 루트 디렉터리를 미리 열어둔 것(preopen)으로 약속한다.
    this.fds.set(3, { path: '/', offset: 0, isDir: true, append: false })
  }

  setMemory(memory: WebAssembly.Memory): void {
    this.memory = memory
    this.refresh()
  }

  /** wasm 메모리가 커지면 기존 뷰가 무효화되므로 매번 확인한다. */
  private refresh(): void {
    if (!this.bytes || this.bytes.buffer !== this.memory.buffer) {
      this.bytes = new Uint8Array(this.memory.buffer)
      this.view = new DataView(this.memory.buffer)
    }
  }

  /** 남아 있는 출력까지 모두 내보낸다. */
  flush(): void {
    if (this.outBuffer) {
      this.options.onStdout?.(this.outBuffer)
      this.outBuffer = ''
    }
    if (this.errBuffer) {
      this.options.onStderr?.(this.errBuffer)
      this.errBuffer = ''
    }
  }

  private emit(isErr: boolean, text: string): void {
    if (isErr) {
      this.errBuffer += text
      const lines = this.errBuffer.split('\n')
      this.errBuffer = lines.pop() ?? ''
      for (const line of lines) this.options.onStderr?.(line)
    } else {
      this.outBuffer += text
      const lines = this.outBuffer.split('\n')
      this.outBuffer = lines.pop() ?? ''
      for (const line of lines) this.options.onStdout?.(line)
    }
  }

  private readString(ptr: number, len: number): string {
    this.refresh()
    return decoder.decode(this.bytes.subarray(ptr, ptr + len))
  }

  private resolve(dirFd: number, path: string): string | null {
    const dir = this.fds.get(dirFd)
    if (!dir) return null
    return normalize(path.startsWith('/') ? path : `${dir.path}/${path}`)
  }

  /** wasm 이 import 로 요구하는 wasi_unstable 함수들 */
  get imports(): WebAssembly.ModuleImports {
    const fs = this.options.fs

    return {
      args_sizes_get: (countPtr: number, bufSizePtr: number) => {
        this.refresh()
        const args = this.options.args
        this.view.setUint32(countPtr, args.length, true)
        const size = args.reduce((total, a) => total + encoder.encode(a).length + 1, 0)
        this.view.setUint32(bufSizePtr, size, true)
        return ESUCCESS
      },

      args_get: (argvPtr: number, bufPtr: number) => {
        this.refresh()
        let offset = bufPtr
        this.options.args.forEach((arg, index) => {
          this.view.setUint32(argvPtr + index * 4, offset, true)
          const encoded = encoder.encode(arg)
          this.bytes.set(encoded, offset)
          this.bytes[offset + encoded.length] = 0
          offset += encoded.length + 1
        })
        return ESUCCESS
      },

      environ_sizes_get: (countPtr: number, bufSizePtr: number) => {
        this.refresh()
        const entries = Object.entries(this.options.env ?? {})
        this.view.setUint32(countPtr, entries.length, true)
        const size = entries.reduce(
          (total, [k, v]) => total + encoder.encode(`${k}=${v}`).length + 1,
          0,
        )
        this.view.setUint32(bufSizePtr, size, true)
        return ESUCCESS
      },

      environ_get: (environPtr: number, bufPtr: number) => {
        this.refresh()
        let offset = bufPtr
        Object.entries(this.options.env ?? {}).forEach(([k, v], index) => {
          this.view.setUint32(environPtr + index * 4, offset, true)
          const encoded = encoder.encode(`${k}=${v}`)
          this.bytes.set(encoded, offset)
          this.bytes[offset + encoded.length] = 0
          offset += encoded.length + 1
        })
        return ESUCCESS
      },

      clock_time_get: (_id: number, _precision: bigint, timePtr: number) => {
        this.refresh()
        // 실제 시각을 줄 이유가 없다. 컴파일 결과가 실행할 때마다 달라지지 않도록 0 으로 고정한다.
        this.view.setBigUint64(timePtr, 0n, true)
        return ESUCCESS
      },

      random_get: (bufPtr: number, len: number) => {
        this.refresh()
        // wasm 메모리 뷰를 그대로 넘길 수 없어(버퍼 타입이 다르다) 따로 채워서 복사한다.
        const random = new Uint8Array(len)
        crypto.getRandomValues(random)
        this.bytes.set(random, bufPtr)
        return ESUCCESS
      },

      proc_exit: (code: number) => {
        throw new WasiExit(code)
      },

      fd_prestat_get: (fd: number, bufPtr: number) => {
        this.refresh()
        if (fd !== 3) return EBADF
        this.view.setUint8(bufPtr, 0) // 0 = 디렉터리
        this.view.setUint32(bufPtr + 4, 1, true) // "/" 의 길이
        return ESUCCESS
      },

      fd_prestat_dir_name: (fd: number, pathPtr: number, pathLen: number) => {
        this.refresh()
        if (fd !== 3) return EBADF
        this.bytes.set(encoder.encode('/').subarray(0, pathLen), pathPtr)
        return ESUCCESS
      },

      fd_fdstat_get: (fd: number, bufPtr: number) => {
        this.refresh()
        const isDir = fd === 3 || this.fds.get(fd)?.isDir
        const isStd = fd <= 2
        if (!isStd && !this.fds.has(fd)) return EBADF

        this.view.setUint8(bufPtr, isDir ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE)
        this.view.setUint16(bufPtr + 2, 0, true)
        // 권한은 넉넉히 열어준다. 어차피 이 파일시스템은 메모리 안에만 있다.
        this.view.setBigUint64(bufPtr + 8, 0xffffffffffffffffn, true)
        this.view.setBigUint64(bufPtr + 16, 0xffffffffffffffffn, true)
        return ESUCCESS
      },

      fd_fdstat_set_flags: () => ESUCCESS,

      fd_filestat_get: (fd: number, bufPtr: number) => {
        const open = this.fds.get(fd)
        if (!open) return EBADF
        return this.writeFilestat(bufPtr, open.path)
      },

      path_filestat_get: (
        dirFd: number,
        _flags: number,
        pathPtr: number,
        pathLen: number,
        bufPtr: number,
      ) => {
        const path = this.resolve(dirFd, this.readString(pathPtr, pathLen))
        if (path === null) return EBADF
        if (!fs.exists(path)) return ENOENT
        return this.writeFilestat(bufPtr, path)
      },

      path_open: (
        dirFd: number,
        _dirFlags: number,
        pathPtr: number,
        pathLen: number,
        oflags: number,
        _rightsBase: bigint,
        _rightsInheriting: bigint,
        fdflags: number,
        openedFdPtr: number,
      ) => {
        this.refresh()
        const path = this.resolve(dirFd, this.readString(pathPtr, pathLen))
        if (path === null) return EBADF

        const wantDir = (oflags & OFLAGS_DIRECTORY) !== 0
        const exists = fs.exists(path)
        const isDir = fs.isDir(path)

        if (wantDir && exists && !isDir) return ENOTDIR
        if (!exists) {
          if (!(oflags & OFLAGS_CREAT)) return ENOENT
          fs.writeFile(path, new Uint8Array(0))
        } else if (oflags & OFLAGS_EXCL) {
          return EEXIST
        } else if (oflags & OFLAGS_TRUNC) {
          if (isDir) return EISDIR
          fs.writeFile(path, new Uint8Array(0))
        }

        const fd = this.nextFd++
        this.fds.set(fd, {
          path,
          offset: 0,
          isDir: fs.isDir(path),
          append: (fdflags & 1) !== 0,
        })
        this.view.setUint32(openedFdPtr, fd, true)
        return ESUCCESS
      },

      fd_close: (fd: number) => {
        this.fds.delete(fd)
        return ESUCCESS
      },

      fd_read: (fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number) => {
        this.refresh()
        let total = 0

        if (fd === 0) {
          // 표준 입력 — 미리 받아둔 내용을 순서대로 넘겨준다.
          for (let i = 0; i < iovsLen; i++) {
            const bufPtr = this.view.getUint32(iovsPtr + i * 8, true)
            const bufLen = this.view.getUint32(iovsPtr + i * 8 + 4, true)
            const chunk = this.stdinBytes.subarray(
              this.stdinOffset,
              this.stdinOffset + bufLen,
            )
            if (chunk.length === 0) break
            this.bytes.set(chunk, bufPtr)
            this.stdinOffset += chunk.length
            total += chunk.length
          }
          this.view.setUint32(nreadPtr, total, true)
          return ESUCCESS
        }

        const open = this.fds.get(fd)
        if (!open) return EBADF
        const file = fs.getFile(open.path)
        if (!file) return EBADF

        for (let i = 0; i < iovsLen; i++) {
          const bufPtr = this.view.getUint32(iovsPtr + i * 8, true)
          const bufLen = this.view.getUint32(iovsPtr + i * 8 + 4, true)
          const chunk = file.data.subarray(
            open.offset,
            Math.min(open.offset + bufLen, file.size),
          )
          if (chunk.length === 0) break
          this.bytes.set(chunk, bufPtr)
          open.offset += chunk.length
          total += chunk.length
        }
        this.view.setUint32(nreadPtr, total, true)
        return ESUCCESS
      },

      fd_pread: (
        fd: number,
        iovsPtr: number,
        iovsLen: number,
        offset: bigint,
        nreadPtr: number,
      ) => {
        this.refresh()
        const open = this.fds.get(fd)
        if (!open) return EBADF
        const file = fs.getFile(open.path)
        if (!file) return EBADF

        let position = Number(offset)
        let total = 0
        for (let i = 0; i < iovsLen; i++) {
          const bufPtr = this.view.getUint32(iovsPtr + i * 8, true)
          const bufLen = this.view.getUint32(iovsPtr + i * 8 + 4, true)
          const chunk = file.data.subarray(position, Math.min(position + bufLen, file.size))
          if (chunk.length === 0) break
          this.bytes.set(chunk, bufPtr)
          position += chunk.length
          total += chunk.length
        }
        this.view.setUint32(nreadPtr, total, true)
        return ESUCCESS
      },

      fd_write: (fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
        this.refresh()
        let total = 0

        for (let i = 0; i < iovsLen; i++) {
          const bufPtr = this.view.getUint32(iovsPtr + i * 8, true)
          const bufLen = this.view.getUint32(iovsPtr + i * 8 + 4, true)
          const chunk = this.bytes.subarray(bufPtr, bufPtr + bufLen)

          if (fd === 1 || fd === 2) {
            this.emit(fd === 2, decoder.decode(chunk, { stream: true }))
          } else {
            const open = this.fds.get(fd)
            if (!open) return EBADF
            const at = open.append ? (fs.getFile(open.path)?.size ?? 0) : open.offset
            fs.writeAt(open.path, at, chunk.slice())
            open.offset = at + chunk.length
          }
          total += chunk.length
        }

        this.view.setUint32(nwrittenPtr, total, true)
        return ESUCCESS
      },

      fd_seek: (fd: number, offset: bigint, whence: number, newOffsetPtr: number) => {
        this.refresh()
        const open = this.fds.get(fd)
        if (!open) return EBADF
        const size = fs.getFile(open.path)?.size ?? 0

        // snapshot_0 순서에 주의: 0=CUR, 1=END, 2=SET
        const base =
          whence === WHENCE_CUR ? open.offset : whence === WHENCE_END ? size : 0
        open.offset = base + Number(offset)

        this.view.setBigUint64(newOffsetPtr, BigInt(open.offset), true)
        return ESUCCESS
      },

      fd_readdir: (
        fd: number,
        bufPtr: number,
        bufLen: number,
        cookie: bigint,
        usedPtr: number,
      ) => {
        this.refresh()
        const open = this.fds.get(fd)
        if (!open) return EBADF

        const entries = fs.entries(open.path)
        let offset = 0
        let index = Number(cookie)

        while (index < entries.length) {
          const entry = entries[index]
          const name = encoder.encode(entry.name)
          if (offset + 24 + name.length > bufLen) break

          this.view.setBigUint64(bufPtr + offset, BigInt(index + 1), true) // 다음 cookie
          this.view.setBigUint64(
            bufPtr + offset + 8,
            BigInt(fs.inodeOf(`${open.path}/${entry.name}`)),
            true,
          ) // inode
          this.view.setUint32(bufPtr + offset + 16, name.length, true)
          this.view.setUint8(
            bufPtr + offset + 20,
            entry.isDir ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE,
          )
          this.bytes.set(name, bufPtr + offset + 24)

          offset += 24 + name.length
          index += 1
        }

        this.view.setUint32(usedPtr, offset, true)
        return ESUCCESS
      },

      path_create_directory: (dirFd: number, pathPtr: number, pathLen: number) => {
        const path = this.resolve(dirFd, this.readString(pathPtr, pathLen))
        if (path === null) return EBADF
        fs.mkdir(path)
        return ESUCCESS
      },

      path_unlink_file: (dirFd: number, pathPtr: number, pathLen: number) => {
        const path = this.resolve(dirFd, this.readString(pathPtr, pathLen))
        if (path === null) return EBADF
        if (!fs.exists(path)) return ENOENT
        fs.unlink(path)
        return ESUCCESS
      },

      path_rename: (
        oldFd: number,
        oldPtr: number,
        oldLen: number,
        newFd: number,
        newPtr: number,
        newLen: number,
      ) => {
        const from = this.resolve(oldFd, this.readString(oldPtr, oldLen))
        const to = this.resolve(newFd, this.readString(newPtr, newLen))
        if (from === null || to === null) return EBADF
        const data = fs.readFile(from)
        if (!data) return ENOENT
        fs.writeFile(to, data.slice())
        fs.unlink(from)
        return ESUCCESS
      },

      // 아래는 clang 이 import 하지만 이 파이프라인에서는 쓰이지 않는다.
      // 그래도 없으면 인스턴스 생성 자체가 실패하므로 자리는 채워 둔다.
      path_remove_directory: () => ENOSYS,
      path_symlink: () => ENOSYS,
      path_readlink: () => EINVAL,
      poll_oneoff: () => ENOSYS,
    }
  }

  /** snapshot_0 의 filestat 구조체(56바이트)를 쓴다. preview1(64바이트)과 다르다. */
  private writeFilestat(bufPtr: number, path: string): number {
    this.refresh()
    const fs = this.options.fs
    const isDir = fs.isDir(path)
    const size = isDir ? 0 : (fs.getFile(path)?.size ?? 0)

    this.view.setBigUint64(bufPtr, 1n, true) // st_dev
    this.view.setBigUint64(bufPtr + 8, BigInt(fs.inodeOf(path)), true) // st_ino
    this.view.setUint8(bufPtr + 16, isDir ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE)
    this.view.setUint32(bufPtr + 20, 1, true) // st_nlink — snapshot_0 에서는 u32
    this.view.setBigUint64(bufPtr + 24, BigInt(size), true)
    this.view.setBigUint64(bufPtr + 32, 0n, true) // atim
    this.view.setBigUint64(bufPtr + 40, 0n, true) // mtim
    this.view.setBigUint64(bufPtr + 48, 0n, true) // ctim
    return ESUCCESS
  }
}

/**
 * wasm 모듈 하나를 WASI 환경에서 실행하고 종료 코드를 돌려준다.
 * proc_exit 은 예외로 올라오므로 여기서 받아 정상 종료로 바꾼다.
 */
export async function runWasi(
  module: WebAssembly.Module,
  options: WasiOptions,
): Promise<number> {
  const wasi = new Wasi(options)
  const instance = await WebAssembly.instantiate(module, { wasi_unstable: wasi.imports })

  const exports = instance.exports as {
    memory: WebAssembly.Memory
    _start: () => void
  }
  wasi.setMemory(exports.memory)

  try {
    exports._start()
    return 0
  } catch (error) {
    if (error instanceof WasiExit) return error.code
    throw error
  } finally {
    wasi.flush()
  }
}
