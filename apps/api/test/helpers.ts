import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { connettiDb } from '../src/db.js';
import { AziendaModel, UtenteModel } from '../src/models/index.js';

export const EMAIL_AVVISI = 'avvisi-admin@wishsrl.it';
export const PASSWORD = 'Password123';

/** Database usa e getta per ogni file di test (MongoDB o FerretDB). */
export async function avviaApp() {
  const base = process.env.MONGO_URI_TEST ?? 'mongodb://127.0.0.1:27017';
  const db = `wish_ticket_test_${crypto.randomBytes(4).toString('hex')}`;
  const app = await buildApp({
    logger: process.env.LOG_TEST ? { level: 'error' } : false,
    config: {
      mongoUri: `${base}/${db}`,
      smtp: null,
      emailAvvisiAdmin: EMAIL_AVVISI,
      bcryptCosto: 4,
      limiteLogin: 1000,
      limiteRegistrazione: 1000,
      urlPubblico: 'https://ticket.test',
      cartellaWeb: '/non-esiste',
      cartellaAllegati: path.join(os.tmpdir(), `wish-allegati-${crypto.randomBytes(4).toString('hex')}`),
    },
  });
  await connettiDb(app.cfg.mongoUri);
  await app.ready();

  const aziende = {
    modo: await AziendaModel.create({ nome: 'MODO SPA' }),
    rgr: await AziendaModel.create({ nome: 'RGR Components S.r.l.' }),
    monterano: await AziendaModel.create({ nome: 'Riserva Naturale Canale Monterano' }),
  };
  await UtenteModel.create({
    nome: 'Admin',
    cognome: 'Wish',
    email: 'admin@wishsrl.it',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    ruolo: 'admin',
    superAdmin: true,
    stato: 'attivo',
    emailVerificata: true,
  });

  const chiudi = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await app.close();
  };
  return { app, aziende, chiudi };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Estrae il token dal link nell'ultima email inviata a un indirizzo. */
export function tokenDaEmail(app: FastifyInstance, a: string): string {
  const mail = [...app.mailer.posta].reverse().find((m) => m.a === a && m.bottone);
  const url = new URL(mail!.bottone!.url);
  return url.searchParams.get('token')!;
}

export function cookieRefresh(res: { cookies: Array<{ name: string; value: string }> }): string {
  return res.cookies.find((c) => c.name === 'wt_refresh')!.value;
}

export async function login(app: FastifyInstance, email: string, password = PASSWORD) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login ${email}: ${res.statusCode} ${res.body}`);
  return { token: res.json().accessToken as string, refresh: cookieRefresh(res), res };
}

export async function registra(
  app: FastifyInstance,
  email: string,
  aziendaId: string,
  extra: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/registrazione',
    payload: {
      nome: 'Mario',
      cognome: 'Rossi',
      email,
      aziendaDichiarataId: aziendaId,
      password: PASSWORD,
      privacy: true,
      ...extra,
    },
  });
}

/** Registrazione + conferma email + attivazione da admin, poi login. */
export async function creaUtenteAttivo(
  app: FastifyInstance,
  adminToken: string,
  email: string,
  aziendaId: string,
  ruolo: 'referente' | 'utente' = 'utente',
) {
  const r = await registra(app, email, aziendaId);
  if (r.statusCode !== 202) throw new Error(`registrazione ${email}: ${r.body}`);
  await app.inject({ method: 'POST', url: '/api/auth/verifica-email', payload: { token: tokenDaEmail(app, email) } });
  const u = await UtenteModel.findOne({ email }).lean();
  const att = await app.inject({
    method: 'POST',
    url: `/api/admin/utenti/${u!._id}/attiva`,
    headers: bearer(adminToken),
    payload: { aziendaId, ruolo },
  });
  if (att.statusCode !== 200) throw new Error(`attivazione ${email}: ${att.body}`);
  const sessione = await login(app, email);
  return { id: String(u!._id), ...sessione };
}

export const ticketDiProva = (oggetto: string) => ({
  oggetto,
  categoria: 'hardware',
  tipoApparato: 'stampante',
  descrizione: 'La stampante non stampa da stamattina.',
  priorita: 'media',
});

/** Corpo multipart per i test di upload: prima i campi, poi il file. */
export async function multipart(file: { dati: Buffer; nome: string; tipo?: string }, campi: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campi)) fd.append(k, v);
  fd.append('file', new Blob([new Uint8Array(file.dati)], { type: file.tipo ?? 'application/octet-stream' }), file.nome);
  const r = new Response(fd);
  return { payload: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type')! } };
}

export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
