import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import type { Ruolo } from '@wish/shared';
import { UtenteModel } from '../models/index.js';
import { nonAutorizzato, vietato } from '../lib/errori.js';

export interface UtenteRichiesta {
  id: string;
  ruolo: Ruolo;
  superAdmin: boolean;
  /** Azienda dell'utente. Sempre presente per referente e utente, null per admin. */
  aziendaId: Types.ObjectId | null;
}

interface PayloadAccesso {
  sub: string;
  ruolo: Ruolo;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: PayloadAccesso;
    user: PayloadAccesso;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    utente: UtenteRichiesta;
  }
  interface FastifyInstance {
    autentica: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    soloAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    soloSuperAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    firmaAccesso: (utente: { id: string; ruolo: Ruolo }) => string;
  }
}

export default fp(async (app) => {
  await app.register(jwt, { secret: app.cfg.jwtSecret });

  app.decorateRequest('utente', null as unknown as UtenteRichiesta);

  app.decorate('firmaAccesso', (u: { id: string; ruolo: Ruolo }) =>
    app.jwt.sign({ sub: u.id, ruolo: u.ruolo }, { expiresIn: `${app.cfg.accessTokenMinuti}m` }),
  );

  /**
   * Verifica il token e ricarica l'utente dal DB a ogni richiesta:
   * un utente disattivato o spostato di azienda perde l'accesso subito,
   * senza aspettare la scadenza del token.
   */
  app.decorate('autentica', async (req: FastifyRequest) => {
    let payload: PayloadAccesso;
    try {
      payload = await req.jwtVerify<PayloadAccesso>();
    } catch {
      throw nonAutorizzato('Sessione scaduta, accedi di nuovo');
    }
    if (!Types.ObjectId.isValid(payload.sub)) throw nonAutorizzato();
    const u = await UtenteModel.findById(payload.sub, { ruolo: 1, stato: 1, aziendaId: 1, superAdmin: 1 }).lean();
    if (!u || u.stato !== 'attivo') throw nonAutorizzato('Account non attivo');
    if (u.ruolo !== 'admin' && !u.aziendaId) throw nonAutorizzato('Account senza azienda');
    req.utente = {
      id: String(u._id),
      ruolo: u.ruolo as Ruolo,
      superAdmin: u.ruolo === 'admin' && !!u.superAdmin,
      aziendaId: u.ruolo === 'admin' ? null : (u.aziendaId as Types.ObjectId),
    };
  });

  app.decorate('soloAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.autentica(req, reply);
    if (req.utente.ruolo !== 'admin') throw vietato();
  });

  app.decorate('soloSuperAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.soloAdmin(req, reply);
    if (!req.utente.superAdmin) throw vietato('Operazione riservata al super admin');
  });
});

/**
 * Filtro obbligatorio per ogni query delle rotte cliente.
 * Referente e dipendenti di un'azienda vedono gli stessi dati, e solo quelli.
 */
export function scoped(req: FastifyRequest): { aziendaId: Types.ObjectId } {
  const { aziendaId } = req.utente;
  if (!aziendaId) throw vietato('Le rotte cliente non sono per gli admin');
  return { aziendaId };
}
