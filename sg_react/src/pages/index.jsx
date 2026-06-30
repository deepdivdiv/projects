import { Link } from "react-router-dom";
import StyleGuide from '@/pages/styleGuide/index.jsx';
import StudyHome from '@/pages/study/index.jsx';
function Index() {
  return (
    <div style={{minHeight:"calc(100vh - 13rem)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column"}}>
      <Link to="guides" element={<StyleGuide/>} style={{fontSize:"3rem", display:"block", padding:"1rem 3rem", fontWeight:"bold"}}>스타일가이드</Link>
      <Link to="study" element={<StudyHome/>}   style={{fontSize:"3rem", display:"block", padding:"1rem 3rem", fontWeight:"bold"}}>공부</Link>
    </div>
  )
}

export default Index
