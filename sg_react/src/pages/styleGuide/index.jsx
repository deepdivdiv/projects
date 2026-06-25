import SgTypo from '@/pages/styleGuide/sg_typo.jsx';
import SgForm from '@/pages/styleGuide/sg_typo.jsx';
import SgData from '@/pages/styleGuide/sg_data.jsx';
import SgDisplay from '@/pages/styleGuide/sg_display.jsx';
import SgFeed from '@/pages/styleGuide/sg_feedback.jsx';
import SgCont from '@/pages/styleGuide/sg_container.jsx';
import { NavLink } from "react-router-dom";


function SgIndex() {
  return (
    <>
    <div className="sg_tit">
      <h1>디자인시스템</h1>
      <div className="flexBox d-col a-left mt20">
        <p>General</p>
        <p><NavLink to="typo" element={<SgTypo />}> -&gt; Font System </NavLink></p>
        <p><NavLink to="form" element={<SgForm />}> -&gt; Form System </NavLink></p>
        <p><NavLink to="data" element={<SgData />}> -&gt; Data System </NavLink></p>
        <p><NavLink to="display" element={<SgDisplay />}> -&gt; Display System </NavLink></p>
        <p><NavLink to="feedback" element={<SgFeed />}> -&gt; Feedback System </NavLink></p>
        <p><NavLink to="container" element={<SgCont />}> -&gt; Container System </NavLink></p>
      </div>
    </div>
    </>
  )
}

export default SgIndex
