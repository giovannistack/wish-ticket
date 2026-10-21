import type { Types } from 'mongoose';
import type { ContrattoDTO, MovimentoDTO, TipoMovimento } from '@wish/shared';
import { AziendaModel, MovimentoModel } from '../models/index.js';
import { ErroreApi } from './errori.js';

type Id = Types.ObjectId | string;

const giorno = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function contrattoDTO(c: any): ContrattoDTO {
  const attivo = !!c?.attivo;
  const residue = c?.residue ?? 0;
  const sblocchi = c?.sblocchi ?? 0;
  const fine = c?.fine ? new Date(c.fine) : null;
  return {
    attivo,
    chiamateAnnue: c?.chiamateAnnue ?? 0,
    residue,
    inizio: giorno(c?.inizio),
    fine: giorno(fine),
    sblocchi,
    bloccato: attivo && residue <= 0 && sblocchi <= 0,
    // scaduto dal giorno dopo la data di fine
    scaduto: attivo && !!fine && fine.getTime() + 86_400_000 <= Date.now(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function movimentoDTO(m: any): MovimentoDTO {
  const autore = m.autoreId as { nome?: string; cognome?: string } | null;
  return {
    id: String(m._id),
    tipo: m.tipo,
    delta: m.delta ?? 0,
    saldoDopo: m.saldoDopo,
    motivo: m.motivo ?? '',
    ticket: m.ticketId ? { id: String(m.ticketId), numero: m.ticketNumero ?? '' } : null,
    autore: autore && autore.nome ? `${autore.nome} ${autore.cognome ?? ''}`.trim() : 'Utente rimosso',
    data: new Date(m.createdAt).toISOString(),
  };
}

export async function registra(m: {
  aziendaId: Id;
  tipo: TipoMovimento;
  delta: number;
  saldoDopo: number;
  motivo: string;
  autoreId: Id;
  ticket?: { _id: Id; numero: string } | null;
}) {
  await MovimentoModel.create({
    aziendaId: m.aziendaId,
    tipo: m.tipo,
    delta: m.delta,
    saldoDopo: m.saldoDopo,
    motivo: m.motivo,
    autoreId: m.autoreId,
    ticketId: m.ticket?._id ?? null,
    ticketNumero: m.ticket?.numero ?? '',
  });
}

export type EsitoApertura =
  | { tipo: 'scalata'; saldo: number }
  | { tipo: 'sblocco'; saldo: number; sblocchiRimasti: number }
  | { tipo: 'senza_contratto' };

/**
 * All'apertura di un ticket: scala una chiamata dal contratto in modo atomico.
 * A chiamate finite usa uno sblocco di emergenza (ticket fuori contratto); senza sblocchi rifiuta.
 */
export async function prenotaChiamata(aziendaId: Id): Promise<EsitoApertura> {
  const az = await AziendaModel.findById(aziendaId, { contratto: 1 }).lean();
  if (!az?.contratto?.attivo) return { tipo: 'senza_contratto' };

  const scalata = await AziendaModel.findOneAndUpdate(
    { _id: aziendaId, 'contratto.attivo': true, 'contratto.residue': { $gt: 0 } },
    { $inc: { 'contratto.residue': -1 } },
    { returnDocument: 'after' },
  ).lean();
  if (scalata) return { tipo: 'scalata', saldo: scalata.contratto!.residue! };

  const sblocco = await AziendaModel.findOneAndUpdate(
    { _id: aziendaId, 'contratto.sblocchi': { $gt: 0 } },
    { $inc: { 'contratto.sblocchi': -1 } },
    { returnDocument: 'after' },
  ).lean();
  if (sblocco) return { tipo: 'sblocco', saldo: sblocco.contratto!.residue!, sblocchiRimasti: sblocco.contratto!.sblocchi! };

  throw new ErroreApi(
    403,
    'Le chiamate incluse nel contratto sono esaurite. Contatta Wish per rinnovare o per una richiesta urgente.',
    'CHIAMATE_ESAURITE',
  );
}

/** Annulla una prenotazione se la creazione del ticket fallisce. */
export async function annullaPrenotazione(aziendaId: Id, esito: EsitoApertura) {
  if (esito.tipo === 'scalata') await AziendaModel.updateOne({ _id: aziendaId }, { $inc: { 'contratto.residue': 1 } });
  if (esito.tipo === 'sblocco') await AziendaModel.updateOne({ _id: aziendaId }, { $inc: { 'contratto.sblocchi': 1 } });
}

/** Restituisce la chiamata di un ticket (fuori contratto o eliminato). */
export async function restituisci(aziendaId: Id, ticket: { _id: Id; numero: string }, autoreId: Id, motivo: string) {
  const az = await AziendaModel.findOneAndUpdate(
    { _id: aziendaId },
    { $inc: { 'contratto.residue': 1 } },
    { returnDocument: 'after' },
  ).lean();
  await registra({ aziendaId, tipo: 'restituita', delta: 1, saldoDopo: az?.contratto?.residue ?? 0, motivo, autoreId, ticket });
}

/** Scala la chiamata per un ticket riportato "a contratto". Serve almeno una chiamata residua. */
export async function scala(aziendaId: Id, ticket: { _id: Id; numero: string }, autoreId: Id, motivo: string) {
  const az = await AziendaModel.findOneAndUpdate(
    { _id: aziendaId, 'contratto.attivo': true, 'contratto.residue': { $gt: 0 } },
    { $inc: { 'contratto.residue': -1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!az) {
    throw new ErroreApi(
      409,
      'Nessuna chiamata residua (o contratto non attivo): aggiungi chiamate all\'azienda oppure lascia il ticket fuori contratto',
      'NESSUNA_CHIAMATA',
    );
  }
  await registra({ aziendaId, tipo: 'scalata', delta: -1, saldoDopo: az.contratto!.residue!, motivo, autoreId, ticket });
}
