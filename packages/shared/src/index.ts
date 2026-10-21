import { z } from 'zod';

// ---------- Costanti di dominio ----------

export const RUOLI = ['admin', 'referente', 'utente'] as const;
export type Ruolo = (typeof RUOLI)[number];

export const STATI_UTENTE = ['in_attesa', 'attivo', 'rifiutato', 'disattivato'] as const;
export type StatoUtente = (typeof STATI_UTENTE)[number];

export const CATEGORIE = [
  'hardware',
  'software',
  'rete',
  'email',
  'stampanti',
  'account',
  'altro',
] as const;
export type Categoria = (typeof CATEGORIE)[number];
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  hardware: 'Hardware',
  software: 'Software',
  rete: 'Rete / Internet',
  email: 'Email',
  stampanti: 'Stampanti',
  account: 'Account / Password',
  altro: 'Altro',
};

export const TIPI_APPARATO = [
  'pc_desktop',
  'portatile',
  'server',
  'stampante',
  'rete',
  'telefono',
  'altro',
] as const;
export type TipoApparato = (typeof TIPI_APPARATO)[number];
export const TIPO_APPARATO_LABEL: Record<TipoApparato, string> = {
  pc_desktop: 'PC desktop',
  portatile: 'Portatile',
  server: 'Server',
  stampante: 'Stampante',
  rete: 'Rete',
  telefono: 'Telefono',
  altro: 'Altro',
};

export const PRIORITA = ['bassa', 'media', 'alta', 'bloccante'] as const;
export type Priorita = (typeof PRIORITA)[number];
export const PRIORITA_LABEL: Record<Priorita, { nome: string; descrizione: string }> = {
  bassa: { nome: 'Bassa', descrizione: 'Posso aspettare' },
  media: { nome: 'Media', descrizione: 'Lavoro con fatica' },
  alta: { nome: 'Alta', descrizione: 'Più persone ferme' },
  bloccante: { nome: 'Bloccante', descrizione: 'Ufficio fermo' },
};

export const STATI_TICKET = ['nuovo', 'in_carico', 'in_attesa_cliente', 'risolto', 'chiuso'] as const;
export type StatoTicket = (typeof STATI_TICKET)[number];
export const STATO_TICKET_LABEL: Record<StatoTicket, string> = {
  nuovo: 'Nuovo',
  in_carico: 'In carico',
  in_attesa_cliente: 'In attesa cliente',
  risolto: 'Risolto',
  chiuso: 'Chiuso',
};

export const MODALITA = ['remoto', 'onsite'] as const;
export type Modalita = (typeof MODALITA)[number];
export const MODALITA_LABEL: Record<Modalita, string> = { remoto: 'Da remoto', onsite: 'On-site' };

/** Stati che contano come "aperti" per i conteggi e i filtri. */
export const STATI_APERTI: StatoTicket[] = ['nuovo', 'in_carico', 'in_attesa_cliente'];

export const DISPONIBILITA = ['prima_possibile', 'mattina', 'pomeriggio'] as const;
export type Disponibilita = (typeof DISPONIBILITA)[number];
export const DISPONIBILITA_LABEL: Record<Disponibilita, string> = {
  prima_possibile: 'Prima possibile',
  mattina: 'Mattina (9–13)',
  pomeriggio: 'Pomeriggio (14–18)',
};

// ---------- Schemi condivisi tra form e API ----------

const testo = (min: number, max: number, campo: string) =>
  z
    .string()
    .trim()
    .min(min, `${campo}: almeno ${min} caratteri`)
    .max(max, `${campo}: massimo ${max} caratteri`);

export const passwordSchema = z
  .string()
  .min(10, 'La password deve avere almeno 10 caratteri')
  .max(128, 'Password troppo lunga')
  .regex(/\d/, 'La password deve contenere almeno un numero');

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificativo non valido');

export const registrazioneSchema = z.object({
  nome: testo(2, 60, 'Nome'),
  cognome: testo(2, 60, 'Cognome'),
  email: z.email('Email non valida').trim().toLowerCase().max(160),
  telefono: z.string().trim().max(30).optional().default(''),
  ufficio: z.string().trim().max(80).optional().default(''),
  aziendaDichiarataId: objectIdSchema,
  password: passwordSchema,
  privacy: z.literal(true, { error: "Serve il consenso all'informativa privacy" }),
});
export type RegistrazioneInput = z.input<typeof registrazioneSchema>;

export const loginSchema = z.object({
  email: z.email('Email non valida').trim().toLowerCase(),
  password: z.string().min(1, 'Inserisci la password').max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const passwordDimenticataSchema = z.object({
  email: z.email('Email non valida').trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const attivaUtenteSchema = z.object({
  aziendaId: objectIdSchema,
  ruolo: z.enum(['referente', 'utente']).default('utente'),
});
export type AttivaUtenteInput = z.input<typeof attivaUtenteSchema>;

export const nuovoTicketSchema = z.object({
  oggetto: testo(4, 120, 'Oggetto'),
  categoria: z.enum(CATEGORIE),
  tipoApparato: z.enum(TIPI_APPARATO),
  marcaModello: z.string().trim().max(120).optional().default(''),
  seriale: z.string().trim().max(80).optional().default(''),
  descrizione: testo(10, 5000, 'Descrizione'),
  priorita: z.enum(PRIORITA).default('media'),
  disponibilita: z.enum(DISPONIBILITA).default('prima_possibile'),
  telefono: z.string().trim().max(30).optional().default(''),
});
export type NuovoTicketInput = z.input<typeof nuovoTicketSchema>;

export const nuovaAziendaSchema = z.object({
  nome: testo(2, 120, 'Nome'),
  ragioneSociale: z.string().trim().max(160).optional().default(''),
  sede: z.string().trim().max(160).optional().default(''),
});

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida (AAAA-MM-GG)');

export const contrattoSchema = z
  .object({
    attivo: z.boolean(),
    chiamateAnnue: z.number().int('Numero intero').min(1, 'Almeno 1 chiamata').max(1000),
    inizio: dataIso,
    fine: dataIso,
  })
  .refine((d) => d.fine > d.inizio, { message: 'La fine deve essere dopo l\'inizio', path: ['fine'] });
export type ContrattoInput = z.input<typeof contrattoSchema>;

export const rettificaSchema = z.object({
  delta: z
    .number()
    .int('Numero intero')
    .min(-100)
    .max(100)
    .refine((n) => n !== 0, 'Indica quante chiamate aggiungere o togliere'),
  motivo: testo(3, 300, 'Motivo'),
});
export type RettificaInput = z.input<typeof rettificaSchema>;

export const sbloccoSchema = z.object({
  richieste: z.number().int().min(0, 'Minimo 0').max(20, 'Massimo 20'),
  motivo: z.string().trim().max(300).optional().default(''),
});

export const rinnovoSchema = z.object({ inizio: dataIso.optional() });

export const aggiornaTicketSchema = z
  .object({
    fuoriContratto: z.boolean().optional(),
    stato: z.enum(STATI_TICKET).optional(),
    priorita: z.enum(PRIORITA).optional(),
    tecnicoId: objectIdSchema.nullable().optional(),
    modalita: z.enum(MODALITA).nullable().optional(),
    tempoMinuti: z.number().int('Minuti interi').min(0).max(100_000).optional(),
    soluzione: z.string().trim().max(5000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nessuna modifica' });
export type AggiornaTicketInput = z.input<typeof aggiornaTicketSchema>;

export const notaSchema = z.object({ testo: testo(1, 5000, 'Nota') });

export const nuovoTecnicoSchema = z.object({
  nome: testo(2, 60, 'Nome'),
  cognome: testo(2, 60, 'Cognome'),
  email: z.email('Email non valida').trim().toLowerCase().max(160),
  password: passwordSchema,
});
export type NuovoTecnicoInput = z.input<typeof nuovoTecnicoSchema>;

export const aggiornaTecnicoSchema = z
  .object({
    nome: testo(2, 60, 'Nome').optional(),
    cognome: testo(2, 60, 'Cognome').optional(),
    password: passwordSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nessuna modifica' });

// ---------- Tipi delle risposte API ----------

export interface UtenteDTO {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  ufficio: string;
  ruolo: Ruolo;
  /** L'admin principale: unico che gestisce il team ed elimina i ticket. */
  superAdmin: boolean;
  stato: StatoUtente;
  emailVerificata: boolean;
  azienda: { id: string; nome: string } | null;
  aziendaDichiarata: { id: string; nome: string } | null;
  ultimoAccesso: string | null;
  createdAt: string;
}

export interface ContrattoDTO {
  attivo: boolean;
  chiamateAnnue: number;
  /** Chiamate ancora disponibili nel periodo. */
  residue: number;
  inizio: string | null;
  fine: string | null;
  /** Richieste di emergenza concesse dal super admin a chiamate esaurite. */
  sblocchi: number;
  /** Il cliente non può aprire ticket: contratto attivo, chiamate finite, nessuno sblocco. */
  bloccato: boolean;
  scaduto: boolean;
}

export interface AziendaDTO {
  id: string;
  nome: string;
  ragioneSociale: string;
  sede: string;
  attiva: boolean;
  contratto: ContrattoDTO;
}

export const TIPI_MOVIMENTO = ['scalata', 'restituita', 'rettifica', 'rinnovo', 'impostazione', 'sblocco', 'sblocco_usato'] as const;
export type TipoMovimento = (typeof TIPI_MOVIMENTO)[number];

/** Una riga del registro chiamate di un'azienda. */
export interface MovimentoDTO {
  id: string;
  tipo: TipoMovimento;
  delta: number;
  saldoDopo: number;
  motivo: string;
  ticket: { id: string; numero: string } | null;
  autore: string;
  data: string;
}

export interface AziendaConStatsDTO extends AziendaDTO {
  utentiAttivi: number;
  ticketAperti: number;
}

export interface TicketDTO {
  id: string;
  numero: string;
  azienda: { id: string; nome: string };
  richiedente: { id: string; nome: string };
  oggetto: string;
  categoria: Categoria;
  tipoApparato: TipoApparato;
  marcaModello: string;
  seriale: string;
  descrizione: string;
  priorita: Priorita;
  stato: StatoTicket;
  disponibilita: Disponibilita;
  telefono: string;
  tecnico: { id: string; nome: string } | null;
  modalita: Modalita | null;
  soluzione: string;
  /** Intervento non coperto dal contratto (da fatturare a parte). */
  fuoriContratto: boolean;
  /** Il ticket ha consumato una chiamata del contratto. */
  chiamataScalata: boolean;
  chiusoIl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventoStoricoDTO {
  id: string;
  azione: string;
  descrizione: string;
  autore: string;
  data: string;
}

export interface NotaDTO {
  id: string;
  testo: string;
  autore: string;
  data: string;
}

/** Dettaglio ticket per l'admin: in più tempo, note interne e storico completo. */
export interface TicketAdminDTO extends TicketDTO {
  tempoMinuti: number;
  note: NotaDTO[];
  storico: EventoStoricoDTO[];
}

export interface TecnicoDTO {
  id: string;
  nome: string;
}

/** Account del team Wish (admin/tecnici) per la pagina Team. */
export interface MembroTeamDTO {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  stato: StatoUtente;
  ultimoAccesso: string | null;
  ticketAperti: number;
  io: boolean;
  superAdmin: boolean;
}

export interface LoginResponse {
  accessToken: string;
  utente: UtenteDTO;
}

export interface ApiErrore {
  errore: string;
  codice?: string;
  dettagli?: Record<string, string[]>;
}
