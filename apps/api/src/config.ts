import fs from 'node:fs';
import path from 'node:path';

/**
 * Carica il file .env della cartella principale, qualunque sia il comando di avvio
 * (npm start, node …/server.js, servizio NSSM). Le variabili già impostate non vengono toccate.
 */
export function caricaEnv(): void {
  const candidati = [path.resolve(process.cwd(), '.env'), path.resolve(import.meta.dirname, '../../../.env')];
  const file = candidati.find((f) => fs.existsSync(f));
  if (!file || process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  for (const riga of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let valore = m[2]!;
    if (/^(["']).*\1$/.test(valore)) valore = valore.slice(1, -1);
    else valore = valore.replace(/\s+#.*$/, '');
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = valore;
  }
}

function richiesto(nome: string, valoreDev?: string): string {
  const v = process.env[nome];
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV !== 'production' && valoreDev !== undefined) return valoreDev;
  throw new Error(`Variabile d'ambiente mancante: ${nome}`);
}

export interface Config {
  produzione: boolean;
  host: string;
  porta: number;
  urlPubblico: string;
  mongoUri: string;
  jwtSecret: string;
  accessTokenMinuti: number;
  refreshTokenGiorni: number;
  bcryptCosto: number;
  cartellaWeb: string;
  smtp: {
    host: string;
    porta: number;
    sicuro: boolean;
    utente: string;
    password: string;
  } | null;
  mittente: string;
  emailAvvisiAdmin: string;
  limiteLogin: number;
  limiteRegistrazione: number;
}

export function caricaConfig(override: Partial<Config> = {}): Config {
  const produzione = process.env.NODE_ENV === 'production';
  const smtpHost = process.env.SMTP_HOST ?? '';
  const cfg: Config = {
    produzione,
    host: process.env.HOST ?? '127.0.0.1',
    porta: Number(process.env.PORT ?? 8040),
    urlPubblico: (process.env.URL_PUBBLICO ?? 'http://localhost:5173').replace(/\/$/, ''),
    mongoUri: richiesto('MONGO_URI', 'mongodb://127.0.0.1:27017/wish_ticket'),
    jwtSecret: richiesto('JWT_SECRET', 'sviluppo-non-usare-in-produzione-0123456789abcdef'),
    accessTokenMinuti: Number(process.env.ACCESS_TOKEN_MINUTI ?? 15),
    refreshTokenGiorni: Number(process.env.REFRESH_TOKEN_GIORNI ?? 30),
    bcryptCosto: Number(process.env.BCRYPT_COSTO ?? 12),
    cartellaWeb:
      process.env.CARTELLA_WEB ?? path.resolve(import.meta.dirname, '../../web/dist'),
    smtp: smtpHost
      ? {
          host: smtpHost,
          porta: Number(process.env.SMTP_PORT ?? 587),
          sicuro: process.env.SMTP_SECURE === 'true',
          utente: process.env.SMTP_USER ?? '',
          password: process.env.SMTP_PASS ?? '',
        }
      : null,
    mittente: process.env.MAIL_FROM ?? 'Wish Assistenza <assistenza@wishsrl.it>',
    emailAvvisiAdmin: process.env.EMAIL_AVVISI_ADMIN ?? '',
    limiteLogin: Number(process.env.LIMITE_LOGIN ?? 10),
    limiteRegistrazione: Number(process.env.LIMITE_REGISTRAZIONE ?? 5),
    ...override,
  };
  if (cfg.produzione && cfg.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET deve avere almeno 32 caratteri in produzione');
  }
  return cfg;
}
