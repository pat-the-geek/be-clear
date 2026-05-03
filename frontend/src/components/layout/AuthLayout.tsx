import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">be.CLEAR</h1>
          <p className="text-gray-500 mt-1">Gestion des interactions ORG ↔ ENV</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
