import { Routes, Route } from 'react-router-dom';
import './css/reset.css'
import './css/board.css'
import './css/styleGuide.css'
import Layout from '@/component/layout.jsx'
import Index from '@/pages/index.jsx'
import SgLayout from '@/pages/styleGuide/layout.jsx'
import SgIndex from '@/pages/styleGuide/index.jsx'
import SgTypo from '@/pages/styleGuide/sg_typo.jsx'

function App() {
  return (
    <Routes>
      {/* Nav를 공통 레이아웃에 한 번만 두어 라우트 전환 시 언마운트되지 않게 함 */}
      <Route element={<Layout />}>
        {/* 메인 */}
        <Route index element={<Index />} />
        {/* 스타일가이드 */}
        <Route path="/guides" element={<SgLayout />}>
            <Route index element={<SgIndex />} />
            <Route path="typo" element={<SgTypo />} />
        </Route>

      </Route>
    </Routes>
  )
}

export default App
