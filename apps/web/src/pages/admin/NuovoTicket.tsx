import { Link, Navigate } from 'react-router';
import { useAuth } from '../../auth';
import { Icona } from '../../components/ui';
import { ModuloTicket } from '../cliente/NuovoTicket';

/** Il super admin apre un ticket per conto di un cliente, con lo stesso modulo. */
export default function NuovoTicketAdmin() {
  const { utente } = useAuth();
  if (!utente?.superAdmin) return <Navigate to="/admin" replace />;
  return (
    <div className="flex flex-col gap-5">
      <ModuloTicket
        admin
        testata={
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-1">
            <Link to="/admin" className="mb-2 flex w-fit items-center gap-1.5 rounded-lg text-sm font-semibold text-brand">
              <Icona nome="indietro" dimensione={16} /> Tutti i ticket
            </Link>
            <span className="text-[13px] font-medium text-muto">Per conto di un cliente</span>
            <h1 className="text-[28px] font-extrabold tracking-tight">Nuovo ticket</h1>
          </div>
        }
      />
    </div>
  );
}
