import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { objectIdSchema, PRIORITA, STATI_TICKET } from '@wish/shared';
import { TicketModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { nonTrovato } from '../../lib/errori.js';
import { ticketDTO } from '../../lib/dto.js';

const filtriSchema = z.object({
  aziendaId: objectIdSchema.optional(),
  stato: z.enum(STATI_TICKET).optional(),
  priorita: z.enum(PRIORITA).optional(),
  q: z.string().trim().max(80).optional(),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rotte admin: vedono tutte le aziende. Separate dalle rotte cliente e protette da soloAdmin. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);

  app.get('/', async (req) => {
    const f = valida(filtriSchema, req.query);
    const filtro: Record<string, unknown> = {};
    if (f.aziendaId) filtro.aziendaId = new Types.ObjectId(f.aziendaId);
    if (f.stato) filtro.stato = f.stato;
    if (f.priorita) filtro.priorita = f.priorita;
    if (f.q) {
      const re = new RegExp(escapeRegex(f.q), 'i');
      filtro.$or = [{ numero: re }, { oggetto: re }, { seriale: re }, { marcaModello: re }];
    }
    const ticket = await TicketModel.find(filtro)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('aziendaId', 'nome')
      .populate('richiedenteId', 'nome cognome')
      .lean();
    return ticket.map(ticketDTO);
  });

  app.get<{ Params: { id: string } }>('/:id', async (req) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const t = await TicketModel.findById(req.params.id)
      .populate('aziendaId', 'nome')
      .populate('richiedenteId', 'nome cognome')
      .lean();
    if (!t) throw nonTrovato('Ticket');
    return ticketDTO(t);
  });
};

export default routes;
