import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import CommunityImpactPage from './pages/CommunityImpactPage'
import MapPage from './pages/MapPage'
import SchedulerPage from './pages/SchedulerPage'

export default function App() {
  return (
    <>
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: -1,
          opacity: 0.55,
          filter: 'brightness(0.7) saturate(1.8) hue-rotate(180deg)',
        }}
      >
        <source src="/Earth.mp4" type="video/mp4" />
      </video>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(2,5,15,0.75)',
          zIndex: -1,
        }}
      />
      <div style={{ position: 'relative', zIndex: 0, minHeight: '100%' }}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/map" replace />} />
            <Route path="map" element={<MapPage />} />
            <Route path="impact" element={<CommunityImpactPage />} />
            <Route path="scheduler" element={<SchedulerPage />} />
            <Route path="leaderboard" element={<Navigate to="/map" replace />} />
          </Route>
        </Routes>
      </div>
    </>
  )
}
