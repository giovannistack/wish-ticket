import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  nuovaAziendaSchema,
  type AziendaConStatsDTO,
  type AziendaDTO,
  type MovimentoDTO,
  type TipoMovimento,
} from '@wish/shared';
import { api, ErroreHttp } from '../../api';
import { useAuth } from '../../auth';
import { leggiForm, useErroriForm } from '../../form';
import { BarraChiamate, dataIt } from '../../components/Contratto';
import { Avviso, Campo, Caricamento, Icona, dataBreve } from '../../components/ui';

const useAziende = () => useQuery({ queryKey: ['admin', 'aziende'], queryFn: () => api<AziendaConStatsDTO[]>('/admin/aziende') });
const messaggio = (e: unknown) => (e instanceof ErroreHttp ? e.message : e ? 'Operazione non riuscita' : null);

// ---------- Elenco ----------

function NuovaAzienda() {
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const { campi, generale, valida, daErrore, pulisci } = useErroriForm();
  const crea = useMutation({
    mutationFn: (dati: unknown) => api('/admin/aziende', { method: 'POST', body: dati }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dati = valida(nuovaAziendaSchema, leggiForm(form));
    if (!dati) return;
    try {
      await crea.mutateAsync(dati);
      form.reset();
      setAperto(false);
    } catch (err) {
      daErrore(err);
    }
  }
  if (!aperto) {
    return (
      <button type="button" className="btn-primario self-start" onClick={() => setAperto(true)}>
        <Icona nome="piu" dimensione={18} /> Nuova azienda
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} onInput={pulisci} noValidate className="card flex flex-col gap-4 p-5">
      <h2 className="text-base font-extrabold">Nuova azienda cliente</h2>
      {generale && <Avviso>{generale}</Avviso>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etichetta="Nome" name="nome" placeholder="Come la vedono i clienti" errore={campi.nome} />
        <Campo etichetta="Ragione sociale" name="ragioneSociale" errore={campi.ragioneSociale} />
        <Campo etichetta="Sede" name="sede" errore={campi.sede} />
      </div>
      <p className="text-[13px] text-muto">Comparirà subito nel modulo di registrazione. Il contratto lo imposti dopo, dalla scheda dell'azienda.</p>
      <div className="flex gap-2 self-end">
        <button type="button" className="btn-secondario" onClick={() => setAperto(false)}>Annulla</button>
        <button type="submit" className="btn-primario" disabled={crea.isPending}>Crea azienda</button>
      </div>
    </form>
  );
}

export default function Aziende() {
  const { utente } = useAuth();
  const aziende = useAziende();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-muto">Clienti e contratti di assistenza</span>
        <h1 className="text-[28px] font-extrabold tracking-tight">Aziende</h1>
      </div>
      {utente?.superAdmin && <NuovaAzienda />}
      {aziende.isLoading && <Caricamento />}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {aziende.data?.map((a) => (
          <Link key={a.id} to={`/admin/aziende/${a.id}`} className={`card flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${a.attiva ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-sm font-extrabold text-white">
                {a.nome.slice(0, 2).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px] font-extrabold">{a.nome}</span>
                <span className="text-xs text-muto">
                  {a.attiva ? `${a.utentiAttivi} utenti · ${a.ticketAperti} ticket aperti` : 'Non attiva'}
                </span>
              </div>
            </div>
            <BarraChiamate c={a.contratto} compatta />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------- Scheda azienda ----------

const ETICHETTA_TIPO: Record<TipoMovimento, string> = {
  scalata: 'Scalata',
  restituita: 'Restituita',
  rettifica: 'Rettifica',
  rinnovo: 'Rinnovo',
  impostazione: 'Contratto',
  sblocco: 'Sblocco',
  sblocco_usato: 'Emergenza',
};

function Riquadro({ titolo, sotto, children }: { titolo: string; sotto?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-extrabold">{titolo}</h2>
        {sotto && <p className="text-[13px] text-muto">{sotto}</p>}
      </div>
      {children}
    </section>
  );
}

const oggi = () => new Date().toISOString().slice(0, 10);
const traUnAnno = (inizio: string) => {
  const d = new Date(`${inizio}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function FormContratto({ a, posso, onFatto }: { a: AziendaDTO; posso: boolean; onFatto: (a: AziendaDTO) => void }) {
  const c = a.contratto;
  const [attivo, setAttivo] = useState(c.attivo);
  const [chiamate, setChiamate] = useState(c.chiamateAnnue || 10);
  const [inizio, setInizio] = useState(c.inizio ?? oggi());
  const [fine, setFine] = useState(c.fine ?? traUnAnno(c.inizio ?? oggi()));
  const salva = useMutation({
    mutationFn: () => api<AziendaDTO>(`/admin/aziende/${a.id}/contratto`, { method: 'PUT', body: { attivo, chiamateAnnue: chiamate, inizio, fine } }),
    onSuccess: onFatto,
  });
  const cambiato = attivo !== c.attivo || chiamate !== c.chiamateAnnue || inizio !== c.inizio || fine !== c.fine;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        salva.mutate();
      }}
    >
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input type="checkbox" checked={attivo} disabled={!posso} onChange={(e) => setAttivo(e.target.checked)} className="size-5 accent-brand" />
        Contratto annuale attivo
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="etichetta">Chiamate incluse</span>
          <input type="number" min={1} max={1000} className="campo" disabled={!posso} value={chiamate} onChange={(e) => setChiamate(Number(e.target.value) || 0)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etichetta">Dal</span>
          <input
            type="date"
            className="campo"
            disabled={!posso}
            value={inizio}
            onChange={(e) => {
              setInizio(e.target.value);
              if (e.target.value) setFine(traUnAnno(e.target.value));
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etichetta">Al</span>
          <input type="date" className="campo" disabled={!posso} value={fine} onChange={(e) => setFine(e.target.value)} />
        </label>
      </div>
      {c.attivo && attivo && chiamate !== c.chiamateAnnue && (
        <p className="text-[13px] text-muto">
          Le chiamate già usate restano usate: ne rimarranno {Math.max(0, c.residue + chiamate - c.chiamateAnnue)}.
        </p>
      )}
      {messaggio(salva.error) && <Avviso>{messaggio(salva.error)}</Avviso>}
      {posso && (
        <button type="submit" className="btn-primario self-end" disabled={!cambiato || salva.isPending}>
          Salva contratto
        </button>
      )}
    </form>
  );
}

function Chiamate({ a, onFatto }: { a: AziendaDTO; onFatto: (a: AziendaDTO) => void }) {
  const [delta, setDelta] = useState(1);
  const [motivo, setMotivo] = useState('');
  const [richieste, setRichieste] = useState(1);
  const [motivoSblocco, setMotivoSblocco] = useState('');
  const post = (percorso: string, body: unknown) => api<AziendaDTO>(`/admin/aziende/${a.id}/${percorso}`, { method: 'POST', body });
  const rettifica = useMutation({
    mutationFn: () => post('rettifica', { delta, motivo }),
    onSuccess: (r) => {
      onFatto(r);
      setMotivo('');
    },
  });
  const sblocco = useMutation({
    mutationFn: (n: number) => post('sblocco', { richieste: n, motivo: motivoSblocco }),
    onSuccess: (r) => {
      onFatto(r);
      setMotivoSblocco('');
    },
  });
  const rinnova = useMutation({ mutationFn: () => post('rinnova', {}), onSuccess: onFatto });
  const errore = messaggio(rettifica.error ?? sblocco.error ?? rinnova.error);

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          rettifica.mutate();
        }}
      >
        <span className="etichetta">Aggiungi o togli chiamate</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-bordo bg-white">
            <button type="button" aria-label="Meno" className="flex size-11 items-center justify-center text-lg font-bold text-testo" onClick={() => setDelta((d) => (d - 1 === 0 ? -1 : Math.max(-100, d - 1)))}>−</button>
            <span className={`w-12 text-center text-lg font-extrabold ${delta > 0 ? 'text-[#14632f]' : 'text-[#a31b1b]'}`}>{delta > 0 ? `+${delta}` : delta}</span>
            <button type="button" aria-label="Più" className="flex size-11 items-center justify-center text-lg font-bold text-testo" onClick={() => setDelta((d) => (d + 1 === 0 ? 1 : Math.min(100, d + 1)))}>+</button>
          </div>
          <label className="min-w-[200px] flex-1">
            <span className="sr-only">Motivo</span>
            <input className="campo" placeholder="Motivo (es. chiamata abbonata)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <button type="submit" className="btn-primario" disabled={motivo.trim().length < 3 || rettifica.isPending}>
            Registra
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-2 rounded-xl border border-[#f3e2c2] bg-[#fffbea] p-4">
        <span className="etichetta">Sblocco di emergenza</span>
        <p className="text-[13px] text-testo">
          A chiamate finite il cliente non può aprire ticket. Con lo sblocco può aprirne alcune, che risultano fuori contratto.
          {a.contratto.sblocchi > 0 && <strong> Ora: {a.contratto.sblocchi} {a.contratto.sblocchi === 1 ? 'richiesta' : 'richieste'}.</strong>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Numero di richieste</span>
            <input type="number" min={1} max={20} className="campo w-20 text-center" value={richieste} onChange={(e) => setRichieste(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            richieste
          </label>
          <label className="min-w-[180px] flex-1">
            <span className="sr-only">Motivo dello sblocco</span>
            <input className="campo" placeholder="Motivo (facoltativo)" value={motivoSblocco} onChange={(e) => setMotivoSblocco(e.target.value)} />
          </label>
          <button type="button" className="btn-secondario" disabled={sblocco.isPending} onClick={() => sblocco.mutate(richieste)}>
            Sblocca
          </button>
          {a.contratto.sblocchi > 0 && (
            <button type="button" className="btn-pericolo" disabled={sblocco.isPending} onClick={() => sblocco.mutate(0)}>
              Revoca
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-riga pt-4">
        <p className="text-[13px] text-testo">
          Nuovo anno: chiamate di nuovo a {a.contratto.chiamateAnnue}, dal {dataIt(a.contratto.fine ? new Date(new Date(`${a.contratto.fine}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10) : oggi())}.
        </p>
        <button
          type="button"
          className="btn-secondario"
          disabled={rinnova.isPending}
          onClick={() => {
            if (window.confirm(`Rinnovare il contratto di ${a.nome}? Le chiamate tornano a ${a.contratto.chiamateAnnue}.`)) rinnova.mutate();
          }}
        >
          Rinnova contratto
        </button>
      </div>
      {errore && <Avviso>{errore}</Avviso>}
    </div>
  );
}

function Registro({ id, posso }: { id: string; posso: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'aziende', id, 'movimenti'], queryFn: () => api<MovimentoDTO[]>(`/admin/aziende/${id}/movimenti`) });
  const [daEliminare, setDaEliminare] = useState<string | null>(null);
  const [inModifica, setInModifica] = useState<{ id: string; delta: number; motivo: string; aggiornaSaldo: boolean } | null>(null);
  const modifica = useMutation({
    mutationFn: (m: { id: string; body: Record<string, unknown> }) =>
      api(`/admin/aziende/${id}/movimenti/${m.id}`, { method: 'PATCH', body: m.body }),
    onSuccess: () => {
      setInModifica(null);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const elimina = useMutation({
    mutationFn: ({ mid, ripristina }: { mid: string; ripristina: boolean }) =>
      api(`/admin/aziende/${id}/movimenti/${mid}${ripristina ? '?ripristina=1' : ''}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDaEliminare(null);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  return (
    <section className="card flex flex-col overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-riga px-5 py-4">
        <h2 className="text-base font-extrabold">Registro chiamate</h2>
        <p className="text-[13px] text-muto">
          Ogni movimento del contratto, dal più recente.{posso && ' Con la matita modifichi una riga, con il cestino la elimini: in entrambi i casi scegli se aggiornare anche il saldo.'}
        </p>
      </div>
      {messaggio(elimina.error ?? modifica.error) && <div className="px-5 pt-4"><Avviso>{messaggio(elimina.error ?? modifica.error)}</Avviso></div>}
      {q.isLoading ? (
        <Caricamento />
      ) : !q.data?.length ? (
        <p className="px-5 py-5 text-sm text-muto">Nessun movimento.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.8px] text-muto">
                <th className="px-5 py-3 font-semibold">Data</th>
                <th className="px-3 py-3 font-semibold">Tipo</th>
                <th className="px-3 py-3 text-right font-semibold">Chiamate</th>
                <th className="px-3 py-3 text-right font-semibold">Saldo</th>
                <th className="px-3 py-3 font-semibold">Dettaglio</th>
                <th className="px-5 py-3 font-semibold">Da</th>
                {posso && <th className="w-24 px-3 py-3"><span className="sr-only">Azioni</span></th>}
              </tr>
            </thead>
            <tbody>
              {q.data.map((m) => (
                <Fragment key={m.id}>
                <tr className={`border-t border-riga align-top ${daEliminare === m.id ? 'bg-[#fff5f5]' : ''}`}>
                  <td className="whitespace-nowrap px-5 py-3 text-muto">{dataBreve(m.data)}</td>
                  <td className="px-3 py-3 font-semibold">{ETICHETTA_TIPO[m.tipo]}</td>
                  <td className={`px-3 py-3 text-right font-bold ${m.delta > 0 ? 'text-[#14632f]' : m.delta < 0 ? 'text-[#a31b1b]' : 'text-muto'}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta || '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-bold">{m.saldoDopo}</td>
                  <td className="px-3 py-3 text-testo">
                    {m.ticket && (
                      <Link to={`/admin/ticket/${m.ticket.id}`} className="mr-1.5 font-mono text-[13px] text-brand">
                        {m.ticket.numero}
                      </Link>
                    )}
                    {m.motivo}
                  </td>
                  <td className="px-5 py-3 text-muto">{m.autore}</td>
                  {posso && (
                    <td className="flex justify-end px-3 py-2">
                      <button
                        type="button"
                        aria-label="Modifica questa riga"
                        title="Modifica riga"
                        onClick={() => {
                          setDaEliminare(null);
                          setInModifica(inModifica?.id === m.id ? null : { id: m.id, delta: m.delta, motivo: m.motivo, aggiornaSaldo: true });
                        }}
                        className="flex size-10 items-center justify-center rounded-lg text-muto hover:bg-fondo hover:text-brand"
                      >
                        <Icona nome="matita" dimensione={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Elimina questa riga"
                        title="Elimina riga"
                        onClick={() => {
                          setInModifica(null);
                          setDaEliminare(daEliminare === m.id ? null : m.id);
                        }}
                        className="flex size-10 items-center justify-center rounded-lg text-muto hover:bg-[#fff5f5] hover:text-[#a31b1b]"
                      >
                        <Icona nome="cestino" dimensione={17} />
                      </button>
                    </td>
                  )}
                </tr>
                {inModifica?.id === m.id && (
                  <tr className="bg-[#f2f6ff]">
                    <td colSpan={7} className="px-5 pb-4">
                      <form
                        className="flex flex-wrap items-end gap-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const body: Record<string, unknown> = { motivo: inModifica.motivo };
                          if (inModifica.delta !== m.delta) {
                            body.delta = inModifica.delta;
                            body.aggiornaSaldo = inModifica.aggiornaSaldo;
                          }
                          modifica.mutate({ id: m.id, body });
                        }}
                      >
                        {(() => {
                          const soloMotivo = !!m.ticket && (m.tipo === 'scalata' || m.tipo === 'restituita');
                          return (
                            <>
                              <label className="flex w-28 flex-col gap-1">
                                <span className="etichetta">Chiamate</span>
                                <input
                                  type="number"
                                  className="campo h-11"
                                  disabled={soloMotivo}
                                  title={soloMotivo ? 'Riga legata a un ticket: usa "Fuori contratto" nel ticket' : undefined}
                                  value={inModifica.delta}
                                  onChange={(e) => setInModifica({ ...inModifica, delta: Number(e.target.value) || 0 })}
                                />
                              </label>
                              <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                                <span className="etichetta">Motivo</span>
                                <input className="campo h-11" value={inModifica.motivo} onChange={(e) => setInModifica({ ...inModifica, motivo: e.target.value })} />
                              </label>
                              {inModifica.delta !== m.delta && (
                                <label className="flex min-h-11 items-center gap-2 text-[13px]">
                                  <input
                                    type="checkbox"
                                    checked={inModifica.aggiornaSaldo}
                                    onChange={(e) => setInModifica({ ...inModifica, aggiornaSaldo: e.target.checked })}
                                    className="size-5 accent-brand"
                                  />
                                  Aggiorna anche il saldo ({inModifica.delta - m.delta > 0 ? '+' : ''}{inModifica.delta - m.delta})
                                </label>
                              )}
                              <button type="submit" className="btn-primario" disabled={modifica.isPending || inModifica.motivo.trim().length < 3}>
                                Salva
                              </button>
                              <button type="button" className="btn-secondario" onClick={() => setInModifica(null)}>
                                Annulla
                              </button>
                            </>
                          );
                        })()}
                      </form>
                    </td>
                  </tr>
                )}
                {daEliminare === m.id && (
                  <tr className="bg-[#fff5f5]">
                    <td colSpan={7} className="px-5 pb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mr-2 text-[13px] text-[#8a2a2a]">Eliminare questa riga dal registro?</span>
                        {m.delta !== 0 && (
                          <button type="button" className="btn-pericolo min-h-9 px-3 text-[13px]" disabled={elimina.isPending} onClick={() => elimina.mutate({ mid: m.id, ripristina: true })}>
                            Elimina e ripristina il saldo ({m.delta > 0 ? `−${m.delta}` : `+${-m.delta}`})
                          </button>
                        )}
                        <button type="button" className="btn-pericolo min-h-9 px-3 text-[13px]" disabled={elimina.isPending} onClick={() => elimina.mutate({ mid: m.id, ripristina: false })}>
                          Elimina solo la riga
                        </button>
                        <button type="button" className="btn-secondario min-h-9 px-3 text-[13px]" onClick={() => setDaEliminare(null)}>
                          Annulla
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Anagrafica({ a, posso, onFatto }: { a: AziendaDTO; posso: boolean; onFatto: (a: AziendaDTO) => void }) {
  const [dati, setDati] = useState({ nome: a.nome, ragioneSociale: a.ragioneSociale, sede: a.sede, attiva: a.attiva });
  useEffect(() => setDati({ nome: a.nome, ragioneSociale: a.ragioneSociale, sede: a.sede, attiva: a.attiva }), [a]);
  const salva = useMutation({ mutationFn: () => api<AziendaDTO>(`/admin/aziende/${a.id}`, { method: 'PATCH', body: dati }), onSuccess: onFatto });
  const cambiato = dati.nome !== a.nome || dati.ragioneSociale !== a.ragioneSociale || dati.sede !== a.sede || dati.attiva !== a.attiva;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        salva.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etichetta="Nome" value={dati.nome} disabled={!posso} onChange={(e) => setDati({ ...dati, nome: e.target.value })} />
        <Campo etichetta="Ragione sociale" value={dati.ragioneSociale} disabled={!posso} onChange={(e) => setDati({ ...dati, ragioneSociale: e.target.value })} />
        <Campo etichetta="Sede" value={dati.sede} disabled={!posso} onChange={(e) => setDati({ ...dati, sede: e.target.value })} />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={dati.attiva} disabled={!posso} onChange={(e) => setDati({ ...dati, attiva: e.target.checked })} className="size-5 accent-brand" />
        <span>
          <strong>Azienda attiva</strong> <span className="text-muto">· se la disattivi non compare più nella registrazione</span>
        </span>
      </label>
      {messaggio(salva.error) && <Avviso>{messaggio(salva.error)}</Avviso>}
      {posso && (
        <button type="submit" className="btn-secondario self-end" disabled={!cambiato || salva.isPending}>
          Salva dati
        </button>
      )}
    </form>
  );
}

export function SchedaAzienda() {
  const { id } = useParams();
  const { utente } = useAuth();
  const posso = !!utente?.superAdmin;
  const qc = useQueryClient();
  const aziende = useAziende();
  const a = aziende.data?.find((x) => x.id === id);
  const aggiorna = () => qc.invalidateQueries({ queryKey: ['admin'] });

  if (aziende.isLoading) return <Caricamento />;
  if (!a) return <Avviso>Azienda non trovata.</Avviso>;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/aziende" className="flex w-fit items-center gap-1.5 rounded-lg text-sm font-semibold text-brand">
        <Icona nome="indietro" dimensione={16} /> Tutte le aziende
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-muto">{a.utentiAttivi} utenti · {a.ticketAperti} ticket aperti</span>
          <h1 className="text-[28px] font-extrabold tracking-tight">{a.nome}</h1>
        </div>
      </div>
      {!posso && <Avviso tipo="info">Aziende e contratti li gestisce il super admin. Tu puoi consultarli.</Avviso>}

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
          <Riquadro titolo="Chiamate del contratto">
            <BarraChiamate c={a.contratto} />
            {posso && a.contratto.attivo && <Chiamate key={a.contratto.residue + a.contratto.sblocchi} a={a} onFatto={aggiorna} />}
          </Riquadro>
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
          <Riquadro titolo="Contratto annuale" sotto="Ogni ticket aperto dal cliente scala una chiamata. Segnare un ticket fuori contratto la restituisce.">
            <FormContratto key={`${a.contratto.attivo}${a.contratto.chiamateAnnue}${a.contratto.inizio}`} a={a} posso={posso} onFatto={aggiorna} />
          </Riquadro>
          <Riquadro titolo="Dati azienda">
            <Anagrafica a={a} posso={posso} onFatto={aggiorna} />
          </Riquadro>
        </div>
      </div>
      <Registro id={a.id} posso={posso} />
    </div>
  );
}
