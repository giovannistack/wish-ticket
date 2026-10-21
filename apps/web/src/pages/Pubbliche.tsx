import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { passwordDimenticataSchema, passwordSchema } from '@wish/shared';
import { z } from 'zod';
import { api } from '../api';
import { leggiForm, useErroriForm } from '../form';
import { LayoutPubblico } from '../components/layout';
import { Avviso, Campo, Icona } from '../components/ui';

function Passo({ fatto, attivo, titolo, nota, ultimo }: { fatto?: boolean; attivo?: boolean; titolo: string; nota?: string; ultimo?: boolean }) {
  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        {fatto ? (
          <span className="flex size-7 items-center justify-center rounded-full bg-[#1f8a46] text-white">
            <Icona nome="ok" dimensione={16} spessore={3} />
          </span>
        ) : attivo ? (
          <span className="flex size-7 items-center justify-center rounded-full border-2 border-brand bg-brand-chiaro">
            <span className="size-2 rounded-full bg-brand" />
          </span>
        ) : (
          <span className="size-7 rounded-full border-2 border-bordo" />
        )}
        {!ultimo && <span className={`h-8 w-0.5 ${fatto ? 'bg-[#1f8a46]' : 'bg-bordo'}`} />}
      </div>
      <div className="flex flex-col gap-0.5 pt-1">
        <span className={`text-[15px] font-bold ${attivo ? 'text-brand-scuro' : fatto ? '' : 'font-semibold text-muto'}`}>{titolo}</span>
        {nota && <span className="text-[13px] text-muto">{nota}</span>}
      </div>
    </li>
  );
}

export function RegistrazioneInviata() {
  const email = (useLocation().state as { email?: string } | null)?.email;
  return (
    <LayoutPubblico titolo="Richiesta inviata">
      <section className="card flex flex-col gap-6 p-6">
        <p className="text-[15px] leading-relaxed text-testo">
          Ti abbiamo mandato una mail di conferma{email ? <> a <strong className="text-inchiostro">{email}</strong></> : null}. Apri il link,
          poi il team Wish attiverà il tuo account: riceverai una seconda mail e potrai aprire i ticket.
        </p>
        <ol className="flex flex-col">
          <Passo fatto titolo="Registrazione completata" />
          <Passo attivo titolo="Conferma la tua email" nota="Controlla anche la posta indesiderata" />
          <Passo titolo="Attivazione da parte di Wish" nota="Ti avvisiamo via mail" />
          <Passo titolo="Accesso e primo ticket" ultimo />
        </ol>
        <Link to="/accesso" className="btn-secondario h-[52px] rounded-[14px]">
          Torna all'accesso
        </Link>
      </section>
    </LayoutPubblico>
  );
}

export function VerificaEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [esito, setEsito] = useState<'attesa' | 'ok' | 'attivo' | 'errore'>('attesa');
  const inviato = useRef(false);

  useEffect(() => {
    if (inviato.current) return; // StrictMode monta due volte: il token è monouso
    inviato.current = true;
    api<{ stato: string }>('/auth/verifica-email', { method: 'POST', body: { token } })
      .then((r) => setEsito(r.stato === 'attivo' ? 'attivo' : 'ok'))
      .catch(() => setEsito('errore'));
  }, [token]);

  return (
    <LayoutPubblico titolo="Conferma email">
      <section className="card flex flex-col gap-5 p-6">
        {esito === 'attesa' && <p className="text-testo">Verifica in corso…</p>}
        {esito === 'errore' && <Avviso>Il link non è valido o è già stato usato.</Avviso>}
        {(esito === 'ok' || esito === 'attivo') && (
          <>
            <Avviso tipo="ok">Email confermata, grazie!</Avviso>
            <ol className="flex flex-col">
              <Passo fatto titolo="Registrazione completata" />
              <Passo fatto titolo="Email confermata" />
              <Passo fatto={esito === 'attivo'} attivo={esito === 'ok'} titolo="Attivazione da parte di Wish" nota={esito === 'ok' ? 'In corso · ti avvisiamo via mail' : undefined} />
              <Passo attivo={esito === 'attivo'} titolo="Accesso e primo ticket" ultimo />
            </ol>
          </>
        )}
        <Link to="/accesso" className="btn-secondario h-[52px] rounded-[14px]">
          Vai all'accesso
        </Link>
      </section>
    </LayoutPubblico>
  );
}

export function PasswordDimenticata() {
  const { campi, generale, valida, daErrore, pulisci } = useErroriForm();
  const [inviata, setInviata] = useState(false);
  const [invio, setInvio] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dati = valida(passwordDimenticataSchema, leggiForm(e.currentTarget));
    if (!dati) return;
    setInvio(true);
    try {
      await api('/auth/password-dimenticata', { method: 'POST', body: dati });
      setInviata(true);
    } catch (err) {
      daErrore(err);
    } finally {
      setInvio(false);
    }
  }

  return (
    <LayoutPubblico titolo="Password dimenticata" sottotitolo="Ti mandiamo un link per sceglierne una nuova.">
      <form onSubmit={onSubmit} onInput={pulisci} noValidate className="card flex flex-col gap-4 p-5">
        {inviata ? (
          <Avviso tipo="ok">Se l'email è registrata riceverai a breve un link valido per un'ora.</Avviso>
        ) : (
          <>
            {generale && <Avviso>{generale}</Avviso>}
            <Campo etichetta="Email" name="email" type="email" autoComplete="email" errore={campi.email} />
            <button type="submit" className="btn-primario h-14 rounded-2xl text-base" disabled={invio}>
              Invia il link
            </button>
          </>
        )}
        <Link to="/accesso" className="self-center text-sm font-semibold text-brand">
          Torna all'accesso
        </Link>
      </form>
    </LayoutPubblico>
  );
}

const nuovaPasswordSchema = z
  .object({ password: passwordSchema, conferma: z.string() })
  .refine((d) => d.password === d.conferma, { message: 'Le password non coincidono', path: ['conferma'] });

export function ResetPassword() {
  const [params] = useSearchParams();
  const { campi, generale, valida, daErrore, pulisci } = useErroriForm();
  const [fatto, setFatto] = useState(false);
  const [invio, setInvio] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dati = valida(nuovaPasswordSchema, leggiForm(e.currentTarget));
    if (!dati) return;
    setInvio(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token') ?? '', password: dati.password } });
      setFatto(true);
    } catch (err) {
      daErrore(err);
    } finally {
      setInvio(false);
    }
  }

  return (
    <LayoutPubblico titolo="Nuova password">
      <form onSubmit={onSubmit} onInput={pulisci} noValidate className="card flex flex-col gap-4 p-5">
        {fatto ? (
          <>
            <Avviso tipo="ok">Password aggiornata. Ora puoi accedere.</Avviso>
            <Link to="/accesso" className="btn-primario h-14 rounded-2xl text-base">
              Accedi
            </Link>
          </>
        ) : (
          <>
            {generale && <Avviso>{generale}</Avviso>}
            <Campo etichetta="Nuova password" name="password" type="password" autoComplete="new-password" errore={campi.password} aiuto="Almeno 10 caratteri, con un numero." />
            <Campo etichetta="Ripeti la password" name="conferma" type="password" autoComplete="new-password" errore={campi.conferma} />
            <button type="submit" className="btn-primario h-14 rounded-2xl text-base" disabled={invio}>
              Salva la password
            </button>
          </>
        )}
      </form>
    </LayoutPubblico>
  );
}
