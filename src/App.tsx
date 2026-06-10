import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Search from './pages/Search'
import TitleDetail from './pages/TitleDetail'
import ListPage from './pages/ListPage'
import Favorites from './pages/Favorites'
import Recommendations from './pages/Recommendations'
import Settings from './pages/Settings'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="search" element={<Search />} />
        <Route path="title/:mediaType/:id" element={<TitleDetail />} />
        <Route path="login" element={<Login />} />
        <Route
          path="lists/watched"
          element={
            <RequireAuth>
              <ListPage status="watched" />
            </RequireAuth>
          }
        />
        <Route
          path="lists/watchlist"
          element={
            <RequireAuth>
              <ListPage status="to_watch" />
            </RequireAuth>
          }
        />
        <Route
          path="lists/in-progress"
          element={
            <RequireAuth>
              <ListPage status="in_progress" />
            </RequireAuth>
          }
        />
        <Route
          path="favorites"
          element={
            <RequireAuth>
              <Favorites />
            </RequireAuth>
          }
        />
        <Route path="recommendations" element={<Recommendations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
