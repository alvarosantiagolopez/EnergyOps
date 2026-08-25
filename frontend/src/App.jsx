import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import UploadView from './components/UploadView';
import HistoryView from './components/HistoryView';
import PriorityQueueView from './components/PriorityQueueView';
import './App.css';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/upload" element={<UploadView />} />
          <Route path="/crm" element={<Navigate to="/priority-queue" replace />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/priority-queue" element={<PriorityQueueView />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
