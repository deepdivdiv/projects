import { Routes, Route } from 'react-router-dom';
import './css/reset.css'
import './css/common.css'
import './css/styleGuide.css'
import Layout from '@/component/layout.jsx'
import { Toaster } from '@/component/feedback'
import { Modal, Dialog } from '@/component/container'
import Index from '@/pages/index.jsx'
import SgLayout from '@/pages/styleGuide/layout.jsx'
import SgIndex from '@/pages/styleGuide/index.jsx'
import StLayout from '@/pages/study/layout.jsx'
import StIndex from '@/pages/study/index.jsx'

// 🔹 sg_*.jsx 파일을 전부 자동으로 불러옴
const sgModules = import.meta.glob('@/pages/styleGuide/sg_*.jsx', { eager: true })
const stModules = import.meta.glob('@/pages/styleGuide/st_*.jsx', { eager: true })

// 🔹 { path, Component } 배열로 가공
const sgRoutes = Object.entries(sgModules).map(([filePath, mod]) => {
  // '/src/pages/styleGuide/sg_data.jsx' 에서 'data' 만 뽑기
  const name = filePath.match(/sg_(\w+)\.jsx$/)[1]
  return { path: name, Component: mod.default }
})
const stRoutes = Object.entries(stModules).map(([filePath, mod]) => {
  // '/src/pages/styleGuide/sg_data.jsx' 에서 'data' 만 뽑기
  const name = filePath.match(/st_(\w+)\.jsx$/)[1]
  return { path: name, Component: mod.default }
})

function App() {
  return (
    <>
      <Routes>
        {/* 헤더,푸터있는버전 */}
        <Route element={<Layout />}>
          <Route index element={<Index />} />
          <Route path="/guides" element={<SgLayout />}>
            <Route index element={<SgIndex />} />
            {/* 🔹 자동 생성된 라우트들 */}
            {sgRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
          </Route>
          <Route path="/study" element={<StLayout/>}>
            <Route index element={<StIndex />} />
            {stRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
          </Route>
        </Route>
      </Routes>
      <Toaster />
      <Modal />
      <Dialog />
    </>
  )
}

export default App
