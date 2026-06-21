import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import { isAuthenticated, clearAuth } from './lib/auth';
import type { Page } from './types';

// Demo/dev bypass: when VITE_SKIP_AUTH=true (set by docker-compose), the app
// boots straight into the dashboard so you can talk to the agent without SAT
// credentials. The dashboard runs on fixtures, so no real auth is needed.
const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    SKIP_AUTH || isAuthenticated() ? 'dashboard' : 'landing',
  );

  useEffect(() => {
    const handler = () => {
      clearAuth();
      setPage('landing');
    };
    window.addEventListener('sati:logout', handler);
    return () => window.removeEventListener('sati:logout', handler);
  }, []);

  function handleNavigate(next: Page) {
    if ((next === 'dashboard' || next === 'settings') && !SKIP_AUTH && !isAuthenticated()) {
      setPage('auth');
      return;
    }
    setPage(next);
  }

  function handleLogout() {
    clearAuth();
    setPage('landing');
  }

  return (
    <AnimatePresence mode="wait">
      {page === 'landing' && (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <LandingPage onNavigate={handleNavigate} />
        </motion.div>
      )}

      {page === 'auth' && (
        <motion.div
          key="auth"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <AuthPage onNavigate={handleNavigate} onLogin={() => setPage('dashboard')} />
        </motion.div>
      )}

      {page === 'dashboard' && (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <DashboardPage onNavigate={handleNavigate} onLogout={handleLogout} />
        </motion.div>
      )}

      {page === 'settings' && (
        <motion.div
          key="settings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <SettingsPage onNavigate={handleNavigate} onLogout={handleLogout} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
