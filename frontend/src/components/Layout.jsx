import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import './Layout.css'

export default function Layout() {
  return (
    <div className="layout">
      <Navbar />
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  )
}
