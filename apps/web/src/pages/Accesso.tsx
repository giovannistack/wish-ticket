import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { loginSchema } from '@wish/shared';
import { useAuth } from '../auth';
import { ErroreHttp } from '../api';
import { leggiForm, useErroriForm } from '../form';
import { LayoutPubblico } from '../components/layout';
import { Avviso, Campo } from '../components/ui';

export default function Accesso() {
  const { accedi } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { campi, generale, valida, daErrore, pulisci } = useErroriForm();
  const [inAttesa, setInAttesa] = useState(false);
  const [invio, setInvio] = useState(false);
  const da = (location.state as { da?: string } | null)?.da;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dati = valida(loginSchema, leggiForm(e.currentTarget));
    if (!dati) return;
    setInvio(true);
    setInAttesa(false);
    try {
      const u = await accedi(dati);
      navigate(da ?? (u.ruolo === 'admin' ? '/admin' : '/'), { replace: true });
    } catch (err) {
      if (err instanceof ErroreHttp && err.codice === 'IN_ATTESA') setInAttesa(true);
      else daErrore(err);
    } finally {
      setInvio(false);
    }
  }

  return (
    <LayoutPubblico titolo="Accedi" sottotitolo="Apri e segui i ticket di assistenza della tua azienda.">
      <form onSubmit={onSubmit} onInput={pulisci} noValidate className="card flex flex-col gap-4 p-5">
        {inAttesa ? (
          <Avviso tipo="info">
            Il tuo account è in attesa di attivazione. Riceverai una email appena il team Wish lo attiva.
          </Avviso>
        ) : (
          generale && <Avviso>{generale}</Avviso>
        )}
        <Campo etichetta="Email" name="email" type="email" autoComplete="email" inputMode="email" errore={campi.email} required />
        <Campo etichetta="Password" name="password" type="password" autoComplete="current-password" errore={campi.password} required />
        <button type="submit" className="btn-primario h-14 rounded-2xl text-base" disabled={invio}>
          {invio ? 'Accesso in corso…' : 'Accedi'}
        </button>
        <Link to="/password-dimenticata" className="self-center text-sm font-semibold text-brand">
          Password dimenticata?
        </Link>
      </form>
      <p className="text-center text-sm text-testo">
        Prima volta qui?{' '}
        <Link to="/registrazione" className="font-bold text-brand">
          Crea un account
        </Link>
      </p>
    </LayoutPubblico>
  );
}
