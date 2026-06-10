import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Search from '@/pages/Search'
import TitleDetail from '@/pages/TitleDetail'
import Watched from '@/pages/lists/Watched'
import Watchlist from '@/pages/lists/Watchlist'
import InProgress from '@/pages/lists/InProgress'
import Favorites from '@/pages/Favorites'
import Recommendations from '@/pages/Recommendations'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<Search />} />
        <Route path="/title/:type/:id" element={<TitleDetail />} />
        <Route path="/lists/watched" element={<Watched />} />
        <Route path="/lists/watchlist" element={<Watchlist />} />
        <Route path="/lists/in-progress" element={<InProgress />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
