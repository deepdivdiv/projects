import SgTypo from '@/pages/styleGuide/sg_typo.jsx';
import { NavLink } from "react-router-dom";


function SgIndex() {
  return (
    <>
    <div className="sg_tit">
      <h1>디자인시스템</h1>
      <div className="flexBox d-col a-left mt20">
        <p>General</p>
        <p><NavLink to="typo" element={<SgTypo />}> -&gt; Font System </NavLink></p>
      </div>
    </div>
    </>
  )
}

export default SgIndex
