import { StrictMode, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import { AuthProvider, useAuth } from './auth';
import { queryClient } from './queryClient';
import { LayoutCliente } from './components/layout';
import { Caricamento } from './components/ui';
import Accesso from './pages/Accesso';
import Registrazione from './pages/Registrazione';
import { PasswordDimenticata, RegistrazioneInviata, ResetPassword, VerificaEmail } from './pages/Pubbliche';
import Home from './pages/cliente/Home';
import NuovoTicket from './pages/cliente/NuovoTicket';
import DettaglioTicket from './pages/cliente/DettaglioTicket';

// L'area admin si scarica solo per chi è admin
const LayoutAdmin = lazy(() => import('./components/LayoutAdmin'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const DettaglioTicketAdmin = lazy(() => import('./pages/admin/Dashboard').then((m) => ({ default: m.DettaglioTicketAdmin })));
const Utenti = lazy(() => import('./pages/admin/Utenti'));

function Protetta({ ruolo, children }: { ruolo: 'cliente' | 'admin'; children: ReactNode }) {
  const { utente, pronto } = useAuth();
  const location = useLocation();
  if (!pronto) return <Caricamento />;
  if (!utente) return <Navigate to="/accesso" replace state={{ da: location.pathname }} />;
  if (ruolo === 'admin' && utente.ruolo !== 'admin') return <Navigate to="/" replace />;
  if (ruolo === 'cliente' && utente.ruolo === 'admin') return <Navigate to="/admin" replace />;
  return <Suspense fallback={<Caricamento />}>{children}</Suspense>;
}

function SoloOspiti({ children }: { children: ReactNode }) {
  const { utente, pronto } = useAuth();
  if (!pronto) return <Caricamento />;
  if (utente) return <Navigate to={utente.ruolo === 'admin' ? '/admin' : '/'} replace />;
  return children;
}

const router = createBrowserRouter([
  { path: '/accesso', element: <SoloOspiti><Accesso /></SoloOspiti> },
  { path: '/registrazione', element: <SoloOspiti><Registrazione /></SoloOspiti> },
  { path: '/registrazione/inviata', element: <RegistrazioneInviata /> },
  { path: '/verifica-email', element: <VerificaEmail /> },
  { path: '/password-dimenticata', element: <PasswordDimenticata /> },
  { path: '/reset-password', element: <ResetPassword /> },
  {
    path: '/',
    element: <Protetta ruolo="cliente"><LayoutCliente /></Protetta>,
    children: [
      { index: true, element: <Home /> },
      { path: 'nuovo-ticket', element: <NuovoTicket /> },
      { path: 'ticket/:id', element: <DettaglioTicket /> },
    ],
  },
  {
    path: '/admin',
    element: <Protetta ruolo="admin"><LayoutAdmin /></Protetta>,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'ticket/:id', element: <DettaglioTicketAdmin /> },
      { path: 'utenti', element: <Utenti /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
