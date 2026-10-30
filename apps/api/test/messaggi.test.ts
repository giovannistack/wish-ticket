import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avviaApp, bearer, creaUtenteAttivo, EMAIL_AVVISI, login, ticketDiProva } from './helpers.js';

/** Conversazione tra Wish e il cliente dentro il ticket. */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let admin: string;
let cliente: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let collega: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let esterno: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let tecnicoId: string;
let ticketId: string;

const dalWish = (testo: string, token = admin) =>
  ctx.app.inject({ method: 'POST', url: `/api/admin/ticket/${ticketId}/messaggi`, headers: bearer(token), payload: { testo } });
const dalCliente = (testo: string, token = cliente.token) =>
  ctx.app.inject({ method: 'POST', url: `/api/ticket/${ticketId}/messaggi`, headers: bearer(token), payload: { testo } });

beforeAll(async () => {
  ctx = await avviaApp();
  admin = (await login(ctx.app, 'admin@wishsrl.it')).token;
  cliente = await creaUtenteAttivo(ctx.app, admin, 'cliente@modo.it', String(ctx.aziende.modo._id));
  collega = await creaUtenteAttivo(ctx.app, admin, 'collega@modo.it', String(ctx.aziende.modo._id));
  esterno = await creaUtenteAttivo(ctx.app, admin, 'esterno@rgr.it', String(ctx.aziende.rgr._id));
  const tec = await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/tecnici',
    headers: bearer(admin),
    payload: { nome: 'Luca', cognome: 'Tecnico', email: 'luca@wishsrl.it', password: 'Password123' },
  });
  tecnicoId = tec.json().id;
  const r = await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: ticketDiProva('Server lento') });
  ticketId = r.json().id;
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/ticket/${ticketId}`, headers: bearer(admin), payload: { tecnicoId } });
});
afterAll(async () => ctx?.chiudi());

describe('messaggi', () => {
  it('Wish scrive: email al cliente, in copia alla casella assistenza e al tecnico', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await dalWish('Domani alle 10 passiamo a sostituire il disco.');
    expect(r.statusCode).toBe(201);
    expect(r.json().messaggi).toHaveLength(1);
    expect(r.json().messaggi[0]).toMatchObject({ daWish: true, autore: 'Admin Wish' });
    const mail = ctx.app.mailer.posta.slice(prima).find((m) => m.a === 'cliente@modo.it');
    expect(mail?.cc).toEqual([EMAIL_AVVISI, 'luca@wishsrl.it']);
    expect(mail?.paragrafi).toContain('Domani alle 10 passiamo a sostituire il disco.');
    expect(mail?.oggetto).toContain('nuovo messaggio da Wish');
  });

  it('il cliente e i colleghi della stessa azienda leggono la conversazione', async () => {
    for (const token of [cliente.token, collega.token]) {
      const r = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/messaggi`, headers: bearer(token) });
      expect(r.json().map((m: { testo: string }) => m.testo)).toEqual(['Domani alle 10 passiamo a sostituire il disco.']);
    }
  });

  it('il cliente risponde: email alla casella assistenza, in copia al tecnico', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await dalCliente('Va bene, vi aspettiamo.');
    expect(r.statusCode).toBe(201);
    expect(r.json().map((m: { daWish: boolean }) => m.daWish)).toEqual([true, false]);
    const mail = ctx.app.mailer.posta.slice(prima).find((m) => m.a === EMAIL_AVVISI);
    expect(mail?.cc).toEqual(['luca@wishsrl.it']);
    expect(mail?.paragrafi).toContain('Va bene, vi aspettiamo.');
  });

  it("un cliente di un'altra azienda non legge né scrive", async () => {
    const leggi = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/messaggi`, headers: bearer(esterno.token) });
    expect(leggi.statusCode).toBe(404);
    expect((await dalCliente('Ciao', esterno.token)).statusCode).toBe(404);
  });

  it('i clienti non usano la rotta di Wish', async () => {
    expect((await dalWish('finto', cliente.token)).statusCode).toBe(403);
  });

  it('i messaggi non finiscono nelle note interne, e viceversa', async () => {
    await ctx.app.inject({ method: 'POST', url: `/api/admin/ticket/${ticketId}/note`, headers: bearer(admin), payload: { testo: 'Nota riservata' } });
    const t = await ctx.app.inject({ method: 'GET', url: `/api/admin/ticket/${ticketId}`, headers: bearer(admin) });
    expect(t.json().note.map((n: { testo: string }) => n.testo)).toEqual(['Nota riservata']);
    const c = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/messaggi`, headers: bearer(cliente.token) });
    expect(c.json().some((m: { testo: string }) => m.testo === 'Nota riservata')).toBe(false);
  });

  it('a ticket chiuso il cliente non scrive più', async () => {
    await ctx.app.inject({ method: 'PATCH', url: `/api/admin/ticket/${ticketId}`, headers: bearer(admin), payload: { stato: 'chiuso', soluzione: 'Disco sostituito.' } });
    const r = await dalCliente('Un altro problema');
    expect(r.statusCode).toBe(409);
  });

  it('il messaggio vuoto non si invia', async () => {
    expect((await dalWish('   ')).statusCode).toBe(400);
  });
});
