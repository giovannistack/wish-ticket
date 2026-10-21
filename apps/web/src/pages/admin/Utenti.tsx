import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttivaUtenteInput, AziendaConStatsDTO, UtenteDTO } from '@wish/shared';
import { api, ErroreHttp } from '../../api';
import { Avviso, Caricamento, dataBreve } from '../../components/ui';

const iniziali = (u: UtenteDTO) => `${u.nome[0] ?? ''}${u.cognome[0] ?? ''}`.toUpperCase();

function RichiestaInAttesa({ u, aziende }: { u: UtenteDTO; aziende: AziendaConStatsDTO[] }) {
  const qc = useQueryClient();
  const [aziendaId, setAziendaId] = useState(u.aziendaDichiarata?.id ?? '');
  const [ruolo, setRuolo] = useState<'utente' | 'referente'>('utente');
  const aggiorna = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const attiva = useMutation({
    mutationFn: (dati: AttivaUtenteInput) => api(`/admin/utenti/${u.id}/attiva`, { method: 'POST', body: dati }),
    onSuccess: aggiorna,
  });
  const rifiuta = useMutation({
    mutationFn: () => api(`/admin/utenti/${u.id}/rifiuta`, { method: 'POST' }),
    onSuccess: aggiorna,
  });
  const errore = (attiva.error ?? rifiuta.error) as ErroreHttp | null;
  const occupato = attiva.isPending || rifiuta.isPending;

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-[#f0f3f8] px-5 py-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-chiaro text-sm font-extrabold text-brand-scuro" aria-hidden="true">
        {iniziali(u)}
      </span>
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {u.nome} {u.cognome}
          {u.ufficio && <span className="font-medium text-muto"> · {u.ufficio}</span>}
        </span>
        <span className="truncate text-[13px] text-muto">
          {u.email} · {dataBreve(u.createdAt)}
        </span>
        <span className={`text-xs font-semibold ${u.emailVerificata ? 'text-[#14632f]' : 'text-[#7a4300]'}`}>
          {u.emailVerificata ? 'Email confermata' : 'Email non ancora confermata'}
        </span>
      </div>
      <div className="grid flex-[1_1_300px] grid-cols-[1fr_auto] gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muto">
            Associa all'azienda <span className="font-medium">(dichiarata: {u.aziendaDichiarata?.nome ?? '—'})</span>
          </span>
          <select value={aziendaId} onChange={(e) => setAziendaId(e.target.value)} className="h-[42px] rounded-[10px] border border-bordo bg-white px-2.5 text-sm">
            <option value="" disabled>Scegli…</option>
            {aziende.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muto">Ruolo</span>
          <select value={ruolo} onChange={(e) => setRuolo(e.target.value as 'utente' | 'referente')} className="h-[42px] rounded-[10px] border border-bordo bg-white px-2.5 text-sm">
            <option value="utente">Dipendente</option>
            <option value="referente">Referente</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-pericolo" disabled={occupato} onClick={() => rifiuta.mutate()}>
          Rifiuta
        </button>
        <button type="button" className="btn-primario" disabled={occupato || !aziendaId} onClick={() => attiva.mutate({ aziendaId, ruolo })}>
          {attiva.isPending ? 'Attivazione…' : 'Attiva e invia mail'}
        </button>
      </div>
      {errore && <div className="basis-full"><Avviso>{errore.message}</Avviso></div>}
    </div>
  );
}

function NonAttivi() {
  const qc = useQueryClient();
  const rifiutati = useQuery({ queryKey: ['admin', 'utenti', 'rifiutato'], queryFn: () => api<UtenteDTO[]>('/admin/utenti?stato=rifiutato') });
  const disattivati = useQuery({ queryKey: ['admin', 'utenti', 'disattivato'], queryFn: () => api<UtenteDTO[]>('/admin/utenti?stato=disattivato') });
  const aggiorna = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const rimetti = useMutation({ mutationFn: (id: string) => api(`/admin/utenti/${id}/rimetti-in-attesa`, { method: 'POST' }), onSuccess: aggiorna });
  const elimina = useMutation({ mutationFn: (id: string) => api(`/admin/utenti/${id}`, { method: 'DELETE' }), onSuccess: aggiorna });
  const elenco = [...(rifiutati.data ?? []), ...(disattivati.data ?? [])];
  const errore = (rimetti.error ?? elimina.error) as Error | null;
  if (!elenco.length) return null;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-riga px-5 py-4">
        <h2 className="text-base font-extrabold">Rifiutati e disattivati</h2>
        <span className="text-xs text-muto">Questi indirizzi non possono accedere né registrarsi di nuovo</span>
      </div>
      {errore && <div className="px-5 pt-4"><Avviso>{errore.message}</Avviso></div>}
      {elenco.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-3 border-t border-[#f0f3f8] px-5 py-3 first:border-t-0">
          <div className="flex min-w-0 flex-[1_1_240px] flex-col">
            <span className="font-bold">{u.nome} {u.cognome}</span>
            <span className="truncate text-xs text-muto">
              {u.email} · {u.azienda?.nome ?? u.aziendaDichiarata?.nome ?? '—'}
            </span>
          </div>
          <span className={`pill ${u.stato === 'rifiutato' ? 'bg-[#fdecec] text-[#a31b1b]' : 'bg-[#f4f6fa] text-testo'}`}>
            {u.stato === 'rifiutato' ? 'Rifiutato' : 'Disattivato'}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondario min-h-9 px-3 text-[13px]" disabled={rimetti.isPending} onClick={() => rimetti.mutate(u.id)}>
              Rimetti in attesa
            </button>
            <button
              type="button"
              className="btn-pericolo min-h-9 px-3 text-[13px]"
              disabled={elimina.isPending}
              onClick={() => {
                if (window.confirm(`Eliminare ${u.email}? Potrà registrarsi di nuovo da zero.`)) elimina.mutate(u.id);
              }}
            >
              Elimina
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export default function Utenti() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState('');
  const aziende = useQuery({ queryKey: ['admin', 'aziende'], queryFn: () => api<AziendaConStatsDTO[]>('/admin/aziende') });
  const inAttesa = useQuery({ queryKey: ['admin', 'utenti', 'in_attesa'], queryFn: () => api<UtenteDTO[]>('/admin/utenti?stato=in_attesa') });
  const attivi = useQuery({ queryKey: ['admin', 'utenti', 'attivo'], queryFn: () => api<UtenteDTO[]>('/admin/utenti?stato=attivo') });
  const disattiva = useMutation({
    mutationFn: (id: string) => api(`/admin/utenti/${id}/disattiva`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  const elencoAttivi = (attivi.data ?? []).filter((u) => !filtro || u.azienda?.id === filtro);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-muto">Ogni utente vede solo i ticket della propria azienda</span>
        <h1 className="text-[28px] font-extrabold tracking-tight">Utenti e accessi</h1>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-[#f3e2c2] bg-[#fff8ec] px-5 py-4">
          <span className="size-2.5 rounded-full bg-ambra" />
          <h2 className="text-base font-extrabold">Richieste da attivare</h2>
          <span className="text-[13px] font-semibold text-[#6b5320]">{inAttesa.data?.length ?? 0} in attesa</span>
        </div>
        {inAttesa.isLoading || aziende.isLoading ? (
          <Caricamento />
        ) : inAttesa.data?.length ? (
          inAttesa.data.map((u) => <RichiestaInAttesa key={u.id} u={u} aziende={aziende.data ?? []} />)
        ) : (
          <p className="px-5 py-5 text-sm text-testo">Nessuna richiesta in attesa.</p>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        {aziende.data?.map((a) => (
          <div key={a.id} className="card flex flex-col gap-3.5 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-sm font-extrabold text-white">
                {a.nome.slice(0, 2).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px] font-extrabold">{a.nome}</span>
                {a.sede && <span className="text-xs text-muto">{a.sede}</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col"><span className="text-[22px] font-extrabold">{a.utentiAttivi}</span><span className="text-xs text-muto">utenti attivi</span></div>
              <div className="flex flex-col"><span className="text-[22px] font-extrabold">{a.ticketAperti}</span><span className="text-xs text-muto">ticket aperti</span></div>
            </div>
          </div>
        ))}
      </div>

      <section className="card flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-riga px-5 py-4">
          <h2 className="text-base font-extrabold">Utenti attivi</h2>
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-fondo p-1" role="group" aria-label="Filtra per azienda">
            {[{ id: '', nome: 'Tutte' }, ...(aziende.data ?? [])].map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={filtro === a.id}
                onClick={() => setFiltro(a.id)}
                className={`h-9 rounded-[9px] px-3.5 text-[13px] ${filtro === a.id ? 'bg-white font-bold shadow-sm' : 'font-semibold text-testo'}`}
              >
                {a.nome}
              </button>
            ))}
          </div>
        </div>
        {disattiva.error && <div className="px-5 pt-4"><Avviso>{(disattiva.error as Error).message}</Avviso></div>}
        {attivi.isLoading ? (
          <Caricamento />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.8px] text-muto">
                  <th className="px-5 py-3 font-semibold">Utente</th>
                  <th className="px-3 py-3 font-semibold">Azienda</th>
                  <th className="px-3 py-3 font-semibold">Ruolo</th>
                  <th className="px-3 py-3 font-semibold">Ultimo accesso</th>
                  <th className="px-5 py-3 text-right font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {elencoAttivi.map((u) => (
                  <tr key={u.id} className="border-t border-riga">
                    <td className="px-5 py-3">
                      <div className="font-bold">{u.nome} {u.cognome}</div>
                      <div className="text-xs text-muto">{u.email}</div>
                    </td>
                    <td className="px-3 py-3 text-testo">{u.azienda?.nome}</td>
                    <td className="px-3 py-3">
                      <span className={`pill ${u.ruolo === 'referente' ? 'bg-brand-chiaro text-brand-scuro' : 'bg-[#f4f6fa] text-testo'}`}>
                        {u.ruolo === 'referente' ? 'Referente' : 'Dipendente'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muto">{u.ultimoAccesso ? dataBreve(u.ultimoAccesso) : 'mai'}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        className="btn-secondario min-h-9 px-3 text-[13px]"
                        disabled={disattiva.isPending}
                        onClick={() => {
                          if (window.confirm(`Disattivare ${u.nome} ${u.cognome}? Perderà subito l'accesso.`)) disattiva.mutate(u.id);
                        }}
                      >
                        Disattiva
                      </button>
                    </td>
                  </tr>
                ))}
                {elencoAttivi.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muto">Nessun utente attivo.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NonAttivi />
    </div>
  );
}
