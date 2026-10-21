/**
 * Primo avvio: crea le tre aziende clienti e l'account admin.
 * Si può rilanciare: non duplica nulla.
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed
 */
import bcrypt from 'bcryptjs';
import { passwordSchema } from '@wish/shared';
import { caricaConfig, caricaEnv } from './config.js';
import { connettiDb, chiudiDb } from './db.js';
import { AziendaModel, UtenteModel } from './models/index.js';

caricaEnv();

const AZIENDE = [
  { nome: 'MODO SPA', ragioneSociale: 'MODO S.p.A.' },
  { nome: 'RGR Components S.r.l.', ragioneSociale: 'RGR Components S.r.l.' },
  { nome: 'Riserva Naturale Canale Monterano', ragioneSociale: 'Riserva Naturale Regionale Monterano', sede: 'Canale Monterano (RM)' },
];

const cfg = caricaConfig();
await connettiDb(cfg.mongoUri);

for (const a of AZIENDE) {
  const r = await AziendaModel.updateOne({ nome: a.nome }, { $setOnInsert: { ...a, attiva: true } }, { upsert: true });
  console.log(r.upsertedCount ? `+ azienda creata: ${a.nome}` : `= azienda già presente: ${a.nome}`);
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  const ok = passwordSchema.safeParse(password);
  if (!ok.success) throw new Error(`ADMIN_PASSWORD: ${ok.error.issues[0]?.message}`);
  if (await UtenteModel.exists({ email })) {
    console.log(`= admin già presente: ${email}`);
  } else {
    await UtenteModel.create({
      nome: process.env.ADMIN_NOME ?? 'Admin',
      cognome: process.env.ADMIN_COGNOME ?? 'Wish',
      email,
      passwordHash: await bcrypt.hash(password, cfg.bcryptCosto),
      ruolo: 'admin',
      stato: 'attivo',
      emailVerificata: true,
    });
    console.log(`+ admin creato: ${email}`);
  }
} else {
  console.log('(nessun admin creato: imposta ADMIN_EMAIL e ADMIN_PASSWORD)');
}

await chiudiDb();
