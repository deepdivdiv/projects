import { Outlet } from 'react-router-dom';
import Nav from '@/component/nav.jsx';

function AllLayout() {
  return (
    <>
      <Nav></Nav>
      <Outlet></Outlet>
      <footer>
        deepdiv.oye@gmail.com
      </footer>
    </>
  )
}

export default AllLayout
