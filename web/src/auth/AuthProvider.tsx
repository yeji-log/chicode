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
      await signInWithPopup(auth, googleProvider)
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      setError(
        code === 'auth/unauthorized-domain'
          ? '이 주소는 Firebase 에 등록되지 않았습니다. 콘솔 → Authentication → 설정 → 승인된 도메인에 추가해 주세요.'
          : '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      )
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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다.')
  return context
}
