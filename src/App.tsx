import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Search from './pages/Search'
import TitleDetail from './pages/TitleDetail'
import ListPage from './pages/ListPage'
import Favorites from './pages/Favorites'
import Recommendations from './pages/Recommendations'
import CatalogPage from './pages/CatalogPage'
import TrophiesPage from './pages/TrophiesPage'
import TasteProfile from './pages/TasteProfile'
import GenrePage from './pages/GenrePage'
import PersonPage from './pages/PersonPage'
import StudioPage from './pages/StudioPage'
import CollectionPage from './pages/CollectionPage'
import Settings from './pages/Settings'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import { getAnime, getCartoons } from './lib/tmdb'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="search" element={<Search />} />
        <Route path="explore" element={<Search />} />
        <Route path="genre/:type/:genreId" element={<GenrePage />} />
        <Route path="person/:id" element={<PersonPage />} />
        <Route path="studio/:id" element={<StudioPage />} />
        <Route path="collection/:id" element={<CollectionPage />} />
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
        <Route
          path="profilo"
          element={
            <RequireAuth>
              <TasteProfile />
            </RequireAuth>
          }
        />
        <Route
          path="anime"
          element={
            <CatalogPage
              eyebrow="Catalogo"
              title="Anime"
              subtitle="Le serie animate giapponesi più popolari del momento."
              fetcher={getAnime}
            />
          }
        />
        <Route
          path="cartoons"
          element={
            <CatalogPage
              eyebrow="Catalogo"
              title="Cartoni animati"
              subtitle="Le serie animate occidentali: Scooby-Doo, Tom & Jerry e altri classici."
              fetcher={getCartoons}
            />
          }
        />
        <Route path="recommendations" element={<Recommendations />} />
        <Route path="trophies" element={<TrophiesPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
