import type { ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import type { UtenteDTO } from '@wish/shared';
import { useAuth } from '../auth';
import { Icona, Logo } from './ui';

/** Pagine pubbliche (accesso, registrazione): testata blu e card che la sovrappone. */
export function LayoutPubblico({ titolo, sottotitolo, children }: { titolo: string; sottotitolo?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-fondo">
      <header className="bg-navy px-5 pb-20 pt-6 text-white">
        <div className="mx-auto flex max-w-md flex-col gap-7">
          <Logo />
          <div className="flex flex-col gap-2">
            <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">{titolo}</h1>
            {sottotitolo && <p className="text-sm leading-relaxed text-[#c9d5f2]">{sottotitolo}</p>}
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-12 flex max-w-md flex-col gap-4 px-4 pb-10">{children}</main>
    </div>
  );
}

export const iniziali = (u: UtenteDTO) => `${u.nome[0] ?? ''}${u.cognome[0] ?? ''}`.toUpperCase();

/** Area cliente: testata con azienda e uscita. */
export function LayoutCliente() {
  const { utente, esci } = useAuth();
  const navigate = useNavigate();
  if (!utente) return null;
  return (
    <div className="min-h-dvh bg-fondo">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4">
          <Link to="/" className="rounded-lg">
            <Logo sottotitolo={utente.azienda?.nome} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-[#c9d5f2] sm:inline">{utente.nome} {utente.cognome}</span>
            <span className="flex size-11 items-center justify-center rounded-full border border-[#2b4686] bg-navy-2 text-sm font-bold" aria-hidden="true">
              {iniziali(utente)}
            </span>
            <button
              type="button"
              aria-label="Esci"
              title="Esci"
              onClick={async () => {
                await esci();
                navigate('/accesso');
              }}
              className="flex size-11 items-center justify-center rounded-full text-[#c9d5f2] hover:bg-navy-2 hover:text-white"
            >
              <Icona nome="esci" />
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
