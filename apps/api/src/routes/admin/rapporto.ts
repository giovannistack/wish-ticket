import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { firmaSchema, minutiRiga, rapportoSchema } from '@wish/shared';
import { StoricoModel, TicketModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { ErroreApi, nonTrovato } from '../../lib/errori.js';
import { ticketAdmin } from '../../lib/ticket.js';
import { impronta, rapportoDTO } from '../../lib/rapporto.js';
import { pdfDelTicket } from '../../lib/pdfRapporto.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Rapportino di intervento: dati, firme e PDF (solo Wish). */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);

  const trova = async (id: string) => {
    if (!Types.ObjectId.isValid(id)) throw nonTrovato('Ticket');
    const t = await TicketModel.findById(id);
    if (!t) throw nonTrovato('Ticket');
    return t;
  };
  const storico = (t: { _id: Types.ObjectId; aziendaId: Types.ObjectId }, autoreId: string, azione: string, testo: string) =>
    StoricoModel.create({ ticketId: t._id, aziendaId: t.aziendaId, autoreId, azione, dettagli: { testo } });

  /** Salva interventi, parti, importo e note. Se il contenuto cambia, le firme già raccolte non valgono più. */
  app.put<{ Params: { id: string } }>('/:id/rapporto', async (req) => {
    const dati = valida(rapportoSchema, req.body);
    const t = await trova(req.params.id);
    const prima = rapportoDTO(t.rapporto);
    t.set('rapporto.interventi', dati.interventi);
    t.set('rapporto.parti', dati.parti);
    t.set('rapporto.importoTotale', dati.importoTotale);
    t.set('rapporto.note', dati.note);
    const dopo = rapportoDTO(t.rapporto);
    if (impronta(prima) === impronta(dopo)) return ticketAdmin(t._id);

    const firmato = !!(prima.firme.cliente || prima.firme.tecnico);
    if (firmato) {
      t.set('rapporto.firmaCliente', null);
      t.set('rapporto.firmaTecnico', null);
    }
    // Il tempo del ticket è la somma delle righe di intervento
    if (dati.interventi.length) t.tempoMinuti = dati.interventi.reduce((s, r) => s + minutiRiga(r), 0);
    await t.save();
    await storico(t, req.utente.id, 'rapporto', 'Rapportino aggiornato');
    if (firmato) await storico(t, req.utente.id, 'firma', 'Firme del rapportino annullate: il contenuto è cambiato');
    return ticketAdmin(t._id);
  });

  /** Firma con il dito del cliente o del tecnico. */
  app.post<{ Params: { id: string } }>('/:id/firma', { bodyLimit: 600_000 }, async (req) => {
    const { chi, nome, immagine } = valida(firmaSchema, req.body);
    const png = Buffer.from(immagine.split(',')[1]!, 'base64');
    if (png.length < 100 || !png.subarray(0, 4).equals(PNG)) throw new ErroreApi(400, 'Firma non valida', 'FIRMA_NON_VALIDA');
    const t = await trova(req.params.id);
    t.set(chi === 'cliente' ? 'rapporto.firmaCliente' : 'rapporto.firmaTecnico', { nome, immagine, data: new Date() });
    await t.save();
    await storico(t, req.utente.id, 'firma', `Rapportino firmato da ${nome} (${chi === 'cliente' ? 'cliente' : 'tecnico'})`);
    return ticketAdmin(t._id);
  });

  app.delete<{ Params: { id: string; chi: string } }>('/:id/firma/:chi', async (req) => {
    if (req.params.chi !== 'cliente' && req.params.chi !== 'tecnico') throw nonTrovato('Firma');
    const t = await trova(req.params.id);
    t.set(req.params.chi === 'cliente' ? 'rapporto.firmaCliente' : 'rapporto.firmaTecnico', null);
    await t.save();
    await storico(t, req.utente.id, 'firma', `Firma del ${req.params.chi} rimossa dal rapportino`);
    return ticketAdmin(t._id);
  });

  app.get<{ Params: { id: string } }>('/:id/rapporto.pdf', async (req, reply) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const r = await pdfDelTicket(req.params.id);
    if (!r) throw nonTrovato('Ticket');
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename="Rapportino-${r.numero}.pdf"`)
      .header('cache-control', 'no-store')
      .send(r.pdf);
  });
};

export default routes;
