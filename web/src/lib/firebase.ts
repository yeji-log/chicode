import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** 설정이 비어 있으면 로그인 화면에서 그 사실을 그대로 알려준다. */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId)

const app = initializeApp(config)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

/**
 * 기본값(indexedDBLocalPersistence)이 아이패드 Safari에서 signInWithPopup 과
 * 부딪힌다. 팝업이 뜨는 순간 원래 탭이 hidden 으로 처리되는 경우가 있는데,
 * Safari 는 탭이 배경으로 가면 열려 있던 IndexedDB 연결을 강제로 닫아버려서
 * 로그인 결과를 쓰려는 시점에 "Database is closing/hidden" 오류로 조용히
 * 실패한다 — 아이폰에서는 재현 안 되고 아이패드에서만 재현됨(?debug=1 로 실기기
 * 스택트레이스 확인, AuthProvider.tsx 참고). localStorage 기반 영속성은 Safari가
 * 이렇게 끊지 않아서 이 문제를 피한다.
 */
void setPersistence(auth, browserLocalPersistence)

export const googleProvider = new GoogleAuthProvider()
// 계정을 여러 개 쓰는 교사가 매번 계정을 고를 수 있도록.
googleProvider.setCustomParameters({ prompt: 'select_account' })
