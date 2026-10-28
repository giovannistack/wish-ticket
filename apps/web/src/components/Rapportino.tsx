import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  minutiRiga,
  TIPOLOGIA_INTERVENTO_LABEL,
  TIPOLOGIE_INTERVENTO,
  type FirmaDTO,
  type FirmaInput,
  type RapportoInput,
  type TicketAdminDTO,
  type TipologiaIntervento,
} from '@wish/shared';
import { api, apiBlob, ErroreHttp } from '../api';
import { useAuth } from '../auth';
import { Avviso, Icona, dataBreve } from './ui';

// ---------- Utilità ----------

const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const durata = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
/** "12,50" → 12.5; vuoto → null; testo non valido → NaN */
const numero = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(/\./g, '').replace(',', '.')));
const testoNumero = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
const testoEuro = (n: number | null) => (n == null ? '' : n.toFixed(2).replace('.', ','));
const messaggio = (e: unknown) => (e instanceof ErroreHttp ? e.message : e ? 'Operazione non riuscita' : null);

interface RigaBozza {
  chiave: string;
  data: string;
  inizio: string;
  fine: string;
  viaggio: string;
  tipologia: TipologiaIntervento;
}
interface ParteBozza {
  chiave: string;
  codice: string;
  descrizione: string;
  quantita: string;
  prezzo: string;
}
interface Bozza {
  righe: RigaBozza[];
  parti: ParteBozza[];
  importo: string;
  note: string;
}

let contatore = 0;
const nuovaChiave = () => `n${++contatore}`;

function daRapporto(t: TicketAdminDTO): Bozza {
  const r = t.rapporto;
  return {
    righe: r.interventi.map((i) => ({ chiave: i.id, data: i.data, inizio: i.inizio, fine: i.fine, viaggio: i.viaggioMinuti ? String(i.viaggioMinuti) : '', tipologia: i.tipologia })),
    parti: r.parti.map((p) => ({ chiave: p.id, codice: p.codice, descrizione: p.descrizione, quantita: testoNumero(p.quantita), prezzo: testoEuro(p.prezzoUnitario) })),
    importo: testoEuro(r.importoTotale),
    note: r.note,
  };
}

function versoApi(b: Bozza): RapportoInput {
  return {
    interventi: b.righe.map((r) => ({ data: r.data, inizio: r.inizio, fine: r.fine, viaggioMinuti: Number(r.viaggio) || 0, tipologia: r.tipologia })),
    parti: b.parti
      .filter((p) => p.descrizione.trim())
      .map((p) => ({ codice: p.codice.trim(), descrizione: p.descrizione.trim(), quantita: numero(p.quantita) ?? 1, prezzoUnitario: numero(p.prezzo) })),
    importoTotale: numero(b.importo),
    note: b.note.trim(),
  };
}

const campo = 'h-10 w-full min-w-0 rounded-[10px] border border-bordo bg-white px-2.5 text-sm';

/** Scarica il PDF protetto (serve il token) e lo apre o lo salva. */
export async function scaricaRapportino(percorso: string, numero: string) {
  const blob = await apiBlob(percorso);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rapportino-${numero}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------- Rapportino (Wish) ----------

export function Rapportino({ t, onAggiornato }: { t: TicketAdminDTO; onAggiornato: (t: TicketAdminDTO) => void }) {
  const [bozza, setBozza] = useState<Bozza>(() => daRapporto(t));
  const [scarico, setScarico] = useState<string | null>(null);
  // Quando il server restituisce un rapportino diverso (salvato, firmato…), il modulo si riallinea
  const firmaServer = JSON.stringify(versoApi(daRapporto(t)));
  useEffect(() => setBozza(daRapporto(t)), [firmaServer]); // eslint-disable-line react-hooks/exhaustive-deps

  const corpo = versoApi(bozza);
  const modificato = JSON.stringify(corpo) !== firmaServer;
  const numeriErrati = bozza.parti.some((p) => Number.isNaN(numero(p.prezzo)) || Number.isNaN(numero(p.quantita))) || Number.isNaN(numero(bozza.importo));
  const firmato = !!(t.rapporto.firme.cliente || t.rapporto.firme.tecnico);

  const salva = useMutation({
    mutationFn: () => api<TicketAdminDTO>(`/admin/ticket/${t.id}/rapporto`, { method: 'PUT', body: corpo }),
    onSuccess: onAggiornato,
  });

  const minuti = bozza.righe.reduce((s, r) => s + (r.inizio < r.fine ? minutiRiga({ inizio: r.inizio, fine: r.fine, viaggioMinuti: Number(r.viaggio) || 0 }) : 0), 0);
  const totaleParti = bozza.parti.reduce((s, p) => s + (numero(p.prezzo) ?? 0) * (numero(p.quantita) ?? 0), 0);
  const setRiga = (i: number, v: Partial<RigaBozza>) => setBozza({ ...bozza, righe: bozza.righe.map((r, j) => (j === i ? { ...r, ...v } : r)) });
  const setParte = (i: number, v: Partial<ParteBozza>) => setBozza({ ...bozza, parti: bozza.parti.map((p, j) => (j === i ? { ...p, ...v } : p)) });

  async function pdf() {
    setScarico('Preparazione del PDF…');
    try {
      await scaricaRapportino(`/admin/ticket/${t.id}/rapporto.pdf`, t.numero);
      setScarico(null);
    } catch (e) {
      setScarico(messaggio(e));
    }
  }

  return (
    <section className="card flex flex-col gap-5 p-5" aria-labelledby="titolo-rapportino">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 id="titolo-rapportino" className="text-base font-extrabold">Rapportino di intervento</h2>
          <span className="text-xs text-muto">N.° {t.numero} · la descrizione dell'attività è la soluzione del ticket</span>
        </div>
        <button type="button" className="btn-secondario" onClick={pdf} disabled={modificato}>
          <Icona nome="documento" dimensione={16} /> Scarica PDF
        </button>
      </div>
      {modificato && <p className="-mt-3 text-xs text-[#7a4300]">Salva il rapportino per scaricare il PDF aggiornato.</p>}
      {scarico && <Avviso tipo={scarico.startsWith('Prepar') ? 'info' : 'errore'}>{scarico}</Avviso>}

      {/* ---- Dettaglio interventi ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-extrabold">Dettaglio interventi eseguiti</h3>
          <span className="text-xs text-muto">Totale {durata(minuti)}</span>
        </div>
        {bozza.righe.length === 0 && <p className="text-sm text-muto">Nessun intervento registrato.</p>}
        {bozza.righe.map((r, i) => {
          const errata = !(r.inizio < r.fine);
          return (
            <div key={r.chiave} className="grid grid-cols-2 items-end gap-2 rounded-xl bg-fondo p-2.5 sm:grid-cols-[1.25fr_0.9fr_0.9fr_0.8fr_1.3fr_auto]">
              <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
                Data
                <input type="date" className={campo} value={r.data} onChange={(e) => setRiga(i, { data: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
                Inizio
                <input type="time" className={campo} value={r.inizio} onChange={(e) => setRiga(i, { inizio: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
                Fine
                <input type="time" className={`${campo} ${errata ? 'border-[#d42a2a]' : ''}`} value={r.fine} onChange={(e) => setRiga(i, { fine: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
                Viaggio (min)
                <input type="number" min={0} max={1440} step={5} inputMode="numeric" className={campo} value={r.viaggio} onChange={(e) => setRiga(i, { viaggio: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
                Tipologia
                <select className={campo} value={r.tipologia} onChange={(e) => setRiga(i, { tipologia: e.target.value as TipologiaIntervento })}>
                  {TIPOLOGIE_INTERVENTO.map((x) => (
                    <option key={x} value={x}>{TIPOLOGIA_INTERVENTO_LABEL[x]}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label="Togli questa riga"
                title="Togli questa riga"
                className="flex size-10 items-center justify-center rounded-lg text-muto hover:bg-[#fff5f5] hover:text-[#a31b1b]"
                onClick={() => setBozza({ ...bozza, righe: bozza.righe.filter((_, j) => j !== i) })}
              >
                <Icona nome="cestino" dimensione={17} />
              </button>
              {errata && <span className="col-span-full text-xs font-medium text-[#a31b1b]">La fine deve essere dopo l'inizio</span>}
            </div>
          );
        })}
        <button
          type="button"
          className="btn-secondario self-start min-h-10 text-[13px]"
          onClick={() =>
            setBozza({ ...bozza, righe: [...bozza.righe, { chiave: nuovaChiave(), data: oggi(), inizio: '09:00', fine: '10:00', viaggio: '', tipologia: 'hardware' }] })
          }
        >
          <Icona nome="piu" dimensione={16} /> Aggiungi intervento
        </button>
      </div>

      {/* ---- Parti utilizzate ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-extrabold">Parti utilizzate</h3>
          <span className="text-xs text-muto">Totale parti {euro(totaleParti)}</span>
        </div>
        {bozza.parti.length === 0 && <p className="text-sm text-muto">Nessuna parte utilizzata.</p>}
        {bozza.parti.map((p, i) => (
          <div key={p.chiave} className="grid grid-cols-2 items-end gap-2 rounded-xl bg-fondo p-2.5 sm:grid-cols-[1fr_2.2fr_0.7fr_1fr_auto]">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
              Numero parte
              <input className={campo} value={p.codice} onChange={(e) => setParte(i, { codice: e.target.value })} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-muto sm:col-span-1">
              Descrizione
              <input className={campo} value={p.descrizione} onChange={(e) => setParte(i, { descrizione: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
              Quantità
              <input inputMode="decimal" className={`${campo} ${Number.isNaN(numero(p.quantita)) ? 'border-[#d42a2a]' : ''}`} value={p.quantita} onChange={(e) => setParte(i, { quantita: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muto">
              Costo unitario €
              <input inputMode="decimal" placeholder="—" className={`${campo} ${Number.isNaN(numero(p.prezzo)) ? 'border-[#d42a2a]' : ''}`} value={p.prezzo} onChange={(e) => setParte(i, { prezzo: e.target.value })} />
            </label>
            <button
              type="button"
              aria-label="Togli questa parte"
              title="Togli questa parte"
              className="flex size-10 items-center justify-center rounded-lg text-muto hover:bg-[#fff5f5] hover:text-[#a31b1b]"
              onClick={() => setBozza({ ...bozza, parti: bozza.parti.filter((_, j) => j !== i) })}
            >
              <Icona nome="cestino" dimensione={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondario self-start min-h-10 text-[13px]"
          onClick={() => setBozza({ ...bozza, parti: [...bozza.parti, { chiave: nuovaChiave(), codice: '', descrizione: '', quantita: '1', prezzo: '' }] })}
        >
          <Icona nome="piu" dimensione={16} /> Aggiungi parte
        </button>
      </div>

      {/* ---- Importo e note ---- */}
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <label className="flex flex-col gap-1.5">
          <span className="etichetta">Importo totale intervento €</span>
          <input
            inputMode="decimal"
            placeholder="Es. 120,00"
            className={`campo ${Number.isNaN(numero(bozza.importo)) ? 'border-[#d42a2a]' : ''}`}
            value={bozza.importo}
            onChange={(e) => setBozza({ ...bozza, importo: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etichetta">
            Note <span className="font-normal text-muto">· stampate sul rapportino, le vede il cliente</span>
          </span>
          <textarea rows={2} className="campo resize-y" value={bozza.note} onChange={(e) => setBozza({ ...bozza, note: e.target.value })} />
        </label>
      </div>

      {messaggio(salva.error) && <Avviso>{messaggio(salva.error)}</Avviso>}
      {modificato && firmato && (
        <Avviso tipo="info">Il rapportino è già firmato: salvando le modifiche le firme vengono annullate e vanno raccolte di nuovo.</Avviso>
      )}
      <button
        type="button"
        className="btn-primario self-end"
        disabled={!modificato || numeriErrati || bozza.righe.some((r) => !(r.inizio < r.fine)) || salva.isPending}
        onClick={() => salva.mutate()}
      >
        {salva.isPending ? 'Salvataggio…' : 'Salva rapportino'}
      </button>

      {/* ---- Firme ---- */}
      <div className="flex flex-col gap-2 border-t border-riga pt-4">
        <h3 className="text-sm font-extrabold">Firme</h3>
        <p className="text-xs text-muto">
          Si firma con il dito su telefono o tablet. In alternativa scarica il PDF, stampalo e fatelo firmare a penna.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Firma t={t} chi="tecnico" titolo="Tecnico" firma={t.rapporto.firme.tecnico} bloccata={modificato} onAggiornato={onAggiornato} />
          <Firma t={t} chi="cliente" titolo="Responsabile cliente · timbro e firma" firma={t.rapporto.firme.cliente} bloccata={modificato} onAggiornato={onAggiornato} />
        </div>
      </div>
    </section>
  );
}

// ---------- Firma con il dito ----------

function Firma({
  t,
  chi,
  titolo,
  firma,
  bloccata,
  onAggiornato,
}: {
  t: TicketAdminDTO;
  chi: 'cliente' | 'tecnico';
  titolo: string;
  firma: FirmaDTO | null;
  bloccata: boolean;
  onAggiornato: (t: TicketAdminDTO) => void;
}) {
  const { utente } = useAuth();
  const [aperta, setAperta] = useState(false);
  const togli = useMutation({
    mutationFn: () => api<TicketAdminDTO>(`/admin/ticket/${t.id}/firma/${chi}`, { method: 'DELETE' }),
    onSuccess: onAggiornato,
  });
  const nomeIniziale = chi === 'tecnico' ? (t.tecnico?.nome ?? `${utente?.nome ?? ''} ${utente?.cognome ?? ''}`.trim()) : t.richiedente.id ? t.richiedente.nome : '';

  return (
    <div className="flex min-h-[132px] flex-col gap-2 rounded-xl border border-bordo p-3">
      <span className="text-xs font-semibold text-muto">{titolo}</span>
      {firma ? (
        <>
          <img src={firma.immagine} alt={`Firma di ${firma.nome}`} className="h-16 w-full rounded-lg bg-white object-contain" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px]">
              <strong>{firma.nome}</strong> <span className="text-muto">· {dataBreve(firma.data)}</span>
            </span>
            <button type="button" className="text-[13px] font-semibold text-[#a31b1b]" disabled={togli.isPending} onClick={() => togli.mutate()}>
              Togli firma
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn-secondario mt-auto h-12" disabled={bloccata} onClick={() => setAperta(true)} title={bloccata ? 'Salva prima il rapportino' : undefined}>
          <Icona nome="matita" dimensione={16} /> Firma
        </button>
      )}
      {aperta && <FinestraFirma t={t} chi={chi} titolo={titolo} nomeIniziale={nomeIniziale} onChiudi={() => setAperta(false)} onAggiornato={onAggiornato} />}
    </div>
  );
}

function FinestraFirma({
  t,
  chi,
  titolo,
  nomeIniziale,
  onChiudi,
  onAggiornato,
}: {
  t: TicketAdminDTO;
  chi: 'cliente' | 'tecnico';
  titolo: string;
  nomeIniziale: string;
  onChiudi: () => void;
  onAggiornato: (t: TicketAdminDTO) => void;
}) {
  const tela = useRef<HTMLCanvasElement>(null);
  const [nome, setNome] = useState(nomeIniziale);
  const [vuota, setVuota] = useState(true);
  const invia = useMutation({
    mutationFn: (dati: FirmaInput) => api<TicketAdminDTO>(`/admin/ticket/${t.id}/firma`, { method: 'POST', body: dati }),
    onSuccess: (r) => {
      onAggiornato(r);
      onChiudi();
    },
  });

  // Tela ad alta definizione, tratto morbido, funziona con dito, penna e mouse
  useEffect(() => {
    const c = tela.current!;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1f5c';
    ctx.lineWidth = 2.4;
    let ultimo: { x: number; y: number } | null = null;
    const punto = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const giu = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      ultimo = punto(e);
      ctx.beginPath();
      ctx.arc(ultimo.x, ultimo.y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1f5c';
      ctx.fill();
      setVuota(false);
    };
    const muovi = (e: PointerEvent) => {
      if (!ultimo) return;
      const p = punto(e);
      const medio = { x: (ultimo.x + p.x) / 2, y: (ultimo.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(ultimo.x, ultimo.y);
      ctx.quadraticCurveTo(ultimo.x, ultimo.y, medio.x, medio.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ultimo = p;
    };
    const su = () => {
      ultimo = null;
    };
    c.addEventListener('pointerdown', giu);
    c.addEventListener('pointermove', muovi);
    c.addEventListener('pointerup', su);
    c.addEventListener('pointercancel', su);
    return () => {
      c.removeEventListener('pointerdown', giu);
      c.removeEventListener('pointermove', muovi);
      c.removeEventListener('pointerup', su);
      c.removeEventListener('pointercancel', su);
    };
  }, []);

  function cancella() {
    const c = tela.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setVuota(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1730]/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={`Firma: ${titolo}`}>
      <div className="flex w-full max-w-xl flex-col gap-3 rounded-[18px] bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold">Firma · {titolo}</h2>
          <button type="button" className="text-sm font-semibold text-muto" onClick={onChiudi}>
            Chiudi
          </button>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="etichetta">Nome e cognome di chi firma</span>
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
        </label>
        <div className="flex flex-col gap-1">
          <span className="etichetta">Firma qui sotto con il dito</span>
          <canvas ref={tela} className="h-48 w-full touch-none rounded-xl border-2 border-dashed border-[#c8d3ea] bg-[#fbfcff]" />
        </div>
        {messaggio(invia.error) && <Avviso>{messaggio(invia.error)}</Avviso>}
        <div className="flex justify-between gap-2">
          <button type="button" className="btn-secondario" onClick={cancella} disabled={vuota}>
            Cancella
          </button>
          <button
            type="button"
            className="btn-primario"
            disabled={vuota || nome.trim().length < 2 || invia.isPending}
            onClick={() => invia.mutate({ chi, nome: nome.trim(), immagine: tela.current!.toDataURL('image/png') })}
          >
            {invia.isPending ? 'Salvataggio…' : 'Conferma firma'}
          </button>
        </div>
      </div>
    </div>
  );
}
