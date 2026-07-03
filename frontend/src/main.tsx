import './theme.css';
import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class GlobalErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, errorMsg: string}> {
    constructor(props: any) { super(props); this.state = { hasError: false, errorMsg: '' }; }
    static getDerivedStateFromError(error: any) { return { hasError: true, errorMsg: error?.message || error?.toString() || 'Unknown Error' }; }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{color: '#ef4444', padding: '2rem', textAlign: 'center', backgroundColor: '#0f172a', height: '100vh'}}>
                    <h3>Fatal React Crash</h3>
                    <pre style={{whiteSpace: 'pre-wrap', textAlign: 'left', background: '#1e293b', padding: '1rem', marginTop: '1rem'}}>{this.state.errorMsg}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)
