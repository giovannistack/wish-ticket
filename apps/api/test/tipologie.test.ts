import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AziendaModel, MovimentoModel, UtenteModel } from '../src/models/index.js';
import { avviaApp, bearer, EMAIL_AVVISI, login, registra, ticketDiProva, tokenDaEmail } from './helpers.js';

/** Clienti con contratto, aziende senza contratto e privati: registrazione, attivazione, separazione. */
let ctx: Awaited<ReturnType<typeof avviaApp>>;
let admin: string;

const iscrivi = (email: string, extra: Record<string, unknown>) => registra(ctx.app, email, 'privato', extra);

/** Conferma email + attivazione con il corpo indicato, poi login. */
async function attiva(email: string, corpo: Record<string, unknown>) {
  await ctx.app.inject({ method: 'POST', url: '/api/auth/verifica-email', payload: { token: tokenDaEmail(ctx.app, email) } });
  const u = await UtenteModel.findOne({ email }).lean();
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/utenti/${u!._id}/attiva`, headers: bearer(admin), payload: corpo });
  return { r, id: String(u!._id) };
}

beforeAll(async () => {
  ctx = await avviaApp();
  admin = (await login(ctx.app, 'admin@wishsrl.it')).token;
});
afterAll(async () => ctx?.chiudi());

describe('registrazione', () => {
  it('il telefono è obbligatorio per tutti', async () => {
    const r = await registra(ctx.app, 'senzatel@modo.it', String(ctx.aziende.modo._id), { telefono: '' });
    expect(r.statusCode).toBe(400);
    expect(r.json().dettagli.telefono).toBeTruthy();
  });

  it('privato: niente azienda, ufficio ignorato', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await iscrivi('mario.privato@gmail.com', { ufficio: 'Casa' });
    expect(r.statusCode).toBe(202);
    const u = await UtenteModel.findOne({ email: 'mario.privato@gmail.com' }).lean();
    expect(u?.richiesta?.tipo).toBe('privato');
    expect(u?.aziendaDichiarataId).toBeNull();
    expect(u?.ufficio).toBe('');
    const avviso = ctx.app.mailer.posta.slice(prima).find((m) => m.a === EMAIL_AVVISI);
    expect(avviso?.oggetto).toContain('(privato)');
    expect(avviso?.paragrafi.join(' ')).toContain('06 1234567');
  });

  it('nuova azienda: denominazione e partita IVA obbligatorie, partita IVA di 11 cifre', async () => {
    const senza = await iscrivi('nuova1@acme.it', { azienda: 'nuova' });
    expect(senza.statusCode).toBe(400);
    expect(Object.keys(senza.json().dettagli)).toEqual(expect.arrayContaining(['denominazione', 'partitaIva']));

    const corta = await iscrivi('nuova1@acme.it', { azienda: 'nuova', denominazione: 'ACME Srl', partitaIva: '123' });
    expect(corta.statusCode).toBe(400);
    expect(corta.json().dettagli.partitaIva).toBeTruthy();

    const prima = ctx.app.mailer.posta.length;
    const ok = await iscrivi('nuova1@acme.it', { azienda: 'nuova', denominazione: 'ACME Srl', partitaIva: 'IT 0123456789 0' });
    expect(ok.statusCode).toBe(202);
    const u = await UtenteModel.findOne({ email: 'nuova1@acme.it' }).lean();
    expect(u?.richiesta).toMatchObject({ tipo: 'nuova', denominazione: 'ACME Srl', partitaIva: '01234567890' });
    const avviso = ctx.app.mailer.posta.slice(prima).find((m) => m.a === EMAIL_AVVISI);
    expect(avviso?.paragrafi.join(' ')).toContain('P.IVA 01234567890');
  });

  it("l'elenco pubblico mostra solo le aziende, mai i privati", async () => {
    await AziendaModel.create({ nome: 'Giulia Bianchi', tipo: 'privato' });
    const r = await ctx.app.inject({ method: 'GET', url: '/api/aziende/pubbliche' });
    const nomi = r.json().map((a: { nome: string }) => a.nome);
    expect(nomi).toContain('MODO SPA');
    expect(nomi).not.toContain('Giulia Bianchi');
  });

  it('non si può dichiarare un cliente privato esistente come propria azienda', async () => {
    const privato = await AziendaModel.findOne({ nome: 'Giulia Bianchi' }).lean();
    const r = await registra(ctx.app, 'furbo@x.it', String(privato!._id));
    expect(r.statusCode).toBe(400);
  });
});

describe('attivazione e tipologie', () => {
  let privatoA: { token: string; id: string };
  let privatoB: { token: string };
  let ticketA: string;

  it('privato: Wish crea il cliente privato a suo nome', async () => {
    const { r } = await attiva('mario.privato@gmail.com', { modo: 'privato' });
    expect(r.statusCode).toBe(200);
    expect(r.json().azienda).toMatchObject({ nome: 'Mario Rossi', tipologia: 'privato' });
    expect(r.json().ruolo).toBe('referente');
    const s = await login(ctx.app, 'mario.privato@gmail.com');
    privatoA = { token: s.token, id: r.json().azienda.id };
  });

  it('un omonimo privato diventa un cliente distinto', async () => {
    await iscrivi('mario.rossi2@libero.it', {});
    const { r } = await attiva('mario.rossi2@libero.it', { modo: 'privato' });
    expect(r.statusCode).toBe(200);
    expect(r.json().azienda.nome).toBe('Mario Rossi (mario.rossi2@libero.it)');
    expect(r.json().azienda.id).not.toBe(privatoA.id);
    privatoB = { token: (await login(ctx.app, 'mario.rossi2@libero.it')).token };
  });

  it('il ticket di un privato è fuori contratto e non scala chiamate', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(privatoA.token), payload: ticketDiProva('PC lento') });
    expect(r.statusCode).toBe(201);
    expect(r.json().fuoriContratto).toBe(true);
    expect(r.json().azienda.tipologia).toBe('privato');
    ticketA = r.json().id;
    expect(await MovimentoModel.countDocuments({ aziendaId: privatoA.id })).toBe(0);
  });

  it('due privati non vedono i ticket uno dell\'altro', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketA}`, headers: bearer(privatoB.token) });
    expect(r.statusCode).toBe(404);
    const elenco = await ctx.app.inject({ method: 'GET', url: '/api/ticket', headers: bearer(privatoB.token) });
    expect(elenco.json()).toHaveLength(0);
  });

  it('le email del ticket di un privato dicono "Cliente privato"', async () => {
    const prima = ctx.app.mailer.posta.length;
    await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(privatoA.token), payload: ticketDiProva('Stampante') });
    const alCliente = ctx.app.mailer.posta.slice(prima).find((m) => m.a === 'mario.privato@gmail.com');
    expect(alCliente?.paragrafi[0]).toMatch(/^Cliente privato: Mario Rossi/);
  });

  it('nuova azienda: Wish la crea senza contratto, con la partita IVA', async () => {
    const { r } = await attiva('nuova1@acme.it', { modo: 'nuova_azienda', nome: 'ACME Srl', partitaIva: '01234567890' });
    expect(r.statusCode).toBe(200);
    expect(r.json().azienda).toMatchObject({ nome: 'ACME Srl', tipologia: 'senza_contratto' });
    expect(r.json().ruolo).toBe('referente');
    const a = await AziendaModel.findOne({ nome: 'ACME Srl' }).lean();
    expect(a).toMatchObject({ tipo: 'azienda', partitaIva: '01234567890' });
  });

  it('una nuova azienda con un nome già presente va associata, non duplicata', async () => {
    await iscrivi('altro@acme.it', { azienda: 'nuova', denominazione: 'ACME Srl', partitaIva: '01234567890' });
    const { r } = await attiva('altro@acme.it', { modo: 'nuova_azienda', nome: 'ACME Srl', partitaIva: '01234567890' });
    expect(r.statusCode).toBe(409);
    const acme = await AziendaModel.findOne({ nome: 'ACME Srl' }).lean();
    const u = await UtenteModel.findOne({ email: 'altro@acme.it' }).lean();
    const ok = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/utenti/${u!._id}/attiva`,
      headers: bearer(admin),
      payload: { modo: 'esistente', aziendaId: String(acme!._id) },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().azienda.nome).toBe('ACME Srl');
  });

  it('elenco clienti e dashboard riportano la tipologia', async () => {
    await ctx.app.inject({
      method: 'PUT',
      url: `/api/admin/aziende/${ctx.aziende.modo._id}/contratto`,
      headers: bearer(admin),
      payload: { attivo: true, chiamateAnnue: 10, inizio: '2026-01-01', fine: '2026-12-31' },
    });
    const aziende = await ctx.app.inject({ method: 'GET', url: '/api/admin/aziende', headers: bearer(admin) });
    const per = Object.fromEntries(aziende.json().map((a: { nome: string; tipologia: string }) => [a.nome, a.tipologia]));
    expect(per).toMatchObject({ 'MODO SPA': 'contratto', 'ACME Srl': 'senza_contratto', 'Mario Rossi': 'privato' });

    const ticket = await ctx.app.inject({ method: 'GET', url: '/api/admin/ticket', headers: bearer(admin) });
    expect(ticket.json().every((t: { azienda: { tipologia: string } }) => t.azienda.tipologia === 'privato')).toBe(true);

    const utenti = await ctx.app.inject({ method: 'GET', url: '/api/admin/utenti', headers: bearer(admin) });
    const acme = utenti.json().find((u: { email: string }) => u.email === 'nuova1@acme.it');
    expect(acme.richiesta).toMatchObject({ tipo: 'nuova', partitaIva: '01234567890' });
    expect(acme.azienda.tipologia).toBe('senza_contratto');
  });

  it('un cliente privato non può avere un contratto a chiamate', async () => {
    const r = await ctx.app.inject({
      method: 'PUT',
      url: `/api/admin/aziende/${privatoA.id}/contratto`,
      headers: bearer(admin),
      payload: { attivo: true, chiamateAnnue: 5, inizio: '2026-01-01', fine: '2026-12-31' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('il super admin crea un cliente privato o un\'azienda con partita IVA dalla pagina Clienti', async () => {
    const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/aziende', headers: bearer(admin), payload: { nome: 'Luca Verdi', tipo: 'privato' } });
    expect(p.statusCode).toBe(201);
    expect(p.json().tipologia).toBe('privato');
    const a = await ctx.app.inject({ method: 'POST', url: '/api/admin/aziende', headers: bearer(admin), payload: { nome: 'Beta Spa', partitaIva: '98765432109' } });
    expect(a.json()).toMatchObject({ tipologia: 'senza_contratto', partitaIva: '98765432109' });
    const errata = await ctx.app.inject({ method: 'POST', url: '/api/admin/aziende', headers: bearer(admin), payload: { nome: 'Gamma', partitaIva: '12' } });
    expect(errata.statusCode).toBe(400);
    // una modifica parziale non tocca tipo e partita IVA
    const mod = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/aziende/${a.json().id}`, headers: bearer(admin), payload: { sede: 'Roma' } });
    expect(mod.json()).toMatchObject({ sede: 'Roma', partitaIva: '98765432109', tipo: 'azienda' });
  });
});
