import { Outlet } from 'react-router-dom';

function SgLayout() {
  return (
    <>
      <section className='styleGuide'>
        <div className='sg_inner'>
            <Outlet></Outlet>
        </div>
      </section>
    </>
  )
}

export default SgLayout
