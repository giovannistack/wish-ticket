import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UtenteModel } from '../src/models/index.js';
import {
  avviaApp,
  bearer,
  cookieRefresh,
  creaUtenteAttivo,
  EMAIL_AVVISI,
  login,
  PASSWORD,
  registra,
  tokenDaEmail,
} from './helpers.js';

let ctx: Awaited<ReturnType<typeof avviaApp>>;
let adminToken: string;

beforeAll(async () => {
  ctx = await avviaApp();
  adminToken = (await login(ctx.app, 'admin@wishsrl.it')).token;
});
afterAll(async () => ctx?.chiudi());

describe('registrazione e attivazione', () => {
  it('crea un utente in attesa, senza azienda confermata, e avvisa utente e admin', async () => {
    const res = await registra(ctx.app, 'nuovo@modo.it', String(ctx.aziende.modo._id));
    expect(res.statusCode).toBe(202);
    const u = await UtenteModel.findOne({ email: 'nuovo@modo.it' }).lean();
    expect(u?.stato).toBe('in_attesa');
    expect(u?.ruolo).toBe('utente');
    expect(u?.aziendaId).toBeNull();
    expect(String(u?.aziendaDichiarataId)).toBe(String(ctx.aziende.modo._id));
    expect(ctx.app.mailer.posta.some((m) => m.a === 'nuovo@modo.it' && m.oggetto.includes('Conferma'))).toBe(true);
    expect(ctx.app.mailer.posta.some((m) => m.a === EMAIL_AVVISI && m.oggetto.includes('Nuova registrazione'))).toBe(true);
  });

  it('non lascia entrare prima dell\'attivazione', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nuovo@modo.it', password: PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().codice).toBe('IN_ATTESA');
  });

  it('non rivela se un\'email è già registrata', async () => {
    const res = await registra(ctx.app, 'nuovo@modo.it', String(ctx.aziende.rgr._id));
    expect(res.statusCode).toBe(202);
    expect(await UtenteModel.countDocuments({ email: 'nuovo@modo.it' })).toBe(1);
  });

  it('ignora ruolo e azienda passati dal client in registrazione', async () => {
    await registra(ctx.app, 'furbo@modo.it', String(ctx.aziende.modo._id), {
      ruolo: 'admin',
      stato: 'attivo',
      aziendaId: String(ctx.aziende.rgr._id),
    });
    const u = await UtenteModel.findOne({ email: 'furbo@modo.it' }).lean();
    expect(u?.ruolo).toBe('utente');
    expect(u?.stato).toBe('in_attesa');
    expect(u?.aziendaId).toBeNull();
  });

  it('rifiuta dati non validi con messaggi in italiano', async () => {
    const res = await registra(ctx.app, 'x@modo.it', String(ctx.aziende.modo._id), { password: 'corta', privacy: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().dettagli.password[0]).toMatch(/almeno 10 caratteri/);
    expect(res.json().dettagli.privacy).toBeDefined();
  });

  it('conferma l\'email con il link e lo invalida dopo l\'uso', async () => {
    const token = tokenDaEmail(ctx.app, 'nuovo@modo.it');
    const ok = await ctx.app.inject({ method: 'POST', url: '/api/auth/verifica-email', payload: { token } });
    expect(ok.statusCode).toBe(200);
    const di_nuovo = await ctx.app.inject({ method: 'POST', url: '/api/auth/verifica-email', payload: { token } });
    expect(di_nuovo.statusCode).toBe(400);
  });

  it('l\'admin attiva con l\'azienda scelta da lui, e il cliente riceve il benvenuto', async () => {
    const u = await UtenteModel.findOne({ email: 'nuovo@modo.it' }).lean();
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/utenti/${u!._id}/attiva`,
      headers: bearer(adminToken),
      payload: { aziendaId: String(ctx.aziende.modo._id), ruolo: 'referente' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stato).toBe('attivo');
    expect(res.json().azienda.nome).toBe('MODO SPA');
    expect(ctx.app.mailer.posta.some((m) => m.a === 'nuovo@modo.it' && m.oggetto.includes('attivo'))).toBe(true);

    const { token } = await login(ctx.app, 'nuovo@modo.it');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) });
    expect(me.json().ruolo).toBe('referente');
    expect(me.json().azienda.nome).toBe('MODO SPA');
  });

  it('l\'admin può rifiutare una richiesta in attesa', async () => {
    const u = await UtenteModel.findOne({ email: 'furbo@modo.it' }).lean();
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/utenti/${u!._id}/rifiuta`,
      headers: bearer(adminToken),
    });
    expect(res.json().stato).toBe('rifiutato');
    const l = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'furbo@modo.it', password: PASSWORD } });
    expect(l.json().codice).toBe('RIFIUTATO');
  });
});

describe('sessioni', () => {
  it('password sbagliata: 401 generico', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nuovo@modo.it', password: 'Sbagliata123' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().codice).toBe('CREDENZIALI');
  });

  it('il refresh ruota il token: quello vecchio non vale più', async () => {
    const { refresh } = await login(ctx.app, 'nuovo@modo.it');
    const r1 = await ctx.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { wt_refresh: refresh } });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().accessToken).toBeTruthy();
    const nuovo = cookieRefresh(r1);
    expect(nuovo).not.toBe(refresh);
    const r2 = await ctx.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { wt_refresh: refresh } });
    expect(r2.statusCode).toBe(401);
  });

  it('un utente disattivato perde l\'accesso subito, anche con un token ancora valido', async () => {
    const utente = await creaUtenteAttivo(ctx.app, adminToken, 'dadisattivare@rgr.it', String(ctx.aziende.rgr._id));
    const prima = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(utente.token) });
    expect(prima.statusCode).toBe(200);

    await ctx.app.inject({ method: 'POST', url: `/api/admin/utenti/${utente.id}/disattiva`, headers: bearer(adminToken) });

    const dopo = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(utente.token) });
    expect(dopo.statusCode).toBe(401);
    const refresh = await ctx.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { wt_refresh: utente.refresh } });
    expect(refresh.statusCode).toBe(401);
  });

  it('il logout revoca il refresh token', async () => {
    const { refresh } = await login(ctx.app, 'nuovo@modo.it');
    await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { wt_refresh: refresh } });
    const r = await ctx.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { wt_refresh: refresh } });
    expect(r.statusCode).toBe(401);
  });

  it('senza token le rotte protette rispondono 401', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/api/ticket' });
    expect(r.statusCode).toBe(401);
  });
});

describe('recupero password', () => {
  it('reimposta la password con il link e chiude le sessioni aperte', async () => {
    const vecchia = await login(ctx.app, 'nuovo@modo.it');
    const r = await ctx.app.inject({ method: 'POST', url: '/api/auth/password-dimenticata', payload: { email: 'nuovo@modo.it' } });
    expect(r.statusCode).toBe(202);
    const token = tokenDaEmail(ctx.app, 'nuovo@modo.it');
    const reset = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'NuovaPassword9' },
    });
    expect(reset.statusCode).toBe(200);
    const refresh = await ctx.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { wt_refresh: vecchia.refresh } });
    expect(refresh.statusCode).toBe(401);
    await login(ctx.app, 'nuovo@modo.it', 'NuovaPassword9');
  });

  it('risponde allo stesso modo per email sconosciute', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/auth/password-dimenticata', payload: { email: 'nessuno@x.it' } });
    expect(r.statusCode).toBe(202);
  });
});
