import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AllegatoModel, StoricoModel, TicketModel, UtenteModel } from '../models/index.js';
import { nonTrovato, vietato } from '../lib/errori.js';
import { allegatoDTO, eliminaFile, inviaFile } from '../lib/allegati.js';
import { valida } from '../lib/valida.js';
import { etichettaCliente, popolaTicket } from '../lib/ticket.js';

const visibilitaSchema = z.object({ visibileCliente: z.boolean() });

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

  /** Wish decide se il cliente vede un allegato. Se lo rende visibile, il cliente viene avvisato. */
  app.patch<{ Params: { id: string } }>('/:id', async (req) => {
    if (req.utente.ruolo !== 'admin') throw vietato();
    const { visibileCliente } = valida(visibilitaSchema, req.body);
    const a = await trova(req.params.id);
    if (!!a.visibileCliente === visibileCliente) return allegatoDTO({ ...a, autoreId: null });
    await AllegatoModel.updateOne({ _id: a._id }, { $set: { visibileCliente } });
    await StoricoModel.create({
      ticketId: a.ticketId,
      aziendaId: a.aziendaId,
      autoreId: req.utente.id,
      azione: visibileCliente ? 'allegato' : 'allegato_interno',
      dettagli: { testo: visibileCliente ? `Allegato reso visibile al cliente: ${a.nomeOriginale}` : `Allegato nascosto al cliente: ${a.nomeOriginale}` },
    });
    if (visibileCliente && a.daWish) {
      const t = await popolaTicket(TicketModel.findById(a.ticketId)).lean();
      const r = t && (await UtenteModel.findById((t.richiedenteId as { _id?: unknown } | null)?._id, { email: 1, ruolo: 1, stato: 1 }).lean());
      if (t && r && r.ruolo !== 'admin' && r.stato === 'attivo') {
        await app.mailer.invia({
          a: r.email,
          oggetto: `${t.numero} · ${(t.aziendaId as { nome?: string }).nome}: nuovo documento da Wish`,
          titolo: `Nuovo documento sul ticket ${t.numero}`,
          paragrafi: [etichettaCliente(t.aziendaId), `Il team Wish ha aggiunto "${a.nomeOriginale}".`, ...(a.nota ? [a.nota] : [])],
          bottone: { testo: 'Vedi il ticket', url: `${app.cfg.urlPubblico}/ticket/${t._id}` },
        });
      }
    }
    const aggiornato = await AllegatoModel.findById(a._id).populate('autoreId', 'nome cognome').lean();
    return allegatoDTO(aggiornato);
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
