import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import '@fontsource/jua'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import Home from './pages/Home'
import Materials from './pages/Materials'
import SubjectMaterials from './pages/SubjectMaterials'
import Practice from './pages/Practice'
import Teacher from './pages/Teacher'
import ComingSoon from './pages/ComingSoon'
import NotFound from './pages/NotFound'

// Monaco 에디터는 무겁다(2MB 남짓). 홈과 수업자료 화면까지 느려지지 않도록
// Python 실습에 들어갈 때만 내려받는다.
const PythonLab = lazy(() => import('./pages/PythonLab'))
const CLab = lazy(() => import('./pages/CLab'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {/* GitHub Pages 는 앱이 /chicode/ 아래에 놓인다. 빌드의 base 경로를 그대로 따른다. */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Home />} />
            <Route path="materials" element={<Materials />} />
            <Route path="materials/:subjectId" element={<SubjectMaterials />} />
            <Route path="practice" element={<Practice />} />
            <Route
              path="practice/python"
              element={
                <Suspense fallback={<p className="text-ink-500">Python 실습 화면을 여는 중…</p>}>
                  <PythonLab />
                </Suspense>
              }
            />
            <Route
              path="practice/c"
              element={
                <Suspense fallback={<p className="text-ink-500">C언어 실습 화면을 여는 중…</p>}>
                  <CLab />
                </Suspense>
              }
            />
            <Route
              path="practice/pico"
              element={
                <ComingSoon
                  emoji="🔌"
                  title="Pico 2 W 시뮬레이터"
                  description="브라우저에서 가상 Pico 2 W 보드로 GPIO, LED, Button 을 다루는 실습입니다. 다음 단계에서 준비합니다."
                  secondary={{ to: '/practice/python', label: 'Python 실습 하러 가기' }}
                />
              }
            />
            {/* 예전 주소로 온 링크·북마크가 끊기지 않도록 새 위치로 보낸다. */}
            <Route path="python" element={<Navigate to="/practice/python" replace />} />
            <Route
              path="projects"
              element={
                <ComingSoon
                  emoji="🚀"
                  title="프로젝트"
                  description="배운 내용을 활용해 나만의 작품과 프로젝트를 만들어보는 공간입니다. 곧 열립니다!"
                />
              }
            />
            <Route
              path="lab"
              element={
                <ComingSoon
                  emoji="🧪"
                  title="Lab"
                  description="동아리 활동을 위한 공간입니다. 조금만 기다려 주세요!"
                />
              }
            />
            <Route path="teacher" element={<Teacher />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
