import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { nuovoTicketSchema, PRIORITA_LABEL, STATI_TICKET } from '@wish/shared';
import { AziendaModel, StoricoModel, TicketModel, UtenteModel, prossimoNumeroTicket } from '../models/index.js';
import { scoped } from '../plugins/auth.js';
import { valida } from '../lib/valida.js';
import { nonTrovato } from '../lib/errori.js';
import { ticketDTO } from '../lib/dto.js';
import { popolaTicket, storicoDi } from '../lib/ticket.js';
import { annullaPrenotazione, contrattoDTO, prenotaChiamata, registra } from '../lib/contratto.js';

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
    else if (f.aperti) filtro.stato = { $in: ['nuovo', 'in_carico', 'in_attesa_cliente'] };
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

    // Contratto: scala una chiamata (o usa uno sblocco di emergenza) prima di creare il ticket
    const esito = await prenotaChiamata(aziendaId);
    const contratto = {
      chiamataScalata: esito.tipo === 'scalata',
      fuoriContratto: esito.tipo !== 'scalata',
    };

    // Il numero è unico (indice): in caso di collisione si prende il successivo.
    let ticket;
    try {
      for (let tentativo = 0; ; tentativo++) {
        const numero = await prossimoNumeroTicket();
        try {
          ticket = await TicketModel.create({ ...dati, ...contratto, numero, aziendaId, richiedenteId: req.utente.id });
          break;
        } catch (err) {
          if ((err as { code?: number }).code !== 11000 || tentativo >= 9) throw err;
        }
      }
    } catch (err) {
      await annullaPrenotazione(aziendaId, esito);
      throw err;
    }
    const numero = ticket.numero;
    await StoricoModel.create({ ticketId: ticket._id, aziendaId, autoreId: req.utente.id, azione: 'creato', dettagli: { testo: 'Ticket aperto' } });
    if (esito.tipo === 'scalata') {
      await registra({ aziendaId, tipo: 'scalata', delta: -1, saldoDopo: esito.saldo, motivo: 'Apertura ticket', autoreId: req.utente.id, ticket });
      if (esito.saldo === 0) {
        const az = await AziendaModel.findById(aziendaId, { nome: 1 }).lean();
        await app.mailer.invia({
          a: app.cfg.emailAvvisiAdmin,
          oggetto: `${az?.nome}: chiamate del contratto esaurite`,
          titolo: 'Chiamate esaurite',
          paragrafi: [
            `Con il ticket ${ticket.numero}, ${az?.nome} ha usato l'ultima chiamata inclusa nel contratto.`,
            'Da ora non può aprire nuovi ticket finché non rinnovi il contratto, aggiungi chiamate o concedi uno sblocco di emergenza.',
          ],
          bottone: { testo: 'Apri le aziende', url: `${app.cfg.urlPubblico}/admin/aziende` },
        });
      }
    } else if (esito.tipo === 'sblocco') {
      await registra({
        aziendaId,
        tipo: 'sblocco_usato',
        delta: 0,
        saldoDopo: esito.saldo,
        motivo: `Richiesta di emergenza a chiamate esaurite (sblocchi rimasti: ${esito.sblocchiRimasti})`,
        autoreId: req.utente.id,
        ticket,
      });
    }

    const [azienda, richiedente] = await Promise.all([
      AziendaModel.findById(aziendaId, { nome: 1 }).lean(),
      UtenteModel.findById(req.utente.id, { nome: 1, cognome: 1, email: 1 }).lean(),
    ]);
    const bloccante = dati.priorita === 'bloccante';
    await app.mailer.invia({
      a: app.cfg.emailAvvisiAdmin,
      oggetto: `${bloccante ? '[BLOCCANTE] ' : ''}${numero} · ${azienda?.nome}: ${dati.oggetto}`,
      titolo: `Nuovo ticket ${numero}`,
      paragrafi: [
        `${richiedente?.nome} ${richiedente?.cognome} (${azienda?.nome}) ha aperto un ticket con priorità ${PRIORITA_LABEL[dati.priorita].nome.toLowerCase()}.`,
        dati.oggetto,
        dati.descrizione,
      ],
      bottone: { testo: 'Apri la dashboard', url: `${app.cfg.urlPubblico}/admin` },
    });
    if (richiedente) {
      await app.mailer.invia({
        a: richiedente.email,
        oggetto: `Ticket ${numero} ricevuto · Wish Assistenza`,
        titolo: `Abbiamo ricevuto il ticket ${numero}`,
        paragrafi: [
          `"${dati.oggetto}"`,
          'Il team Wish lo prenderà in carico al più presto. Ti avviseremo a ogni aggiornamento.',
        ],
        bottone: { testo: 'Vedi il ticket', url: `${app.cfg.urlPubblico}/ticket/${ticket._id}` },
      });
    }

    const completo = await popolaTicket(TicketModel.findById(ticket._id)).lean();
    return reply.status(201).send(ticketDTO(completo));
  });
};

export default routes;
