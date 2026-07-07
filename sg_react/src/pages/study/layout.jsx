import { Outlet } from 'react-router-dom';

function StLayout() {
  return (
    <>
      <section className='studyGuide'>
          <Outlet></Outlet>
      </section>
    </>
  )
}

export default StLayout
