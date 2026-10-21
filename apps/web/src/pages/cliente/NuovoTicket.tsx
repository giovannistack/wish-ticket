import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIE,
  CATEGORIA_LABEL,
  DISPONIBILITA,
  DISPONIBILITA_LABEL,
  PRIORITA,
  PRIORITA_LABEL,
  TIPI_APPARATO,
  TIPO_APPARATO_LABEL,
  nuovoTicketSchema,
  type Categoria,
  type Priorita,
  type TicketDTO,
} from '@wish/shared';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { leggiForm, useErroriForm } from '../../form';
import { AreaTesto, Avviso, Campo, Icona, Sezione, Selezione } from '../../components/ui';

export default function NuovoTicket() {
  const { utente } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { campi, generale, valida, daErrore, pulisci } = useErroriForm();
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [priorita, setPriorita] = useState<Priorita>('media');
  const [invio, setInvio] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dati = valida(nuovoTicketSchema, { ...leggiForm(e.currentTarget), categoria: categoria || undefined, priorita });
    if (!dati) return;
    setInvio(true);
    try {
      const t = await api<TicketDTO>('/ticket', { method: 'POST', body: dati });
      await qc.invalidateQueries({ queryKey: ['ticket'] });
      navigate(`/ticket/${t.id}`, { state: { creato: true } });
    } catch (err) {
      daErrore(err);
    } finally {
      setInvio(false);
    }
  }

  return (
    <>
      <div className="bg-navy text-white">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 px-5 pb-16 pt-2">
          <Link to="/" className="flex w-fit items-center gap-1.5 rounded-lg text-sm text-[#c9d5f2] hover:text-white">
            <Icona nome="indietro" dimensione={16} /> I tuoi ticket
          </Link>
          <span className="mt-2 text-xs font-semibold uppercase tracking-[1.4px] text-[#8fb0ff]">Nuova richiesta</span>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">Apri un ticket di assistenza</h1>
          <p className="text-sm text-[#c9d5f2]">Descrivi il problema: il tecnico riceve subito la segnalazione.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} onInput={pulisci} noValidate className="mx-auto -mt-12 flex max-w-2xl flex-col gap-3.5 px-4 pb-10">
        {generale && <Avviso>{generale}</Avviso>}

        <Sezione numero={1} titolo="Richiedente">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etichetta="Nome e cognome" value={`${utente?.nome} ${utente?.cognome}`} disabled readOnly />
            <Campo etichetta="Telefono" name="telefono" type="tel" defaultValue={utente?.telefono} placeholder="Numero diretto" errore={campi.telefono} />
          </div>
        </Sezione>

        <Sezione numero={2} titolo="Il problema">
          <Campo etichetta="Oggetto" name="oggetto" placeholder="Es. La stampante non stampa" errore={campi.oggetto} />
          <fieldset className="flex flex-col gap-2">
            <legend className="etichetta mb-2">Tipo di problema</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={categoria === c}
                  onClick={() => setCategoria(c)}
                  className={`h-10 rounded-full px-3.5 text-sm transition ${
                    categoria === c ? 'border-[1.5px] border-brand bg-brand-chiaro font-semibold text-brand-scuro' : 'border border-bordo bg-white font-medium text-testo hover:border-brand/50'
                  }`}
                >
                  {CATEGORIA_LABEL[c]}
                </button>
              ))}
            </div>
            {campi.categoria && <span className="text-xs font-medium text-[#a31b1b]">Scegli il tipo di problema</span>}
          </fieldset>
          <AreaTesto etichetta="Descrizione" name="descrizione" rows={5} placeholder="Cosa succede, da quando, eventuali messaggi di errore…" errore={campi.descrizione} />
        </Sezione>

        <Sezione numero={3} titolo="Apparato">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selezione etichetta="Tipo" name="tipoApparato" defaultValue="pc_desktop" errore={campi.tipoApparato}>
              {TIPI_APPARATO.map((t) => (
                <option key={t} value={t}>
                  {TIPO_APPARATO_LABEL[t]}
                </option>
              ))}
            </Selezione>
            <Campo etichetta="Marca e modello" name="marcaModello" placeholder="Es. HP LaserJet" errore={campi.marcaModello} />
          </div>
          <Campo
            etichetta={<>Serial number <span className="font-normal text-muto">(facoltativo)</span></>}
            name="seriale"
            className="campo font-mono placeholder:font-sans"
            placeholder="Sull'etichetta dell'apparato"
            errore={campi.seriale}
          />
        </Sezione>

        <Sezione numero={4} titolo="Urgenza">
          <fieldset>
            <legend className="etichetta mb-2">Quanto ti blocca?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRIORITA.map((p) => {
                const attivo = priorita === p;
                const rosso = p === 'bloccante';
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={attivo}
                    onClick={() => setPriorita(p)}
                    className={`flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-xl px-3 py-2 text-left transition ${
                      attivo
                        ? rosso
                          ? 'border-[1.5px] border-[#d42a2a] bg-[#fdecec]'
                          : 'border-[1.5px] border-brand bg-brand-chiaro'
                        : rosso
                          ? 'border border-[#f1c3c3] bg-[#fff5f5]'
                          : 'border border-bordo bg-white'
                    }`}
                  >
                    <span className={`text-sm font-bold ${rosso ? 'text-[#a31b1b]' : attivo ? 'text-brand-scuro' : 'text-inchiostro'}`}>{PRIORITA_LABEL[p].nome}</span>
                    <span className={`text-xs ${rosso ? 'text-[#8a2a2a]' : 'text-muto'}`}>{PRIORITA_LABEL[p].descrizione}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Selezione etichetta="Quando possiamo intervenire?" name="disponibilita" defaultValue="prima_possibile">
            {DISPONIBILITA.map((d) => (
              <option key={d} value={d}>
                {DISPONIBILITA_LABEL[d]}
              </option>
            ))}
          </Selezione>
        </Sezione>

        <button type="submit" className="btn-primario h-14 rounded-2xl text-base" disabled={invio}>
          {invio ? 'Invio in corso…' : 'Invia ticket'}
          <Icona nome="freccia" dimensione={20} spessore={2.2} />
        </button>
        <p className="text-center text-xs text-muto">Riceverai una mail con il numero del ticket e ogni aggiornamento.</p>
      </form>
    </>
  );
}
