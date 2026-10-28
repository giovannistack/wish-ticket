import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { attivaUtenteSchema, objectIdSchema, STATI_UTENTE } from '@wish/shared';
import { AziendaModel, CAMPI_CLIENTE, RefreshTokenModel, StoricoModel, TicketModel, UtenteModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { ErroreApi, nonTrovato, vietato } from '../../lib/errori.js';
import { utenteDTO } from '../../lib/dto.js';

const filtriSchema = z.object({
  stato: z.enum(STATI_UTENTE).optional(),
  aziendaId: objectIdSchema.optional(),
});

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);

  const trova = async (id: string) => {
    if (!Types.ObjectId.isValid(id)) throw nonTrovato('Utente');
    const u = await UtenteModel.findById(id);
    if (!u) throw nonTrovato('Utente');
    if (u.ruolo === 'admin') throw vietato('Gli account admin non si gestiscono da qui');
    return u;
  };
  const dto = async (id: Types.ObjectId) =>
    utenteDTO(await UtenteModel.findById(id).populate('aziendaId', CAMPI_CLIENTE).populate('aziendaDichiarataId', 'nome').lean());
  const revocaSessioni = (utenteId: Types.ObjectId) =>
    RefreshTokenModel.updateMany({ utenteId, revocato: false }, { $set: { revocato: true } });

  app.get('/', async (req) => {
    const f = valida(filtriSchema, req.query);
    const filtro: Record<string, unknown> = { ruolo: { $ne: 'admin' } };
    if (f.stato) filtro.stato = f.stato;
    if (f.aziendaId) filtro.aziendaId = new Types.ObjectId(f.aziendaId);
    const utenti = await UtenteModel.find(filtro)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('aziendaId', CAMPI_CLIENTE)
      .populate('aziendaDichiarataId', 'nome')
      .lean();
    return utenti.map(utenteDTO);
  });

  /** Crea il cliente privato a nome dell'utente (in caso di omonimia si aggiunge l'email). */
  async function creaPrivato(u: { nome: string; cognome: string; email: string; telefono?: string | null }) {
    const base = `${u.nome} ${u.cognome}`.trim();
    for (const nome of [base, `${base} (${u.email})`]) {
      if (await AziendaModel.exists({ nome })) continue;
      return AziendaModel.create({ nome, tipo: 'privato' });
    }
    throw new ErroreApi(409, 'Esiste già un cliente con questo nome: associalo dall\'elenco', 'DUPLICATO');
  }

  app.post<{ Params: { id: string } }>('/:id/attiva', async (req) => {
    const dati = valida(attivaUtenteSchema, req.body);
    const u = await trova(req.params.id);

    let azienda: { _id: Types.ObjectId; nome: string; tipo?: string | null };
    let creato = false;
    if (dati.modo === 'esistente') {
      const a = await AziendaModel.findOne({ _id: dati.aziendaId, attiva: true }).lean();
      if (!a) throw new ErroreApi(400, 'Azienda non valida', 'AZIENDA_NON_VALIDA');
      azienda = a;
    } else if (dati.modo === 'nuova_azienda') {
      if (await AziendaModel.exists({ nome: dati.nome })) {
        throw new ErroreApi(409, "Esiste già un'azienda con questo nome: associala dall'elenco", 'DUPLICATO');
      }
      azienda = await AziendaModel.create({ nome: dati.nome, tipo: 'azienda', partitaIva: dati.partitaIva });
      creato = true;
    } else {
      azienda = await creaPrivato(u);
      creato = true;
    }
    const privato = azienda.tipo === 'privato';
    const ruolo = dati.modo === 'privato' || privato ? 'referente' : dati.ruolo;

    const primaAttivazione = u.stato !== 'attivo';
    const cambioAzienda = !!u.aziendaId && String(u.aziendaId) !== String(azienda._id);
    u.stato = 'attivo';
    u.aziendaId = azienda._id;
    u.ruolo = ruolo;
    await u.save();
    // Se cambia azienda, le sessioni aperte non devono più valere per i dati della vecchia.
    if (cambioAzienda) await revocaSessioni(u._id);
    if (creato) {
      await StoricoModel.create({
        aziendaId: azienda._id,
        autoreId: req.utente.id,
        azione: 'cliente_creato',
        dettagli: { testo: `${privato ? 'Cliente privato' : 'Azienda'} creato all'attivazione di ${u.email}` },
      });
    }
    await StoricoModel.create({
      aziendaId: azienda._id,
      autoreId: req.utente.id,
      azione: primaAttivazione ? 'utente_attivato' : 'utente_aggiornato',
      dettagli: { utenteId: String(u._id), ruolo },
    });

    if (primaAttivazione) {
      await app.mailer.invia({
        a: u.email,
        oggetto: 'Il tuo account è attivo · Wish Assistenza',
        titolo: `Benvenuto, ${u.nome}!`,
        paragrafi: [
          privato ? 'Il tuo account è stato attivato.' : `Il tuo account per ${azienda.nome} è stato attivato.`,
          'Da ora puoi aprire ticket di assistenza e seguirne lo stato. Riceverai una notifica a ogni aggiornamento.',
        ],
        bottone: { testo: 'Accedi', url: `${app.cfg.urlPubblico}/accesso` },
      });
    }
    return dto(u._id);
  });

  app.post<{ Params: { id: string } }>('/:id/rifiuta', async (req) => {
    const u = await trova(req.params.id);
    if (u.stato !== 'in_attesa') throw new ErroreApi(409, 'Si possono rifiutare solo le richieste in attesa', 'STATO');
    u.stato = 'rifiutato';
    await u.save();
    await StoricoModel.create({ autoreId: req.utente.id, azione: 'utente_rifiutato', dettagli: { utenteId: String(u._id) } });
    await app.mailer.invia({
      a: u.email,
      oggetto: 'Richiesta di accesso · Wish Assistenza',
      titolo: 'Richiesta non approvata',
      paragrafi: [
        'La tua richiesta di accesso a Wish Assistenza non è stata approvata.',
        'Se pensi sia un errore, contatta direttamente il team Wish.',
      ],
    });
    return dto(u._id);
  });

  /** Un indirizzo rifiutato o disattivato torna tra le richieste da attivare. */
  app.post<{ Params: { id: string } }>('/:id/rimetti-in-attesa', async (req) => {
    const u = await trova(req.params.id);
    if (u.stato !== 'rifiutato' && u.stato !== 'disattivato') {
      throw new ErroreApi(409, 'Solo utenti rifiutati o disattivati', 'STATO');
    }
    if (!u.aziendaDichiarataId && u.aziendaId) u.aziendaDichiarataId = u.aziendaId;
    u.stato = 'in_attesa';
    u.aziendaId = null;
    await u.save();
    await StoricoModel.create({ autoreId: req.utente.id, azione: 'utente_rimesso_in_attesa', dettagli: { utenteId: String(u._id) } });
    return dto(u._id);
  });

  /**
   * Elimina un utente cliente (anche attivo). L'indirizzo potrà registrarsi di nuovo.
   * I ticket che ha aperto restano, con il richiedente indicato come "Utente eliminato".
   */
  app.delete<{ Params: { id: string } }>('/:id', async (req) => {
    const u = await trova(req.params.id);
    const ticketAperti = await TicketModel.countDocuments({ richiedenteId: u._id });
    await RefreshTokenModel.deleteMany({ utenteId: u._id });
    await UtenteModel.deleteOne({ _id: u._id });
    await StoricoModel.create({
      aziendaId: u.aziendaId,
      autoreId: req.utente.id,
      azione: 'utente_eliminato',
      dettagli: { email: u.email, nome: `${u.nome} ${u.cognome}`, ticketConservati: ticketAperti },
    });
    return { ok: true, ticketConservati: ticketAperti };
  });

  app.post<{ Params: { id: string } }>('/:id/disattiva', async (req) => {
    const u = await trova(req.params.id);
    if (String(u._id) === req.utente.id) throw vietato('Non puoi disattivare te stesso');
    u.stato = 'disattivato';
    await u.save();
    await revocaSessioni(u._id);
    await StoricoModel.create({
      aziendaId: u.aziendaId,
      autoreId: req.utente.id,
      azione: 'utente_disattivato',
      dettagli: { utenteId: String(u._id) },
    });
    return dto(u._id);
  });
};

export default routes;
