/**
 * 실습(Python/C/Pico) 공개 설정.
 *
 * 지금은 Pico 2 W 시뮬레이터 하나만 켜고 끄는 스위치가 필요하다 — Python/C는
 * 이미 다 만들어져서 잠글 이유가 없고, 사용자도 "pico2w만" 제어할 수 있게
 * 해달라고 했다. labSettings(labs.ts)와 같은 "문서 하나만 쓰는 싱글턴" 패턴.
 *
 * 기본값은 false(준비중)다 — subjects.ts의 published(기본 true, opt-out)와
 * 반대 방향인데, 지금 이 기능을 넣는 시점에 "아직 학생에게 열면 안 된다"는
 * 요구사항 자체가 있었기 때문에 일부러 opt-in으로 뒤집었다.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { db } from './firebase'

const SETTINGS = 'practiceSettings'
const PICO_ID = 'pico2w'

export interface PicoPracticeSettings {
  /** true 면 학생도 볼 수 있다. 문서가 아직 없으면(기본) false. */
  open: boolean
  updatedAt: number
}

const DEFAULT_SETTINGS: PicoPracticeSettings = { open: false, updatedAt: 0 }

export async function getPicoPracticeSettings(): Promise<PicoPracticeSettings> {
  const snapshot = await getDoc(doc(db, SETTINGS, PICO_ID))
  if (!snapshot.exists()) return DEFAULT_SETTINGS
  return { ...DEFAULT_SETTINGS, ...snapshot.data() } as PicoPracticeSettings
}

export async function setPicoOpen(open: boolean): Promise<void> {
  await setDoc(doc(db, SETTINGS, PICO_ID), { open, updatedAt: Date.now() }, { merge: true })
}
