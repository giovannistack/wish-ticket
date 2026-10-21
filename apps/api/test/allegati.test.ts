import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AllegatoModel } from '../src/models/index.js';
import { avviaApp, bearer, creaUtenteAttivo, JPG, login, multipart, PDF, ticketDiProva } from './helpers.js';

let ctx: Awaited<ReturnType<typeof avviaApp>>;
let sup: string;
let tec: string;
let cliente: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let collega: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let esterno: Awaited<ReturnType<typeof creaUtenteAttivo>>;
let ticketId: string;

const carica = async (url: string, token: string, file: Parameters<typeof multipart>[0], campi?: Record<string, string>) => {
  const m = await multipart(file, campi);
  return ctx.app.inject({ method: 'POST', url, headers: { ...bearer(token), ...m.headers }, payload: m.payload });
};
const elenco = async (token = cliente.token) =>
  (await ctx.app.inject({ method: 'GET', url: `/api/ticket/${ticketId}/allegati`, headers: bearer(token) })).json() as Array<{ id: string; nome: string; nota: string; daWish: boolean }>;
const scarica = (id: string, token: string) => ctx.app.inject({ method: 'GET', url: `/api/allegati/${id}/file`, headers: bearer(token) });

beforeAll(async () => {
  ctx = await avviaApp();
  sup = (await login(ctx.app, 'admin@wishsrl.it')).token;
  await ctx.app.inject({ method: 'POST', url: '/api/admin/tecnici', headers: bearer(sup), payload: { nome: 'Tec', cognome: 'Nico', email: 'tec@wishsrl.it', password: 'Tecnico2026' } });
  tec = (await login(ctx.app, 'tec@wishsrl.it', 'Tecnico2026')).token;
  cliente = await creaUtenteAttivo(ctx.app, sup, 'c@modo.it', String(ctx.aziende.modo._id));
  collega = await creaUtenteAttivo(ctx.app, sup, 'c2@modo.it', String(ctx.aziende.modo._id));
  esterno = await creaUtenteAttivo(ctx.app, sup, 'x@rgr.it', String(ctx.aziende.rgr._id));
  ticketId = (await ctx.app.inject({ method: 'POST', url: '/api/ticket', headers: bearer(cliente.token), payload: ticketDiProva('Con foto') })).json().id;
});
afterAll(async () => {
  fs.rmSync(ctx.app.cfg.cartellaAllegati, { recursive: true, force: true });
  await ctx?.chiudi();
});

describe('allegati del cliente', () => {
  it('il cliente carica una foto, che lui e i colleghi vedono e scaricano', async () => {
    const r = await carica(`/api/ticket/${ticketId}/allegati`, cliente.token, { dati: JPG, nome: 'errore stampante.jpg', tipo: 'image/jpeg' });
    expect(r.statusCode).toBe(201);
    const lista = await elenco(collega.token);
    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe('errore stampante.jpg');
    const f = await scarica(lista[0].id, collega.token);
    expect(f.statusCode).toBe(200);
    expect(f.headers['content-type']).toBe('image/jpeg');
    expect(f.rawPayload.equals(JPG)).toBe(true);
  });

  it('rifiuta un file che non è davvero una foto o un PDF, anche se si chiama .jpg', async () => {
    const r = await carica(`/api/ticket/${ticketId}/allegati`, cliente.token, { dati: Buffer.from('<script>alert(1)</script>'), nome: 'finto.jpg', tipo: 'image/jpeg' });
    expect(r.statusCode).toBe(415);
  });

  it('rifiuta i file oltre 10 MB', async () => {
    const grande = Buffer.concat([JPG, Buffer.alloc(10 * 1024 * 1024 + 10)]);
    const r = await carica(`/api/ticket/${ticketId}/allegati`, cliente.token, { dati: grande, nome: 'enorme.jpg' });
    expect(r.statusCode).toBe(413);
  });

  it('un\'altra azienda non vede né carica allegati su questo ticket', async () => {
    const lista = await elenco();
    expect((await scarica(lista[0].id, esterno.token)).statusCode).toBe(404);
    const r = await carica(`/api/ticket/${ticketId}/allegati`, esterno.token, { dati: JPG, nome: 'x.jpg' });
    expect(r.statusCode).toBe(404);
  });

  it('i nomi con percorsi vengono ripuliti', async () => {
    await carica(`/api/ticket/${ticketId}/allegati`, cliente.token, { dati: PDF, nome: '../../etc/passwd.pdf' });
    expect((await elenco()).map((a) => a.nome)).toContain('passwd.pdf');
  });
});

describe('allegati di Wish', () => {
  it('Wish carica un PDF con una nota: il cliente lo vede e riceve una email', async () => {
    const prima = ctx.app.mailer.posta.length;
    const r = await carica(`/api/admin/ticket/${ticketId}/allegati`, tec, { dati: PDF, nome: 'rapporto intervento.pdf' }, { nota: 'Rapporto firmato' });
    expect(r.statusCode).toBe(201);
    const a = (await elenco()).find((x) => x.nome === 'rapporto intervento.pdf');
    expect(a?.nota).toBe('Rapporto firmato');
    expect(a?.daWish).toBe(true);
    expect(ctx.app.mailer.posta.slice(prima).some((m) => m.a === 'c@modo.it' && /nuovo documento/.test(m.oggetto))).toBe(true);
  });

  it('un allegato "solo interno" non arriva al cliente, ma Wish lo vede', async () => {
    const r = await carica(`/api/admin/ticket/${ticketId}/allegati`, tec, { dati: JPG, nome: 'interno.jpg' }, { visibileCliente: 'false', nota: 'Solo per noi' });
    const interno = (r.json().allegati as Array<{ id: string; nome: string; visibileCliente: boolean }>).find((x) => x.nome === 'interno.jpg')!;
    expect(interno.visibileCliente).toBe(false);
    expect((await elenco()).some((x) => x.nome === 'interno.jpg')).toBe(false);
    expect((await scarica(interno.id, cliente.token)).statusCode).toBe(404);
    expect((await scarica(interno.id, tec)).statusCode).toBe(200);
  });

  it('il cliente non può eliminare allegati, Wish sì (anche il file sul disco)', async () => {
    const a = (await elenco())[0];
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/allegati/${a.id}`, headers: bearer(cliente.token) })).statusCode).toBe(403);
    const doc = await AllegatoModel.findById(a.id).lean();
    const file = path.join(ctx.app.cfg.cartellaAllegati, doc!.file);
    expect(fs.existsSync(file)).toBe(true);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/allegati/${a.id}`, headers: bearer(tec) })).statusCode).toBe(200);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('eliminare il ticket elimina anche i suoi file', async () => {
    const docs = await AllegatoModel.find({ ticketId }).lean();
    expect(docs.length).toBeGreaterThan(0);
    await ctx.app.inject({ method: 'DELETE', url: `/api/admin/ticket/${ticketId}`, headers: bearer(sup) });
    for (const d of docs) expect(fs.existsSync(path.join(ctx.app.cfg.cartellaAllegati, d.file))).toBe(false);
    expect(await AllegatoModel.countDocuments({ ticketId })).toBe(0);
  });
});
