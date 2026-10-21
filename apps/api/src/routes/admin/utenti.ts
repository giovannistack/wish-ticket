import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { attivaUtenteSchema, objectIdSchema, STATI_UTENTE } from '@wish/shared';
import { AziendaModel, RefreshTokenModel, StoricoModel, UtenteModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { ErroreApi, nonTrovato, vietato } from '../../lib/errori.js';
import { utenteDTO } from '../../lib/dto.js';

const filtriSchema = z.object({
  stato: z.enum(STATI_UTENTE).optional(),
  aziendaId: objectIdSchema.optional(),
});

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);

  const trova = async (id: string) => {
    if (!Types.ObjectId.isValid(id)) throw nonTrovato('Utente');
    const u = await UtenteModel.findById(id);
    if (!u) throw nonTrovato('Utente');
    if (u.ruolo === 'admin') throw vietato('Gli account admin non si gestiscono da qui');
    return u;
  };
  const dto = async (id: Types.ObjectId) =>
    utenteDTO(await UtenteModel.findById(id).populate('aziendaId', 'nome').populate('aziendaDichiarataId', 'nome').lean());
  const revocaSessioni = (utenteId: Types.ObjectId) =>
    RefreshTokenModel.updateMany({ utenteId, revocato: false }, { $set: { revocato: true } });

  app.get('/', async (req) => {
    const f = valida(filtriSchema, req.query);
    const filtro: Record<string, unknown> = { ruolo: { $ne: 'admin' } };
    if (f.stato) filtro.stato = f.stato;
    if (f.aziendaId) filtro.aziendaId = new Types.ObjectId(f.aziendaId);
    const utenti = await UtenteModel.find(filtro)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('aziendaId', 'nome')
      .populate('aziendaDichiarataId', 'nome')
      .lean();
    return utenti.map(utenteDTO);
  });

  app.post<{ Params: { id: string } }>('/:id/attiva', async (req) => {
    const { aziendaId, ruolo } = valida(attivaUtenteSchema, req.body);
    const u = await trova(req.params.id);
    const azienda = await AziendaModel.findOne({ _id: aziendaId, attiva: true }).lean();
    if (!azienda) throw new ErroreApi(400, 'Azienda non valida', 'AZIENDA_NON_VALIDA');

    const primaAttivazione = u.stato !== 'attivo';
    const cambioAzienda = !!u.aziendaId && String(u.aziendaId) !== aziendaId;
    u.stato = 'attivo';
    u.aziendaId = azienda._id;
    u.ruolo = ruolo;
    await u.save();
    // Se cambia azienda, le sessioni aperte non devono più valere per i dati della vecchia.
    if (cambioAzienda) await revocaSessioni(u._id);
    await StoricoModel.create({
      aziendaId: azienda._id,
      autoreId: req.utente.id,
      azione: primaAttivazione ? 'utente_attivato' : 'utente_aggiornato',
      dettagli: { utenteId: String(u._id), ruolo },
    });

    if (primaAttivazione) {
      await app.mailer.invia({
        a: u.email,
        oggetto: 'Il tuo account è attivo · Wish Assistenza',
        titolo: `Benvenuto, ${u.nome}!`,
        paragrafi: [
          `Il tuo account per ${azienda.nome} è stato attivato.`,
          'Da ora puoi aprire ticket di assistenza e seguirne lo stato. Riceverai una notifica a ogni aggiornamento.',
        ],
        bottone: { testo: 'Accedi', url: `${app.cfg.urlPubblico}/accesso` },
      });
    }
    return dto(u._id);
  });

  app.post<{ Params: { id: string } }>('/:id/rifiuta', async (req) => {
    const u = await trova(req.params.id);
    if (u.stato !== 'in_attesa') throw new ErroreApi(409, 'Si possono rifiutare solo le richieste in attesa', 'STATO');
    u.stato = 'rifiutato';
    await u.save();
    await StoricoModel.create({ autoreId: req.utente.id, azione: 'utente_rifiutato', dettagli: { utenteId: String(u._id) } });
    await app.mailer.invia({
      a: u.email,
      oggetto: 'Richiesta di accesso · Wish Assistenza',
      titolo: 'Richiesta non approvata',
      paragrafi: [
        'La tua richiesta di accesso a Wish Assistenza non è stata approvata.',
        'Se pensi sia un errore, contatta direttamente il team Wish.',
      ],
    });
    return dto(u._id);
  });

  app.post<{ Params: { id: string } }>('/:id/disattiva', async (req) => {
    const u = await trova(req.params.id);
    if (String(u._id) === req.utente.id) throw vietato('Non puoi disattivare te stesso');
    u.stato = 'disattivato';
    await u.save();
    await revocaSessioni(u._id);
    await StoricoModel.create({
      aziendaId: u.aziendaId,
      autoreId: req.utente.id,
      azione: 'utente_disattivato',
      dettagli: { utenteId: String(u._id) },
    });
    return dto(u._id);
  });
};

export default routes;
