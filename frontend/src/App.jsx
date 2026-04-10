import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ImpactPage from './pages/ImpactPage'
import LeaderboardPage from './pages/LeaderboardPage'
import MapPage from './pages/MapPage'
import SchedulerPage from './pages/SchedulerPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/map" replace />} />
        <Route path="map" element={<MapPage />} />
        <Route path="impact" element={<ImpactPage />} />
        <Route path="scheduler" element={<SchedulerPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
      </Route>
    </Routes>
  )
}
