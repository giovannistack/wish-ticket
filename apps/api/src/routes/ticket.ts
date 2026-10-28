import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { nuovoTicketSchema, STATI_TICKET, STATI_APERTI } from '@wish/shared';
import { AziendaModel, StoricoModel, TicketModel } from '../models/index.js';
import { scoped } from '../plugins/auth.js';
import { valida } from '../lib/valida.js';
import { pdfDelTicket } from '../lib/pdfRapporto.js';
import { nonTrovato } from '../lib/errori.js';
import { ticketDTO } from '../lib/dto.js';
import { popolaTicket, storicoDi } from '../lib/ticket.js';
import { contrattoDTO } from '../lib/contratto.js';
import { creaTicket } from '../lib/creaTicket.js';
import { elencoAllegati, salvaAllegato } from '../lib/allegati.js';

const filtriSchema = z.object({
  stato: z.enum(STATI_TICKET).optional(),
  aperti: z.enum(['1']).optional(),
});

/** Rotte dei clienti: ogni query passa da scoped(req), quindi solo l'azienda dell'utente. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.autentica);

  app.get('/', async (req) => {
    const f = valida(filtriSchema, req.query);
    const filtro: Record<string, unknown> = { ...scoped(req) };
    if (f.stato) filtro.stato = f.stato;
    else if (f.aperti) filtro.stato = { $in: STATI_APERTI };
    const ticket = await popolaTicket(TicketModel.find(filtro).sort({ createdAt: -1 }).limit(300)).lean();
    return ticket.map(ticketDTO);
  });

  app.get<{ Params: { id: string } }>('/:id', async (req) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const t = await popolaTicket(TicketModel.findOne({ _id: req.params.id, ...scoped(req) })).lean();
    // Un ticket di un'altra azienda risponde 404: non si rivela nemmeno che esiste.
    if (!t) throw nonTrovato('Ticket');
    return ticketDTO(t);
  });

  /** Stato del contratto della propria azienda: chiamate rimaste, blocco. */
  app.get('/contratto', async (req) => {
    const az = await AziendaModel.findById(scoped(req).aziendaId, { contratto: 1 }).lean();
    return contrattoDTO(az?.contratto);
  });

  /** Storico visibile al cliente: apertura, cambi di stato, assegnazione. Niente note interne. */
  app.get<{ Params: { id: string } }>('/:id/storico', async (req) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const esiste = await TicketModel.exists({ _id: req.params.id, ...scoped(req) });
    if (!esiste) throw nonTrovato('Ticket');
    return storicoDi(req.params.id, true);
  });

  app.post('/', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req, reply) => {
    const dati = valida(nuovoTicketSchema, req.body);
    const { aziendaId } = scoped(req); // mai dal body
    const t = await creaTicket(app, { dati, aziendaId, richiedenteId: req.utente.id, autoreId: req.utente.id });
    return reply.status(201).send(t);
  });

  // ---------- Allegati ----------

  const ticketDelCliente = async (id: string, req: Parameters<typeof scoped>[0]) => {
    if (!Types.ObjectId.isValid(id)) throw nonTrovato('Ticket');
    const t = await TicketModel.findOne({ _id: id, ...scoped(req) }, { aziendaId: 1, numero: 1, oggetto: 1 }).lean();
    if (!t) throw nonTrovato('Ticket');
    return t;
  };

  /** Rapportino di intervento in PDF: il cliente lo scarica quando il ticket è risolto o chiuso. */
  app.get<{ Params: { id: string } }>('/:id/rapporto.pdf', async (req, reply) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const t = await TicketModel.findOne({ _id: req.params.id, ...scoped(req) }, { stato: 1 }).lean();
    if (!t || (t.stato !== 'risolto' && t.stato !== 'chiuso')) throw nonTrovato('Rapportino');
    const r = await pdfDelTicket(t._id);
    if (!r) throw nonTrovato('Rapportino');
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename="Rapportino-${r.numero}.pdf"`)
      .header('cache-control', 'no-store')
      .send(r.pdf);
  });

  app.get<{ Params: { id: string } }>('/:id/allegati', async (req) => {
    const t = await ticketDelCliente(req.params.id, req);
    return elencoAllegati(t._id, true);
  });

  app.post<{ Params: { id: string } }>(
    '/:id/allegati',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const t = await ticketDelCliente(req.params.id, req);
      const a = await salvaAllegato(app, req, t, { daWish: false, puoNascondere: false });
      await StoricoModel.create({
        ticketId: t._id,
        aziendaId: t.aziendaId,
        autoreId: req.utente.id,
        azione: 'allegato',
        dettagli: { testo: `Allegato aggiunto: ${a.nomeOriginale}` },
      });
      return reply.status(201).send(await elencoAllegati(t._id, true));
    },
  );
};

export default routes;
