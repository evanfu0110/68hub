import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TokenStats } from './pages/TokenStats';
import { DailyTrends } from './pages/DailyTrends';
import { UsageRecords } from './pages/UsageRecords';
import { Settings } from './pages/Settings';
import { About } from './pages/About';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tokens" element={<TokenStats />} />
          <Route path="/daily" element={<DailyTrends />} />
          <Route path="/records" element={<UsageRecords />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
