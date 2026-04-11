import { Outlet, useLocation } from 'react-router-dom'
import CommunityCostMeter from './CommunityCostMeter'
import Navbar from './Navbar'
import './Layout.css'

export default function Layout() {
  const { pathname } = useLocation()
  const mapMission = pathname === '/map' || pathname === '/'

  return (
    <div className="layout">
      <Navbar />
      <CommunityCostMeter />
      <main
        className={`layout__main${mapMission ? ' layout__main--map-mission' : ''}`}
      >
        <Outlet />
      </main>
    </div>
  )
}
