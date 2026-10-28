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

/** Un ticket nasce "In lavorazione"; chi lo segue si vede dal tecnico assegnato. */
export const STATI_TICKET = ['in_lavorazione', 'in_attesa_cliente', 'risolto', 'chiuso'] as const;
export type StatoTicket = (typeof STATI_TICKET)[number];
export const STATO_TICKET_LABEL: Record<StatoTicket, string> = {
  in_lavorazione: 'In lavorazione',
  in_attesa_cliente: 'In attesa cliente',
  risolto: 'Risolto',
  chiuso: 'Chiuso',
};

/** Dove si interviene: collegamento remoto, dal cliente (on-site) o nel laboratorio Wish. */
export const MODALITA = ['remoto', 'onsite', 'laboratorio'] as const;
export type Modalita = (typeof MODALITA)[number];
export const MODALITA_LABEL: Record<Modalita, string> = {
  remoto: 'Da remoto',
  onsite: 'On-site (presso il cliente)',
  laboratorio: 'Presso il nostro laboratorio',
};

/** Stati che contano come "aperti" per i conteggi e i filtri. */
export const STATI_APERTI: StatoTicket[] = ['in_lavorazione', 'in_attesa_cliente'];

export const DISPONIBILITA = ['prima_possibile', 'mattina', 'pomeriggio'] as const;
export type Disponibilita = (typeof DISPONIBILITA)[number];
export const DISPONIBILITA_LABEL: Record<Disponibilita, string> = {
  prima_possibile: 'Prima possibile',
  mattina: 'Mattina (9–13)',
  pomeriggio: 'Pomeriggio (14–18)',
};

/** Che cos'è un cliente: un'azienda o una persona privata. */
export const TIPI_CLIENTE = ['azienda', 'privato'] as const;
export type TipoCliente = (typeof TIPI_CLIENTE)[number];

/** Come lo vede Wish: dipende dal tipo e dal contratto. */
export const TIPOLOGIE_CLIENTE = ['contratto', 'senza_contratto', 'privato'] as const;
export type TipologiaCliente = (typeof TIPOLOGIE_CLIENTE)[number];
export const TIPOLOGIA_CLIENTE_LABEL: Record<TipologiaCliente, string> = {
  contratto: 'Azienda con contratto',
  senza_contratto: 'Azienda senza contratto',
  privato: 'Cliente privato',
};
export function tipologiaCliente(c: { tipo?: string | null; contratto?: { attivo?: boolean | null } | null }): TipologiaCliente {
  if (c.tipo === 'privato') return 'privato';
  return c.contratto?.attivo ? 'contratto' : 'senza_contratto';
}

/** Cosa ha indicato chi si registra nel menu "La tua azienda". */
export const RICHIESTE_CLIENTE = ['esistente', 'nuova', 'privato'] as const;
export type RichiestaCliente = (typeof RICHIESTE_CLIENTE)[number];

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

/** Partita IVA italiana: 11 cifre (spazi e prefisso IT tollerati). */
export const partitaIvaSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, '').replace(/^IT/i, ''))
  .pipe(z.string().regex(/^\d{11}$/, 'La partita IVA ha 11 cifre'));

export const telefonoSchema = z
  .string()
  .trim()
  .min(1, 'Inserisci il telefono')
  .max(30, 'Telefono troppo lungo')
  .regex(/^\+?[\d\s./-]{6,}$/, 'Telefono non valido');

/**
 * Registrazione. Nel menu "La tua azienda" si sceglie un'azienda dell'elenco (id),
 * "nuova" (con denominazione e partita IVA) oppure "privato".
 */
export const registrazioneSchema = z
  .object({
    nome: testo(2, 60, 'Nome'),
    cognome: testo(2, 60, 'Cognome'),
    email: z.email('Email non valida').trim().toLowerCase().max(160),
    telefono: telefonoSchema,
    ufficio: z.string().trim().max(80).optional().default(''),
    azienda: z.union([objectIdSchema, z.literal('nuova'), z.literal('privato')], { error: 'Scegli la tua azienda o "Privato"' }),
    denominazione: z.string().trim().max(160).optional().default(''),
    partitaIva: z.string().trim().max(20).optional().default(''),
    password: passwordSchema,
    privacy: z.literal(true, { error: "Serve il consenso all'informativa privacy" }),
  })
  .superRefine((d, ctx) => {
    if (d.azienda !== 'nuova') return;
    if (d.denominazione.length < 2) ctx.addIssue({ code: 'custom', path: ['denominazione'], message: "Inserisci la denominazione dell'azienda" });
    const piva = partitaIvaSchema.safeParse(d.partitaIva);
    if (!piva.success) ctx.addIssue({ code: 'custom', path: ['partitaIva'], message: d.partitaIva ? 'La partita IVA ha 11 cifre' : 'Inserisci la partita IVA' });
  })
  .transform((d) => ({
    ...d,
    ufficio: d.azienda === 'privato' ? '' : d.ufficio,
    denominazione: d.azienda === 'nuova' ? d.denominazione : '',
    partitaIva: d.azienda === 'nuova' ? d.partitaIva.replace(/\s+/g, '').replace(/^IT/i, '') : '',
  }));
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

/**
 * Attivazione di un utente da parte di Wish:
 * - esistente: lo associa a un cliente già presente (azienda o privato)
 * - nuova_azienda: crea l'azienda (senza contratto) e ce lo associa
 * - privato: crea il cliente privato a suo nome
 * Senza "modo" vale "esistente" (compatibilità con le versioni precedenti).
 */
export const attivaUtenteSchema = z.preprocess(
  (v) => (v && typeof v === 'object' && !('modo' in v) ? { ...v, modo: 'esistente' } : v),
  z.discriminatedUnion('modo', [
    z.object({ modo: z.literal('esistente'), aziendaId: objectIdSchema, ruolo: z.enum(['referente', 'utente']).default('utente') }),
    z.object({
      modo: z.literal('nuova_azienda'),
      nome: testo(2, 120, 'Denominazione'),
      partitaIva: partitaIvaSchema,
      ruolo: z.enum(['referente', 'utente']).default('referente'),
    }),
    z.object({ modo: z.literal('privato') }),
  ]),
);
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
  tipo: z.enum(TIPI_CLIENTE).optional().default('azienda'),
  ragioneSociale: z.string().trim().max(160).optional().default(''),
  partitaIva: z.union([z.literal(''), partitaIvaSchema]).optional().default(''),
  sede: z.string().trim().max(160).optional().default(''),
});

/** Modifica di un cliente: solo i campi inviati, nessun valore predefinito. */
export const aggiornaAziendaSchema = z
  .object({
    nome: testo(2, 120, 'Nome'),
    tipo: z.enum(TIPI_CLIENTE),
    ragioneSociale: z.string().trim().max(160),
    partitaIva: z.union([z.literal(''), partitaIvaSchema]),
    sede: z.string().trim().max(160),
    attiva: z.boolean(),
  })
  .partial();

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

export const MIME_ALLEGATI = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_ALLEGATO_MB = 10;

/** Ticket aperto da Wish per conto di un cliente: stessi campi, più azienda e richiedente. */
export const nuovoTicketAdminSchema = nuovoTicketSchema.extend({
  aziendaId: objectIdSchema,
  richiedenteId: objectIdSchema.optional(),
  fuoriContratto: z.boolean().optional().default(false),
});
export type NuovoTicketAdminInput = z.input<typeof nuovoTicketAdminSchema>;

export const modificaMovimentoSchema = z
  .object({
    motivo: z.string().trim().min(3, 'Motivo: almeno 3 caratteri').max(300).optional(),
    delta: z.number().int('Numero intero').min(-1000).max(1000).optional(),
    aggiornaSaldo: z.boolean().optional().default(true),
  })
  .refine((d) => d.motivo !== undefined || d.delta !== undefined, { message: 'Nessuna modifica' });
export type ModificaMovimentoInput = z.input<typeof modificaMovimentoSchema>;

// ---------- Tipi delle risposte API ----------

/** Riferimento a un cliente (azienda o privato) con la sua tipologia. */
export interface RifCliente {
  id: string;
  nome: string;
  tipologia: TipologiaCliente;
}

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
  azienda: RifCliente | null;
  aziendaDichiarata: { id: string; nome: string } | null;
  /** Cosa ha indicato in registrazione (nuova azienda: denominazione e partita IVA). */
  richiesta: { tipo: RichiestaCliente; denominazione: string; partitaIva: string };
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
  tipo: TipoCliente;
  tipologia: TipologiaCliente;
  ragioneSociale: string;
  partitaIva: string;
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
  azienda: RifCliente;
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

export interface AllegatoDTO {
  id: string;
  nome: string;
  mime: string;
  dimensione: number;
  nota: string;
  visibileCliente: boolean;
  /** Chi l'ha caricato: cliente o team Wish. */
  daWish: boolean;
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
  allegati: AllegatoDTO[];
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
