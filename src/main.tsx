
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import GroupEntry from './routes/GroupEntry';
import Board from './routes/Board';
import Admin from './routes/Admin';
import './styles.css';

const router = createBrowserRouter([
  { path: '/', element: <App />, children: [
    { index: true, element: <GroupEntry /> },
    { path: 'board', element: <Board /> },
    { path: 'admin', element: <Admin /> },
  ]},
]);

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
