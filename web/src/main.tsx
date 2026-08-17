import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import Home from './pages/Home'
import Materials from './pages/Materials'
import Teacher from './pages/Teacher'
import NotFound from './pages/NotFound'

// Monaco 에디터는 무겁다(2MB 남짓). 홈과 수업자료 화면까지 느려지지 않도록
// Python 실습에 들어갈 때만 내려받는다.
const PythonLab = lazy(() => import('./pages/PythonLab'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Home />} />
            <Route path="materials" element={<Materials />} />
            <Route
              path="python"
              element={
                <Suspense fallback={<p className="text-ink-500">Python 실습 화면을 여는 중…</p>}>
                  <PythonLab />
                </Suspense>
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
