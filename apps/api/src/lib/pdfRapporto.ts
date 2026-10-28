import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { TIPO_APPARATO_LABEL, TIPOLOGIA_INTERVENTO_LABEL, type RapportoDTO, type TipoApparato } from '@wish/shared';

/** Intestazione del modulo "Rapporto intervento tecnico" di Wish IT. */
export const WISH_IT = {
  ragioneSociale: 'Wish IT Srl',
  indirizzo: 'Via Giovanni Botero 15, 00179 Roma',
  partitaIva: '04960111005',
  telefono: '06.7806570',
  fax: '06.78390189',
};

const LOGO = path.resolve(import.meta.dirname, '../../assets/logo-wish-it.png');

export interface DatiRapporto {
  numero: string;
  cliente: { nome: string; ragioneSociale: string; sede: string; partitaIva: string; privato: boolean };
  tipoApparato: TipoApparato;
  marcaModello: string;
  seriale: string;
  descrizioneAttivita: string;
  tecnico: string;
  rapporto: RapportoDTO;
}

const X0 = 57; // margine sinistro
const X1 = 538; // margine destro
const LARGHEZZA = X1 - X0;
const NERO = '#000000';
const RIGA = 14.5; // altezza delle righe delle tabelle

const dataIt = (iso: string) => iso.split('-').reverse().join('/');
const durata = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const euro = (n: number | null) =>
  n == null ? '' : `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quantita = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
const immagineFirma = (dataUrl: string) => Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');

/** PDF del rapportino, uguale al modulo cartaceo Wish IT, con i dati del ticket. */
export function creaPdfRapporto(d: DatiRapporto): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 30, bottom: 30, left: X0, right: 595.28 - X1 },
    info: { Title: `Rapporto intervento tecnico ${d.numero}`, Author: WISH_IT.ragioneSociale },
  });
  const pezzi: Buffer[] = [];
  doc.on('data', (b: Buffer) => pezzi.push(b));
  const fine = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(pezzi))));

  doc.lineWidth(0.7).strokeColor(NERO).fillColor(NERO);
  const font = (grassetto = false, corpo = 10.5) => doc.font(grassetto ? 'Times-Bold' : 'Times-Roman').fontSize(corpo);
  const testo = (t: string, x: number, y: number, o: PDFKit.Mixins.TextOptions = {}) => doc.text(t, x, y, { lineBreak: false, ...o });
  const cella = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).stroke();
  /** Va a capo pagina se il blocco non ci sta. */
  let y = 0;
  const spazio = (h: number) => {
    if (y + h > 841.89 - 36) {
      doc.addPage();
      y = 40;
    }
  };

  // ---- Titolo, logo, intestazione Wish IT ----
  font(true, 12);
  doc.text('RAPPORTO INTERVENTO TECNICO', X0, 32, { width: LARGHEZZA, align: 'center' });
  if (fs.existsSync(LOGO)) doc.image(LOGO, X0, 62, { fit: [60, 62] });
  font(false, 11);
  const righeWish = [WISH_IT.ragioneSociale, WISH_IT.indirizzo, `Partita Iva ${WISH_IT.partitaIva}`, `Tel. ${WISH_IT.telefono}`, `Fax. ${WISH_IT.fax}`];
  righeWish.forEach((r, i) => testo(r, X0, 131 + i * 14.5));

  // ---- Numero e dati cliente ----
  testo(`N.° ${d.numero}`, X0, 145, { width: LARGHEZZA, align: 'right' });
  testo('Dati Cliente', X0, 160, { width: LARGHEZZA, align: 'right' });
  const xc = 212;
  const wc = X1 - xc;
  const datiCliente: Array<[string, string]> = [
    [d.cliente.privato ? 'Nome e cognome:' : 'Denominazione:', d.cliente.ragioneSociale || d.cliente.nome],
    ['Indirizzo:', d.cliente.sede],
    ['Partita IVA:', d.cliente.partitaIva],
  ];
  datiCliente.forEach(([etichetta, valore], i) => {
    const yy = 174 + i * 15;
    cella(xc, yy, wc, 15);
    font(true, 10.5);
    testo(etichetta, xc + 4, yy + 3);
    const we = doc.widthOfString(etichetta) + 6;
    font(false, 10.5);
    testo(valore, xc + 4 + we, yy + 3, { width: wc - we - 8, ellipsis: true });
  });

  // ---- Intervento eseguito su ----
  y = 224;
  doc.moveTo(X0, y + 16).lineTo(X1, y + 16).stroke();
  doc.moveTo(X0, y).lineTo(X0, y + 16).stroke();
  doc.moveTo(X0 + 123, y).lineTo(X0 + 123, y + 16).stroke();
  doc.moveTo(X0 + 337, y).lineTo(X0 + 337, y + 16).stroke();
  font(true, 9.5);
  testo('Intervento eseguito su:', X0 + 4, y + 4);
  testo('Tipo:', X0 + 127, y + 4);
  testo('S/N', X0 + 341, y + 4);
  font(false, 9.5);
  const tipo = [TIPO_APPARATO_LABEL[d.tipoApparato], d.marcaModello].filter(Boolean).join(' · ');
  testo(tipo, X0 + 127 + 30, y + 4, { width: 175, ellipsis: true });
  testo(d.seriale, X0 + 341 + 24, y + 4, { width: 112, ellipsis: true });

  // ---- Dettaglio interventi eseguiti ----
  y = 253;
  font(false, 11);
  testo('Dettaglio interventi eseguiti:', X0, y);
  y += 12;
  const colI = [68, 63, 63, 64, 80, LARGHEZZA - 338];
  const intestazioneI = ['Data', 'Inizio', 'Fine', 'Viaggio', 'Tempo totale', 'Tipologia intervento'];
  const righeI = d.rapporto.interventi.map((r) => [
    dataIt(r.data),
    r.inizio,
    r.fine,
    r.viaggioMinuti ? durata(r.viaggioMinuti) : '',
    durata(r.minuti),
    TIPOLOGIA_INTERVENTO_LABEL[r.tipologia],
  ]);
  if (righeI.length > 1) righeI.push(['', '', '', '', durata(d.rapporto.minutiTotali), 'Totale']);
  y = tabella(colI, intestazioneI, righeI, Math.max(4, righeI.length), RIGA);
  font(false, 6.5);
  testo('Tipo intervento: hardware, software, installazione, aggiornamento, configurazione, …', X0, y + 2);
  y += 13;

  // ---- Descrizione attività svolta ----
  font(false, 10.5);
  const hTesto = d.descrizioneAttivita ? doc.heightOfString(d.descrizioneAttivita, { width: LARGHEZZA - 10 }) : 0;
  const hDescr = Math.max(100, hTesto + 12);
  spazio(15 + hDescr);
  cella(X0, y, LARGHEZZA, 15);
  testo('Descrizione attività svolta', X0 + 5, y + 3.5);
  y += 15;
  cella(X0, y, LARGHEZZA, hDescr);
  if (d.descrizioneAttivita) doc.text(d.descrizioneAttivita, X0 + 5, y + 6, { width: LARGHEZZA - 10 });
  y += hDescr + 12;

  // ---- Parti utilizzate ----
  spazio(26 + RIGA * (1 + Math.max(4, d.rapporto.parti.length)));
  font(false, 11);
  testo('PARTI UTILIZZATE:', X0, y);
  y += 12;
  const colP = [97, 184, 81, 54, LARGHEZZA - 416];
  const righeP = d.rapporto.parti.map((p) => [p.codice, p.descrizione, euro(p.prezzoUnitario), quantita(p.quantita), euro(p.totale)]);
  y = tabella(colP, ['Numero parte', 'Descrizione', 'Costo unitario', 'Quantità', 'Costo totale'], righeP, Math.max(4, righeP.length), RIGA);
  y += 14;

  // ---- Nome tecnico e importi ----
  spazio(52);
  const wTec = 218;
  cella(X0, y, wTec, 15);
  font(false, 10.5);
  testo('Nome Tecnico', X0 + 5, y + 3.5);
  cella(X0, y + 15, wTec, 36);
  font(false, 10.5);
  testo(d.tecnico, X0 + 5, y + 20, { width: wTec - 10, ellipsis: true });
  const ft = d.rapporto.firme.tecnico;
  if (ft) {
    try {
      doc.image(immagineFirma(ft.immagine), X0 + wTec - 95, y + 17, { fit: [90, 32] });
    } catch {
      /* immagine non leggibile: resta il nome */
    }
  }
  const xi = 292;
  const wi1 = 159;
  const wi2 = X1 - xi - wi1;
  cella(xi, y, wi1, 15);
  cella(xi + wi1, y, wi2, 15);
  testo('Importo totale parti utilizzate', xi + 5, y + 3.5);
  testo(d.rapporto.totaleParti ? euro(d.rapporto.totaleParti) : '€', xi + wi1 + 5, y + 3.5, { width: wi2 - 10, align: 'right' });
  cella(xi, y + 15, wi1, 36);
  cella(xi + wi1, y + 15, wi2, 36);
  font(true, 10.5);
  testo('Importo totale intervento', xi + 5, y + 19);
  testo(euro(d.rapporto.importoTotale), xi + wi1 + 5, y + 19, { width: wi2 - 10, align: 'right' });
  y += 51 + 13;

  // ---- Note ----
  font(false, 10.5);
  const hNoteTesto = d.rapporto.note ? doc.heightOfString(d.rapporto.note, { width: LARGHEZZA - 10 }) : 0;
  const hNote = Math.max(54, hNoteTesto + 12);
  spazio(13 + hNote + 12 + 64);
  testo('NOTE', X0, y);
  y += 13;
  cella(X0, y, LARGHEZZA, hNote);
  if (d.rapporto.note) doc.text(d.rapporto.note, X0 + 5, y + 6, { width: LARGHEZZA - 10 });
  y += hNote + 12;

  // ---- Responsabile cliente / Timbro e firma ----
  const wr = 221;
  const wg = 44;
  const wf = LARGHEZZA - wr - wg;
  const xf = X0 + wr + wg;
  cella(X0, y, wr, 15);
  cella(X0 + wr, y, wg, 15);
  cella(xf, y, wf, 15);
  testo('Responsabile cliente', X0 + 5, y + 3.5);
  testo('Timbro e Firma', xf + 5, y + 3.5);
  cella(X0, y + 15, wr, 34);
  cella(X0 + wr, y + 15, wg, 34);
  cella(xf, y + 15, wf, 34);
  cella(X0, y + 49, wr, 15);
  cella(X0 + wr, y + 49, wg, 15);
  cella(xf, y + 49, wf, 15);
  const fc = d.rapporto.firme.cliente;
  if (fc) {
    testo(fc.nome, X0 + 5, y + 26, { width: wr - 10, ellipsis: true });
    try {
      doc.image(immagineFirma(fc.immagine), xf + 5, y + 16, { fit: [wf - 10, 32] });
    } catch {
      /* immagine non leggibile */
    }
    font(false, 8.5);
    testo(`Firmato il ${new Date(fc.data).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' })}`, xf + 5, y + 53);
  }

  doc.end();
  return fine;

  /** Tabella con intestazione e righe (vuote se mancano dati), come nel modulo. Restituisce la y finale. */
  function tabella(colonne: number[], intestazione: string[], righe: string[][], quante: number, h: number): number {
    let yy = y;
    const riga = (valori: string[], grassetto: boolean) => {
      let x = X0;
      font(grassetto, 10);
      colonne.forEach((w, i) => {
        cella(x, yy, w, h);
        const v = valori[i] ?? '';
        if (v) testo(v, x + 4, yy + 3.5, { width: w - 8, ellipsis: true });
        x += w;
      });
      yy += h;
    };
    riga(intestazione, false);
    for (let i = 0; i < quante; i++) riga(righe[i] ?? [], righe[i]?.[colonne.length - 1] === 'Totale');
    return yy;
  }
}

/** Raccoglie dal database i dati per il PDF di un ticket. */
export async function pdfDelTicket(id: unknown): Promise<{ numero: string; pdf: Buffer } | null> {
  const { TicketModel, AziendaModel, UtenteModel } = await import('../models/index.js');
  const { rapportoDTO } = await import('./rapporto.js');
  const t = await TicketModel.findById(id).lean();
  if (!t) return null;
  const [a, tec] = await Promise.all([
    AziendaModel.findById(t.aziendaId, { nome: 1, ragioneSociale: 1, sede: 1, partitaIva: 1, tipo: 1 }).lean(),
    t.tecnicoId ? UtenteModel.findById(t.tecnicoId, { nome: 1, cognome: 1 }).lean() : null,
  ]);
  const pdf = await creaPdfRapporto({
    numero: t.numero,
    cliente: {
      nome: a?.nome ?? '',
      ragioneSociale: a?.ragioneSociale ?? '',
      sede: a?.sede ?? '',
      partitaIva: a?.partitaIva ?? '',
      privato: a?.tipo === 'privato',
    },
    tipoApparato: t.tipoApparato as TipoApparato,
    marcaModello: t.marcaModello ?? '',
    seriale: t.seriale ?? '',
    descrizioneAttivita: t.soluzione ?? '',
    // senza tecnico assegnato vale il nome di chi ha firmato come tecnico
    tecnico: tec ? `${tec.nome} ${tec.cognome}` : (t.rapporto?.firmaTecnico?.nome ?? ''),
    rapporto: rapportoDTO(t.rapporto),
  });
  return { numero: t.numero, pdf };
}
