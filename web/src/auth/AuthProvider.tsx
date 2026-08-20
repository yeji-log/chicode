import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

import { auth, db, googleProvider } from '../lib/firebase'
import { pushDebug } from '../lib/debugLog'

/**
 * 교사 인증.
 *
 * Google 로그인에 성공했다고 교사가 되는 것이 아니다. Firestore 의 teachers 컬렉션에
 * 해당 이메일 문서가 있어야 교사로 인정한다.
 *
 * 여기서 하는 확인은 화면을 그리기 위한 것일 뿐 보안 장치가 아니다. 실제 차단은
 * firestore.rules / storage.rules 가 구글 서버에서 수행한다. 이 코드를 우회해도
 * 자료를 쓰지 못한다.
 */

/**
 * 갤럭시 탭에서 signInWithPopup 이 오류 코드도 없이 조용히 실패하는 걸 겪고,
 * 한동안 안드로이드만 signInWithRedirect 로 보내도록 갈라뒀던 적이 있다.
 * 그런데 그것도 똑같이 "에러 없이 로그인 결과 없음"으로 조용히 실패했다 —
 * ?debug=1 진단 패널로 실기기에서 signIn 클릭부터 getRedirectResult 까지
 * 전 과정을 직접 받아 확인했다.
 *
 * 원인은 기기가 아니라 이 프로젝트의 Firebase 설정 자체에 있었다: authDomain
 * 이 앱이 실제로 떠 있는 도메인(chico-edu.vercel.app)과 다른
 * chicode-b5713.firebaseapp.com 이다. signInWithRedirect 는 로그인 결과를
 * 돌려받을 때 이 둘 사이를 크로스 오리진 iframe 으로 연결해서 브라우저
 * 스토리지에 접근하는데, Chrome 115+ 를 포함한 최신 브라우저는 이 크로스
 * 오리진 스토리지 접근을 기본으로 차단한다 — Firebase 공식 문서가 정확히 이
 * 증상과 원인을 설명하고, 대안으로 "signInWithPopup 사용"을 꼽는다
 * (https://firebase.google.com/docs/auth/web/redirect-best-practices).
 * signInWithPopup 은 팝업 창과 opener 사이를 postMessage 로 직접 잇기 때문에
 * 이 스토리지 접근 문제가 없다.
 *
 * 그래서 기기별로 방식을 가르지 않고 팝업으로 통일한다. 맥북/윈도우/아이폰은
 * 이미 팝업으로 잘 된다 — 갤럭시 탭에서 애초에 왜 실패했는지(코드 없는 그
 * 첫 실패)는 아직 정확히 확인 못 했다. authDomain 을 커스텀 도메인으로 맞추는
 * 게 Firebase 가 권장하는 더 근본적인 해결책이지만, 이건 코드가 아니라
 * Firebase Hosting 커스텀 도메인 설정이 필요한 인프라 변경이라 여기서 하지
 * 않았다.
 */

export type TeacherState = 'loading' | 'anonymous' | 'not-allowed' | 'teacher'

interface AuthContextValue {
  user: User | null
  state: TeacherState
  error: string | null
  signIn: () => Promise<void>
  signOutTeacher: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<TeacherState>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    pushDebug('AuthProvider 마운트')
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      pushDebug('onAuthStateChanged', { email: nextUser?.email ?? null })
      setUser(nextUser)

      if (!nextUser?.email) {
        setState('anonymous')
        return
      }

      setState('loading')
      try {
        const snapshot = await getDoc(doc(db, 'teachers', nextUser.email.toLowerCase()))
        pushDebug('teachers 문서 조회', { exists: snapshot.exists() })
        setState(snapshot.exists() ? 'teacher' : 'not-allowed')
      } catch (caught) {
        // 규칙상 본인 문서만 읽을 수 있으므로, 실패는 보통 목록에 없다는 뜻이다.
        console.error('교사 확인 실패', caught)
        pushDebug('teachers 문서 조회 실패', caught)
        setState('not-allowed')
      }
    })
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    pushDebug('signIn 클릭', { ua: navigator.userAgent })
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (caught) {
      pushDebug('signIn 실패', caught)
      const code = (caught as { code?: string }).code ?? ''

      // 사용자가 직접 창을 닫은 경우는 오류가 아니다.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return

      setError(explainAuthError(code))
    }
  }, [])

  const signOutTeacher = useCallback(async () => {
    await signOut(auth)
    setError(null)
  }, [])

  const value = useMemo(
    () => ({ user, state, error, signIn, signOutTeacher }),
    [user, state, error, signIn, signOutTeacher],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * 로그인 실패 원인을 화면에 그대로 드러낸다.
 *
 * "잠시 후 다시 시도해 주세요" 같은 뭉뚱그린 문구는 대부분 거짓말이다 — 설정이 빠져서
 * 나는 오류는 몇 번을 다시 눌러도 똑같이 실패한다. 무엇을 고쳐야 하는지 적고,
 * 모르는 오류는 코드라도 붙여 내보낸다.
 */
function explainAuthError(code: string): string {
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Google 로그인이 아직 켜져 있지 않습니다. Firebase 콘솔 → Authentication → Sign-in method → Google → 사용 설정을 해주세요.'
    case 'auth/unauthorized-domain':
      return `이 주소(${location.hostname})가 Firebase 에 등록되지 않았습니다. 콘솔 → Authentication → 설정 → 승인된 도메인에 추가해 주세요.`
    case 'auth/popup-blocked':
      return '브라우저가 로그인 창을 막았습니다. 주소창 오른쪽의 팝업 차단 아이콘을 눌러 허용해 주세요.'
    case 'auth/network-request-failed':
      return '네트워크 연결에 실패했습니다. 인터넷 연결을 확인해 주세요.'
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Firebase 설정값이 올바르지 않습니다. 배포 환경변수를 확인해 주세요.'
    default:
      return `로그인에 실패했습니다. (오류 코드: ${code || '알 수 없음'})`
  }
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다.')
  return context
}
