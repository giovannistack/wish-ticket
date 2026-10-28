import type { Types } from 'mongoose';
import {
  MODALITA_LABEL,
  PRIORITA_LABEL,
  STATO_TICKET_LABEL,
  type EventoStoricoDTO,
  type Modalita,
  type NotaDTO,
  type Priorita,
  type StatoTicket,
  type TicketAdminDTO,
} from '@wish/shared';
import { CAMPI_CLIENTE, NotaModel, StoricoModel, TicketModel } from '../models/index.js';
import { ticketDTO } from './dto.js';
import { elencoAllegati } from './allegati.js';

/** "Azienda: MODO SPA" oppure "Cliente privato: Mario Rossi", per le email. */
export const etichettaCliente = (a: unknown) => {
  const c = a as { nome?: string; tipo?: string } | null;
  return `${c?.tipo === 'privato' ? 'Cliente privato' : 'Azienda'}: ${c?.nome ?? ''}`;
};

/** Eventi dello storico che anche il cliente può vedere. */
export const AZIONI_PUBBLICHE = ['creato', 'stato', 'assegnato', 'contratto', 'allegato'];

const nomeDi = (u: unknown) => {
  const p = u as { nome?: string; cognome?: string } | null;
  return p ? `${p.nome ?? ''} ${p.cognome ?? ''}`.trim() : 'Utente rimosso';
};

export const durata = (minuti: number) => {
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

export const testoEvento = {
  creato: () => 'Ticket aperto',
  stato: (da: StatoTicket, a: StatoTicket) => `Stato: ${STATO_TICKET_LABEL[da]} → ${STATO_TICKET_LABEL[a]}`,
  assegnato: (tecnico: string | null) => (tecnico ? `Assegnato a ${tecnico}` : 'Assegnazione rimossa'),
  priorita: (da: Priorita, a: Priorita) => `Priorità: ${PRIORITA_LABEL[da].nome} → ${PRIORITA_LABEL[a].nome}`,
  modalita: (a: Modalita | null) => (a ? `Intervento: ${MODALITA_LABEL[a].toLowerCase()}` : 'Modalità di intervento rimossa'),
  tempo: (a: number) => `Tempo registrato: ${durata(a)}`,
  soluzione: () => 'Soluzione aggiornata',
  nota: () => 'Nota interna aggiunta',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function eventoDTO(e: any): EventoStoricoDTO {
  return {
    id: String(e._id),
    azione: e.azione,
    descrizione: e.dettagli?.testo ?? testoEvento.creato(),
    autore: nomeDi(e.autoreId),
    data: new Date(e.createdAt).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notaDTO(n: any): NotaDTO {
  return { id: String(n._id), testo: n.testo, autore: nomeDi(n.autoreId), data: new Date(n.createdAt).toISOString() };
}

export const popolaTicket = <Q extends { populate: (p: string, s: string) => Q }>(q: Q) =>
  q.populate('aziendaId', CAMPI_CLIENTE).populate('richiedenteId', 'nome cognome').populate('tecnicoId', 'nome cognome');

export async function storicoDi(ticketId: Types.ObjectId | string, soloPubblico = false) {
  const filtro: Record<string, unknown> = { ticketId };
  if (soloPubblico) filtro.azione = { $in: AZIONI_PUBBLICHE };
  const eventi = await StoricoModel.find(filtro).sort({ createdAt: 1 }).populate('autoreId', 'nome cognome').lean();
  return eventi.map(eventoDTO);
}

export async function ticketAdmin(id: Types.ObjectId | string): Promise<TicketAdminDTO | null> {
  const t = await popolaTicket(TicketModel.findById(id)).lean();
  if (!t) return null;
  const [note, storico, allegati] = await Promise.all([
    NotaModel.find({ ticketId: id }).sort({ createdAt: 1 }).populate('autoreId', 'nome cognome').lean(),
    storicoDi(id),
    elencoAllegati(id, false),
  ]);
  return { ...ticketDTO(t), tempoMinuti: t.tempoMinuti ?? 0, allegati, note: note.map(notaDTO), storico };
}
