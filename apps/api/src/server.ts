import { caricaEnv } from './config.js';
caricaEnv();
import { buildApp } from './app.js';
import { connettiDb, chiudiDb } from './db.js';
import { RefreshTokenModel } from './models/index.js';

const app = await buildApp();
await connettiDb(app.cfg.mongoUri);

// Pulizia dei refresh token scaduti, all'avvio e poi ogni 6 ore
const pulisci = () =>
  RefreshTokenModel.deleteMany({ scadenza: { $lt: new Date() } }).catch((err) => app.log.error({ err }, 'Pulizia token'));
await pulisci();
setInterval(pulisci, 6 * 3600_000).unref();

const chiudi = async (segnale: string) => {
  app.log.info(`Ricevuto ${segnale}, chiusura in corso`);
  await app.close();
  await chiudiDb();
  process.exit(0);
};
process.on('SIGINT', () => void chiudi('SIGINT'));
process.on('SIGTERM', () => void chiudi('SIGTERM'));

await app.listen({ host: app.cfg.host, port: app.cfg.porta });
