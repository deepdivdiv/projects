import { Outlet } from 'react-router-dom';

function StLayout() {
  return (
    <>
      <section className='styleGuide'>
          <Outlet></Outlet>
      </section>
    </>
  )
}

export default StLayout
