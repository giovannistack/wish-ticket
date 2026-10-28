import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AziendaModel } from '../src/models/index.js';
import { avviaApp, bearer, creaUtenteAttivo, login, ticketDiProva } from './helpers.js';

/** Rapportino di intervento: righe, parti, importi, firme e PDF. */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let admin: string;
let cliente: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let esterno: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let ticketId: string;

// Una firma vera (PNG) si può passare con FIRMA_PROVA per controllare il PDF a occhio;
// altrimenti basta un PNG con l'intestazione giusta.
const FIRMA_GRANDE = process.env.FIRMA_PROVA
  ? `data:image/png;base64,${process.env.FIRMA_PROVA}`
  : `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 0)]).toString('base64')}`;

const rapporto = {
  interventi: [
    { data: '2026-10-27', inizio: '09:00', fine: '10:30', viaggioMinuti: 30, tipologia: 'hardware' },
    { data: '2026-10-28', inizio: '14:00', fine: '14:45', viaggioMinuti: 0, tipologia: 'configurazione' },
  ],
  parti: [
    { codice: 'HP-59A', descrizione: 'Toner HP 59A originale', quantita: 2, prezzoUnitario: 89.9 },
    { descrizione: 'Cavo di rete Cat6 3 m', quantita: 1, prezzoUnitario: null },
  ],
  importoTotale: 245,
  note: 'Consigliata la sostituzione del rullo entro 6 mesi.',
};

const put = (body: unknown, token = admin) =>
  ctx.app.inject({ method: 'PUT', url: `/api/admin/ticket/${ticketId}/rapporto`, headers: bearer(token), payload: body });
const firma = (chi: string, nome: string, immagine = FIRMA_GRANDE) =>
  ctx.app.inject({ method: 'POST', url: `/api/admin/ticket/${ticketId}/firma`, headers: bearer(admin), payload: { chi, nome, immagine } });

beforeAll(async () => {
  ctx = await avviaApp();
  admin = (await login(ctx.app, 'admin@wishsrl.it')).token;
  await AziendaModel.updateOne({ _id: ctx.aziende.modo._id }, { ragioneSociale: 'MODO S.p.A.', sede: 'Via Tiburtina 100, Roma', partitaIva: '01234567890' });
  cliente = await creaUtenteAttivo(ctx.app, admin, 'cliente@modo.it', String(ctx.aziende.modo._id));
  esterno = await creaUtenteAttivo(ctx.app, admin, 'esterno@rgr.it', String(ctx.aziende.rgr._id));
  const r = await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: { ...ticketDiProva('Stampante ferma'), seriale: 'CNB1234567' } });
  ticketId = r.json().id;
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/ticket/${ticketId}`, headers: bearer(admin), payload: { tecnicoId: (await login(ctx.app, 'admin@wishsrl.it')).res.json().utente.id } });
});
afterAll(async () => ctx?.chiudi());

describe('rapportino', () => {
  it('salva righe e parti e calcola tempo e totali', async () => {
    const r = await put(rapporto);
    expect(r.statusCode).toBe(200);
    const rap = r.json().rapporto;
    expect(rap.interventi.map((i: { minuti: number }) => i.minuti)).toEqual([120, 45]);
    expect(rap.minutiTotali).toBe(165);
    expect(rap.parti[0].totale).toBe(179.8);
    expect(rap.parti[1].totale).toBeNull();
    expect(rap.totaleParti).toBe(179.8);
    expect(rap.importoTotale).toBe(245);
    expect(r.json().tempoMinuti).toBe(165);
  });

  it("rifiuta una riga che finisce prima di iniziare", async () => {
    const r = await put({ ...rapporto, interventi: [{ data: '2026-10-27', inizio: '11:00', fine: '10:00', tipologia: 'software' }] });
    expect(r.statusCode).toBe(400);
  });

  it('i clienti non possono modificare il rapportino', async () => {
    expect((await put(rapporto, cliente.token)).statusCode).toBe(403);
  });

  it('firma del tecnico e del cliente, visibile nello storico del cliente', async () => {
    expect((await firma('tecnico', 'Admin Wish')).statusCode).toBe(200);
    const r = await firma('cliente', 'Mario Bianchi');
    expect(r.statusCode).toBe(200);
    expect(r.json().rapporto.firme.cliente.nome).toBe('Mario Bianchi');
    const s = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/storico`, headers: bearer(cliente.token) });
    expect(s.json().map((e: { descrizione: string }) => e.descrizione)).toContain('Rapportino firmato da Mario Bianchi (cliente)');
  });

  it('una firma che non è un PNG viene rifiutata', async () => {
    const finta = `data:image/png;base64,${Buffer.from('<svg>non sono un png</svg>'.repeat(10)).toString('base64')}`;
    expect((await firma('cliente', 'Mario Bianchi', finta)).statusCode).toBe(400);
  });

  it('salvare lo stesso contenuto non tocca le firme', async () => {
    const r = await put(rapporto);
    expect(r.json().rapporto.firme.cliente).not.toBeNull();
  });

  it('il PDF del rapportino è come il modulo Wish IT', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: `/api/admin/ticket/${ticketId}/rapporto.pdf`, headers: bearer(admin) });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.SALVA_PDF) fs.writeFileSync(process.env.SALVA_PDF, r.rawPayload);
  });

  it('il cliente scarica il PDF solo a ticket risolto, e lo riceve via email', async () => {
    const prima = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/rapporto.pdf`, headers: bearer(cliente.token) });
    expect(prima.statusCode).toBe(404);
    const n = ctx.app.mailer.posta.length;
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/ticket/${ticketId}`,
      headers: bearer(admin),
      payload: { stato: 'risolto', soluzione: 'Sostituito il toner, pulito il rullo, stampa di prova ok.' },
    });
    const mail = ctx.app.mailer.posta.slice(n).find((m) => m.a === 'cliente@modo.it');
    expect(mail?.allegati?.[0]?.nome).toMatch(/^Rapportino-TK-\d{4}-\d{4}\.pdf$/);
    const dopo = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/rapporto.pdf`, headers: bearer(cliente.token) });
    expect(dopo.statusCode).toBe(200);
    const t = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}`, headers: bearer(cliente.token) });
    expect(t.json().rapportoDisponibile).toBe(true);
    if (process.env.SALVA_PDF) fs.writeFileSync(process.env.SALVA_PDF, dopo.rawPayload);
  });

  it("un cliente di un'altra azienda non vede il rapportino", async () => {
    const r = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/rapporto.pdf`, headers: bearer(esterno.token) });
    expect(r.statusCode).toBe(404);
  });

  it('modificare il rapportino dopo la firma annulla le firme', async () => {
    const r = await put({ ...rapporto, importoTotale: 260 });
    expect(r.json().rapporto.firme).toEqual({ cliente: null, tecnico: null });
    const storico = r.json().storico.map((e: { descrizione: string }) => e.descrizione);
    expect(storico).toContain('Firme del rapportino annullate: il contenuto è cambiato');
  });

  it('si può togliere una firma', async () => {
    await firma('cliente', 'Mario Bianchi');
    const r = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/ticket/${ticketId}/firma/cliente`, headers: bearer(admin) });
    expect(r.json().rapporto.firme.cliente).toBeNull();
  });
});

