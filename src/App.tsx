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
const TonightPage = lazy(() => import('./pages/TonightPage'))
const TasteProfile = lazy(() => import('./pages/TasteProfile'))
const ListsPage = lazy(() => import('./pages/ListsPage'))
const CustomListPage = lazy(() => import('./pages/CustomListPage'))
const DiaryPage = lazy(() => import('./pages/DiaryPage'))
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
        {/* "Per te" sostituito da "Stasera"; vecchi link reindirizzano. */}
        <Route path="recommendations" element={<Navigate to="/stasera" replace />} />
        <Route
          path="stasera"
          element={
            <RequireAuth>
              <TonightPage />
            </RequireAuth>
          }
        />
        {/* "Trofei" temporaneamente nascosto; verrà rifatto in futuro. */}
        <Route path="trophies" element={<Navigate to="/" replace />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
