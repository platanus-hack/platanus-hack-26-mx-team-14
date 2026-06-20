import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import type { Page } from './types';

export default function App() {
  const [page, setPage] = useState<Page>('landing');

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
          <LandingPage onNavigate={setPage} />
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
          <AuthPage onNavigate={setPage} onLogin={() => setPage('dashboard')} />
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
          <DashboardPage onNavigate={setPage} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
