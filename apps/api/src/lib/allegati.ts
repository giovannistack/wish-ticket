import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Types } from 'mongoose';
import type { AllegatoDTO } from '@wish/shared';
import { AllegatoModel } from '../models/index.js';
import { ErroreApi } from './errori.js';

const ESTENSIONE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Il tipo si decide dai primi byte del file, non dal nome né da quello che dichiara il browser:
 * un file rinominato in .jpg non passa.
 */
export function riconosciTipo(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Nome leggibile e sicuro: niente percorsi, niente caratteri di controllo. */
const pulisciNome = (nome: string) =>
  path
    .basename(nome || 'allegato')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .slice(0, 120) || 'allegato';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function allegatoDTO(a: any): AllegatoDTO {
  const autore = a.autoreId as { nome?: string; cognome?: string } | null;
  return {
    id: String(a._id),
    nome: a.nomeOriginale,
    mime: a.mime,
    dimensione: a.dimensione,
    nota: a.nota ?? '',
    visibileCliente: !!a.visibileCliente,
    daWish: !!a.daWish,
    autore: autore?.nome ? `${autore.nome} ${autore.cognome ?? ''}`.trim() : 'Utente rimosso',
    data: new Date(a.createdAt).toISOString(),
  };
}

export async function elencoAllegati(ticketId: Types.ObjectId | string, soloVisibili: boolean) {
  const filtro: Record<string, unknown> = { ticketId };
  if (soloVisibili) filtro.visibileCliente = true;
  const lista = await AllegatoModel.find(filtro).sort({ createdAt: 1 }).populate('autoreId', 'nome cognome').lean();
  return lista.map(allegatoDTO);
}

/**
 * Legge l'upload (campi "nota" e "visibileCliente" prima del file), controlla tipo e dimensione,
 * salva il file con un nome casuale e registra i metadati.
 */
export async function salvaAllegato(
  app: FastifyInstance,
  req: FastifyRequest,
  t: { _id: Types.ObjectId; aziendaId: Types.ObjectId },
  opzioni: { daWish: boolean; puoNascondere: boolean },
) {
  if (!req.isMultipart()) throw new ErroreApi(400, 'Invia il file come modulo (multipart)', 'NO_FILE');
  let parte;
  try {
    parte = await req.file();
  } catch {
    throw new ErroreApi(400, 'Upload non valido', 'NO_FILE');
  }
  if (!parte) throw new ErroreApi(400, 'Nessun file ricevuto', 'NO_FILE');
  let dati: Buffer;
  try {
    dati = await parte.toBuffer();
  } catch {
    throw new ErroreApi(413, 'File troppo grande: massimo 10 MB', 'FILE_TROPPO_GRANDE');
  }
  if (!dati.length) throw new ErroreApi(400, 'Il file è vuoto', 'NO_FILE');
  const mime = riconosciTipo(dati);
  if (!mime) throw new ErroreApi(415, 'Formato non accettato: carica una foto (JPG, PNG) o un PDF', 'FORMATO');

  const campo = (nome: string) => {
    const f = parte!.fields[nome] as { value?: unknown } | undefined;
    return typeof f?.value === 'string' ? f.value : '';
  };
  const nota = campo('nota').trim().slice(0, 500);
  const visibileCliente = opzioni.puoNascondere ? campo('visibileCliente') !== 'false' : true;

  const ora = new Date();
  const sotto = path.join(String(ora.getFullYear()), String(ora.getMonth() + 1).padStart(2, '0'));
  const nomeFile = `${crypto.randomBytes(16).toString('hex')}.${ESTENSIONE[mime]}`;
  const cartella = path.join(app.cfg.cartellaAllegati, sotto);
  await fs.promises.mkdir(cartella, { recursive: true });
  await fs.promises.writeFile(path.join(cartella, nomeFile), dati, { flag: 'wx' });

  const a = await AllegatoModel.create({
    ticketId: t._id,
    aziendaId: t.aziendaId,
    autoreId: req.utente.id,
    daWish: opzioni.daWish,
    nomeOriginale: pulisciNome(parte.filename),
    file: path.join(sotto, nomeFile),
    mime,
    dimensione: dati.length,
    nota,
    visibileCliente,
  });
  return a;
}

export async function inviaFile(app: FastifyInstance, reply: FastifyReply, a: { file: string; mime: string; nomeOriginale: string }) {
  const percorso = path.resolve(app.cfg.cartellaAllegati, a.file);
  // il percorso deve restare dentro la cartella allegati
  if (!percorso.startsWith(path.resolve(app.cfg.cartellaAllegati) + path.sep)) throw new ErroreApi(404, 'File non trovato', 'NON_TROVATO');
  if (!fs.existsSync(percorso)) throw new ErroreApi(404, 'File non trovato sul server', 'NON_TROVATO');
  const nome = encodeURIComponent(a.nomeOriginale);
  return reply
    .type(a.mime)
    .header('Content-Disposition', `inline; filename*=UTF-8''${nome}`)
    .header('Cache-Control', 'private, max-age=3600')
    .header('X-Content-Type-Options', 'nosniff')
    .send(fs.createReadStream(percorso));
}

export async function eliminaFile(app: FastifyInstance, file: string) {
  try {
    await fs.promises.unlink(path.resolve(app.cfg.cartellaAllegati, file));
  } catch {
    /* già assente */
  }
}

export async function eliminaAllegatiTicket(app: FastifyInstance, ticketId: Types.ObjectId | string) {
  const lista = await AllegatoModel.find({ ticketId }, { file: 1 }).lean();
  await Promise.all(lista.map((a) => eliminaFile(app, a.file)));
  await AllegatoModel.deleteMany({ ticketId });
}
