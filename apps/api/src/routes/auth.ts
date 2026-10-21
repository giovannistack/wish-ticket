import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import {
  loginSchema,
  passwordDimenticataSchema,
  registrazioneSchema,
  resetPasswordSchema,
  tokenSchema,
  type LoginResponse,
} from '@wish/shared';
import { AziendaModel, RefreshTokenModel, UtenteModel } from '../models/index.js';
import { valida } from '../lib/valida.js';
import { ErroreApi, nonAutorizzato } from '../lib/errori.js';
import { hashToken, tokenCasuale } from '../lib/sicurezza.js';
import { utenteDTO } from '../lib/dto.js';

export const COOKIE_REFRESH = 'wt_refresh';
const MESSAGGIO_REGISTRAZIONE =
  'Richiesta ricevuta. Controlla la tua email: dopo la conferma il team Wish attiverà il tuo account.';

// Hash fittizio: il confronto costa lo stesso tempo anche se l'email non esiste
const HASH_FITTIZIO = bcrypt.hashSync('password-fittizia-per-tempi-costanti', 10);

const routes: FastifyPluginAsync = async (app) => {
  const { cfg, mailer } = app;
  const cookiePath = '/api/auth';

  async function emettiSessione(reply: FastifyReply, utenteId: Types.ObjectId): Promise<LoginResponse> {
    const u = await UtenteModel.findById(utenteId).populate('aziendaId', 'nome').populate('aziendaDichiarataId', 'nome').lean();
    if (!u) throw nonAutorizzato();
    const refresh = tokenCasuale();
    const scadenza = new Date(Date.now() + cfg.refreshTokenGiorni * 86400_000);
    await RefreshTokenModel.create({ utenteId, hash: hashToken(refresh), scadenza });
    reply.setCookie(COOKIE_REFRESH, refresh, {
      httpOnly: true,
      secure: cfg.produzione,
      sameSite: 'strict',
      path: cookiePath,
      expires: scadenza,
    });
    return { accessToken: app.firmaAccesso({ id: String(u._id), ruolo: u.ruolo as LoginResponse['utente']['ruolo'] }), utente: utenteDTO(u) };
  }

  // ---------- Registrazione ----------
  app.post(
    '/registrazione',
    { config: { rateLimit: { max: cfg.limiteRegistrazione, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const dati = valida(registrazioneSchema, req.body);
      const azienda = await AziendaModel.findOne({ _id: dati.aziendaDichiarataId, attiva: true }).lean();
      if (!azienda) throw new ErroreApi(400, 'Seleziona la tua azienda', 'AZIENDA_NON_VALIDA');

      // Stessa risposta anche se l'email esiste già: non si rivela chi è registrato.
      const esistente = await UtenteModel.exists({ email: dati.email });
      if (esistente) return reply.status(202).send({ messaggio: MESSAGGIO_REGISTRAZIONE });

      const tokenVerifica = tokenCasuale();
      const utente = await UtenteModel.create({
        nome: dati.nome,
        cognome: dati.cognome,
        email: dati.email,
        telefono: dati.telefono,
        ufficio: dati.ufficio,
        passwordHash: await bcrypt.hash(dati.password, cfg.bcryptCosto),
        ruolo: 'utente',
        stato: 'in_attesa',
        aziendaId: null,
        aziendaDichiarataId: azienda._id,
        tokenVerificaHash: hashToken(tokenVerifica),
      });

      await mailer.invia({
        a: utente.email,
        oggetto: 'Conferma la tua email · Wish Assistenza',
        titolo: `Ciao ${utente.nome}, conferma la tua email`,
        paragrafi: [
          'Abbiamo ricevuto la tua richiesta di accesso a Wish Assistenza.',
          'Conferma il tuo indirizzo email: poi il team Wish verificherà i dati e attiverà il tuo account. Riceverai una seconda email appena è pronto.',
        ],
        bottone: { testo: 'Conferma email', url: `${cfg.urlPubblico}/verifica-email?token=${tokenVerifica}` },
      });
      await mailer.invia({
        a: cfg.emailAvvisiAdmin,
        oggetto: `Nuova registrazione da attivare: ${utente.nome} ${utente.cognome}`,
        titolo: 'Nuova richiesta di accesso',
        paragrafi: [
          `${utente.nome} ${utente.cognome} (${utente.email}) si è registrato indicando l'azienda ${azienda.nome}.`,
          'Verifica i dati e attiva l\'account dalla pagina Utenti e accessi.',
        ],
        bottone: { testo: 'Apri Utenti e accessi', url: `${cfg.urlPubblico}/admin/utenti` },
      });

      return reply.status(202).send({ messaggio: MESSAGGIO_REGISTRAZIONE });
    },
  );

  app.post('/verifica-email', async (req) => {
    const { token } = valida(tokenSchema, req.body);
    const u = await UtenteModel.findOneAndUpdate(
      { tokenVerificaHash: hashToken(token) },
      { $set: { emailVerificata: true, tokenVerificaHash: null } },
      { returnDocument: 'after' },
    ).lean();
    if (!u) throw new ErroreApi(400, 'Link non valido o già usato', 'TOKEN_NON_VALIDO');
    return { messaggio: 'Email confermata', stato: u.stato };
  });

  // ---------- Accesso ----------
  app.post(
    '/login',
    { config: { rateLimit: { max: cfg.limiteLogin, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { email, password } = valida(loginSchema, req.body);
      const u = await UtenteModel.findOne({ email }, { passwordHash: 1, stato: 1, ruolo: 1, aziendaId: 1 }).lean();
      const ok = await bcrypt.compare(password, u?.passwordHash ?? HASH_FITTIZIO);
      if (!u || !ok) throw new ErroreApi(401, 'Email o password non corretti', 'CREDENZIALI');

      if (u.stato === 'in_attesa')
        throw new ErroreApi(403, 'Il tuo account è in attesa di attivazione da parte di Wish', 'IN_ATTESA');
      if (u.stato === 'rifiutato') throw new ErroreApi(403, 'La richiesta di accesso non è stata approvata', 'RIFIUTATO');
      if (u.stato === 'disattivato') throw new ErroreApi(403, 'Account disattivato. Contatta Wish', 'DISATTIVATO');
      if (u.ruolo !== 'admin' && !u.aziendaId) throw new ErroreApi(403, 'Account senza azienda', 'IN_ATTESA');

      await UtenteModel.updateOne({ _id: u._id }, { $set: { ultimoAccesso: new Date() } });
      return emettiSessione(reply, u._id);
    },
  );

  app.post('/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const token = req.cookies[COOKIE_REFRESH];
    if (!token) throw nonAutorizzato('Nessuna sessione');
    const rt = await RefreshTokenModel.findOne({ hash: hashToken(token) }).lean();
    if (!rt || rt.scadenza < new Date()) throw nonAutorizzato('Sessione scaduta');
    if (rt.revocato) {
      // Token già usato: se non è un doppio refresh ravvicinato, è un possibile furto → si chiudono tutte le sessioni.
      const recente = rt.updatedAt && Date.now() - new Date(rt.updatedAt).getTime() < 60_000;
      if (!recente) await RefreshTokenModel.updateMany({ utenteId: rt.utenteId }, { $set: { revocato: true } });
      throw nonAutorizzato('Sessione scaduta');
    }
    const u = await UtenteModel.findById(rt.utenteId, { stato: 1, ruolo: 1, aziendaId: 1 }).lean();
    if (!u || u.stato !== 'attivo' || (u.ruolo !== 'admin' && !u.aziendaId)) {
      await RefreshTokenModel.updateMany({ utenteId: rt.utenteId }, { $set: { revocato: true } });
      throw nonAutorizzato('Account non attivo');
    }
    await RefreshTokenModel.updateOne({ _id: rt._id }, { $set: { revocato: true } });
    return emettiSessione(reply, u._id);
  });

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[COOKIE_REFRESH];
    if (token) await RefreshTokenModel.updateOne({ hash: hashToken(token) }, { $set: { revocato: true } });
    reply.clearCookie(COOKIE_REFRESH, { path: cookiePath });
    return { ok: true };
  });

  // ---------- Recupero password ----------
  app.post(
    '/password-dimenticata',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { email } = valida(passwordDimenticataSchema, req.body);
      const u = await UtenteModel.findOne({ email, stato: { $in: ['attivo', 'in_attesa'] } });
      if (u) {
        const token = tokenCasuale();
        u.tokenResetHash = hashToken(token);
        u.tokenResetScadenza = new Date(Date.now() + 3600_000);
        await u.save();
        await mailer.invia({
          a: u.email,
          oggetto: 'Reimposta la password · Wish Assistenza',
          titolo: 'Reimposta la tua password',
          paragrafi: [
            'Hai chiesto di reimpostare la password. Il link vale un\'ora.',
            'Se non sei stato tu, ignora questa email: la password attuale resta valida.',
          ],
          bottone: { testo: 'Scegli una nuova password', url: `${cfg.urlPubblico}/reset-password?token=${token}` },
        });
      }
      return reply.status(202).send({ messaggio: 'Se l\'email è registrata riceverai un link per reimpostare la password.' });
    },
  );

  app.post('/reset-password', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const { token, password } = valida(resetPasswordSchema, req.body);
    const u = await UtenteModel.findOne({ tokenResetHash: hashToken(token), tokenResetScadenza: { $gt: new Date() } });
    if (!u) throw new ErroreApi(400, 'Link non valido o scaduto', 'TOKEN_NON_VALIDO');
    u.passwordHash = await bcrypt.hash(password, cfg.bcryptCosto);
    u.tokenResetHash = null;
    u.tokenResetScadenza = null;
    await u.save();
    await RefreshTokenModel.updateMany({ utenteId: u._id }, { $set: { revocato: true } });
    return { messaggio: 'Password aggiornata. Ora puoi accedere.' };
  });
};

export default routes;
