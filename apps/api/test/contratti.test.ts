import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AziendaModel } from '../src/models/index.js';
import { avviaApp, bearer, creaUtenteAttivo, EMAIL_AVVISI, login, ticketDiProva } from './helpers.js';

/** Contratti annuali: chiamate scalate in automatico, blocco a zero, sblocco, fuori contratto, registro. */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let sup: string;
let tec: string;
let modo: string;
let rgr: string;
let cliente: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let clienteRgr: Awaited<ReturnType<typeof creaUtenteAttivo>>;
const ticket: string[] = [];

const apri = (oggetto: string, token = cliente.token) =>
  ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(token), payload: ticketDiProva(oggetto) });
const contratto = async (token = cliente.token) =>
  (await ctx.app.inject({ method: 'GET', url: '/api/ticket/contratto', headers: bearer(token) })).json();
const admin = (method: 'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE', url: string, payload?: unknown, token = sup) =>
  ctx.app.inject({ method, url: `/api/admin${url}`, headers: bearer(token), payload: payload as object });

beforeAll(async () => {
  ctx = await avviaApp();
  sup = (await login(ctx.app, 'admin@wishsrl.it')).token;
  await admin('POST', '/tecnici', { nome: 'Tec', cognome: 'Nico', email: 'tec@wishsrl.it', password: 'Tecnico2026' });
  tec = (await login(ctx.app, 'tec@wishsrl.it', 'Tecnico2026')).token;
  modo = String(ctx.aziende.modo._id);
  rgr = String(ctx.aziende.rgr._id);
  cliente = await creaUtenteAttivo(ctx.app, sup, 'c@modo.it', modo);
  clienteRgr = await creaUtenteAttivo(ctx.app, sup, 'c@rgr.it', rgr);
});
afterAll(async () => ctx?.chiudi());

describe('aziende', () => {
  it('il super admin crea una nuova azienda, che compare nella registrazione', async () => {
    const r = await admin('POST', '/aziende', { nome: 'Nuova Srl', sede: 'Roma' });
    expect(r.statusCode).toBe(201);
    const pubbliche = await ctx.app.inject({ method: 'GET', url: '/api/aziende/pubbliche' });
    expect(pubbliche.json().map((a: { nome: string }) => a.nome)).toContain('Nuova Srl');
  });

  it('un tecnico non crea aziende né tocca i contratti', async () => {
    expect((await admin('POST', '/aziende', { nome: 'Abusiva' }, tec)).statusCode).toBe(403);
    expect((await admin('PUT', `/aziende/${modo}/contratto`, { attivo: true, chiamateAnnue: 99, inizio: '2026-01-01', fine: '2026-12-31' }, tec)).statusCode).toBe(403);
    expect((await admin('POST', `/aziende/${modo}/rettifica`, { delta: 5, motivo: 'regalo' }, tec)).statusCode).toBe(403);
  });
});

describe('contratto e chiamate', () => {
  it('senza contratto i ticket sono fuori contratto e non si blocca nulla', async () => {
    const r = await apri('Senza contratto');
    expect(r.json().fuoriContratto).toBe(true);
    expect(r.json().chiamataScalata).toBe(false);
    expect((await contratto()).attivo).toBe(false);
  });

  it('attivato un contratto da 3 chiamate, il cliente le vede tutte', async () => {
    const r = await admin('PUT', `/aziende/${modo}/contratto`, { attivo: true, chiamateAnnue: 3, inizio: '2026-01-01', fine: '2026-12-31' });
    expect(r.json().contratto.residue).toBe(3);
    const c = await contratto();
    expect(c).toMatchObject({ attivo: true, chiamateAnnue: 3, residue: 3, bloccato: false, fine: '2026-12-31' });
  });

  it('ogni ticket scala una chiamata', async () => {
    for (const n of [1, 2]) {
      const r = await apri(`Chiamata ${n}`);
      expect(r.json().chiamataScalata).toBe(true);
      ticket.push(r.json().id);
    }
    expect((await contratto()).residue).toBe(1);
  });

  it('le chiamate di un\'azienda non toccano le altre', async () => {
    await apri('Ticket RGR', clienteRgr.token);
    expect((await contratto()).residue).toBe(1);
  });

  it('all\'ultima chiamata avvisa l\'admin, poi blocca le richieste', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await apri('Ultima');
    ticket.push(r.json().id);
    expect(ctx.app.mailer.posta.slice(prima).some((m) => m.a === EMAIL_AVVISI && /esaurite/.test(m.oggetto))).toBe(true);
    expect((await contratto()).bloccato).toBe(true);
    const bloccata = await apri('Non passa');
    expect(bloccata.statusCode).toBe(403);
    expect(bloccata.json().codice).toBe('CHIAMATE_ESAURITE');
  });

  it('lo sblocco di emergenza concede N richieste, fuori contratto', async () => {
    await admin('POST', `/aziende/${modo}/sblocco`, { richieste: 1, motivo: 'server fermo' });
    expect((await contratto()).bloccato).toBe(false);
    const r = await apri('Emergenza');
    expect(r.statusCode).toBe(201);
    expect(r.json().fuoriContratto).toBe(true);
    expect((await contratto()).bloccato).toBe(true);
  });

  it('segnare un ticket fuori contratto restituisce la chiamata', async () => {
    const r = await admin('PATCH', `/ticket/${ticket[0]}`, { fuoriContratto: true });
    expect(r.json().fuoriContratto).toBe(true);
    expect(r.json().chiamataScalata).toBe(false);
    expect((await contratto()).residue).toBe(1);
  });

  it('solo il super admin cambia la copertura di un ticket', async () => {
    const r = await admin('PATCH', `/ticket/${ticket[1]}`, { fuoriContratto: true }, tec);
    expect(r.statusCode).toBe(403);
    expect((await contratto()).residue).toBe(1);
  });

  it('riportarlo a contratto scala di nuovo, ma solo se c\'è una chiamata', async () => {
    const ok = await admin('PATCH', `/ticket/${ticket[0]}`, { fuoriContratto: false });
    expect(ok.json().chiamataScalata).toBe(true);
    expect((await contratto()).residue).toBe(0);
    const emergenza = (await ctx.app.inject({ method: 'GET', url: '/api/admin/ticket?q=Emergenza', headers: bearer(sup) })).json()[0];
    const ko = await admin('PATCH', `/ticket/${emergenza.id}`, { fuoriContratto: false });
    expect(ko.json().codice).toBe('NESSUNA_CHIAMATA');
  });

  it('un errore di chiusura non tocca le chiamate', async () => {
    const r = await admin('PATCH', `/ticket/${ticket[1]}`, { fuoriContratto: true, stato: 'risolto' });
    expect(r.statusCode).toBe(400);
    expect((await contratto()).residue).toBe(0);
  });

  it('rettifica manuale con motivo: chiamata abbonata', async () => {
    const r = await admin('POST', `/aziende/${modo}/rettifica`, { delta: 1, motivo: 'Chiamata abbonata' });
    expect(r.json().contratto.residue).toBe(1);
    const troppo = await admin('POST', `/aziende/${modo}/rettifica`, { delta: -5, motivo: 'Errore' });
    expect(troppo.json().codice).toBe('SALDO_INSUFFICIENTE');
  });

  it('eliminare un ticket a contratto restituisce la chiamata', async () => {
    await admin('DELETE', `/ticket/${ticket[1]}`);
    expect((await contratto()).residue).toBe(2);
  });

  it('cambiare le chiamate annue mantiene quelle già usate', async () => {
    // usate finora: 1 (ticket[0]) + 1 (Ultima) = 2 su 3, residue 2 per la rettifica +1 e il ticket eliminato
    const r = await admin('PUT', `/aziende/${modo}/contratto`, { attivo: true, chiamateAnnue: 10, inizio: '2026-01-01', fine: '2026-12-31' });
    expect(r.json().contratto.residue).toBe(9);
  });

  it('il rinnovo riporta le chiamate al massimo e sposta il periodo di un anno', async () => {
    const r = await admin('POST', `/aziende/${modo}/rinnova`, {});
    expect(r.json().contratto).toMatchObject({ residue: 10, inizio: '2027-01-01', fine: '2027-12-31', sblocchi: 0 });
  });

  it('il registro traccia ogni movimento, con ticket, autore e saldo', async () => {
    const m = (await admin('GET', `/aziende/${modo}/movimenti`)).json() as Array<{ tipo: string; ticket: { numero: string } | null; saldoDopo: number; autore: string }>;
    const tipi = m.map((x) => x.tipo);
    for (const t of ['impostazione', 'scalata', 'sblocco', 'sblocco_usato', 'restituita', 'rettifica', 'rinnovo']) expect(tipi).toContain(t);
    expect(m.find((x) => x.tipo === 'scalata')?.ticket?.numero).toMatch(/^TK-/);
    expect(m[0].tipo).toBe('rinnovo'); // dal più recente
    // i tecnici possono consultare il registro
    expect((await admin('GET', `/aziende/${modo}/movimenti`, undefined, tec)).statusCode).toBe(200);
  });

  it('il saldo nel database corrisponde all\'ultimo movimento', async () => {
    const az = await AziendaModel.findById(modo).lean();
    const m = (await admin('GET', `/aziende/${modo}/movimenti`)).json();
    expect(az?.contratto?.residue).toBe(m[0].saldoDopo);
  });

  it('il cliente vede la copertura nello storico del ticket', async () => {
    const s = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticket[0]}/storico`, headers: bearer(cliente.token) });
    const testi = (s.json() as Array<{ descrizione: string }>).map((e) => e.descrizione);
    expect(testi).toContain('Segnato fuori contratto');
    expect(testi).toContain('Riportato a contratto');
  });

  it('il super admin elimina una rettifica e ripristina il saldo', async () => {
    await admin('POST', `/aziende/${modo}/rettifica`, { delta: -2, motivo: 'Errore di battitura' });
    const prima = (await contratto()).residue;
    const m = (await admin('GET', `/aziende/${modo}/movimenti`)).json()[0];
    expect(m.motivo).toBe('Errore di battitura');
    const r = await admin('DELETE', `/aziende/${modo}/movimenti/${m.id}?ripristina=1`);
    expect(r.statusCode).toBe(200);
    expect((await contratto()).residue).toBe(prima + 2);
    const dopo = (await admin('GET', `/aziende/${modo}/movimenti`)).json() as Array<{ id: string }>;
    expect(dopo.some((x) => x.id === m.id)).toBe(false);
  });

  it('eliminare solo la riga lascia il saldo com\'è', async () => {
    await admin('POST', `/aziende/${modo}/rettifica`, { delta: 1, motivo: 'Da togliere dal registro' });
    const prima = (await contratto()).residue;
    const m = (await admin('GET', `/aziende/${modo}/movimenti`)).json()[0];
    await admin('DELETE', `/aziende/${modo}/movimenti/${m.id}`);
    expect((await contratto()).residue).toBe(prima);
  });

  it('annullare la scalata di un ticket restituisce la chiamata e il ticket non conta più', async () => {
    const t = await apri('Da annullare');
    const prima = (await contratto()).residue;
    const m = ((await admin('GET', `/aziende/${modo}/movimenti`)).json() as Array<{ id: string; tipo: string; ticket: { id: string } | null }>).find(
      (x) => x.tipo === 'scalata' && x.ticket?.id === t.json().id,
    )!;
    await admin('DELETE', `/aziende/${modo}/movimenti/${m.id}?ripristina=1`);
    expect((await contratto()).residue).toBe(prima + 1);
    const dett = (await admin('GET', `/ticket/${t.json().id}`)).json();
    expect(dett.chiamataScalata).toBe(false);
    // segnarlo poi fuori contratto non restituisce una seconda volta
    await admin('PATCH', `/ticket/${t.json().id}`, { fuoriContratto: true });
    expect((await contratto()).residue).toBe(prima + 1);
  });

  it('solo il super admin elimina righe del registro', async () => {
    const m = (await admin('GET', `/aziende/${modo}/movimenti`)).json()[0];
    const r = await admin('DELETE', `/aziende/${modo}/movimenti/${m.id}?ripristina=1`, undefined, tec);
    expect(r.statusCode).toBe(403);
  });

  it('non si eliminano righe di un\'altra azienda passando dall\'URL sbagliato', async () => {
    const m = (await admin('GET', `/aziende/${modo}/movimenti`)).json()[0];
    const r = await admin('DELETE', `/aziende/${rgr}/movimenti/${m.id}`);
    expect(r.statusCode).toBe(404);
  });
});
