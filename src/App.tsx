import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Search from './pages/Search'
import TitleDetail from './pages/TitleDetail'
import ListPage from './pages/ListPage'
import Favorites from './pages/Favorites'
import Recommendations from './pages/Recommendations'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="search" element={<Search />} />
        <Route path="title/:mediaType/:id" element={<TitleDetail />} />
        <Route path="lists/watched" element={<ListPage status="watched" />} />
        <Route path="lists/watchlist" element={<ListPage status="to_watch" />} />
        <Route
          path="lists/in-progress"
          element={<ListPage status="in_progress" />}
        />
        <Route path="favorites" element={<Favorites />} />
        <Route path="recommendations" element={<Recommendations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
