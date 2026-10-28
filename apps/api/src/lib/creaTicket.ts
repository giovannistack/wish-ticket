import type { FastifyInstance } from 'fastify';
import type { Types } from 'mongoose';
import { PRIORITA_LABEL, type NuovoTicketInput } from '@wish/shared';
import type { z } from 'zod';
import type { nuovoTicketSchema } from '@wish/shared';
import { AziendaModel, StoricoModel, TicketModel, UtenteModel, prossimoNumeroTicket } from '../models/index.js';
import { annullaPrenotazione, prenotaChiamata, registra, type EsitoApertura } from './contratto.js';
import { etichettaCliente, popolaTicket } from './ticket.js';
import { ticketDTO } from './dto.js';

type DatiTicket = z.output<typeof nuovoTicketSchema>;
export type { NuovoTicketInput };

/**
 * Crea un ticket: scala la chiamata dal contratto (o usa uno sblocco), assegna il numero,
 * registra storico e movimento, manda le email. Usata sia dal cliente sia dal super admin.
 */
export async function creaTicket(
  app: FastifyInstance,
  o: {
    dati: DatiTicket;
    aziendaId: Types.ObjectId;
    richiedenteId: Types.ObjectId | string;
    autoreId: string;
    /** Aperto dal team Wish per conto del cliente. */
    daWish?: boolean;
    /** Il super admin lo apre già fuori contratto: nessuna chiamata scalata. */
    fuoriContratto?: boolean;
  },
) {
  const { dati, aziendaId } = o;
  const esito: EsitoApertura = o.fuoriContratto ? { tipo: 'senza_contratto' } : await prenotaChiamata(aziendaId);
  const contratto = { chiamataScalata: esito.tipo === 'scalata', fuoriContratto: esito.tipo !== 'scalata' };

  // Il numero è unico (indice): in caso di collisione si prende il successivo.
  let ticket;
  try {
    for (let tentativo = 0; ; tentativo++) {
      const numero = await prossimoNumeroTicket();
      try {
        ticket = await TicketModel.create({ ...dati, ...contratto, numero, aziendaId, richiedenteId: o.richiedenteId });
        break;
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || tentativo >= 9) throw err;
      }
    }
  } catch (err) {
    await annullaPrenotazione(aziendaId, esito);
    throw err;
  }

  const [azienda, richiedente, autore] = await Promise.all([
    AziendaModel.findById(aziendaId, { nome: 1, tipo: 1 }).lean(),
    UtenteModel.findById(o.richiedenteId, { nome: 1, cognome: 1, email: 1, ruolo: 1 }).lean(),
    UtenteModel.findById(o.autoreId, { nome: 1, cognome: 1 }).lean(),
  ]);
  const nomeAutore = autore ? `${autore.nome} ${autore.cognome}` : 'Wish';
  const testoApertura = o.daWish
    ? `Ticket aperto da ${nomeAutore} (Wish)${richiedente && richiedente.ruolo !== 'admin' ? ` per ${richiedente.nome} ${richiedente.cognome}` : ''}`
    : 'Ticket aperto';
  await StoricoModel.create({ ticketId: ticket._id, aziendaId, autoreId: o.autoreId, azione: 'creato', dettagli: { testo: testoApertura } });
  if (o.daWish && o.fuoriContratto) {
    await StoricoModel.create({ ticketId: ticket._id, aziendaId, autoreId: o.autoreId, azione: 'contratto', dettagli: { testo: 'Aperto fuori contratto' } });
  }

  if (esito.tipo === 'scalata') {
    await registra({ aziendaId, tipo: 'scalata', delta: -1, saldoDopo: esito.saldo, motivo: o.daWish ? 'Apertura ticket (da Wish)' : 'Apertura ticket', autoreId: o.autoreId, ticket });
    if (esito.saldo === 0) {
      await app.mailer.invia({
        a: app.cfg.emailAvvisiAdmin,
        oggetto: `${azienda?.nome}: chiamate del contratto esaurite`,
        titolo: 'Chiamate esaurite',
        paragrafi: [
          `Con il ticket ${ticket.numero}, ${azienda?.nome} ha usato l'ultima chiamata inclusa nel contratto.`,
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
      autoreId: o.autoreId,
      ticket,
    });
  }

  // Avviso al team solo se il ticket arriva dal cliente
  if (!o.daWish) {
    const bloccante = dati.priorita === 'bloccante';
    await app.mailer.invia({
      a: app.cfg.emailAvvisiAdmin,
      oggetto: `${bloccante ? '[BLOCCANTE] ' : ''}${ticket.numero} · ${azienda?.nome}: ${dati.oggetto}`,
      titolo: `Nuovo ticket ${ticket.numero} · ${azienda?.nome}`,
      paragrafi: [
        `${richiedente?.nome} ${richiedente?.cognome} (${azienda?.tipo === 'privato' ? 'cliente privato' : azienda?.nome}) ha aperto un ticket con priorità ${PRIORITA_LABEL[dati.priorita].nome.toLowerCase()}.`,
        dati.oggetto,
        dati.descrizione,
      ],
      bottone: { testo: 'Apri la dashboard', url: `${app.cfg.urlPubblico}/admin` },
    });
  }
  if (richiedente && richiedente.ruolo !== 'admin') {
    await app.mailer.invia({
      a: richiedente.email,
      oggetto: `Ticket ${ticket.numero} ${o.daWish ? 'aperto' : 'ricevuto'} · ${azienda?.nome} · Wish Assistenza`,
      titolo: o.daWish ? `Wish ha aperto per te il ticket ${ticket.numero}` : `Abbiamo ricevuto il ticket ${ticket.numero}`,
      paragrafi: [
        `${etichettaCliente(azienda)} · Richiedente: ${richiedente.nome} ${richiedente.cognome}`,
        `"${dati.oggetto}"`,
        'Il team Wish lo segue e ti avviserà a ogni aggiornamento.',
      ],
      bottone: { testo: 'Vedi il ticket', url: `${app.cfg.urlPubblico}/ticket/${ticket._id}` },
    });
  }

  const completo = await popolaTicket(TicketModel.findById(ticket._id)).lean();
  return ticketDTO(completo);
}
