/**
 * 브레드보드 하나를 그릴 때 쓰는 좌표를 만든다.
 *
 * 실제 브레드보드는 30칸 + 위아래 전원 레일이지만, 화면에 다 넣기엔 크다. 미니(10칸)
 * 와 중간(20칸) 두 크기만 우선 지원한다 — "같은 세로줄(칸)에 꽂으면 전기적으로
 * 연결된다"는 핵심 규칙은 크기와 상관없이 그대로다(계획 문서 6절).
 */
import type { Point } from './types'

export const COL_GAP = 34
export const ROW_GAP = 12

export interface BreadboardLayout {
  id: string
  columns: number
  x: number
  y: number
  width: number
  height: number
  railPlusY: number
  railMinusY: number
  topRowsY: number[]
  bottomRowsY: number[]
  colX: (col: number) => number
}

export function layoutBreadboard(
  id: string,
  x: number,
  y: number,
  columns: number,
): BreadboardLayout {
  const railPlusY = y + 14
  const railMinusY = y + 14 + ROW_GAP
  const topStart = y + 54
  const topRowsY = [0, 1, 2, 3, 4].map((r) => topStart + r * ROW_GAP)
  const gutter = topRowsY[4] + ROW_GAP * 1.6
  const bottomRowsY = [0, 1, 2, 3, 4].map((r) => gutter + r * ROW_GAP)
  const width = (columns - 1) * COL_GAP + 24
  const height = bottomRowsY[4] - y + 20

  return {
    id,
    columns,
    x,
    y,
    width,
    height,
    railPlusY,
    railMinusY,
    topRowsY,
    bottomRowsY,
    colX: (col: number) => x + 20 + col * COL_GAP,
  }
}

/** 특정 칸/줄의 대표 좌표(전선을 그릴 때 그 칸의 "중앙 dot" 로 쓴다). */
export function breadboardAnchor(
  layout: BreadboardLayout,
  col: number,
  side: 'top' | 'bottom',
): Point {
  const rows = side === 'top' ? layout.topRowsY : layout.bottomRowsY
  return { x: layout.colX(col), y: rows[2] }
}

export function breadboardRailAnchor(layout: BreadboardLayout, rail: 'plus' | 'minus'): Point {
  return {
    x: layout.colX(Math.floor(layout.columns / 2)),
    y: rail === 'plus' ? layout.railPlusY : layout.railMinusY,
  }
}
