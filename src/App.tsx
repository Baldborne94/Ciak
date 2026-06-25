import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'

// Pages are code-split: each is fetched only when its route is visited,
// keeping the initial bundle small. The shell (Layout/RequireAuth) stays eager.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Search = lazy(() => import('./pages/Search'))
const TitleDetail = lazy(() => import('./pages/TitleDetail'))
const ListPage = lazy(() => import('./pages/ListPage'))
const Favorites = lazy(() => import('./pages/Favorites'))
const AiToolsPage = lazy(() => import('./pages/AiToolsPage'))
const TasteProfile = lazy(() => import('./pages/TasteProfile'))
const ListsPage = lazy(() => import('./pages/ListsPage'))
const CustomListPage = lazy(() => import('./pages/CustomListPage'))
const PublicListPage = lazy(() => import('./pages/PublicListPage'))
const PublicWatchlistPage = lazy(() => import('./pages/PublicWatchlistPage'))
const DiaryPage = lazy(() => import('./pages/DiaryPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const TrophiesPage = lazy(() => import('./pages/TrophiesPage'))
const UpcomingPage = lazy(() => import('./pages/UpcomingPage'))
const GenrePage = lazy(() => import('./pages/GenrePage'))
const PersonPage = lazy(() => import('./pages/PersonPage'))
const StudioPage = lazy(() => import('./pages/StudioPage'))
const CollectionPage = lazy(() => import('./pages/CollectionPage'))
const Settings = lazy(() => import('./pages/Settings'))
const Login = lazy(() => import('./pages/Login'))
const NotFound = lazy(() => import('./pages/NotFound'))

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
        {/* Viste pubbliche condivise: niente login richiesto. */}
        <Route path="lista/:id" element={<PublicListPage />} />
        <Route path="watchlist/:userId" element={<PublicWatchlistPage />} />
        {/* "Visti" è confluito nel Diario: vecchi link reindirizzano. */}
        <Route path="lists/watched" element={<Navigate to="/diario" replace />} />
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
          path="liste"
          element={
            <RequireAuth>
              <ListsPage />
            </RequireAuth>
          }
        />
        <Route
          path="liste/:id"
          element={
            <RequireAuth>
              <CustomListPage />
            </RequireAuth>
          }
        />
        <Route
          path="diario"
          element={
            <RequireAuth>
              <DiaryPage />
            </RequireAuth>
          }
        />
        <Route
          path="statistiche"
          element={
            <RequireAuth>
              <StatsPage />
            </RequireAuth>
          }
        />
        {/* Anime/Cartoni ora vivono dentro Cerca → Titoli; i vecchi URL reindirizzano. */}
        <Route path="anime" element={<Navigate to="/search?mode=anime" replace />} />
        <Route path="cartoons" element={<Navigate to="/search?mode=cartoons" replace />} />
        <Route
          path="in-arrivo"
          element={
            <RequireAuth>
              <UpcomingPage />
            </RequireAuth>
          }
        />
        {/* Strumenti AI raccolti in un hub unico (Stasera, Canzone, Foto).
            Vecchi link a "Per te" e "Stasera" reindirizzano all'hub. */}
        <Route path="recommendations" element={<Navigate to="/ai?tab=tonight" replace />} />
        <Route path="stasera" element={<Navigate to="/ai?tab=tonight" replace />} />
        <Route
          path="ai"
          element={
            <RequireAuth>
              <AiToolsPage />
            </RequireAuth>
          }
        />
        <Route
          path="trophies"
          element={
            <RequireAuth>
              <TrophiesPage />
            </RequireAuth>
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
