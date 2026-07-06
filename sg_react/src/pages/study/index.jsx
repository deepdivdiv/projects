
import StGround from "./st_ground.jsx";
import { NavLink } from "react-router-dom";


function StIndex() {
  return (
    <>
      <div className="sg_tit">
        <h1>디자인시스템</h1>
        <div className="flexBox d-col a-left mt20">
          <p>연습</p>
          <p><NavLink to="ground" element={<StGround />}> -&gt; 정리 </NavLink></p>
        </div>
      </div>
      
    </>
  )
}

export default StIndex
