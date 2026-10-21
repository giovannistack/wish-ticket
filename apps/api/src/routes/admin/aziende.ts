import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { nuovaAziendaSchema, type AziendaConStatsDTO } from '@wish/shared';
import { AziendaModel, TicketModel, UtenteModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { ErroreApi, nonTrovato } from '../../lib/errori.js';
import { aziendaDTO } from '../../lib/dto.js';

const aggiornaSchema = nuovaAziendaSchema.partial().extend({ attiva: z.boolean().optional() });

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);

  app.get('/', async (): Promise<AziendaConStatsDTO[]> => {
    const aziende = await AziendaModel.find().sort({ nome: 1 }).lean();
    return Promise.all(
      aziende.map(async (a) => ({
        ...aziendaDTO(a),
        utentiAttivi: await UtenteModel.countDocuments({ aziendaId: a._id, stato: 'attivo' }),
        ticketAperti: await TicketModel.countDocuments({
          aziendaId: a._id,
          stato: { $in: ['nuovo', 'in_carico', 'in_attesa_cliente'] },
        }),
      })),
    );
  });

  app.post('/', async (req, reply) => {
    const dati = valida(nuovaAziendaSchema, req.body);
    if (await AziendaModel.exists({ nome: dati.nome })) throw new ErroreApi(409, 'Esiste già un\'azienda con questo nome', 'DUPLICATO');
    const a = await AziendaModel.create(dati);
    return reply.status(201).send(aziendaDTO(a));
  });

  app.patch<{ Params: { id: string } }>('/:id', async (req) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Azienda');
    const dati = valida(aggiornaSchema, req.body);
    const a = await AziendaModel.findByIdAndUpdate(req.params.id, { $set: dati }, { returnDocument: 'after' }).lean();
    if (!a) throw nonTrovato('Azienda');
    return aziendaDTO(a);
  });
};

export default routes;
