
import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import FooterLogo from './components/FooterLogo';

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="container">
        <Outlet />
      </main>
      <FooterLogo />
    </div>
  );
}
