import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ContrattoDTO, TicketDTO } from '@wish/shared';
import { BarraChiamate } from '../../components/Contratto';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Avviso, Caricamento, Icona, StatoPill, Vuoto, dataBreve } from '../../components/ui';

const avanzamento: Record<TicketDTO['stato'], number> = {
  in_lavorazione: 40,
  in_attesa_cliente: 70,
  risolto: 100,
  chiuso: 100,
};

function saluto() {
  const h = new Date().getHours();
  return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

export default function Home() {
  const { utente } = useAuth();
  const ticket = useQuery({ queryKey: ['ticket'], queryFn: () => api<TicketDTO[]>('/ticket'), refetchInterval: 60_000 });
  const contratto = useQuery({ queryKey: ['contratto'], queryFn: () => api<ContrattoDTO>('/ticket/contratto'), refetchInterval: 60_000 });
  const bloccato = !!contratto.data?.bloccato;
  const aperti = ticket.data?.filter((t) => t.stato !== 'risolto' && t.stato !== 'chiuso') ?? [];
  const chiusi = ticket.data?.filter((t) => t.stato === 'risolto' || t.stato === 'chiuso') ?? [];

  return (
    <>
      <div className="bg-navy text-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-7 pt-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-[#c9d5f2]">{saluto()},</span>
            <h1 className="text-[28px] font-extrabold tracking-tight">{utente?.nome} {utente?.cognome}</h1>
          </div>
          {bloccato ? (
            <div className="rounded-2xl border border-[#f1c3c3] bg-[#fff5f5] p-4 text-[#8a2a2a]">
              <p className="font-extrabold">Chiamate del contratto esaurite</p>
              <p className="mt-1 text-sm leading-relaxed">
                Per ora non puoi aprire nuovi ticket. Contatta Wish per rinnovare il contratto o per un intervento urgente.
              </p>
            </div>
          ) : (
            <Link to="/nuovo-ticket" className="btn h-14 rounded-2xl bg-white text-base font-extrabold text-navy hover:bg-brand-chiaro">
              <Icona nome="piu" dimensione={20} spessore={2.4} />
              Apri nuovo ticket
            </Link>
          )}
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        {ticket.isError && <Avviso>{(ticket.error as Error).message}</Avviso>}
        {contratto.data?.attivo && (
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-[15px] font-extrabold">Contratto di assistenza</h2>
            <BarraChiamate c={contratto.data} />
            {contratto.data.sblocchi > 0 && contratto.data.residue <= 0 && (
              <p className="text-[13px] text-testo">Wish ti ha concesso {contratto.data.sblocchi === 1 ? 'una richiesta urgente' : `${contratto.data.sblocchi} richieste urgenti`}, fuori contratto.</p>
            )}
          </section>
        )}
        {ticket.isLoading ? (
          <Caricamento />
        ) : (
          <>
            <ElencoTicket titolo="Ticket aperti" sotto={utente?.azienda?.nome} elenco={aperti} vuoto="Nessun ticket aperto" />
            {chiusi.length > 0 && <ElencoTicket titolo="Risolti di recente" elenco={chiusi.slice(0, 10)} />}
          </>
        )}
      </main>
    </>
  );
}

function ElencoTicket({ titolo, sotto, elenco, vuoto }: { titolo: string; sotto?: string; elenco: TicketDTO[]; vuoto?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold tracking-tight">{titolo}</h2>
        {sotto && <span className="text-[13px] text-muto">{sotto}</span>}
      </div>
      {elenco.length === 0 && vuoto ? (
        <div className="card">
          <Vuoto titolo={vuoto}>Quando hai un problema tecnico, apri un ticket: il team Wish riceve subito la segnalazione.</Vuoto>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {elenco.map((t) => (
            <Link key={t.id} to={`/ticket/${t.id}`} className="card flex flex-col gap-2.5 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] text-brand">{t.numero}</span>
                <StatoPill stato={t.stato} />
              </div>
              <span className="text-[15px] font-bold">{t.oggetto}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-fondo" aria-hidden="true">
                <div
                  className={`h-1.5 rounded-full ${avanzamento[t.stato] === 100 ? 'bg-[#1f8a46]' : 'bg-brand'}`}
                  style={{ width: `${avanzamento[t.stato]}%` }}
                />
              </div>
              <span className="text-xs text-muto">
                Aperto {dataBreve(t.createdAt)} da {t.richiedente.nome}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
