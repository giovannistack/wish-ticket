import type { FastifyInstance } from 'fastify';
import type { Types } from 'mongoose';
import type { MessaggioDTO } from '@wish/shared';
import { MessaggioModel, TicketModel, UtenteModel } from '../models/index.js';
import { etichettaCliente, popolaTicket } from './ticket.js';

const nome = (u: unknown) => {
  const p = u as { nome?: string; cognome?: string } | null;
  return p?.nome ? `${p.nome} ${p.cognome ?? ''}`.trim() : 'Utente rimosso';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const messaggioDTO = (m: any): MessaggioDTO => ({
  id: String(m._id),
  testo: m.testo,
  autore: nome(m.autoreId),
  daWish: !!m.daWish,
  data: new Date(m.createdAt).toISOString(),
});

export async function elencoMessaggi(ticketId: Types.ObjectId | string) {
  const m = await MessaggioModel.find({ ticketId }).sort({ createdAt: 1 }).populate('autoreId', 'nome cognome').lean();
  return m.map(messaggioDTO);
}

/**
 * Salva un messaggio e manda le email:
 * - da Wish → al richiedente, in copia alla casella assistenza e al tecnico assegnato
 * - dal cliente → alla casella assistenza, in copia al tecnico assegnato
 */
export async function inviaMessaggio(app: FastifyInstance, ticketId: Types.ObjectId, autoreId: string, daWish: boolean, testo: string) {
  const t = await popolaTicket(TicketModel.findById(ticketId)).lean();
  if (!t) return;
  await MessaggioModel.create({ ticketId: t._id, aziendaId: (t.aziendaId as { _id: Types.ObjectId })._id, autoreId, daWish, testo });

  const [autore, tecnico, richiedente] = await Promise.all([
    UtenteModel.findById(autoreId, { nome: 1, cognome: 1 }).lean(),
    t.tecnicoId ? UtenteModel.findById((t.tecnicoId as { _id: Types.ObjectId })._id, { email: 1, stato: 1 }).lean() : null,
    UtenteModel.findById((t.richiedenteId as { _id?: Types.ObjectId } | null)?._id, { email: 1, ruolo: 1, stato: 1 }).lean(),
  ]);
  const emailTecnico = tecnico?.stato === 'attivo' ? tecnico.email : '';
  const chi = autore ? `${autore.nome} ${autore.cognome}` : daWish ? 'Wish' : 'Il cliente';
  const base = app.cfg.urlPubblico;
  const cliente = etichettaCliente(t.aziendaId);

  if (daWish) {
    if (!richiedente || richiedente.ruolo === 'admin' || richiedente.stato !== 'attivo') {
      // nessun cliente a cui scrivere (ticket aperto da Wish o utente non più attivo): avvisiamo comunque il team
      await app.mailer.invia({
        a: app.cfg.emailAvvisiAdmin,
        cc: emailTecnico,
        oggetto: `${t.numero}: messaggio registrato (nessun cliente da avvisare)`,
        titolo: `${t.numero} · ${t.oggetto}`,
        paragrafi: [cliente, `${chi} ha scritto:`, testo, 'Il ticket non ha un richiedente attivo: il messaggio è solo nella scheda del ticket.'],
        bottone: { testo: 'Apri il ticket', url: `${base}/admin/ticket/${t._id}` },
      });
      return;
    }
    await app.mailer.invia({
      a: richiedente.email,
      cc: [app.cfg.emailAvvisiAdmin, emailTecnico],
      oggetto: `${t.numero} · ${(t.aziendaId as { nome?: string }).nome}: nuovo messaggio da Wish`,
      titolo: `${t.numero} · ${t.oggetto}`,
      paragrafi: [cliente, `${chi} (Wish) ti ha scritto:`, testo, 'Puoi rispondere dalla scheda del ticket.'],
      bottone: { testo: 'Rispondi dal portale', url: `${base}/ticket/${t._id}` },
    });
  } else {
    await app.mailer.invia({
      a: app.cfg.emailAvvisiAdmin,
      cc: emailTecnico,
      oggetto: `${t.numero} · ${(t.aziendaId as { nome?: string }).nome}: nuovo messaggio dal cliente`,
      titolo: `${t.numero} · ${t.oggetto}`,
      paragrafi: [cliente, `${chi} ha scritto:`, testo],
      bottone: { testo: 'Apri il ticket', url: `${base}/admin/ticket/${t._id}` },
    });
  }
}
