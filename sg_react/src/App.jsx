import { Routes, Route } from 'react-router-dom';
import './css/reset.css'
import './css/common.css'
import './css/styleGuide.css'
import Layout from '@/component/layout.jsx'
import { Toaster } from '@/component/feedback'
import Index from '@/pages/index.jsx'
import SgLayout from '@/pages/styleGuide/layout.jsx'
import SgIndex from '@/pages/styleGuide/index.jsx'

// 🔹 sg_*.jsx 파일을 전부 자동으로 불러옴
const modules = import.meta.glob('@/pages/styleGuide/sg_*.jsx', { eager: true })

// 🔹 { path, Component } 배열로 가공
const sgRoutes = Object.entries(modules).map(([filePath, mod]) => {
  // '/src/pages/styleGuide/sg_data.jsx' 에서 'data' 만 뽑기
  const name = filePath.match(/sg_(\w+)\.jsx$/)[1]
  return { path: name, Component: mod.default }
})

function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Index />} />
          <Route path="/guides" element={<SgLayout />}>
            <Route index element={<SgIndex />} />
            {/* 🔹 자동 생성된 라우트들 */}
            {sgRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
          </Route>
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

export default App
