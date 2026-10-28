import { tipologiaCliente, type AziendaDTO, type RifCliente, type TicketDTO, type UtenteDTO } from '@wish/shared';
import type { Types } from 'mongoose';
import { contrattoDTO } from './contratto.js';

type Ref = { _id: Types.ObjectId; nome?: string; cognome?: string } | Types.ObjectId | null | undefined;

function riferimento(r: Ref, conNome: (o: { nome?: string; cognome?: string }) => string) {
  if (!r) return null;
  if ('_id' in r && r._id) return { id: String(r._id), nome: conNome(r as { nome?: string; cognome?: string }) };
  return { id: String(r), nome: '' };
}

const nomeAzienda = (o: { nome?: string }) => o.nome ?? '';

/** Cliente popolato con CAMPI_CLIENTE → id, nome e tipologia. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rifCliente(a: any): RifCliente | null {
  if (!a) return null;
  if (!a._id) return { id: String(a), nome: '', tipologia: 'senza_contratto' };
  return { id: String(a._id), nome: a.nome ?? '', tipologia: tipologiaCliente(a) };
}
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
    superAdmin: !!u.superAdmin,
    stato: u.stato,
    emailVerificata: !!u.emailVerificata,
    azienda: rifCliente(u.aziendaId),
    aziendaDichiarata: riferimento(u.aziendaDichiarataId, nomeAzienda),
    richiesta: {
      tipo: u.richiesta?.tipo ?? 'esistente',
      denominazione: u.richiesta?.denominazione ?? '',
      partitaIva: u.richiesta?.partitaIva ?? '',
    },
    ultimoAccesso: u.ultimoAccesso ? new Date(u.ultimoAccesso).toISOString() : null,
    createdAt: new Date(u.createdAt).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aziendaDTO(a: any): AziendaDTO {
  return {
    id: String(a._id),
    nome: a.nome,
    tipo: a.tipo === 'privato' ? 'privato' : 'azienda',
    tipologia: tipologiaCliente(a),
    ragioneSociale: a.ragioneSociale ?? '',
    partitaIva: a.partitaIva ?? '',
    sede: a.sede ?? '',
    attiva: !!a.attiva,
    contratto: contrattoDTO(a.contratto),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ticketDTO(t: any): TicketDTO {
  return {
    id: String(t._id),
    numero: t.numero,
    azienda: rifCliente(t.aziendaId)!,
    richiedente: (t.richiedenteId && t.richiedenteId._id) ? riferimento(t.richiedenteId, nomePersona)! : { id: '', nome: 'Utente eliminato' },
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
    tecnico: t.tecnicoId && t.tecnicoId._id ? riferimento(t.tecnicoId, nomePersona) : null,
    modalita: t.modalita ?? null,
    soluzione: t.soluzione ?? '',
    fuoriContratto: !!t.fuoriContratto,
    chiamataScalata: !!t.chiamataScalata,
    chiusoIl: t.chiusoIl ? new Date(t.chiusoIl).toISOString() : null,
    createdAt: new Date(t.createdAt).toISOString(),
    updatedAt: new Date(t.updatedAt).toISOString(),
  };
}
