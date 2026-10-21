import type { FastifyPluginAsync } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  aggiornaTicketSchema,
  notaSchema,
  objectIdSchema,
  PRIORITA,
  PRIORITA_LABEL,
  STATI_APERTI,
  STATI_TICKET,
  STATO_TICKET_LABEL,
  type Priorita,
  type StatoTicket,
} from '@wish/shared';
import { NotaModel, StoricoModel, TicketModel, UtenteModel } from '../../models/index.js';
import { valida } from '../../lib/valida.js';
import { ErroreApi, nonTrovato } from '../../lib/errori.js';
import { ticketDTO } from '../../lib/dto.js';
import { popolaTicket, testoEvento, ticketAdmin } from '../../lib/ticket.js';

const filtriSchema = z.object({
  aziendaId: objectIdSchema.optional(),
  stato: z.enum(STATI_TICKET).optional(),
  priorita: z.enum(PRIORITA).optional(),
  tecnicoId: z.union([objectIdSchema, z.literal('me'), z.literal('nessuno')]).optional(),
  q: z.string().trim().max(80).optional(),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CHIUSI: StatoTicket[] = ['risolto', 'chiuso'];

/** Rotte admin: vedono tutte le aziende. Separate dalle rotte cliente e protette da soloAdmin. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);

  app.get('/', async (req) => {
    const f = valida(filtriSchema, req.query);
    const filtro: Record<string, unknown> = {};
    if (f.aziendaId) filtro.aziendaId = new Types.ObjectId(f.aziendaId);
    if (f.stato) filtro.stato = f.stato;
    if (f.priorita) filtro.priorita = f.priorita;
    if (f.tecnicoId === 'me') filtro.tecnicoId = new Types.ObjectId(req.utente.id);
    else if (f.tecnicoId === 'nessuno') filtro.tecnicoId = null;
    else if (f.tecnicoId) filtro.tecnicoId = new Types.ObjectId(f.tecnicoId);
    if (f.q) {
      const re = new RegExp(escapeRegex(f.q), 'i');
      filtro.$or = [{ numero: re }, { oggetto: re }, { seriale: re }, { marcaModello: re }];
    }
    const ticket = await popolaTicket(TicketModel.find(filtro).sort({ createdAt: -1 }).limit(500)).lean();
    return ticket.map(ticketDTO);
  });

  app.get<{ Params: { id: string } }>('/:id', async (req) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const t = await ticketAdmin(req.params.id);
    if (!t) throw nonTrovato('Ticket');
    return t;
  });

  app.patch<{ Params: { id: string } }>('/:id', async (req) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const dati = valida(aggiornaTicketSchema, req.body);
    const t = await TicketModel.findById(req.params.id);
    if (!t) throw nonTrovato('Ticket');

    const eventi: Array<{ azione: string; testo: string }> = [];
    let nuovoTecnico: { email: string; nome: string } | null = null;
    const statoPrima = t.stato as StatoTicket;

    // Prendere in carico un ticket senza tecnico lo assegna a chi lo fa
    if (dati.stato === 'in_carico' && !t.tecnicoId && dati.tecnicoId === undefined) dati.tecnicoId = req.utente.id;

    if (dati.tecnicoId !== undefined && String(dati.tecnicoId) !== String(t.tecnicoId ?? null)) {
      let nome: string | null = null;
      if (dati.tecnicoId) {
        const tec = await UtenteModel.findOne({ _id: dati.tecnicoId, ruolo: 'admin', stato: 'attivo' }, { nome: 1, cognome: 1, email: 1 }).lean();
        if (!tec) throw new ErroreApi(400, 'Tecnico non valido', 'TECNICO_NON_VALIDO');
        nome = `${tec.nome} ${tec.cognome}`;
        if (String(tec._id) !== req.utente.id) nuovoTecnico = { email: tec.email, nome: tec.nome };
      }
      t.tecnicoId = dati.tecnicoId ? new Types.ObjectId(dati.tecnicoId) : null;
      eventi.push({ azione: 'assegnato', testo: testoEvento.assegnato(nome) });
    }
    if (dati.priorita && dati.priorita !== t.priorita) {
      eventi.push({ azione: 'priorita', testo: testoEvento.priorita(t.priorita, dati.priorita) });
      t.priorita = dati.priorita;
    }
    if (dati.modalita !== undefined && dati.modalita !== (t.modalita ?? null)) {
      t.modalita = dati.modalita;
      eventi.push({ azione: 'modalita', testo: testoEvento.modalita(dati.modalita) });
    }
    if (dati.tempoMinuti !== undefined && dati.tempoMinuti !== t.tempoMinuti) {
      t.tempoMinuti = dati.tempoMinuti;
      eventi.push({ azione: 'tempo', testo: testoEvento.tempo(dati.tempoMinuti) });
    }
    if (dati.soluzione !== undefined && dati.soluzione !== t.soluzione) {
      t.soluzione = dati.soluzione;
      eventi.push({ azione: 'soluzione', testo: testoEvento.soluzione() });
    }
    if (dati.stato && dati.stato !== statoPrima) {
      if (CHIUSI.includes(dati.stato) && !t.soluzione.trim()) {
        throw new ErroreApi(400, 'Scrivi la soluzione prima di chiudere il ticket: il cliente la riceve via email', 'SOLUZIONE_MANCANTE');
      }
      t.stato = dati.stato;
      t.chiusoIl = CHIUSI.includes(dati.stato) ? (t.chiusoIl ?? new Date()) : null;
      eventi.push({ azione: 'stato', testo: testoEvento.stato(statoPrima, dati.stato) });
    }

    if (eventi.length) {
      await t.save();
      await StoricoModel.insertMany(
        eventi.map((e) => ({ ticketId: t._id, aziendaId: t.aziendaId, autoreId: req.utente.id, azione: e.azione, dettagli: { testo: e.testo } })),
      );
      if (t.stato !== statoPrima) await avvisaCliente(t._id, statoPrima);
      if (nuovoTecnico) await avvisaTecnico(t._id, nuovoTecnico, req.utente.id);
    }
    return ticketAdmin(t._id);
  });

  /** Elimina definitivamente un ticket con note e storico. Resta una riga nel registro generale. */
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: app.soloSuperAdmin }, async (req) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const t = await TicketModel.findById(req.params.id, { numero: 1, oggetto: 1, aziendaId: 1 }).lean();
    if (!t) throw nonTrovato('Ticket');
    await Promise.all([NotaModel.deleteMany({ ticketId: t._id }), StoricoModel.deleteMany({ ticketId: t._id })]);
    await TicketModel.deleteOne({ _id: t._id });
    await StoricoModel.create({
      aziendaId: t.aziendaId,
      autoreId: req.utente.id,
      azione: 'ticket_eliminato',
      dettagli: { numero: t.numero, oggetto: t.oggetto },
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/:id/note', async (req, reply) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw nonTrovato('Ticket');
    const { testo } = valida(notaSchema, req.body);
    const t = await TicketModel.findById(req.params.id, { aziendaId: 1 }).lean();
    if (!t) throw nonTrovato('Ticket');
    await NotaModel.create({ ticketId: t._id, aziendaId: t.aziendaId, autoreId: req.utente.id, testo });
    await StoricoModel.create({ ticketId: t._id, aziendaId: t.aziendaId, autoreId: req.utente.id, azione: 'nota', dettagli: { testo: testoEvento.nota() } });
    return reply.status(201).send(await ticketAdmin(t._id));
  });

  /** Email al tecnico a cui è stato assegnato il ticket, in copia alla casella assistenza. */
  async function avvisaTecnico(id: Types.ObjectId, tecnico: { email: string; nome: string }, autoreId: string) {
    const t = await popolaTicket(TicketModel.findById(id)).lean();
    if (!t) return;
    const autore = await UtenteModel.findById(autoreId, { nome: 1, cognome: 1 }).lean();
    const azienda = (t.aziendaId as { nome?: string } | null)?.nome ?? '';
    const richiedente = (t.richiedenteId as { nome?: string; cognome?: string } | null) ?? null;
    await app.mailer.invia({
      a: tecnico.email,
      cc: app.cfg.emailAvvisiAdmin,
      oggetto: `${t.priorita === 'bloccante' ? '[BLOCCANTE] ' : ''}Ti è stato assegnato ${t.numero} · ${azienda}`,
      titolo: `${t.numero} · ${t.oggetto}`,
      paragrafi: [
        `Ciao ${tecnico.nome}, ${autore ? `${autore.nome} ${autore.cognome}` : 'il team'} ti ha assegnato questo ticket.`,
        `Azienda: ${azienda}${richiedente ? ` · Richiedente: ${richiedente.nome ?? ''} ${richiedente.cognome ?? ''}` : ''}${t.telefono ? ` · Tel. ${t.telefono}` : ''}`,
        `Priorità: ${PRIORITA_LABEL[t.priorita as Priorita].nome}`,
        t.descrizione,
      ],
      bottone: { testo: 'Apri il ticket', url: `${app.cfg.urlPubblico}/admin/ticket/${t._id}` },
    });
  }

  /** Email al richiedente quando il ticket cambia stato. */
  async function avvisaCliente(id: Types.ObjectId, statoPrima: StatoTicket) {
    const t = await popolaTicket(TicketModel.findById(id)).lean();
    const richiedente = await UtenteModel.findById((t?.richiedenteId as { _id?: unknown } | null)?._id, { email: 1, nome: 1, stato: 1 }).lean();
    if (!t || !richiedente || richiedente.stato !== 'attivo') return;
    const tecnico = t.tecnicoId as { nome?: string } | null;
    const riaperto = CHIUSI.includes(statoPrima) && STATI_APERTI.includes(t.stato as StatoTicket);
    const testi: Partial<Record<StatoTicket, string[]>> = {
      in_carico: [
        riaperto ? 'Il ticket è stato riaperto ed è di nuovo in lavorazione.' : `Il ticket è stato preso in carico${tecnico?.nome ? ` da ${tecnico.nome}` : ''}.`,
        'Ti avviseremo a ogni aggiornamento.',
      ],
      in_attesa_cliente: [
        'Per andare avanti il tecnico ha bisogno di informazioni da te.',
        'Rispondi a questa email oppure contatta direttamente il team Wish.',
      ],
      risolto: ['Il ticket è stato risolto. Ecco cosa abbiamo fatto:', t.soluzione, 'Se il problema si ripresenta, rispondi a questa email.'],
      chiuso: ['Il ticket è stato chiuso.', ...(t.soluzione ? ['Soluzione:', t.soluzione] : [])],
    };
    const paragrafi = testi[t.stato as StatoTicket];
    if (!paragrafi) return;
    await app.mailer.invia({
      a: richiedente.email,
      oggetto: `${t.numero}: ${STATO_TICKET_LABEL[t.stato as StatoTicket].toLowerCase()} · Wish Assistenza`,
      titolo: `${t.numero} · ${t.oggetto}`,
      paragrafi,
      bottone: { testo: 'Vedi il ticket', url: `${app.cfg.urlPubblico}/ticket/${t._id}` },
    });
  }
};

export default routes;
