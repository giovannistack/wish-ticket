import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avviaApp, bearer, creaUtenteAttivo, login, ticketDiProva } from './helpers.js';

/** Super admin: unico che gestisce il team ed elimina i ticket. Il suo account non lo tocca nessuno. */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let superTok: string;
let superId: string;
let tecTok: string;
let tecId: string;
let altroId: string;
let ticketId: string;

beforeAll(async () => {
  ctx = await avviaApp();
  const s = await login(ctx.app, 'admin@wishsrl.it');
  superTok = s.token;
  superId = s.res.json().utente.id;
  const crea = (email: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/admin/tecnici', headers: bearer(superTok), payload: { nome: 'Tec', cognome: 'Nico', email, password: 'Tecnico2026' } });
  tecId = (await crea('tec@wishsrl.it')).json().id;
  altroId = (await crea('altro@wishsrl.it')).json().id;
  tecTok = (await login(ctx.app, 'tec@wishsrl.it', 'Tecnico2026')).token;
  const cliente = await creaUtenteAttivo(ctx.app, superTok, 'c@modo.it', String(ctx.aziende.modo._id));
  ticketId = (await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: ticketDiProva('Prova') })).json().id;
});
afterAll(async () => ctx?.chiudi());

describe('super admin', () => {
  it('il login dice chi è super admin', async () => {
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(superTok) });
    expect(me.json().superAdmin).toBe(true);
    const tec = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(tecTok) });
    expect(tec.json().superAdmin).toBe(false);
  });

  it('un tecnico non può toccare l\'account del super admin', async () => {
    for (const [method, url, payload] of [
      ['PATCH', `/api/admin/tecnici/${superId}`, { password: 'Rubata2026xx' }],
      ['POST', `/api/admin/tecnici/${superId}/disattiva`, undefined],
      ['DELETE', `/api/admin/tecnici/${superId}`, undefined],
    ] as const) {
      const r = await ctx.app.inject({ method, url, headers: bearer(tecTok), payload });
      expect(r.statusCode).toBe(403);
    }
    await login(ctx.app, 'admin@wishsrl.it'); // la password è ancora quella
  });

  it('un tecnico non gestisce gli altri tecnici né ne crea di nuovi', async () => {
    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/tecnici/${altroId}`, headers: bearer(tecTok) });
    expect(del.statusCode).toBe(403);
    const pw = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/tecnici/${altroId}`, headers: bearer(tecTok), payload: { password: 'Altra2026xx' } });
    expect(pw.statusCode).toBe(403);
    const nuovo = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/tecnici',
      headers: bearer(tecTok),
      payload: { nome: 'Nuovo', cognome: 'Tec', email: 'n@wishsrl.it', password: 'Tecnico2026' },
    });
    expect(nuovo.statusCode).toBe(403);
  });

  it('un tecnico può cambiare la propria password', async () => {
    const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/tecnici/${tecId}`, headers: bearer(tecTok), payload: { password: 'MiaNuova2026' } });
    expect(r.statusCode).toBe(200);
    await login(ctx.app, 'tec@wishsrl.it', 'MiaNuova2026');
  });

  it('il super admin non si può disattivare o eliminare, neanche da solo', async () => {
    const r = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/tecnici/${superId}`, headers: bearer(superTok) });
    expect(r.statusCode).toBe(403);
  });

  it('solo il super admin elimina i ticket', async () => {
    const tec = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/ticket/${ticketId}`, headers: bearer(tecTok) });
    expect(tec.statusCode).toBe(403);
    expect(tec.json().errore).toMatch(/super admin/);
    const sup = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/ticket/${ticketId}`, headers: bearer(superTok) });
    expect(sup.statusCode).toBe(200);
  });

  it('il super admin gestisce gli altri: disattiva ed elimina', async () => {
    const dis = await ctx.app.inject({ method: 'POST', url: `/api/admin/tecnici/${altroId}/disattiva`, headers: bearer(superTok) });
    expect(dis.statusCode).toBe(200);
    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/tecnici/${altroId}`, headers: bearer(superTok) });
    expect(del.statusCode).toBe(200);
  });

  it('i tecnici continuano a gestire i ticket', async () => {
    const t = await ctx.app.inject({ method: 'GET', url: '/api/admin/ticket', headers: bearer(tecTok) });
    expect(t.statusCode).toBe(200);
  });
});
