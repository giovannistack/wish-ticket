import type { FastifyPluginAsync } from 'fastify';
import type { TecnicoDTO } from '@wish/shared';
import { UtenteModel } from '../../models/index.js';

/** I tecnici sono gli account admin di Wish attivi. */
const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.soloAdmin);
  app.get('/', async (): Promise<TecnicoDTO[]> => {
    const admin = await UtenteModel.find({ ruolo: 'admin', stato: 'attivo' }, { nome: 1, cognome: 1 }).sort({ nome: 1 }).lean();
    return admin.map((a) => ({ id: String(a._id), nome: `${a.nome} ${a.cognome}` }));
  });
};

export default routes;
