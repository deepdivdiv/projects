import { Outlet } from 'react-router-dom';

function SgLayout() {
  return (
    <>
      <section className='styleGuide'>
          <Outlet></Outlet>
      </section>
    </>
  )
}

export default SgLayout
