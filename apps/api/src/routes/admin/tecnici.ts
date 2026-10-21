import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import {
  aggiornaTecnicoSchema,
  nuovoTecnicoSchema,
  STATI_APERTI,
  type MembroTeamDTO,
  type TecnicoDTO,
} from '@wish/shared';
import { RefreshTokenModel, StoricoModel, TicketModel, UtenteModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { ErroreApi, nonTrovato, vietato } from '../../lib/errori.js';

/**
 * Team Wish: gli account admin, che sono anche i tecnici a cui si assegnano i ticket.
 * Si creano solo da qui (mai dalla registrazione pubblica).
 */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);

  /** Elenco breve per i menu di assegnazione: solo gli attivi. */
  app.get('/', async (): Promise<TecnicoDTO[]> => {
    const admin = await UtenteModel.find({ ruolo: 'admin', stato: 'attivo' }, { nome: 1, cognome: 1 }).sort({ nome: 1 }).lean();
    return admin.map((a) => ({ id: String(a._id), nome: `${a.nome} ${a.cognome}` }));
  });

  app.get('/team', async (req): Promise<MembroTeamDTO[]> => {
    const admin = await UtenteModel.find({ ruolo: 'admin' }).sort({ stato: 1, nome: 1 }).lean();
    return Promise.all(
      admin.map(async (a) => ({
        id: String(a._id),
        nome: a.nome,
        cognome: a.cognome,
        email: a.email,
        stato: a.stato,
        ultimoAccesso: a.ultimoAccesso ? new Date(a.ultimoAccesso).toISOString() : null,
        ticketAperti: await TicketModel.countDocuments({ tecnicoId: a._id, stato: { $in: STATI_APERTI } }),
        io: String(a._id) === req.utente.id,
      })),
    );
  });

  app.post('/', async (req, reply) => {
    const dati = valida(nuovoTecnicoSchema, req.body);
    if (await UtenteModel.exists({ email: dati.email })) {
      throw new ErroreApi(409, 'Questa email è già usata da un altro account', 'DUPLICATO');
    }
    const u = await UtenteModel.create({
      nome: dati.nome,
      cognome: dati.cognome,
      email: dati.email,
      passwordHash: await bcrypt.hash(dati.password, app.cfg.bcryptCosto),
      ruolo: 'admin',
      stato: 'attivo',
      emailVerificata: true,
    });
    await StoricoModel.create({ autoreId: req.utente.id, azione: 'tecnico_creato', dettagli: { email: u.email } });
    // La password non viaggia per email: la comunica chi crea l'account.
    await app.mailer.invia({
      a: u.email,
      oggetto: 'Il tuo account Wish Assistenza',
      titolo: `Benvenuto nel team, ${u.nome}`,
      paragrafi: [
        'È stato creato il tuo account da tecnico su Wish Assistenza.',
        'Accedi con questa email e la password che ti è stata comunicata. Riceverai una email ogni volta che ti viene assegnato un ticket.',
      ],
      bottone: { testo: 'Accedi', url: `${app.cfg.urlPubblico}/accesso` },
    });
    return reply.status(201).send({ id: String(u._id) });
  });

  const trova = async (id: string) => {
    if (!Types.ObjectId.isValid(id)) throw nonTrovato('Account');
    const u = await UtenteModel.findOne({ _id: id, ruolo: 'admin' });
    if (!u) throw nonTrovato('Account');
    return u;
  };
  const altriAdminAttivi = (id: Types.ObjectId) => UtenteModel.countDocuments({ ruolo: 'admin', stato: 'attivo', _id: { $ne: id } });

  app.patch<{ Params: { id: string } }>('/:id', async (req) => {
    const dati = valida(aggiornaTecnicoSchema, req.body);
    const u = await trova(req.params.id);
    if (dati.nome) u.nome = dati.nome;
    if (dati.cognome) u.cognome = dati.cognome;
    if (dati.password) {
      u.passwordHash = await bcrypt.hash(dati.password, app.cfg.bcryptCosto);
      // Una nuova password chiude le sessioni aperte, tranne se la cambi a te stesso
      if (String(u._id) !== req.utente.id) await RefreshTokenModel.updateMany({ utenteId: u._id }, { $set: { revocato: true } });
    }
    await u.save();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/:id/disattiva', async (req) => {
    const u = await trova(req.params.id);
    if (String(u._id) === req.utente.id) throw vietato('Non puoi disattivare te stesso');
    u.stato = 'disattivato';
    await u.save();
    await RefreshTokenModel.updateMany({ utenteId: u._id }, { $set: { revocato: true } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/:id/riattiva', async (req) => {
    const u = await trova(req.params.id);
    u.stato = 'attivo';
    await u.save();
    return { ok: true };
  });

  /** Elimina un account del team. I suoi ticket aperti tornano "non assegnati". */
  app.delete<{ Params: { id: string } }>('/:id', async (req) => {
    const u = await trova(req.params.id);
    if (String(u._id) === req.utente.id) throw vietato('Non puoi eliminare te stesso');
    if ((await altriAdminAttivi(u._id)) === 0) throw new ErroreApi(409, 'Deve restare almeno un admin attivo', 'ULTIMO_ADMIN');
    const r = await TicketModel.updateMany({ tecnicoId: u._id, stato: { $in: STATI_APERTI } }, { $set: { tecnicoId: null } });
    await RefreshTokenModel.deleteMany({ utenteId: u._id });
    await UtenteModel.deleteOne({ _id: u._id });
    await StoricoModel.create({ autoreId: req.utente.id, azione: 'tecnico_eliminato', dettagli: { email: u.email } });
    return { ok: true, ticketRiassegnare: r.modifiedCount };
  });
};

export default routes;
