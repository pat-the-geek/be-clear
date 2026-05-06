import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center h-screen p-6 text-center bg-gray-50">
        <div className="max-w-sm">
          <p className="text-5xl mb-4">⚠️</p>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">Une erreur inattendue s'est produite</h1>
          {this.state.message && (
            <p className="text-xs text-gray-500 font-mono bg-gray-100 rounded-lg px-3 py-2 mb-6 break-all">
              {this.state.message}
            </p>
          )}
          <button
            onClick={() => { this.setState({ hasError: false, message: '' }); window.location.href = '/panel' }}
            className="flex items-center gap-2 mx-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={14} />
            Recharger l'application
          </button>
        </div>
      </div>
    )
  }
}
