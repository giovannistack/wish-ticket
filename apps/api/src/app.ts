import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { caricaConfig, type Config } from './config.js';
import { creaMailer, type Mailer } from './lib/mail.js';
import { ErroreApi } from './lib/errori.js';
import { ErroreValidazione } from './lib/valida.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import ticketRoutes from './routes/ticket.js';
import pubblicheRoutes from './routes/pubbliche.js';
import adminUtentiRoutes from './routes/admin/utenti.js';
import adminAziendeRoutes from './routes/admin/aziende.js';
import adminTicketRoutes from './routes/admin/ticket.js';

declare module 'fastify' {
  interface FastifyInstance {
    cfg: Config;
    mailer: Mailer;
  }
}

export interface OpzioniApp {
  config?: Partial<Config>;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(opzioni: OpzioniApp = {}): Promise<FastifyInstance> {
  const cfg = caricaConfig(opzioni.config);
  const app = Fastify({
    logger: opzioni.logger ?? {
      level: cfg.produzione ? 'info' : 'debug',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: true, // dietro Caddy: IP reale del client per il rate limit
    bodyLimit: 1024 * 1024,
  });

  app.decorate('cfg', cfg);
  app.decorate('mailer', creaMailer(cfg, app.log));

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        // In sviluppo si lavora in http: niente upgrade forzato né HSTS
        upgradeInsecureRequests: cfg.produzione ? [] : null,
      },
    },
    hsts: cfg.produzione,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ErroreValidazione) {
      return reply.status(400).send({ errore: err.message, codice: err.codice, dettagli: err.dettagli });
    }
    if (err instanceof ErroreApi) {
      return reply.status(err.statusCode).send({ errore: err.message, codice: err.codice });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) {
      return reply.status(429).send({ errore: 'Troppi tentativi, riprova tra qualche minuto', codice: 'TROPPI_TENTATIVI' });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ errore: e.message ?? 'Richiesta non valida', codice: e.code });
    }
    req.log.error({ err }, 'Errore interno');
    return reply.status(500).send({ errore: 'Errore interno, riprova', codice: 'ERRORE_INTERNO' });
  });

  await app.register(
    async (api) => {
      api.get('/salute', async () => ({ ok: true }));
      await api.register(pubblicheRoutes);
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(meRoutes);
      await api.register(ticketRoutes, { prefix: '/ticket' });
      await api.register(adminUtentiRoutes, { prefix: '/admin/utenti' });
      await api.register(adminAziendeRoutes, { prefix: '/admin/aziende' });
      await api.register(adminTicketRoutes, { prefix: '/admin/ticket' });
      api.setNotFoundHandler((_req, reply) => reply.status(404).send({ errore: 'Percorso non trovato', codice: 'NON_TROVATO' }));
    },
    { prefix: '/api' },
  );

  // App web compilata, con ritorno a index.html per le pagine della SPA
  const webDir = cfg.cartellaWeb;
  if (fs.existsSync(path.join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) {
        return reply.status(404).send({ errore: 'Percorso non trovato', codice: 'NON_TROVATO' });
      }
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }

  return app;
}
