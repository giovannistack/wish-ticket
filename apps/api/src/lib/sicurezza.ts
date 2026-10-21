import crypto from 'node:crypto';

/** Token casuale da mandare all'utente (email, cookie). */
export const tokenCasuale = () => crypto.randomBytes(32).toString('base64url');

/** Nel database si salva solo l'hash: un furto del DB non espone token validi. */
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
