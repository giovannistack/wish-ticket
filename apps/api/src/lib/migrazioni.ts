import type { FastifyBaseLogger } from 'fastify';
import { TicketModel } from '../models/index.js';

/**
 * Ottobre 2026: gli stati "Nuovo" e "In carico" diventano un solo stato, "In lavorazione".
 * Idempotente: dopo la prima volta non trova più nulla da cambiare.
 */
export async function unificaStatiAperti(log?: FastifyBaseLogger) {
  const r = await TicketModel.collection.updateMany(
    { stato: { $in: ['nuovo', 'in_carico'] } },
    { $set: { stato: 'in_lavorazione' } },
  );
  if (r.modifiedCount) log?.info({ ticket: r.modifiedCount }, 'Ticket portati allo stato "In lavorazione"');
  return r.modifiedCount;
}
