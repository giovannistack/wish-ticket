import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';
import {
  CATEGORIE,
  DISPONIBILITA,
  MODALITA,
  TIPI_MOVIMENTO,
  PRIORITA,
  RUOLI,
  STATI_TICKET,
  STATI_UTENTE,
  TIPI_APPARATO,
} from '@wish/shared';

const { ObjectId } = Schema.Types;

// ---------- Aziende ----------
const aziendaSchema = new Schema(
  {
    nome: { type: String, required: true, trim: true },
    ragioneSociale: { type: String, default: '' },
    sede: { type: String, default: '' },
    attiva: { type: Boolean, default: true },
    // Contratto annuale di assistenza: numero di chiamate incluse nel periodo
    contratto: {
      attivo: { type: Boolean, default: false },
      chiamateAnnue: { type: Number, default: 0 },
      residue: { type: Number, default: 0 },
      inizio: { type: Date, default: null },
      fine: { type: Date, default: null },
      sblocchi: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);
aziendaSchema.index({ nome: 1 }, { unique: true });
export type Azienda = InferSchemaType<typeof aziendaSchema>;
export const AziendaModel = mongoose.model('Azienda', aziendaSchema, 'aziende');

// ---------- Utenti ----------
const utenteSchema = new Schema(
  {
    nome: { type: String, required: true },
    cognome: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    telefono: { type: String, default: '' },
    ufficio: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    ruolo: { type: String, enum: RUOLI, default: 'utente' },
    // Un solo super admin: gestisce il team ed è l'unico che può eliminare i ticket
    superAdmin: { type: Boolean, default: false },
    stato: { type: String, enum: STATI_UTENTE, default: 'in_attesa' },
    // null finché l'admin non conferma l'azienda; sempre null per gli admin
    aziendaId: { type: ObjectId, ref: 'Azienda', default: null },
    aziendaDichiarataId: { type: ObjectId, ref: 'Azienda', default: null },
    emailVerificata: { type: Boolean, default: false },
    tokenVerificaHash: { type: String, default: null },
    tokenResetHash: { type: String, default: null },
    tokenResetScadenza: { type: Date, default: null },
    ultimoAccesso: { type: Date, default: null },
  },
  { timestamps: true },
);
utenteSchema.index({ email: 1 }, { unique: true });
utenteSchema.index({ aziendaId: 1, stato: 1 });
utenteSchema.index({ stato: 1, createdAt: -1 });
export type Utente = InferSchemaType<typeof utenteSchema>;
export type UtenteDoc = HydratedDocument<Utente>;
export const UtenteModel = mongoose.model('Utente', utenteSchema, 'utenti');

// ---------- Refresh token (revocabili) ----------
const refreshTokenSchema = new Schema(
  {
    utenteId: { type: ObjectId, ref: 'Utente', required: true },
    hash: { type: String, required: true },
    scadenza: { type: Date, required: true },
    revocato: { type: Boolean, default: false },
  },
  { timestamps: true },
);
refreshTokenSchema.index({ hash: 1 }, { unique: true });
refreshTokenSchema.index({ utenteId: 1 });
refreshTokenSchema.index({ scadenza: 1 }); // pulizia periodica in server.ts
export const RefreshTokenModel = mongoose.model('RefreshToken', refreshTokenSchema, 'refreshToken');

// ---------- Contatori (numerazione ticket atomica) ----------
const contatoreSchema = new Schema({
  _id: { type: String, required: true },
  valore: { type: Number, default: 0 },
});
export const ContatoreModel = mongoose.model('Contatore', contatoreSchema, 'contatori');

// ---------- Ticket ----------
const ticketSchema = new Schema(
  {
    numero: { type: String, required: true },
    aziendaId: { type: ObjectId, ref: 'Azienda', required: true },
    richiedenteId: { type: ObjectId, ref: 'Utente', required: true },
    oggetto: { type: String, required: true },
    categoria: { type: String, enum: CATEGORIE, required: true },
    tipoApparato: { type: String, enum: TIPI_APPARATO, required: true },
    marcaModello: { type: String, default: '' },
    seriale: { type: String, default: '' },
    descrizione: { type: String, required: true },
    priorita: { type: String, enum: PRIORITA, default: 'media' },
    stato: { type: String, enum: STATI_TICKET, default: 'nuovo' },
    disponibilita: { type: String, enum: DISPONIBILITA, default: 'prima_possibile' },
    telefono: { type: String, default: '' },
    tecnicoId: { type: ObjectId, ref: 'Utente', default: null },
    modalita: { type: String, enum: [...MODALITA, null], default: null },
    tempoMinuti: { type: Number, default: 0 },
    soluzione: { type: String, default: '' },
    fuoriContratto: { type: Boolean, default: false },
    chiamataScalata: { type: Boolean, default: false },
    chiusoIl: { type: Date, default: null },
  },
  { timestamps: true },
);
ticketSchema.index({ numero: 1 }, { unique: true });
ticketSchema.index({ aziendaId: 1, stato: 1, createdAt: -1 });
ticketSchema.index({ stato: 1, createdAt: -1 });
ticketSchema.index({ tecnicoId: 1, stato: 1 });
export type Ticket = InferSchemaType<typeof ticketSchema>;
export const TicketModel = mongoose.model('Ticket', ticketSchema, 'ticket');

// ---------- Note interne (solo Wish, mai visibili ai clienti) ----------
const notaSchema = new Schema(
  {
    ticketId: { type: ObjectId, ref: 'Ticket', required: true },
    aziendaId: { type: ObjectId, ref: 'Azienda', required: true },
    autoreId: { type: ObjectId, ref: 'Utente', required: true },
    testo: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notaSchema.index({ ticketId: 1, createdAt: 1 });
export const NotaModel = mongoose.model('Nota', notaSchema, 'note');

// ---------- Registro chiamate del contratto (ogni movimento, mai modificato) ----------
const movimentoSchema = new Schema(
  {
    aziendaId: { type: ObjectId, ref: 'Azienda', required: true },
    tipo: { type: String, enum: TIPI_MOVIMENTO, required: true },
    delta: { type: Number, default: 0 },
    saldoDopo: { type: Number, required: true },
    motivo: { type: String, default: '' },
    ticketId: { type: ObjectId, ref: 'Ticket', default: null },
    ticketNumero: { type: String, default: '' },
    autoreId: { type: ObjectId, ref: 'Utente', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
movimentoSchema.index({ aziendaId: 1, createdAt: -1 });
export const MovimentoModel = mongoose.model('Movimento', movimentoSchema, 'movimentiContratto');

// ---------- Allegati dei ticket (file su disco, metadati qui) ----------
const allegatoSchema = new Schema(
  {
    ticketId: { type: ObjectId, ref: 'Ticket', required: true },
    aziendaId: { type: ObjectId, ref: 'Azienda', required: true },
    autoreId: { type: ObjectId, ref: 'Utente', required: true },
    daWish: { type: Boolean, default: false },
    nomeOriginale: { type: String, required: true },
    file: { type: String, required: true }, // nome casuale sul disco
    mime: { type: String, required: true },
    dimensione: { type: Number, required: true },
    nota: { type: String, default: '' },
    visibileCliente: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
allegatoSchema.index({ ticketId: 1, createdAt: 1 });
export const AllegatoModel = mongoose.model('Allegato', allegatoSchema, 'allegati');

// ---------- Storico modifiche ----------
const storicoSchema = new Schema(
  {
    ticketId: { type: ObjectId, ref: 'Ticket', default: null },
    aziendaId: { type: ObjectId, ref: 'Azienda', default: null },
    autoreId: { type: ObjectId, ref: 'Utente', required: true },
    azione: { type: String, required: true },
    dettagli: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
storicoSchema.index({ ticketId: 1, createdAt: -1 });
export const StoricoModel = mongoose.model('Storico', storicoSchema, 'storico');

export async function prossimoNumeroTicket(anno = new Date().getFullYear()): Promise<string> {
  // Upsert concorrenti possono collidere (E11000) o andare in conflitto di scrittura (112):
  // in quei casi si riprova, il $inc resta atomico.
  for (let tentativo = 0; ; tentativo++) {
    try {
      const doc = await ContatoreModel.findOneAndUpdate(
        { _id: `ticket-${anno}` },
        { $inc: { valore: 1 } },
        { upsert: true, returnDocument: 'after' },
      ).lean();
      return `TK-${anno}-${String(doc!.valore).padStart(4, '0')}`;
    } catch (err) {
      const codice = (err as { code?: number }).code;
      if ((codice !== 11000 && codice !== 112) || tentativo >= 9) throw err;
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 20 * (tentativo + 1)));
    }
  }
}
