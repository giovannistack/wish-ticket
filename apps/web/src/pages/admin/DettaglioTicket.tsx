import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MODALITA,
  MODALITA_LABEL,
  PRIORITA,
  PRIORITA_LABEL,
  STATI_TICKET,
  STATO_TICKET_LABEL,
  type AggiornaTicketInput,
  type AziendaConStatsDTO,
  type Modalita,
  type Priorita,
  type StatoTicket,
  type TecnicoDTO,
  type TicketAdminDTO,
} from '@wish/shared';
import { api, ErroreHttp } from '../../api';
import { useAuth } from '../../auth';
import { Storico } from '../../components/Storico';
import { Avviso, Caricamento, Icona, dataBreve } from '../../components/ui';
import { BoxSoluzione, SchedaTicket } from '../cliente/DettaglioTicket';

interface Bozza {
  id: string;
  fuoriContratto: boolean;
  stato: StatoTicket;
  priorita: Priorita;
  tecnicoId: string;
  modalita: Modalita | '';
  ore: number;
  minuti: number;
  soluzione: string;
}

const daTicket = (t: TicketAdminDTO): Bozza => ({
  id: t.id,
  fuoriContratto: t.fuoriContratto,
  stato: t.stato,
  priorita: t.priorita,
  tecnicoId: t.tecnico?.id ?? '',
  modalita: t.modalita ?? '',
  ore: Math.floor(t.tempoMinuti / 60),
  minuti: t.tempoMinuti % 60,
  soluzione: t.soluzione,
});

/** Solo i campi cambiati rispetto al ticket salvato. */
function differenze(t: TicketAdminDTO, b: Bozza): AggiornaTicketInput {
  const d: AggiornaTicketInput = {};
  const tempo = b.ore * 60 + b.minuti;
  if (b.fuoriContratto !== t.fuoriContratto) d.fuoriContratto = b.fuoriContratto;
  if (b.stato !== t.stato) d.stato = b.stato;
  if (b.priorita !== t.priorita) d.priorita = b.priorita;
  if (b.tecnicoId !== (t.tecnico?.id ?? '')) d.tecnicoId = b.tecnicoId || null;
  if (b.modalita !== (t.modalita ?? '')) d.modalita = b.modalita || null;
  if (tempo !== t.tempoMinuti) d.tempoMinuti = tempo;
  if (b.soluzione.trim() !== t.soluzione) d.soluzione = b.soluzione.trim();
  return d;
}

const selezione = 'h-11 w-full rounded-xl border border-bordo bg-white px-2.5 text-sm';

export default function DettaglioTicketAdmin() {
  const { id } = useParams();
  const { utente } = useAuth();
  const qc = useQueryClient();
  const chiave = ['admin', 'ticket', id];
  const q = useQuery({ queryKey: chiave, queryFn: () => api<TicketAdminDTO>(`/admin/ticket/${id}`) });
  const aziende = useQuery({ queryKey: ['admin', 'aziende'], queryFn: () => api<AziendaConStatsDTO[]>('/admin/aziende') });
  const tecnici = useQuery({ queryKey: ['admin', 'tecnici'], queryFn: () => api<TecnicoDTO[]>('/admin/tecnici'), staleTime: 300_000 });
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [nota, setNota] = useState('');
  const [salvato, setSalvato] = useState(false);
  const navigate = useNavigate();
  const elimina = useMutation({
    mutationFn: () => api(`/admin/ticket/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: chiave });
      qc.invalidateQueries({ queryKey: ['admin'] });
      navigate('/admin', { replace: true });
    },
  });

  // Il modulo si riempie al primo caricamento e dopo ogni salvataggio:
  // aggiungere una nota o un aggiornamento in background non cancella le modifiche in corso.
  useEffect(() => {
    if (q.data && (!bozza || bozza.id !== q.data.id)) setBozza(daTicket(q.data));
  }, [q.data, bozza]);

  const aggiorna = (t: TicketAdminDTO) => {
    qc.setQueryData(chiave, t);
    qc.invalidateQueries({ queryKey: ['admin', 'ticket'], exact: true });
    qc.invalidateQueries({ queryKey: ['admin', 'aziende'] });
  };
  const salva = useMutation({
    mutationFn: (dati: AggiornaTicketInput) => api<TicketAdminDTO>(`/admin/ticket/${id}`, { method: 'PATCH', body: dati }),
    onSuccess: (t) => {
      aggiorna(t);
      setBozza(daTicket(t));
      setSalvato(true);
      setTimeout(() => setSalvato(false), 2500);
    },
  });
  const aggiungiNota = useMutation({
    mutationFn: (testo: string) => api<TicketAdminDTO>(`/admin/ticket/${id}/note`, { method: 'POST', body: { testo } }),
    onSuccess: (t) => {
      aggiorna(t);
      setNota('');
    },
  });

  if (q.isLoading || (q.data && !bozza)) return <Caricamento />;
  if (q.isError || !q.data || !bozza) return <Avviso>Ticket non trovato.</Avviso>;

  const t = q.data;
  const azienda = aziende.data?.find((a) => a.id === t.azienda.id);
  const modifiche = differenze(t, bozza);
  const daSalvare = Object.keys(modifiche).length > 0;
  const set = <K extends keyof Bozza>(k: K, v: Bozza[K]) => setBozza({ ...bozza, [k]: v });
  const errore = salva.error instanceof ErroreHttp ? salva.error.message : salva.error ? 'Salvataggio non riuscito' : null;

  function onSalva(e: FormEvent) {
    e.preventDefault();
    if (daSalvare) salva.mutate(modifiche);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/admin" className="flex w-fit items-center gap-1.5 rounded-lg text-sm font-semibold text-brand">
        <Icona nome="indietro" dimensione={16} /> Tutti i ticket
      </Link>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <BoxSoluzione t={t} />
          <SchedaTicket t={t} />

          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-extrabold">Note interne</h2>
              <span className="text-xs text-muto">Non visibili al cliente</span>
            </div>
            {t.note.length === 0 && <p className="text-sm text-muto">Nessuna nota.</p>}
            {t.note.map((n) => (
              <div key={n.id} className="rounded-xl border border-[#f3e2c2] bg-[#fffbea] px-4 py-3">
                <p className="whitespace-pre-line text-sm leading-relaxed">{n.testo}</p>
                <span className="text-xs text-muto">
                  {n.autore} · {dataBreve(n.data)}
                </span>
              </div>
            ))}
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (nota.trim()) aggiungiNota.mutate(nota.trim());
              }}
            >
              <label htmlFor="nota" className="sr-only">Nuova nota interna</label>
              <textarea
                id="nota"
                rows={3}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Diagnosi, cosa hai provato, ricambi…"
                className="campo resize-y bg-[#fffbea]"
              />
              <button type="submit" className="btn-secondario self-end" disabled={!nota.trim() || aggiungiNota.isPending}>
                Aggiungi nota
              </button>
            </form>
          </section>

          <Storico eventi={t.storico} titolo="Storico" />
        </div>

        <form onSubmit={onSalva} className="card flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-5 lg:sticky lg:top-6">
          <h2 className="text-base font-extrabold">Gestione</h2>

          {t.stato === 'nuovo' && (
            <button
              type="button"
              className="btn-primario h-12"
              disabled={salva.isPending}
              onClick={() => salva.mutate({ stato: 'in_carico', ...(t.tecnico ? {} : { tecnicoId: utente?.id }) })}
            >
              Prendi in carico
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="etichetta">Stato</span>
              <select className={selezione} value={bozza.stato} onChange={(e) => set('stato', e.target.value as StatoTicket)}>
                {STATI_TICKET.map((s) => (
                  <option key={s} value={s}>{STATO_TICKET_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="etichetta">Priorità</span>
              <select className={selezione} value={bozza.priorita} onChange={(e) => set('priorita', e.target.value as Priorita)}>
                {PRIORITA.map((p) => (
                  <option key={p} value={p}>{PRIORITA_LABEL[p].nome}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="etichetta">Tecnico</span>
              <select className={selezione} value={bozza.tecnicoId} onChange={(e) => set('tecnicoId', e.target.value)}>
                <option value="">Non assegnato</option>
                {tecnici.data?.map((x) => (
                  <option key={x.id} value={x.id}>{x.id === utente?.id ? `${x.nome} (io)` : x.nome}</option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="etichetta">Intervento</span>
              <select className={selezione} value={bozza.modalita} onChange={(e) => set('modalita', e.target.value as Modalita | '')}>
                <option value="">—</option>
                {MODALITA.map((m) => (
                  <option key={m} value={m}>{MODALITA_LABEL[m]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-fondo p-3">
            <label className={`flex min-h-10 items-center gap-3 text-sm font-semibold ${utente?.superAdmin ? '' : 'opacity-70'}`}>
              <input
                type="checkbox"
                checked={bozza.fuoriContratto}
                disabled={!utente?.superAdmin}
                onChange={(e) => set('fuoriContratto', e.target.checked)}
                className="size-5 accent-[#c2410c]"
              />
              Fuori contratto
            </label>
            <span className="text-xs leading-relaxed text-muto">
              {t.chiamataScalata ? 'Questo ticket ha usato una chiamata del contratto.' : 'Questo ticket non ha usato chiamate del contratto.'}
              {azienda?.contratto.attivo ? ` ${t.azienda.nome}: ${azienda.contratto.residue} di ${azienda.contratto.chiamateAnnue} chiamate rimaste.` : ` ${t.azienda.nome} non ha un contratto attivo.`}
              {!utente?.superAdmin && ' Solo il super admin può cambiarlo.'}
            </span>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="etichetta mb-1.5">Tempo impiegato</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm text-muto">
                <input type="number" min={0} max={999} value={bozza.ore} onChange={(e) => set('ore', Math.max(0, Number(e.target.value) || 0))} className="campo h-11 w-16 px-2 text-center" aria-label="Ore" />
                h
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muto">
                <input type="number" min={0} max={59} step={5} value={bozza.minuti} onChange={(e) => set('minuti', Math.min(59, Math.max(0, Number(e.target.value) || 0)))} className="campo h-11 w-16 px-2 text-center" aria-label="Minuti" />
                min
              </label>
              {[15, 30].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="h-9 rounded-full border border-bordo px-2.5 text-xs font-bold text-testo hover:border-brand"
                  onClick={() => {
                    const tot = bozza.ore * 60 + bozza.minuti + n;
                    setBozza({ ...bozza, ore: Math.floor(tot / 60), minuti: tot % 60 });
                  }}
                >
                  +{n}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="etichetta">
              Soluzione <span className="font-normal text-muto">· la riceve il cliente</span>
            </span>
            <textarea
              rows={4}
              value={bozza.soluzione}
              onChange={(e) => set('soluzione', e.target.value)}
              placeholder="Cosa è stato fatto per risolvere"
              className="campo resize-y"
            />
          </label>

          {errore && <Avviso>{errore}</Avviso>}
          {salvato && !daSalvare && <Avviso tipo="ok">Modifiche salvate.</Avviso>}

          <div className="flex flex-col gap-2">
            <button type="submit" className="btn-primario h-12" disabled={!daSalvare || salva.isPending}>
              {salva.isPending ? 'Salvataggio…' : 'Salva modifiche'}
            </button>
            {t.stato !== 'risolto' && t.stato !== 'chiuso' && (
              <button
                type="button"
                className="btn h-11 border border-[#bfe3cb] bg-[#e7f6ec] text-[#14632f] hover:bg-[#d6efdf]"
                disabled={salva.isPending}
                onClick={() => salva.mutate({ ...modifiche, stato: 'risolto' })}
              >
                Segna risolto
              </button>
            )}
            <p className="text-xs leading-relaxed text-muto">
              Il cliente riceve una email quando cambia lo stato. Per segnare risolto serve la soluzione.
            </p>
          </div>
          {utente?.superAdmin && <div className="border-t border-riga pt-4">
            <button
              type="button"
              className="btn-pericolo w-full"
              disabled={elimina.isPending}
              onClick={() => {
                if (window.confirm(`Eliminare definitivamente il ticket ${t.numero}?\nSpariscono anche note e storico, e il cliente non lo vedrà più.`)) elimina.mutate();
              }}
            >
              <Icona nome="cestino" dimensione={16} /> Elimina ticket
            </button>
          </div>}
        </form>
      </div>
    </div>
  );
}
