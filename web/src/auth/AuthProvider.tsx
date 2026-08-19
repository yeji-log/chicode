import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

import { auth, db, googleProvider } from '../lib/firebase'

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
 * 안드로이드(삼성 인터넷·크롬 둘 다 확인됨)에서 signInWithPopup 이 오류 코드도 없이
 * 조용히 실패하는 걸 실제로 겪고 나서 넣었다 — 팝업 창과 원래 창이 스토리지로 로그인
 * 결과를 주고받는데, 안드로이드 브라우저들이 이 통신을 데스크톱과 다르게 처리해서 깨지는
 * 것으로 보인다(Firebase 공식 문서도 모바일에는 리다이렉트 방식을 권장한다).
 *
 * 안드로이드로만 좁힌 이유: 아이폰(Safari)은 지금 팝업 방식으로 이미 잘 된다. 사파리는
 * 추적 방지 때문에 리다이렉트 방식에서 또 다른 방식으로 깨질 수 있어서, 검증 안 된
 * 위험을 새로 만들지 않으려고 이미 되는 흐름은 건드리지 않았다.
 */
function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

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
    // signInWithRedirect 로 나갔다가 돌아온 경우, 그 과정에서 난 오류는
    // onAuthStateChanged 로는 안 잡히고 이걸로만 잡힌다.
    getRedirectResult(auth).catch((caught) => {
      const code = (caught as { code?: string }).code ?? ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      setError(explainAuthError(code))
    })
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)

      if (!nextUser?.email) {
        setState('anonymous')
        return
      }

      setState('loading')
      try {
        const snapshot = await getDoc(doc(db, 'teachers', nextUser.email.toLowerCase()))
        setState(snapshot.exists() ? 'teacher' : 'not-allowed')
      } catch (caught) {
        // 규칙상 본인 문서만 읽을 수 있으므로, 실패는 보통 목록에 없다는 뜻이다.
        console.error('교사 확인 실패', caught)
        setState('not-allowed')
      }
    })
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      if (isAndroid()) {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      await signInWithPopup(auth, googleProvider)
    } catch (caught) {
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
