import { caricaEnv } from './config.js';
caricaEnv();
import { buildApp } from './app.js';
import { connettiDb, chiudiDb } from './db.js';
import { RefreshTokenModel, UtenteModel } from './models/index.js';
import { unificaStatiAperti } from './lib/migrazioni.js';

const app = await buildApp();
await connettiDb(app.cfg.mongoUri);

// Installazioni esistenti: se non c'è un super admin, lo diventa il primo admin creato
if (!(await UtenteModel.exists({ ruolo: 'admin', superAdmin: true }))) {
  const primo = await UtenteModel.findOne({ ruolo: 'admin' }).sort({ createdAt: 1 });
  if (primo) {
    primo.superAdmin = true;
    await primo.save();
    app.log.info({ email: primo.email }, 'Super admin assegnato al primo admin');
  }
}

await unificaStatiAperti(app.log);

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
