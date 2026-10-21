import type { AziendaDTO, TicketDTO, UtenteDTO } from '@wish/shared';
import type { Types } from 'mongoose';

type Ref = { _id: Types.ObjectId; nome?: string; cognome?: string } | Types.ObjectId | null | undefined;

function riferimento(r: Ref, conNome: (o: { nome?: string; cognome?: string }) => string) {
  if (!r) return null;
  if ('_id' in r && r._id) return { id: String(r._id), nome: conNome(r as { nome?: string; cognome?: string }) };
  return { id: String(r), nome: '' };
}

const nomeAzienda = (o: { nome?: string }) => o.nome ?? '';
const nomePersona = (o: { nome?: string; cognome?: string }) => `${o.nome ?? ''} ${o.cognome ?? ''}`.trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function utenteDTO(u: any): UtenteDTO {
  return {
    id: String(u._id),
    nome: u.nome,
    cognome: u.cognome,
    email: u.email,
    telefono: u.telefono ?? '',
    ufficio: u.ufficio ?? '',
    ruolo: u.ruolo,
    stato: u.stato,
    emailVerificata: !!u.emailVerificata,
    azienda: riferimento(u.aziendaId, nomeAzienda),
    aziendaDichiarata: riferimento(u.aziendaDichiarataId, nomeAzienda),
    ultimoAccesso: u.ultimoAccesso ? new Date(u.ultimoAccesso).toISOString() : null,
    createdAt: new Date(u.createdAt).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aziendaDTO(a: any): AziendaDTO {
  return {
    id: String(a._id),
    nome: a.nome,
    ragioneSociale: a.ragioneSociale ?? '',
    sede: a.sede ?? '',
    attiva: !!a.attiva,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ticketDTO(t: any): TicketDTO {
  return {
    id: String(t._id),
    numero: t.numero,
    azienda: riferimento(t.aziendaId, nomeAzienda)!,
    richiedente: riferimento(t.richiedenteId, nomePersona)!,
    oggetto: t.oggetto,
    categoria: t.categoria,
    tipoApparato: t.tipoApparato,
    marcaModello: t.marcaModello ?? '',
    seriale: t.seriale ?? '',
    descrizione: t.descrizione,
    priorita: t.priorita,
    stato: t.stato,
    disponibilita: t.disponibilita,
    telefono: t.telefono ?? '',
    tecnico: riferimento(t.tecnicoId, nomePersona),
    modalita: t.modalita ?? null,
    soluzione: t.soluzione ?? '',
    chiusoIl: t.chiusoIl ? new Date(t.chiusoIl).toISOString() : null,
    createdAt: new Date(t.createdAt).toISOString(),
    updatedAt: new Date(t.updatedAt).toISOString(),
  };
}
