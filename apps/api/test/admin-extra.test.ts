import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { avviaApp, bearer, creaUtenteAttivo, login, ticketDiProva } from './helpers.js';

/** Ticket aperti dal super admin per conto del cliente, e modifica delle righe del registro. */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let sup: string;
let tec: string;
let modo: string;
let cliente: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let esterno: Awaited<ReturnType<typeof creaUtenteAttivo>>;

const admin = (method: 'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE', url: string, payload?: unknown, token = sup) =>
  ctx.app.inject({ method, url: `/api/admin${url}`, headers: bearer(token), payload: payload as object });
const residue = async () => (await ctx.app.inject({ method: 'GET', url: '/api/ticket/contratto', headers: bearer(cliente.token) })).json().residue as number;

beforeAll(async () => {
  ctx = await avviaApp();
  sup = (await login(ctx.app, 'admin@wishsrl.it')).token;
  await admin('POST', '/tecnici', { nome: 'Tec', cognome: 'Nico', email: 'tec@wishsrl.it', password: 'Tecnico2026' });
  tec = (await login(ctx.app, 'tec@wishsrl.it', 'Tecnico2026')).token;
  modo = String(ctx.aziende.modo._id);
  cliente = await creaUtenteAttivo(ctx.app, sup, 'c@modo.it', modo);
  esterno = await creaUtenteAttivo(ctx.app, sup, 'x@rgr.it', String(ctx.aziende.rgr._id));
  await admin('PUT', `/aziende/${modo}/contratto`, { attivo: true, chiamateAnnue: 2, inizio: '2026-01-01', fine: '2026-12-31' });
});
afterAll(async () => ctx?.chiudi());

describe('ticket aperto dal super admin', () => {
  it('lo apre per un cliente: scala la chiamata e il cliente lo vede e riceve la email', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await admin('POST', '/ticket', { ...ticketDiProva('Aperto da Wish'), aziendaId: modo, richiedenteId: cliente.id });
    expect(r.statusCode).toBe(201);
    expect(r.json().richiedente.nome).toMatch(/Mario/);
    expect(r.json().chiamataScalata).toBe(true);
    expect(await residue()).toBe(1);
    const lista = (await ctx.app.inject({ method: 'GET', url: '/api/ticket', headers: bearer(cliente.token) })).json();
    expect(lista.some((t: { oggetto: string }) => t.oggetto === 'Aperto da Wish')).toBe(true);
    expect(ctx.app.mailer.posta.slice(prima).some((m) => m.a === 'c@modo.it' && /Wish ha aperto per te/.test(m.titolo))).toBe(true);
    const storico = (await admin('GET', `/ticket/${r.json().id}`)).json().storico[0].descrizione;
    expect(storico).toMatch(/aperto da .* \(Wish\) per Mario/);
  });

  it('spuntando "fuori contratto" non scala chiamate', async () => {
    const r = await admin('POST', '/ticket', { ...ticketDiProva('Fuori'), aziendaId: modo, fuoriContratto: true });
    expect(r.json().fuoriContratto).toBe(true);
    expect(await residue()).toBe(1);
  });

  it('a chiamate finite serve "fuori contratto"', async () => {
    await admin('POST', '/ticket', { ...ticketDiProva('Ultima'), aziendaId: modo });
    const ko = await admin('POST', '/ticket', { ...ticketDiProva('Bloccato'), aziendaId: modo });
    expect(ko.json().codice).toBe('CHIAMATE_ESAURITE');
    const ok = await admin('POST', '/ticket', { ...ticketDiProva('Urgente'), aziendaId: modo, fuoriContratto: true });
    expect(ok.statusCode).toBe(201);
  });

  it('il richiedente deve essere della stessa azienda', async () => {
    const r = await admin('POST', '/ticket', { ...ticketDiProva('Prova richiedente'), aziendaId: modo, richiedenteId: esterno.id, fuoriContratto: true });
    expect(r.json().codice).toBe('RICHIEDENTE_NON_VALIDO');
  });

  it('solo il super admin apre ticket per i clienti', async () => {
    const r = await admin('POST', '/ticket', { ...ticketDiProva('X'), aziendaId: modo, fuoriContratto: true }, tec);
    expect(r.statusCode).toBe(403);
  });
});

describe('modifica righe del registro', () => {
  const movimenti = async () => (await admin('GET', `/aziende/${modo}/movimenti`)).json() as Array<{ id: string; tipo: string; delta: number; motivo: string; saldoDopo: number }>;

  it('cambia il numero di una rettifica e aggiorna il saldo', async () => {
    await admin('POST', `/aziende/${modo}/rettifica`, { delta: 3, motivo: 'Bonus' });
    expect(await residue()).toBe(3);
    const m = (await movimenti())[0];
    const r = await admin('PATCH', `/aziende/${modo}/movimenti/${m.id}`, { delta: 1, motivo: 'Bonus corretto' });
    expect(r.json().contratto.residue).toBe(1);
    const dopo = (await movimenti())[0];
    expect(dopo).toMatchObject({ delta: 1, motivo: 'Bonus corretto', saldoDopo: 1 });
  });

  it('può cambiare il numero senza toccare il saldo', async () => {
    const m = (await movimenti())[0];
    await admin('PATCH', `/aziende/${modo}/movimenti/${m.id}`, { delta: 2, aggiornaSaldo: false });
    expect(await residue()).toBe(1);
  });

  it('le righe di un ticket accettano solo il motivo', async () => {
    const scalata = (await movimenti()).find((x) => x.tipo === 'scalata')!;
    const ko = await admin('PATCH', `/aziende/${modo}/movimenti/${scalata.id}`, { delta: 0 });
    expect(ko.json().codice).toBe('LEGATA_A_TICKET');
    const ok = await admin('PATCH', `/aziende/${modo}/movimenti/${scalata.id}`, { motivo: 'Intervento in sede' });
    expect(ok.statusCode).toBe(200);
  });

  it('non porta il saldo sotto zero', async () => {
    const m = (await movimenti()).find((x) => x.motivo === 'Bonus corretto')!;
    const r = await admin('PATCH', `/aziende/${modo}/movimenti/${m.id}`, { delta: -10 });
    expect(r.json().codice).toBe('SALDO_INSUFFICIENTE');
  });

  it('solo il super admin modifica il registro', async () => {
    const m = (await movimenti())[0];
    expect((await admin('PATCH', `/aziende/${modo}/movimenti/${m.id}`, { motivo: 'Hack' }, tec)).statusCode).toBe(403);
  });
});
