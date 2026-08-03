import StudentPage from './pages/StudentPage'
import CollectionsPage from './pages/CollectionsPage'
import AdminPage from './pages/AdminPage'

function getRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/recaudaciones') return 'collections'
  if (path === '/administracion') return 'admin'
  return 'student'
}

export default function App() {
  const route = getRoute()
  if (route === 'collections') return <CollectionsPage />
  if (route === 'admin') return <AdminPage />
  return <StudentPage />
}
