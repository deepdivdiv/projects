import { NavLink } from "react-router-dom";



function Nav() {
  return (
    <>
        <header>
            <div className="h_inner">
                <NavLink to={"/"} className={"logo"}>REACT STUDY</NavLink>
                <ul>
                    <li><NavLink to="/">HOME</NavLink></li>
                    <li><NavLink to="/guides">STYLE GUIDE</NavLink></li>
                </ul>
            </div>
        </header>
    </>
  )
}

export default Nav
