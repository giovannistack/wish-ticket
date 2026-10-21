import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STATI_TICKET, STATO_TICKET_LABEL, type AziendaConStatsDTO, type StatoTicket, type TicketDTO } from '@wish/shared';
import { api } from '../../api';
import { Avviso, Caricamento, Icona, PrioritaPill, StatoPill, Vuoto, dataBreve } from '../../components/ui';
import { useAuth } from '../../auth';

const KPI: Array<{ stato: StatoTicket; etichetta: string; sotto: string; colore: string }> = [
  { stato: 'nuovo', etichetta: 'Nuovi', sotto: 'da prendere in carico', colore: '#1747c9' },
  { stato: 'in_carico', etichetta: 'In carico', sotto: 'in lavorazione', colore: '#c77700' },
  { stato: 'in_attesa_cliente', etichetta: 'In attesa cliente', sotto: 'serve una risposta', colore: '#6b47d6' },
  { stato: 'risolto', etichetta: 'Risolti', sotto: 'in totale', colore: '#1f8a46' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [aziendaId, setAziendaId] = useState('');
  const [stato, setStato] = useState<StatoTicket | ''>('');
  const [cerca, setCerca] = useState('');
  const [soloMiei, setSoloMiei] = useState(false);
  const { utente } = useAuth();
  const qc = useQueryClient();
  const elimina = useMutation({
    mutationFn: (id: string) => api(`/admin/ticket/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  const aziende = useQuery({ queryKey: ['admin', 'aziende'], queryFn: () => api<AziendaConStatsDTO[]>('/admin/aziende') });
  const tutti = useQuery({
    queryKey: ['admin', 'ticket'],
    queryFn: () => api<TicketDTO[]>('/admin/ticket'),
    refetchInterval: 30_000,
  });

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (tutti.data ?? []).filter(
      (t) =>
        (!aziendaId || t.azienda.id === aziendaId) &&
        (!stato || t.stato === stato) &&
        (!soloMiei || t.tecnico?.id === utente?.id) &&
        (!q || [t.numero, t.oggetto, t.seriale, t.marcaModello, t.richiedente.nome].some((v) => v.toLowerCase().includes(q))),
    );
  }, [tutti.data, aziendaId, stato, cerca, soloMiei, utente?.id]);

  const conteggio = (s: StatoTicket) => (tutti.data ?? []).filter((t) => t.stato === s && (!aziendaId || t.azienda.id === aziendaId)).length;
  const bloccanti = (tutti.data ?? []).filter((t) => t.priorita === 'bloccante' && t.stato === 'nuovo');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium capitalize text-muto">
            {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <h1 className="text-[28px] font-extrabold tracking-tight">Ticket di assistenza</h1>
        </div>
        <label className="flex h-11 min-w-[260px] flex-1 items-center gap-2.5 rounded-xl border border-bordo bg-white px-3.5 text-muto sm:flex-none">
          <Icona nome="cerca" />
          <span className="sr-only">Cerca</span>
          <input
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca ticket, persona, seriale…"
            className="min-w-0 flex-1 bg-transparent text-sm text-inchiostro outline-none"
          />
        </label>
      </div>

      {bloccanti.map((t) => (
        <div key={t.id} role="status" className="flex flex-wrap items-center gap-3.5 rounded-2xl bg-navy p-4 text-white">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#d42a2a]">!</span>
          <div className="flex flex-[1_1_260px] flex-col">
            <span className="text-[15px] font-bold">Ticket bloccante da {t.azienda.nome}</span>
            <span className="text-[13px] text-[#c9d5f2]">
              <span className="font-mono">{t.numero}</span> · {t.oggetto} · {dataBreve(t.createdAt)}
            </span>
          </div>
          <Link to={`/admin/ticket/${t.id}`} className="btn bg-white text-navy hover:bg-brand-chiaro">
            Apri ticket
          </Link>
        </div>
      ))}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        {KPI.map((k) => (
          <button
            key={k.stato}
            type="button"
            onClick={() => setStato(stato === k.stato ? '' : k.stato)}
            aria-pressed={stato === k.stato}
            className={`card flex flex-col gap-2.5 p-4 text-left transition ${stato === k.stato ? 'ring-2 ring-brand' : 'hover:-translate-y-0.5'}`}
          >
            <span className="flex items-center justify-between text-[13px] font-semibold text-testo">
              {k.etichetta}
              <span className="size-2.5 rounded-full" style={{ background: k.colore }} />
            </span>
            <span className="text-[34px] font-extrabold leading-none tracking-tight">{tutti.isLoading ? '–' : conteggio(k.stato)}</span>
            <span className="text-xs text-muto">{k.sotto}</span>
          </button>
        ))}
      </div>

      <section className="card flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-riga px-5 py-4">
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-fondo p-1" role="group" aria-label="Filtra per azienda">
            {[{ id: '', nome: 'Tutte' }, ...(aziende.data ?? [])].map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={aziendaId === a.id}
                onClick={() => setAziendaId(a.id)}
                className={`h-9 rounded-[9px] px-3.5 text-[13px] ${aziendaId === a.id ? 'bg-white font-bold text-inchiostro shadow-sm' : 'font-semibold text-testo hover:text-inchiostro'}`}
              >
                {a.nome}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={soloMiei}
            onClick={() => setSoloMiei(!soloMiei)}
            className={`h-10 rounded-[10px] px-3 text-[13px] font-semibold ${soloMiei ? 'border-[1.5px] border-brand bg-brand-chiaro text-brand-scuro' : 'border border-bordo bg-white text-testo'}`}
          >
            Assegnati a me
          </button>
          <label className="flex items-center gap-2 text-[13px] text-muto">
            <span className="sr-only">Filtra per stato</span>
            <select value={stato} onChange={(e) => setStato(e.target.value as StatoTicket | '')} className="h-10 rounded-[10px] border border-bordo bg-white px-2.5 text-[13px] text-inchiostro">
              <option value="">Tutti gli stati</option>
              {STATI_TICKET.map((s) => (
                <option key={s} value={s}>
                  {STATO_TICKET_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          </div>
        </div>

        {tutti.isError && <div className="p-5"><Avviso>{(tutti.error as Error).message}</Avviso></div>}
        {tutti.isLoading ? (
          <Caricamento />
        ) : filtrati.length === 0 ? (
          <Vuoto titolo="Nessun ticket">Con questi filtri non ci sono ticket.</Vuoto>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.8px] text-muto">
                  <th className="px-5 py-3 font-semibold">Ticket</th>
                  <th className="px-3 py-3 font-semibold">Oggetto</th>
                  <th className="px-3 py-3 font-semibold">Priorità</th>
                  <th className="px-3 py-3 font-semibold">Stato</th>
                  <th className="px-3 py-3 font-semibold">Tecnico</th>
                  <th className="px-3 py-3 text-right font-semibold">Aperto</th>
                  {utente?.superAdmin && <th className="w-14 px-3 py-3"><span className="sr-only">Azioni</span></th>}
                </tr>
              </thead>
              <tbody>
                {filtrati.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/admin/ticket/${t.id}`)}
                    className={`cursor-pointer border-t border-riga hover:bg-[#f7f9fc] ${t.stato === 'nuovo' ? 'bg-[#f2f6ff]' : ''}`}
                  >
                    <td className="px-5 py-3.5 align-top">
                      <Link to={`/admin/ticket/${t.id}`} className="font-mono text-[13px] text-brand" onClick={(e) => e.stopPropagation()}>
                        {t.numero}
                      </Link>
                      <div className="text-xs text-muto">{t.azienda.nome}</div>
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <div className="font-semibold">{t.oggetto}</div>
                      <div className="text-xs text-muto">{t.richiedente.nome}</div>
                    </td>
                    <td className="px-3 py-3.5 align-top"><PrioritaPill priorita={t.priorita} /></td>
                    <td className="px-3 py-3.5 align-top"><StatoPill stato={t.stato} /></td>
                    <td className="px-3 py-3.5 align-top text-testo">{t.tecnico?.nome ?? <span className="text-muto">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right align-top text-muto">{dataBreve(t.createdAt)}</td>
                    {utente?.superAdmin && <td className="px-3 py-2 text-right align-top">
                      <button
                        type="button"
                        aria-label={`Elimina ${t.numero}`}
                        title="Elimina ticket"
                        disabled={elimina.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Eliminare definitivamente il ticket ${t.numero} (${t.azienda.nome})?`)) elimina.mutate(t.id);
                        }}
                        className="flex size-10 items-center justify-center rounded-lg text-muto hover:bg-[#fff5f5] hover:text-[#a31b1b]"
                      >
                        <Icona nome="cestino" dimensione={17} />
                      </button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
