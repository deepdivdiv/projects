import { Outlet } from 'react-router-dom';

function StLayout() {
  return (
    <>
      <section className='studyWrap'>
          <Outlet></Outlet>
      </section>
    </>
  )
}

export default StLayout
