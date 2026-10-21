import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { AllegatoModel, StoricoModel } from '../models/index.js';
import { nonTrovato, vietato } from '../lib/errori.js';
import { eliminaFile, inviaFile } from '../lib/allegati.js';

/** File degli allegati: un cliente vede solo quelli visibili della propria azienda, Wish vede tutto. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autentica);

  const trova = async (id: string) => {
    if (!Types.ObjectId.isValid(id)) throw nonTrovato('Allegato');
    const a = await AllegatoModel.findById(id).lean();
    if (!a) throw nonTrovato('Allegato');
    return a;
  };

  app.get<{ Params: { id: string } }>('/:id/file', async (req, reply) => {
    const a = await trova(req.params.id);
    if (req.utente.ruolo !== 'admin') {
      const stessaAzienda = String(a.aziendaId) === String(req.utente.aziendaId);
      if (!stessaAzienda || !a.visibileCliente) throw nonTrovato('Allegato');
    }
    return inviaFile(app, reply, a);
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req) => {
    if (req.utente.ruolo !== 'admin') throw vietato();
    const a = await trova(req.params.id);
    await AllegatoModel.deleteOne({ _id: a._id });
    await eliminaFile(app, a.file);
    await StoricoModel.create({
      ticketId: a.ticketId,
      aziendaId: a.aziendaId,
      autoreId: req.utente.id,
      azione: 'allegato_eliminato',
      dettagli: { testo: `Allegato eliminato: ${a.nomeOriginale}` },
    });
    return { ok: true };
  });
};

export default routes;
