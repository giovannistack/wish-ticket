import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UtenteModel } from '../models/index.js';
import { utenteDTO } from '../lib/dto.js';
import { valida } from '../lib/valida.js';
import { nonAutorizzato } from '../lib/errori.js';

const aggiornaProfiloSchema = z.object({
  telefono: z.string().trim().max(30).optional(),
  ufficio: z.string().trim().max(80).optional(),
});

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autentica);

  const carica = async (id: string) => {
    const u = await UtenteModel.findById(id).populate('aziendaId', 'nome').populate('aziendaDichiarataId', 'nome').lean();
    if (!u) throw nonAutorizzato();
    return utenteDTO(u);
  };

  app.get('/me', async (req) => carica(req.utente.id));

  app.patch('/me', async (req) => {
    const dati = valida(aggiornaProfiloSchema, req.body);
    await UtenteModel.updateOne({ _id: req.utente.id }, { $set: dati });
    return carica(req.utente.id);
  });
};

export default routes;
