import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LogPlayModal } from './components/history/LogPlayModal';
import { AppShell } from './components/layout/AppShell';
import { AppStateProvider } from './context/AppStateContext';
import { DesignSystemPreview } from './pages/DesignSystemPreview';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { SessionRoomPage } from './pages/SessionRoomPage';
import { SessionsHubPage } from './pages/SessionsHubPage';

export function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/sessions" replace />} />
            <Route path="/sessions" element={<SessionsHubPage />} />
            <Route path="/sessions/:id" element={<SessionRoomPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/preview" element={<DesignSystemPreview />} />
            <Route path="*" element={<Navigate to="/sessions" replace />} />
          </Routes>
          <LogPlayModal />
        </AppShell>
      </BrowserRouter>
    </AppStateProvider>
  );
}
