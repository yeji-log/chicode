/**
 * 전선 + 브레드보드 칸 규칙을 union-find 로 묶어서, 각 부품 핀이 최종적으로 어떤 GPIO
 * 번호에 물려있는지 계산한다. 브레드보드의 "같은 칸 = 같은 노드"는 pinRefKey 자체가
 * 칸/줄 단위로 이미 겹치게 만들어져 있어서 별도 union이 필요 없다 — 실제 하드웨어처럼
 * 같은 라벨(GND 등)을 공유하는 보드 핀들만 여기서 추가로 묶어준다.
 */
import { BOARD_PINS } from './board'
import { type PinRef, type Wire, pinRefKey } from './types'

class UnionFind {
  private parent = new Map<string, string>()

  private find(key: string): string {
    if (!this.parent.has(key)) this.parent.set(key, key)
    let root = this.parent.get(key)!
    while (root !== this.parent.get(root)) root = this.parent.get(root)!
    this.parent.set(key, root)
    return root
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  rootOf(key: string): string {
    return this.find(key)
  }
}

export interface ConnectivityResult {
  /** 부품 핀(pinRefKey) → 연결된 GPIO 번호. 안 이어졌거나 GND 등만 물려있으면 없음. */
  pinToGpio: Map<string, number>
}

export function resolveConnectivity(wires: Wire[]): ConnectivityResult {
  const uf = new UnionFind()

  for (const wire of wires) {
    uf.union(pinRefKey(wire.from), pinRefKey(wire.to))
  }

  // 같은 전원 레일의 구멍들은 전부 한 노드다. 구멍마다 pinRefKey 가 달라진 뒤로
  // (여러 선을 다른 구멍에 꽂을 수 있게 하려고) 여기서 명시적으로 묶어준다 —
  // 이게 없으면 같은 레일에 꽂은 선끼리 안 이어진 것으로 계산된다.
  for (const wire of wires) {
    for (const ref of [wire.from, wire.to]) {
      if (ref.kind !== 'breadboardRail') continue
      uf.union(pinRefKey(ref), `bb:${ref.boardId}:rail:${ref.rail}`)
    }
  }

  // 같은 라벨(GND 등)을 공유하는 보드 핀은 실제 칩처럼 전부 같은 노드다.
  const byLabel = new Map<string, string[]>()
  for (const pin of BOARD_PINS) {
    const ref: PinRef = { kind: 'board', pinId: pin.id }
    const key = pinRefKey(ref)
    const list = byLabel.get(pin.label) ?? []
    list.push(key)
    byLabel.set(pin.label, list)
  }
  for (const keys of byLabel.values()) {
    for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i])
  }

  // 각 root 에 GPIO 핀이 물려있는지 미리 계산해둔다.
  const rootToGpio = new Map<string, number>()
  for (const pin of BOARD_PINS) {
    if (pin.gpio === null) continue
    const root = uf.rootOf(pinRefKey({ kind: 'board', pinId: pin.id }))
    rootToGpio.set(root, pin.gpio)
  }

  const pinToGpio = new Map<string, number>()
  for (const wire of wires) {
    for (const ref of [wire.from, wire.to]) {
      if (ref.kind !== 'component') continue
      const key = pinRefKey(ref)
      const gpio = rootToGpio.get(uf.rootOf(key))
      if (gpio !== undefined) pinToGpio.set(key, gpio)
    }
  }

  return { pinToGpio }
}
