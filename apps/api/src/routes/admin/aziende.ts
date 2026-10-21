import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  contrattoSchema,
  nuovaAziendaSchema,
  rettificaSchema,
  rinnovoSchema,
  sbloccoSchema,
  STATI_APERTI,
  type AziendaConStatsDTO,
} from '@wish/shared';
import { AziendaModel, MovimentoModel, TicketModel, UtenteModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { ErroreApi, nonTrovato } from '../../lib/errori.js';
import { aziendaDTO } from '../../lib/dto.js';
import { movimentoDTO, registra } from '../../lib/contratto.js';

const aggiornaSchema = nuovaAziendaSchema.partial().extend({ attiva: z.boolean().optional() });

const data = (s: string) => new Date(`${s}T00:00:00.000Z`);
const isoGiorno = (d: Date) => d.toISOString().slice(0, 10);
/** 2026-10-21 → 21/10/2026, per i testi del registro. */
const it = (s: string | Date) => (typeof s === 'string' ? s : isoGiorno(s)).split('-').reverse().join('/');

/**
 * Aziende clienti e contratti. Tutti gli admin le vedono;
 * crearle, modificarle e toccare le chiamate del contratto spetta solo al super admin.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);
  const superAdmin = { preHandler: app.soloSuperAdmin };

  const trova = async (id: string) => {
    if (!Types.ObjectId.isValid(id)) throw nonTrovato('Azienda');
    const a = await AziendaModel.findById(id);
    if (!a) throw nonTrovato('Azienda');
    return a;
  };

  app.get('/', async (): Promise<AziendaConStatsDTO[]> => {
    const aziende = await AziendaModel.find().sort({ attiva: -1, nome: 1 }).lean();
    return Promise.all(
      aziende.map(async (a) => ({
        ...aziendaDTO(a),
        utentiAttivi: await UtenteModel.countDocuments({ aziendaId: a._id, stato: 'attivo' }),
        ticketAperti: await TicketModel.countDocuments({ aziendaId: a._id, stato: { $in: STATI_APERTI } }),
      })),
    );
  });

  app.get<{ Params: { id: string } }>('/:id/movimenti', async (req) => {
    const a = await trova(req.params.id);
    const movimenti = await MovimentoModel.find({ aziendaId: a._id })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('autoreId', 'nome cognome')
      .lean();
    return movimenti.map(movimentoDTO);
  });

  app.post('/', superAdmin, async (req, reply) => {
    const dati = valida(nuovaAziendaSchema, req.body);
    if (await AziendaModel.exists({ nome: dati.nome })) throw new ErroreApi(409, "Esiste già un'azienda con questo nome", 'DUPLICATO');
    const a = await AziendaModel.create(dati);
    return reply.status(201).send(aziendaDTO(a));
  });

  app.patch<{ Params: { id: string } }>('/:id', superAdmin, async (req) => {
    const dati = valida(aggiornaSchema, req.body);
    const a = await trova(req.params.id);
    if (dati.nome && dati.nome !== a.nome && (await AziendaModel.exists({ nome: dati.nome }))) {
      throw new ErroreApi(409, "Esiste già un'azienda con questo nome", 'DUPLICATO');
    }
    Object.assign(a, dati);
    await a.save();
    return aziendaDTO(a);
  });

  /** Imposta o modifica il contratto annuale. */
  app.put<{ Params: { id: string } }>('/:id/contratto', superAdmin, async (req) => {
    const dati = valida(contrattoSchema, req.body);
    const a = await trova(req.params.id);
    const c = a.contratto!;
    const eraAttivo = !!c.attivo;
    let motivo: string;

    if (dati.attivo && !eraAttivo) {
      // Nuovo contratto: chiamate piene
      c.residue = dati.chiamateAnnue;
      motivo = `Contratto attivato: ${dati.chiamateAnnue} chiamate dal ${it(dati.inizio)} al ${it(dati.fine)}`;
    } else if (dati.attivo) {
      // Cambia il numero di chiamate: le chiamate già usate restano usate
      const differenza = dati.chiamateAnnue - (c.chiamateAnnue ?? 0);
      c.residue = Math.max(0, (c.residue ?? 0) + differenza);
      motivo = `Contratto modificato: ${dati.chiamateAnnue} chiamate dal ${it(dati.inizio)} al ${it(dati.fine)}`;
    } else {
      motivo = eraAttivo ? 'Contratto disattivato: i nuovi ticket saranno fuori contratto' : 'Impostazioni contratto salvate (non attivo)';
    }
    const saldoPrima = eraAttivo ? (c.residue ?? 0) : 0;
    c.attivo = dati.attivo;
    c.chiamateAnnue = dati.chiamateAnnue;
    c.inizio = data(dati.inizio);
    c.fine = data(dati.fine);
    await a.save();
    await registra({
      aziendaId: a._id,
      tipo: 'impostazione',
      delta: dati.attivo ? (c.residue ?? 0) - saldoPrima : 0,
      saldoDopo: c.residue ?? 0,
      motivo,
      autoreId: req.utente.id,
    });
    return aziendaDTO(a);
  });

  /** Aggiunge o toglie chiamate a mano, sempre con un motivo (es. chiamata abbonata). */
  app.post<{ Params: { id: string } }>('/:id/rettifica', superAdmin, async (req) => {
    const { delta, motivo } = valida(rettificaSchema, req.body);
    const a = await trova(req.params.id);
    if (!a.contratto?.attivo) throw new ErroreApi(409, "L'azienda non ha un contratto attivo", 'NESSUN_CONTRATTO');
    const filtro: Record<string, unknown> = { _id: a._id };
    if (delta < 0) filtro['contratto.residue'] = { $gte: -delta };
    const agg = await AziendaModel.findOneAndUpdate(filtro, { $inc: { 'contratto.residue': delta } }, { returnDocument: 'after' }).lean();
    if (!agg) throw new ErroreApi(409, `Non ci sono ${-delta} chiamate da togliere`, 'SALDO_INSUFFICIENTE');
    await registra({ aziendaId: a._id, tipo: 'rettifica', delta, saldoDopo: agg.contratto!.residue!, motivo, autoreId: req.utente.id });
    return aziendaDTO(agg);
  });

  /** Nuovo anno di contratto: chiamate di nuovo piene, periodo spostato avanti. */
  app.post<{ Params: { id: string } }>('/:id/rinnova', superAdmin, async (req) => {
    const { inizio } = valida(rinnovoSchema, req.body);
    const a = await trova(req.params.id);
    const c = a.contratto!;
    if (!c.attivo) throw new ErroreApi(409, "L'azienda non ha un contratto attivo", 'NESSUN_CONTRATTO');
    const nuovoInizio = inizio ? data(inizio) : c.fine ? new Date(c.fine.getTime() + 86_400_000) : data(isoGiorno(new Date()));
    const nuovaFine = new Date(nuovoInizio);
    nuovaFine.setUTCFullYear(nuovaFine.getUTCFullYear() + 1);
    nuovaFine.setUTCDate(nuovaFine.getUTCDate() - 1);
    const delta = (c.chiamateAnnue ?? 0) - (c.residue ?? 0);
    c.inizio = nuovoInizio;
    c.fine = nuovaFine;
    c.residue = c.chiamateAnnue;
    c.sblocchi = 0;
    await a.save();
    await registra({
      aziendaId: a._id,
      tipo: 'rinnovo',
      delta,
      saldoDopo: c.residue ?? 0,
      motivo: `Rinnovo: ${c.chiamateAnnue} chiamate dal ${it(nuovoInizio)} al ${it(nuovaFine)}`,
      autoreId: req.utente.id,
    });
    return aziendaDTO(a);
  });

  /** Sblocco di emergenza: il cliente può aprire N richieste anche a chiamate finite (fuori contratto). */
  app.post<{ Params: { id: string } }>('/:id/sblocco', superAdmin, async (req) => {
    const { richieste, motivo } = valida(sbloccoSchema, req.body);
    const a = await trova(req.params.id);
    a.contratto!.sblocchi = richieste;
    await a.save();
    await registra({
      aziendaId: a._id,
      tipo: 'sblocco',
      delta: 0,
      saldoDopo: a.contratto!.residue ?? 0,
      motivo: richieste
        ? `Sblocco di emergenza: ${richieste} ${richieste === 1 ? 'richiesta' : 'richieste'} fuori contratto${motivo ? ` · ${motivo}` : ''}`
        : 'Sblocco di emergenza revocato',
      autoreId: req.utente.id,
    });
    return aziendaDTO(a);
  });
};

export default routes;
