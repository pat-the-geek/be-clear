import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <p className="text-7xl font-bold text-gray-100 mb-4 select-none">404</p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">Page introuvable</h1>
      <p className="text-sm text-gray-500 mb-8 max-w-xs">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={14} />
          Retour
        </button>
        <Link
          to="/panel"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Home size={14} />
          Tableau de bord
        </Link>
      </div>
    </div>
  )
}
