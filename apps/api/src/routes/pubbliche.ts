import type { FastifyPluginAsync } from 'fastify';
import { AziendaModel } from '../models/index.js';

/** Dati visibili senza accesso: solo i nomi delle aziende per il form di registrazione. */
const routes: FastifyPluginAsync = async (app) => {
  app.get('/aziende/pubbliche', async () => {
    const aziende = await AziendaModel.find({ attiva: true }, { nome: 1 }).sort({ nome: 1 }).lean();
    return aziende.map((a) => ({ id: String(a._id), nome: a.nome }));
  });
};

export default routes;
