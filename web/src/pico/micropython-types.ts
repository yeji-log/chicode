/**
 * @micropython/micropython-webassembly-pyscript 는 타입 선언을 제공하지 않는다.
 * 실제로 쓰는 부분만 최소로 타입을 붙인다 (registerJsModule, runPythonAsync 등 —
 * 근거는 pico2w_시뮬레이터_구현_계획.md 2.3, 2.5).
 */
export interface MicroPythonInterface {
  runPythonAsync(code: string): Promise<unknown>
  registerJsModule(name: string, module: Record<string, unknown>): void
  FS: unknown
}
