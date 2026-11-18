import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
          <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-sm space-y-4">
            <h1 className="font-display text-xl font-bold text-rose-800">
              Se ha producido un error al cargar la aplicación
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {this.state.error.message || 'Error inesperado en el cliente.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
