import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avviaApp, bearer, creaUtenteAttivo, login, ticketDiProva } from './helpers.js';

/**
 * Il test più importante dell'app: ogni azienda vede solo i propri dati.
 * Tre aziende, per ognuna un referente e un dipendente, un ticket a testa.
 */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let adminToken: string;
type Sessione = Awaited<ReturnType<typeof creaUtenteAttivo>>;
const persone: Record<string, Sessione> = {};
const ticket: Record<string, string> = {};

beforeAll(async () => {
  ctx = await avviaApp();
  adminToken = (await login(ctx.app, 'admin@wishsrl.it')).token;
  const az = ctx.aziende;
  const elenco: Array<[string, string, 'referente' | 'utente']> = [
    ['modoRef', String(az.modo._id), 'referente'],
    ['modoDip', String(az.modo._id), 'utente'],
    ['rgrRef', String(az.rgr._id), 'referente'],
    ['rgrDip', String(az.rgr._id), 'utente'],
    ['monRef', String(az.monterano._id), 'referente'],
    ['monDip', String(az.monterano._id), 'utente'],
  ];
  for (const [chi, aziendaId, ruolo] of elenco) {
    persone[chi] = await creaUtenteAttivo(ctx.app, adminToken, `${chi.toLowerCase()}@test.it`, aziendaId, ruolo);
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/api/ticket',
      headers: bearer(persone[chi].token),
      payload: ticketDiProva(`Problema di ${chi}`),
    });
    expect(r.statusCode).toBe(201);
    ticket[chi] = r.json().id;
  }
});
afterAll(async () => ctx?.chiudi());

const elenca = async (chi: string) => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/ticket', headers: bearer(persone[chi].token) });
  expect(r.statusCode).toBe(200);
  return r.json() as Array<{ id: string; azienda: { nome: string }; oggetto: string }>;
};

describe('separazione tra aziende', () => {
  it.each([
    ['modoRef', 'MODO SPA'],
    ['modoDip', 'MODO SPA'],
    ['rgrRef', 'RGR Components S.r.l.'],
    ['rgrDip', 'RGR Components S.r.l.'],
    ['monRef', 'Riserva Naturale Canale Monterano'],
    ['monDip', 'Riserva Naturale Canale Monterano'],
  ])('%s vede solo e tutti i ticket di %s', async (chi, azienda) => {
    const lista = await elenca(chi);
    expect(lista).toHaveLength(2); // il suo e quello del collega
    expect(lista.every((t) => t.azienda.nome === azienda)).toBe(true);
  });

  it('il dipendente vede anche i ticket aperti dal referente della stessa azienda', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticket.modoRef}`, headers: bearer(persone.modoDip.token) });
    expect(r.statusCode).toBe(200);
  });

  it.each([
    ['modoDip', 'rgrRef'],
    ['modoRef', 'monDip'],
    ['rgrDip', 'modoDip'],
    ['monRef', 'rgrDip'],
  ])('%s riceve 404 sul ticket di %s', async (chi, altro) => {
    const r = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticket[altro]}`, headers: bearer(persone[chi].token) });
    expect(r.statusCode).toBe(404);
  });

  it('un id inesistente e un id di un\'altra azienda rispondono allo stesso modo', async () => {
    const altra = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticket.rgrRef}`, headers: bearer(persone.modoDip.token) });
    const inventato = await ctx.app.inject({ method: 'GET', url: '/api/ticket/0123456789abcdef01234567', headers: bearer(persone.modoDip.token) });
    expect(altra.statusCode).toBe(inventato.statusCode);
    expect(altra.json()).toEqual(inventato.json());
  });

  it('l\'azienda del ticket viene dal token, mai dal body', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/api/ticket',
      headers: bearer(persone.modoDip.token),
      payload: { ...ticketDiProva('Tentativo su RGR'), aziendaId: String(ctx.aziende.rgr._id) },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().azienda.nome).toBe('MODO SPA');
    const rgr = await elenca('rgrRef');
    expect(rgr.some((t) => t.oggetto === 'Tentativo su RGR')).toBe(false);
  });

  it('i clienti non accedono alle rotte admin', async () => {
    for (const url of ['/api/admin/ticket', '/api/admin/utenti', '/api/admin/aziende']) {
      const r = await ctx.app.inject({ method: 'GET', url, headers: bearer(persone.modoRef.token) });
      expect(r.statusCode).toBe(403);
    }
  });

  it('l\'admin vede i ticket di tutte le aziende e può filtrare', async () => {
    const tutti = await ctx.app.inject({ method: 'GET', url: '/api/admin/ticket', headers: bearer(adminToken) });
    const nomi = new Set((tutti.json() as Array<{ azienda: { nome: string } }>).map((t) => t.azienda.nome));
    expect(nomi.size).toBe(3);
    const soloRgr = await ctx.app.inject({
      method: 'GET',
      url: `/api/admin/ticket?aziendaId=${ctx.aziende.rgr._id}`,
      headers: bearer(adminToken),
    });
    expect((soloRgr.json() as Array<{ azienda: { nome: string } }>).every((t) => t.azienda.nome === 'RGR Components S.r.l.')).toBe(true);
  });

  it('se l\'admin sposta un utente su un\'altra azienda, vede solo quella e le vecchie sessioni decadono', async () => {
    const chi = await creaUtenteAttivo(ctx.app, adminToken, 'trasferito@test.it', String(ctx.aziende.monterano._id));
    const r = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/utenti/${chi.id}/attiva`,
      headers: bearer(adminToken),
      payload: { aziendaId: String(ctx.aziende.rgr._id), ruolo: 'utente' },
    });
    expect(r.json().azienda.nome).toBe('RGR Components S.r.l.');

    // l'access token ricarica l'azienda dal DB a ogni richiesta
    const lista = await ctx.app.inject({ method: 'GET', url: '/api/ticket', headers: bearer(chi.token) });
    expect((lista.json() as Array<{ azienda: { nome: string } }>).every((t) => t.azienda.nome === 'RGR Components S.r.l.')).toBe(true);
    // il refresh token emesso prima del trasferimento non vale più
    const refresh = await ctx.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { wt_refresh: chi.refresh } });
    expect(refresh.statusCode).toBe(401);
  });

  it('gli admin non usano le rotte cliente', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/api/ticket', headers: bearer(adminToken) });
    expect(r.statusCode).toBe(403);
  });
});

describe('numerazione ticket', () => {
  it('assegna numeri unici anche con aperture contemporanee', async () => {
    const risposte = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ctx.app.inject({
          method: 'POST',
          url: '/api/ticket',
          headers: bearer(persone.rgrDip.token),
          payload: ticketDiProva(`Contemporaneo ${i}`),
        }),
      ),
    );
    const numeri = risposte.map((r) => r.json().numero as string);
    expect(new Set(numeri).size).toBe(10);
    expect(numeri.every((n) => /^TK-\d{4}-\d{4}$/.test(n))).toBe(true);
  });
});
