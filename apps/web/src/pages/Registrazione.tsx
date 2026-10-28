import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { registrazioneSchema } from '@wish/shared';
import { api } from '../api';
import { leggiForm, useErroriForm } from '../form';
import { LayoutPubblico } from '../components/layout';
import { Avviso, Campo, Selezione } from '../components/ui';

function forzaPassword(p: string): number {
  let f = 0;
  if (p.length >= 10) f++;
  if (/\d/.test(p)) f++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) f++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 14) f++;
  return f;
}

export default function Registrazione() {
  const navigate = useNavigate();
  const { campi, generale, valida, daErrore, pulisci } = useErroriForm();
  const [password, setPassword] = useState('');
  // "" = da scegliere, id = azienda dell'elenco, "nuova" = azienda da inserire, "privato"
  const [scelta, setScelta] = useState('');
  const privato = scelta === 'privato';
  const nuova = scelta === 'nuova';
  const [invio, setInvio] = useState(false);
  const aziende = useQuery({
    queryKey: ['aziende-pubbliche'],
    queryFn: () => api<Array<{ id: string; nome: string }>>('/aziende/pubbliche'),
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const grezzi = leggiForm(e.currentTarget);
    const dati = valida(registrazioneSchema, { ...grezzi, privacy: grezzi.privacy === 'on' });
    if (!dati) return;
    setInvio(true);
    try {
      await api('/auth/registrazione', { method: 'POST', body: dati });
      navigate('/registrazione/inviata', { state: { email: dati.email } });
    } catch (err) {
      daErrore(err);
    } finally {
      setInvio(false);
    }
  }

  const forza = forzaPassword(password);
  return (
    <LayoutPubblico
      titolo="Crea il tuo account"
      sottotitolo="Dopo la registrazione il team Wish verifica i tuoi dati e attiva l'accesso. Riceverai una mail di conferma."
    >
      <form onSubmit={onSubmit} onInput={pulisci} noValidate className="flex flex-col gap-4">
        <section className="card flex flex-col gap-4 p-5">
          {generale && <Avviso>{generale}</Avviso>}
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Nome" name="nome" autoComplete="given-name" errore={campi.nome} />
            <Campo etichetta="Cognome" name="cognome" autoComplete="family-name" errore={campi.cognome} />
          </div>
          <Selezione
            etichetta="La tua azienda"
            name="azienda"
            value={scelta}
            onChange={(e) => setScelta(e.target.value)}
            errore={campi.azienda ? 'Scegli la tua azienda, "Nuova azienda" o "Privato"' : undefined}
            aiuto={
              privato
                ? 'Ti registri come persona privata.'
                : nuova
                  ? 'Inserisci i dati della tua azienda: Wish li verifica prima di attivare l\'account.'
                  : "L'associazione all'azienda viene confermata da Wish."
            }
          >
            <option value="" disabled>
              {aziende.isLoading ? 'Caricamento…' : 'Seleziona…'}
            </option>
            <option value="privato">Privato</option>
            <option value="nuova">+ Inserisci nuova azienda</option>
            {!!aziende.data?.length && (
              <optgroup label="Aziende già clienti Wish">
                {aziende.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </Selezione>
          {nuova && (
            <div className="grid gap-3 rounded-xl bg-fondo p-3 sm:grid-cols-[1fr_180px]">
              <Campo etichetta="Denominazione azienda" name="denominazione" autoComplete="organization" errore={campi.denominazione} />
              <Campo etichetta="Partita IVA" name="partitaIva" inputMode="numeric" maxLength={16} placeholder="11 cifre" errore={campi.partitaIva} />
            </div>
          )}
          {!privato && (
            <Campo etichetta={<>Ufficio o reparto <span className="font-normal text-muto">(facoltativo)</span></>} name="ufficio" placeholder="Es. Amministrazione" errore={campi.ufficio} />
          )}
          <Campo
            etichetta={privato ? 'Email' : 'Email aziendale'}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={privato ? 'nome@email.it' : 'nome@azienda.it'}
            errore={campi.email}
          />
          <Campo etichetta="Telefono" name="telefono" type="tel" autoComplete="tel" placeholder="Numero a cui Wish può richiamarti" errore={campi.telefono} />
          <div className="flex flex-col gap-1.5">
            <Campo
              etichetta="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              errore={campi.password}
            />
            <div className="grid grid-cols-4 gap-1" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1 rounded-full ${i < forza ? (forza >= 3 ? 'bg-[#1f8a46]' : 'bg-ambra') : 'bg-bordo'}`} />
              ))}
            </div>
            <span className="text-xs text-muto">Almeno 10 caratteri, con un numero.</span>
          </div>
        </section>

        <label className="flex items-start gap-3 px-1.5 text-[13px] leading-relaxed text-testo">
          <input type="checkbox" name="privacy" className="mt-0.5 size-[22px] shrink-0 accent-brand" />
          <span>
            Ho letto l'informativa privacy e acconsento al trattamento dei dati per la gestione delle richieste di assistenza.
            {campi.privacy && <span className="mt-1 block font-medium text-[#a31b1b]">{campi.privacy}</span>}
          </span>
        </label>

        <button type="submit" className="btn-primario h-14 rounded-2xl text-base" disabled={invio}>
          {invio ? 'Invio in corso…' : 'Richiedi accesso'}
        </button>
        <p className="text-center text-sm text-testo">
          Hai già un account?{' '}
          <Link to="/accesso" className="font-bold text-brand">
            Accedi
          </Link>
        </p>
      </form>
    </LayoutPubblico>
  );
}
