import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import './Layout.css'

export default function Layout() {
  const { pathname } = useLocation()
  const pathNorm = pathname.replace(/\/+$/, '') || '/'
  const wideMain = pathNorm === '/map' || pathNorm.endsWith('/map')

  return (
    <div className="layout">
      <Navbar />
      <main
        className={
          wideMain ? 'layout__main layout__main--wide' : 'layout__main'
        }
      >
        <Outlet />
      </main>
    </div>
  )
}
