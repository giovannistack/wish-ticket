import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketModel } from '../src/models/index.js';
import { avviaApp, bearer, creaUtenteAttivo, EMAIL_AVVISI, login, ticketDiProva } from './helpers.js';

/** Team Wish: altri admin creati a mano, email di assegnazione, eliminazione ticket. */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let admin: string;
let tecnicoId: string;
let cliente: Awaited<ReturnType<typeof creaUtenteAttivo>>;

beforeAll(async () => {
  ctx = await avviaApp();
  admin = (await login(ctx.app, 'admin@wishsrl.it')).token;
  cliente = await creaUtenteAttivo(ctx.app, admin, 'cliente@rgr.it', String(ctx.aziende.rgr._id));
});
afterAll(async () => ctx?.chiudi());

describe('team Wish', () => {
  it('l\'admin crea un tecnico con email e password, che può accedere', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/tecnici',
      headers: bearer(admin),
      payload: { nome: 'Luca', cognome: 'Tecnico', email: 'luca@wishsrl.it', password: 'Tecnico2026' },
    });
    expect(r.statusCode).toBe(201);
    tecnicoId = r.json().id;
    const s = await login(ctx.app, 'luca@wishsrl.it', 'Tecnico2026');
    expect(s.res.json().utente.ruolo).toBe('admin');
    // la password non viaggia per email
    const mail = ctx.app.mailer.posta.find((m) => m.a === 'luca@wishsrl.it');
    expect(mail?.html).not.toContain('Tecnico2026');
  });

  it('non accetta un\'email già usata', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/tecnici',
      headers: bearer(admin),
      payload: { nome: 'Doppio', cognome: 'Xy', email: 'cliente@rgr.it', password: 'Tecnico2026' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('un cliente non può creare tecnici', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/tecnici',
      headers: bearer(cliente.token),
      payload: { nome: 'Hacker', cognome: 'X', email: 'h@x.it', password: 'Tecnico2026' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('assegnare un ticket a un tecnico gli manda una email, in copia alla casella assistenza', async () => {
    const t = await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: ticketDiProva('PC lento') });
    const prima = ctx.app.mailer.posta.length;
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/ticket/${t.json().id}`,
      headers: bearer(admin),
      payload: { tecnicoId },
    });
    expect(r.json().tecnico.nome).toBe('Luca Tecnico');
    const mail = ctx.app.mailer.posta.slice(prima).find((m) => m.a === 'luca@wishsrl.it');
    expect(mail?.oggetto).toMatch(/Ti è stato assegnato TK-/);
    expect(mail?.cc).toBe(EMAIL_AVVISI);
  });

  it('elenca il team con i ticket aperti assegnati', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/api/admin/tecnici/team', headers: bearer(admin) });
    const luca = r.json().find((m: { email: string }) => m.email === 'luca@wishsrl.it');
    expect(luca.ticketAperti).toBe(1);
    expect(r.json().find((m: { io: boolean }) => m.io).email).toBe('admin@wishsrl.it');
  });

  it('cambiare la password di un tecnico chiude le sue sessioni', async () => {
    const s = await login(ctx.app, 'luca@wishsrl.it', 'Tecnico2026');
    await ctx.app.inject({ method: 'PATCH', url: `/api/admin/tecnici/${tecnicoId}`, headers: bearer(admin), payload: { password: 'Nuova2026xx' } });
    const r = await ctx.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { wt_refresh: s.refresh } });
    expect(r.statusCode).toBe(401);
    await login(ctx.app, 'luca@wishsrl.it', 'Nuova2026xx');
  });

  it('non si può eliminare se stessi', async () => {
    const team = await ctx.app.inject({ method: 'GET', url: '/api/admin/tecnici/team', headers: bearer(admin) });
    const io = team.json().find((m: { io: boolean }) => m.io);
    const r = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/tecnici/${io.id}`, headers: bearer(admin) });
    expect(r.statusCode).toBe(403);
  });

  it('eliminare un tecnico lascia i suoi ticket aperti senza assegnazione', async () => {
    const r = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/tecnici/${tecnicoId}`, headers: bearer(admin) });
    expect(r.json().ticketRiassegnare).toBe(1);
    const t = await TicketModel.findOne({ oggetto: 'PC lento' }).lean();
    expect(t?.tecnicoId).toBeNull();
  });
});

describe('eliminazione ticket', () => {
  it('l\'admin elimina un ticket, che sparisce anche per il cliente', async () => {
    const t = await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: ticketDiProva('Da eliminare') });
    const id = t.json().id;
    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/ticket/${id}`, headers: bearer(admin) });
    expect(del.statusCode).toBe(200);
    const visto = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${id}`, headers: bearer(cliente.token) });
    expect(visto.statusCode).toBe(404);
  });

  it('un cliente non può eliminare ticket', async () => {
    const t = await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: ticketDiProva('Resta qui') });
    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/ticket/${t.json().id}`, headers: bearer(cliente.token) });
    expect(del.statusCode).toBe(403);
  });
});
