import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  type AziendaConStatsDTO,
  type Categoria,
  type ContrattoDTO,
  type Priorita,
  type TicketDTO,
  type UtenteDTO,
} from '@wish/shared';
import { api, apiUpload, ErroreHttp } from '../../api';
import { useAuth } from '../../auth';
import { leggiForm, useErroriForm } from '../../form';
import { SceltaFile } from '../../components/Allegati';
import { AreaTesto, Avviso, Campo, Icona, Sezione, Selezione } from '../../components/ui';

/**
 * Modulo di apertura ticket, lo stesso per il cliente e per il super admin.
 * In modalità admin si sceglie anche azienda, richiedente e se è fuori contratto.
 */
export function ModuloTicket({ admin = false, testata }: { admin?: boolean; testata?: ReactNode }) {
  const { utente } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { campi, generale, valida, daErrore, pulisci, setGenerale } = useErroriForm();
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [priorita, setPriorita] = useState<Priorita>('media');
  const [file, setFile] = useState<File[]>([]);
  const [invio, setInvio] = useState<string | null>(null);

  // Solo admin: azienda, richiedente, fuori contratto
  const [aziendaId, setAziendaId] = useState('');
  const [richiedenteId, setRichiedenteId] = useState('');
  const [fuoriContratto, setFuoriContratto] = useState(false);
  const aziende = useQuery({
    queryKey: ['admin', 'aziende'],
    queryFn: () => api<AziendaConStatsDTO[]>('/admin/aziende'),
    enabled: admin,
  });
  const utentiAzienda = useQuery({
    queryKey: ['admin', 'utenti', 'attivo', aziendaId],
    queryFn: () => api<UtenteDTO[]>(`/admin/utenti?stato=attivo&aziendaId=${aziendaId}`),
    enabled: admin && !!aziendaId,
  });
  const contrattoCliente = useQuery({ queryKey: ['contratto'], queryFn: () => api<ContrattoDTO>('/ticket/contratto'), enabled: !admin });

  const azienda = aziende.data?.find((a) => a.id === aziendaId);
  const c: ContrattoDTO | undefined = admin ? azienda?.contratto : contrattoCliente.data;
  const bloccato = !!c?.bloccato && !(admin && fuoriContratto);
  const richiedente = utentiAzienda.data?.find((u) => u.id === richiedenteId);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (admin && !aziendaId) {
      setGenerale('Scegli l\'azienda');
      return;
    }
    const dati = valida(nuovoTicketSchema, { ...leggiForm(e.currentTarget), categoria: categoria || undefined, priorita });
    if (!dati) return;
    setInvio('Invio in corso…');
    try {
      const t = admin
        ? await api<TicketDTO>('/admin/ticket', {
            method: 'POST',
            body: { ...dati, aziendaId, richiedenteId: richiedenteId || undefined, fuoriContratto },
          })
        : await api<TicketDTO>('/ticket', { method: 'POST', body: dati });

      // Gli allegati si caricano dopo, sul ticket appena creato
      const falliti: string[] = [];
      for (const [i, f] of file.entries()) {
        setInvio(`Carico gli allegati (${i + 1} di ${file.length})…`);
        try {
          await apiUpload(admin ? `/admin/ticket/${t.id}/allegati` : `/ticket/${t.id}/allegati`, f);
        } catch (err) {
          falliti.push(`${f.name}: ${err instanceof ErroreHttp ? err.message : 'non caricato'}`);
        }
      }
      await qc.invalidateQueries({ queryKey: admin ? ['admin'] : ['ticket'] });
      await qc.invalidateQueries({ queryKey: ['contratto'] });
      navigate(admin ? `/admin/ticket/${t.id}` : `/ticket/${t.id}`, { state: { creato: true, falliti } });
    } catch (err) {
      daErrore(err);
    } finally {
      setInvio(null);
    }
  }

  return (
    <>
      {testata}
      <form onSubmit={onSubmit} onInput={pulisci} noValidate className={`mx-auto flex max-w-2xl flex-col gap-3.5 ${admin ? 'w-full' : '-mt-12 px-4 pb-10'}`}>
        {bloccato && (
          <Avviso>
            {admin
              ? `${azienda?.nome} ha esaurito le chiamate del contratto: spunta "Fuori contratto" per aprire comunque il ticket.`
              : 'Le chiamate incluse nel contratto sono esaurite: per ora non puoi aprire nuovi ticket. Contatta Wish.'}
          </Avviso>
        )}
        {c?.attivo && !bloccato && !(admin && fuoriContratto) && (
          <Avviso tipo="info">
            {c.residue > 0
              ? `${admin ? `${azienda?.nome}: q` : 'Q'}uesta richiesta userà 1 delle ${c.residue} chiamate rimaste nel contratto.`
              : 'Chiamate esaurite: questa è una richiesta urgente concessa da Wish, fuori contratto.'}
          </Avviso>
        )}
        {generale && <Avviso>{generale}</Avviso>}

        {admin ? (
          <Sezione numero={1} titolo="Cliente">
            <div className="grid gap-3 sm:grid-cols-2">
              <Selezione
                etichetta="Azienda"
                value={aziendaId}
                onChange={(e) => {
                  setAziendaId(e.target.value);
                  setRichiedenteId('');
                }}
              >
                <option value="" disabled>Scegli…</option>
                {aziende.data?.filter((a) => a.attiva).map((a) => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </Selezione>
              <Selezione etichetta="Richiedente" value={richiedenteId} disabled={!aziendaId} onChange={(e) => setRichiedenteId(e.target.value)}>
                <option value="">Nessuno: lo apre Wish</option>
                {utentiAzienda.data?.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>
                ))}
              </Selezione>
            </div>
            <Campo
              key={richiedenteId}
              etichetta="Telefono di contatto"
              name="telefono"
              type="tel"
              defaultValue={richiedente?.telefono ?? ''}
              placeholder="Numero diretto"
              errore={campi.telefono}
            />
            {c?.attivo && (
              <label className="flex min-h-11 items-center gap-3 rounded-xl bg-fondo px-3 text-sm">
                <input type="checkbox" checked={fuoriContratto} onChange={(e) => setFuoriContratto(e.target.checked)} className="size-5 accent-[#c2410c]" />
                <span>
                  <strong>Fuori contratto</strong>{' '}
                  <span className="text-muto">· {c.residue} di {c.chiamateAnnue} chiamate rimaste{fuoriContratto ? ', nessuna verrà scalata' : ''}</span>
                </span>
              </label>
            )}
          </Sezione>
        ) : (
          <Sezione numero={1} titolo="Richiedente">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etichetta="Nome e cognome" value={`${utente?.nome} ${utente?.cognome}`} disabled readOnly />
              <Campo etichetta="Telefono" name="telefono" type="tel" defaultValue={utente?.telefono} placeholder="Numero diretto" errore={campi.telefono} />
            </div>
          </Sezione>
        )}

        <Sezione numero={2} titolo="Il problema">
          <Campo etichetta="Oggetto" name="oggetto" placeholder="Es. La stampante non stampa" errore={campi.oggetto} />
          <fieldset className="flex flex-col gap-2">
            <legend className="etichetta mb-2">Tipo di problema</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIE.map((x) => (
                <button
                  key={x}
                  type="button"
                  aria-pressed={categoria === x}
                  onClick={() => setCategoria(x)}
                  className={`h-10 rounded-full px-3.5 text-sm transition ${
                    categoria === x ? 'border-[1.5px] border-brand bg-brand-chiaro font-semibold text-brand-scuro' : 'border border-bordo bg-white font-medium text-testo hover:border-brand/50'
                  }`}
                >
                  {CATEGORIA_LABEL[x]}
                </button>
              ))}
            </div>
            {campi.categoria && <span className="text-xs font-medium text-[#a31b1b]">Scegli il tipo di problema</span>}
          </fieldset>
          <AreaTesto etichetta="Descrizione" name="descrizione" rows={5} placeholder="Cosa succede, da quando, eventuali messaggi di errore…" errore={campi.descrizione} />
          <SceltaFile file={file} onCambio={setFile} />
        </Sezione>

        <Sezione numero={3} titolo="Apparato">
          <div className="grid gap-3 sm:grid-cols-2">
            <Selezione etichetta="Tipo" name="tipoApparato" defaultValue="pc_desktop" errore={campi.tipoApparato}>
              {TIPI_APPARATO.map((t) => (
                <option key={t} value={t}>{TIPO_APPARATO_LABEL[t]}</option>
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
            <legend className="etichetta mb-2">{admin ? 'Quanto blocca il cliente?' : 'Quanto ti blocca?'}</legend>
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
              <option key={d} value={d}>{DISPONIBILITA_LABEL[d]}</option>
            ))}
          </Selezione>
        </Sezione>

        <button type="submit" className="btn-primario h-14 rounded-2xl text-base" disabled={!!invio || bloccato}>
          {invio ?? (admin ? 'Apri il ticket' : 'Invia ticket')}
          {!invio && <Icona nome="freccia" dimensione={20} spessore={2.2} />}
        </button>
        <p className="text-center text-xs text-muto">
          {admin ? 'Il richiedente riceve una email con il numero del ticket.' : 'Riceverai una mail con il numero del ticket e ogni aggiornamento.'}
        </p>
      </form>
    </>
  );
}

export default function NuovoTicket() {
  return (
    <ModuloTicket
      testata={
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
      }
    />
  );
}
