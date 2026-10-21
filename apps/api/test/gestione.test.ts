import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UtenteModel } from '../src/models/index.js';
import { avviaApp, bearer, creaUtenteAttivo, login, registra, ticketDiProva } from './helpers.js';

/** Fase 3: gestione del ticket da parte di Wish (stato, tecnico, tempi, note interne, storico). */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let admin: string;
let adminId: string;
let cliente: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let collega: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let altraAzienda: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let ticketId: string;

const patch = (body: unknown, token = admin) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/admin/ticket/${ticketId}`, headers: bearer(token), payload: body });

beforeAll(async () => {
  ctx = await avviaApp();
  const s = await login(ctx.app, 'admin@wishsrl.it');
  admin = s.token;
  adminId = s.res.json().utente.id;
  cliente = await creaUtenteAttivo(ctx.app, admin, 'cliente@modo.it', String(ctx.aziende.modo._id));
  collega = await creaUtenteAttivo(ctx.app, admin, 'collega@modo.it', String(ctx.aziende.modo._id));
  altraAzienda = await creaUtenteAttivo(ctx.app, admin, 'esterno@rgr.it', String(ctx.aziende.rgr._id));
  const r = await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: ticketDiProva('Stampante ferma') });
  ticketId = r.json().id;
});
afterAll(async () => ctx?.chiudi());

describe('gestione ticket', () => {
  it('prendere in carico assegna il ticket a chi lo fa e avvisa il cliente', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await patch({ stato: 'in_carico' });
    expect(r.statusCode).toBe(200);
    expect(r.json().stato).toBe('in_carico');
    expect(r.json().tecnico.id).toBe(adminId);
    const mail = ctx.app.mailer.posta.slice(prima).find((m) => m.a === 'cliente@modo.it');
    expect(mail?.oggetto).toMatch(/in carico/);
  });

  it('salva modalità, tempo e priorità e li registra nello storico', async () => {
    const r = await patch({ modalita: 'onsite', tempoMinuti: 90, priorita: 'alta' });
    const t = r.json();
    expect(t.modalita).toBe('onsite');
    expect(t.tempoMinuti).toBe(90);
    expect(t.priorita).toBe('alta');
    const testi = (t.storico as Array<{ descrizione: string }>).map((e) => e.descrizione);
    expect(testi).toContain('Intervento: on-site');
    expect(testi).toContain('Tempo registrato: 1 h 30 min');
    expect(testi).toContain('Priorità: Media → Alta');
  });

  it('non permette di risolvere senza soluzione', async () => {
    const r = await patch({ stato: 'risolto' });
    expect(r.statusCode).toBe(400);
    expect(r.json().codice).toBe('SOLUZIONE_MANCANTE');
  });

  it('risolve con la soluzione e la manda al cliente via email', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await patch({ stato: 'risolto', soluzione: 'Sostituito il toner e pulito il rullo.' });
    expect(r.json().stato).toBe('risolto');
    expect(r.json().chiusoIl).toBeTruthy();
    const mail = ctx.app.mailer.posta.slice(prima).find((m) => m.a === 'cliente@modo.it');
    expect(mail?.paragrafi).toContain('Sostituito il toner e pulito il rullo.');
  });

  it('riaprire un ticket risolto azzera la chiusura', async () => {
    const r = await patch({ stato: 'in_carico' });
    expect(r.json().chiusoIl).toBeNull();
  });

  it('accetta come tecnico solo un admin Wish attivo', async () => {
    const r = await patch({ tecnicoId: cliente.id });
    expect(r.statusCode).toBe(400);
    expect(r.json().codice).toBe('TECNICO_NON_VALIDO');
  });

  it('elenca i tecnici e filtra i ticket assegnati a me', async () => {
    const tec = await ctx.app.inject({ method: 'GET', url: '/api/admin/tecnici', headers: bearer(admin) });
    expect(tec.json()).toHaveLength(1);
    const miei = await ctx.app.inject({ method: 'GET', url: '/api/admin/ticket?tecnicoId=me', headers: bearer(admin) });
    expect(miei.json().map((t: { id: string }) => t.id)).toContain(ticketId);
  });

  it('i clienti non possono modificare i ticket', async () => {
    const r = await patch({ stato: 'chiuso' }, cliente.token);
    expect(r.statusCode).toBe(403);
  });
});

describe('note interne', () => {
  it('l\'admin aggiunge una nota e la vede nel dettaglio', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/ticket/${ticketId}/note`,
      headers: bearer(admin),
      payload: { testo: 'Cliente difficile, chiamare prima di andare.' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().note[0].testo).toBe('Cliente difficile, chiamare prima di andare.');
  });

  it('il cliente non vede note, tempo né eventi interni', async () => {
    const t = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}`, headers: bearer(cliente.token) });
    const corpo = t.body;
    expect(corpo).not.toContain('Cliente difficile');
    expect(t.json().note).toBeUndefined();
    expect(t.json().tempoMinuti).toBeUndefined();

    const s = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/storico`, headers: bearer(cliente.token) });
    const azioni = new Set((s.json() as Array<{ azione: string }>).map((e) => e.azione));
    expect([...azioni].every((a) => ['creato', 'stato', 'assegnato'].includes(a))).toBe(true);
    expect(s.body).not.toContain('Tempo registrato');
  });

  it('il collega della stessa azienda vede lo storico pubblico', async () => {
    const s = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/storico`, headers: bearer(collega.token) });
    expect(s.statusCode).toBe(200);
  });

  it('un\'altra azienda riceve 404 anche sullo storico', async () => {
    const s = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/storico`, headers: bearer(altraAzienda.token) });
    expect(s.statusCode).toBe(404);
  });
});

describe('rifiutati e disattivati', () => {
  it('un rifiutato si può rimettere in attesa e poi attivare', async () => {
    await registra(ctx.app, 'ripensato@modo.it', String(ctx.aziende.modo._id));
    const u = await UtenteModel.findOne({ email: 'ripensato@modo.it' }).lean();
    await ctx.app.inject({ method: 'POST', url: `/api/admin/utenti/${u!._id}/rifiuta`, headers: bearer(admin) });
    const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/utenti/${u!._id}/rimetti-in-attesa`, headers: bearer(admin) });
    expect(r.json().stato).toBe('in_attesa');
    expect(r.json().aziendaDichiarata.nome).toBe('MODO SPA');
  });

  it('un indirizzo rifiutato si può eliminare e registrare di nuovo', async () => {
    await registra(ctx.app, 'spam@esempio.it', String(ctx.aziende.modo._id));
    const u = await UtenteModel.findOne({ email: 'spam@esempio.it' }).lean();
    await ctx.app.inject({ method: 'POST', url: `/api/admin/utenti/${u!._id}/rifiuta`, headers: bearer(admin) });
    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/utenti/${u!._id}`, headers: bearer(admin) });
    expect(del.statusCode).toBe(200);
    await registra(ctx.app, 'spam@esempio.it', String(ctx.aziende.modo._id));
    const nuovo = await UtenteModel.findOne({ email: 'spam@esempio.it' }).lean();
    expect(nuovo?.stato).toBe('in_attesa');
  });

  it('elimina anche un utente attivo con ticket: i ticket restano come "Utente eliminato"', async () => {
    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/utenti/${cliente.id}`, headers: bearer(admin) });
    expect(del.statusCode).toBe(200);
    expect(del.json().ticketConservati).toBe(1);
    const t = await ctx.app.inject({ method: 'GET', url: `/api/admin/ticket/${ticketId}`, headers: bearer(admin) });
    expect(t.json().richiedente.nome).toBe('Utente eliminato');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(cliente.token) });
    expect(me.statusCode).toBe(401);
  });
});
