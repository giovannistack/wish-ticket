import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nuovoTecnicoSchema, passwordSchema, type MembroTeamDTO } from '@wish/shared';
import { api, ErroreHttp } from '../../api';
import { leggiForm, useErroriForm } from '../../form';
import { Avviso, Campo, Caricamento, dataBreve } from '../../components/ui';

/** Password leggibile da comunicare a voce: senza caratteri ambigui (0/O, 1/l). */
function generaPassword(): string {
  const lettere = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const cifre = '23456789';
  const casuale = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0]! % s.length];
  const parte = Array.from({ length: 8 }, () => casuale(lettere)).join('');
  return `${parte}${casuale(cifre)}${casuale(cifre)}${casuale(cifre)}`;
}

function NuovoMembro() {
  const qc = useQueryClient();
  const { campi, generale, valida, daErrore, pulisci, setGenerale } = useErroriForm();
  const [password, setPassword] = useState('');
  const [creato, setCreato] = useState<{ email: string; password: string } | null>(null);
  const crea = useMutation({
    mutationFn: (dati: unknown) => api('/admin/tecnici', { method: 'POST', body: dati }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dati = valida(nuovoTecnicoSchema, leggiForm(form));
    if (!dati) return;
    try {
      await crea.mutateAsync(dati);
      setCreato({ email: dati.email, password: dati.password });
      form.reset();
      setPassword('');
      setGenerale(null);
    } catch (err) {
      daErrore(err);
    }
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-extrabold">Aggiungi un tecnico</h2>
        <p className="text-[13px] text-muto">
          Avrà accesso completo al pannello e riceverà le email dei ticket che gli assegni, sempre in copia alla casella assistenza.
        </p>
      </div>
      {creato && (
        <Avviso tipo="ok">
          Account creato. Comunica al tecnico le credenziali: <strong>{creato.email}</strong> · password <strong className="font-mono">{creato.password}</strong>.
          Per sicurezza la password non viene mandata per email.
        </Avviso>
      )}
      {generale && <Avviso>{generale}</Avviso>}
      <form onSubmit={onSubmit} onInput={pulisci} noValidate className="grid gap-3 sm:grid-cols-2">
        <Campo etichetta="Nome" name="nome" errore={campi.nome} />
        <Campo etichetta="Cognome" name="cognome" errore={campi.cognome} />
        <Campo etichetta="Email" name="email" type="email" placeholder="nome@wishsrl.it" errore={campi.email} />
        <div className="flex flex-col gap-1.5">
          <Campo
            etichetta="Password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="campo font-mono"
            autoComplete="new-password"
            errore={campi.password}
            aiuto="Almeno 10 caratteri, con un numero."
          />
          <button type="button" className="self-start text-[13px] font-semibold text-brand" onClick={() => setPassword(generaPassword())}>
            Genera una password
          </button>
        </div>
        <button type="submit" className="btn-primario sm:col-span-2 sm:justify-self-end" disabled={crea.isPending}>
          {crea.isPending ? 'Creazione…' : 'Crea account'}
        </button>
      </form>
    </section>
  );
}

function RigaMembro({ m }: { m: MembroTeamDTO }) {
  const qc = useQueryClient();
  const [cambio, setCambio] = useState(false);
  const [nuova, setNuova] = useState('');
  const [esito, setEsito] = useState<string | null>(null);
  const aggiorna = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const azione = useMutation({
    mutationFn: (a: { metodo: 'POST' | 'DELETE' | 'PATCH'; percorso: string; body?: unknown }) =>
      api<{ ticketRiassegnare?: number }>(`/admin/tecnici/${m.id}${a.percorso}`, { method: a.metodo, body: a.body }),
    onSuccess: aggiorna,
  });
  const errore = azione.error instanceof ErroreHttp ? azione.error.message : null;
  const passwordOk = passwordSchema.safeParse(nuova).success;

  return (
    <div className="flex flex-col gap-3 border-t border-riga px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${m.stato === 'attivo' ? 'bg-navy text-white' : 'bg-fondo text-muto'}`} aria-hidden="true">
          {`${m.nome[0] ?? ''}${m.cognome[0] ?? ''}`.toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-[1_1_220px] flex-col">
          <span className="font-bold">
            {m.nome} {m.cognome} {m.io && <span className="font-medium text-muto">(tu)</span>}
          </span>
          <span className="truncate text-[13px] text-muto">{m.email}</span>
        </div>
        <div className="flex flex-[1_1_200px] flex-wrap gap-x-5 gap-y-1 text-[13px] text-testo">
          <span><strong className="text-inchiostro">{m.ticketAperti}</strong> ticket aperti</span>
          <span className="text-muto">Ultimo accesso: {m.ultimoAccesso ? dataBreve(m.ultimoAccesso) : 'mai'}</span>
        </div>
        {m.stato !== 'attivo' && <span className="pill bg-[#f4f6fa] text-testo">Disattivato</span>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondario min-h-9 px-3 text-[13px]" onClick={() => setCambio(!cambio)}>
            Cambia password
          </button>
          {!m.io && m.stato === 'attivo' && (
            <button type="button" className="btn-secondario min-h-9 px-3 text-[13px]" disabled={azione.isPending} onClick={() => azione.mutate({ metodo: 'POST', percorso: '/disattiva' })}>
              Disattiva
            </button>
          )}
          {!m.io && m.stato !== 'attivo' && (
            <button type="button" className="btn-secondario min-h-9 px-3 text-[13px]" disabled={azione.isPending} onClick={() => azione.mutate({ metodo: 'POST', percorso: '/riattiva' })}>
              Riattiva
            </button>
          )}
          {!m.io && (
            <button
              type="button"
              className="btn-pericolo min-h-9 px-3 text-[13px]"
              disabled={azione.isPending}
              onClick={() => {
                const avviso = m.ticketAperti ? `\nI suoi ${m.ticketAperti} ticket aperti torneranno "non assegnati".` : '';
                if (window.confirm(`Eliminare l'account di ${m.nome} ${m.cognome}?${avviso}`)) azione.mutate({ metodo: 'DELETE', percorso: '' });
              }}
            >
              Elimina
            </button>
          )}
        </div>
      </div>
      {cambio && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl bg-fondo p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await azione.mutateAsync({ metodo: 'PATCH', percorso: '', body: { password: nuova } });
            setEsito(`Password aggiornata: ${nuova}`);
            setNuova('');
            setCambio(false);
          }}
        >
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="etichetta">Nuova password</span>
            <input className="campo font-mono" value={nuova} onChange={(e) => setNuova(e.target.value)} autoComplete="new-password" />
          </label>
          <button type="button" className="btn-secondario" onClick={() => setNuova(generaPassword())}>Genera</button>
          <button type="submit" className="btn-primario" disabled={!passwordOk || azione.isPending}>Salva</button>
        </form>
      )}
      {esito && <Avviso tipo="ok">{esito}{m.io ? '' : '. Le sue sessioni aperte sono state chiuse.'}</Avviso>}
      {errore && <Avviso>{errore}</Avviso>}
    </div>
  );
}

export default function Team() {
  const team = useQuery({ queryKey: ['admin', 'team'], queryFn: () => api<MembroTeamDTO[]>('/admin/tecnici/team') });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-muto">Gli account che gestiscono i ticket</span>
        <h1 className="text-[28px] font-extrabold tracking-tight">Team Wish</h1>
      </div>
      <section className="card overflow-hidden">
        {team.isLoading ? <Caricamento /> : team.data?.map((m) => <RigaMembro key={m.id} m={m} />)}
      </section>
      <NuovoMembro />
    </div>
  );
}
