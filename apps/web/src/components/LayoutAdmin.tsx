import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { UtenteDTO } from '@wish/shared';
import { useAuth } from '../auth';
import { api } from '../api';
import { Icona, Logo } from './ui';
import { iniziali } from './layout';

function VoceMenu({ to, icona, children, badge, end }: { to: string; icona: string; children: ReactNode; badge?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex h-11 items-center gap-3 rounded-xl px-3 text-sm ${isActive ? 'bg-brand font-semibold text-white' : 'font-medium text-[#c9d5f2] hover:bg-navy-2 hover:text-white'}`
      }
    >
      <Icona nome={icona} />
      <span className="flex-1">{children}</span>
      {!!badge && (
        <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ambra px-1.5 text-xs font-extrabold text-navy">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

/** Area admin: menu laterale che su telefono va in cima. */
export default function LayoutAdmin() {
  const { utente, esci } = useAuth();
  const navigate = useNavigate();
  const inAttesa = useQuery({
    queryKey: ['admin', 'utenti', 'in_attesa'],
    queryFn: () => api<UtenteDTO[]>('/admin/utenti?stato=in_attesa'),
    refetchInterval: 60_000,
  });
  if (!utente) return null;
  return (
    <div className="flex min-h-dvh flex-wrap bg-fondo">
      <nav aria-label="Menu principale" className="flex max-w-full flex-[1_1_232px] flex-col gap-6 bg-navy px-4 py-6 text-white lg:max-w-[260px]">
        <div className="px-2">
          <Logo sottotitolo="Pannello tecnico" />
        </div>
        <div className="flex flex-col gap-1">
          <VoceMenu to="/admin" icona="dashboard" end>
            Ticket
          </VoceMenu>
          <VoceMenu to="/admin/utenti" icona="utenti" badge={inAttesa.data?.length}>
            Utenti e accessi
          </VoceMenu>
        </div>
        <div className="mt-auto flex items-center gap-3 border-t border-navy-2 px-2 pt-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-navy-2 text-sm font-bold" aria-hidden="true">
            {iniziali(utente)}
          </span>
          <span className="flex-1 truncate text-sm text-[#c9d5f2]">{utente.nome} {utente.cognome}</span>
          <button
            type="button"
            aria-label="Esci"
            title="Esci"
            onClick={async () => {
              await esci();
              navigate('/accesso');
            }}
            className="flex size-11 items-center justify-center rounded-xl text-[#c9d5f2] hover:bg-navy-2 hover:text-white"
          >
            <Icona nome="esci" />
          </button>
        </div>
      </nav>
      <main className="min-w-0 flex-[999_1_560px] px-5 py-6 sm:px-7">
        <Outlet />
      </main>
    </div>
  );
}
