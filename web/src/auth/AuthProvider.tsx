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
    // signInWithPopup은 accounts.google.com이 자체적으로 거는 Cross-Origin-Opener-Policy
    // 때문에 팝업↔원래 창 통신이 막혀서 계정 선택 후 팝업만 닫히고 로그인이 실패하는
    // 현상이 있었다(우리 쪽 헤더 문제가 아니라 Google 페이지 쪽 정책이라 우리가 못 고침).
    // signInWithRedirect는 페이지 전체가 Google로 이동했다가 돌아오는 방식이라 이 문제를
    // 구조적으로 피해간다. 로그인 성공은 아래 onAuthStateChanged가 그대로 잡고, 리다이렉트
    // 도중 발생한 오류만 여기서 잡아서 화면에 드러낸다.
    getRedirectResult(auth).catch((caught) => {
      const code = (caught as { code?: string }).code ?? ''
      setError(explainAuthError(code))
    })

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
      // 이 호출 이후 페이지 전체가 Google 로그인 화면으로 이동한다. 성공/실패 결과는
      // 돌아온 뒤 위 useEffect의 getRedirectResult에서 처리된다.
      await signInWithRedirect(auth, googleProvider)
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? ''
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
