import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';

export interface Email {
  a: string;
  oggetto: string;
  titolo: string;
  paragrafi: string[];
  bottone?: { testo: string; url: string };
}

export interface Mailer {
  invia(email: Email): Promise<void>;
  /** Email inviate (solo senza SMTP: sviluppo e test). */
  posta: Array<Email & { html: string }>;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function htmlEmail(e: Email): string {
  const paragrafi = e.paragrafi
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3A4763">${escape(p)}</p>`)
    .join('');
  const bottone = e.bottone
    ? `<p style="margin:22px 0 6px"><a href="${escape(e.bottone.url)}" style="display:inline-block;background:#1747C9;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px">${escape(e.bottone.testo)}</a></p>`
    : '';
  return `<!doctype html><html lang="it"><body style="margin:0;background:#EEF2F8;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:#0A1E4A;border-radius:16px 16px 0 0;padding:20px 24px;color:#ffffff;font-weight:700;font-size:16px">Wish Assistenza</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:26px 24px">
<h1 style="margin:0 0 16px;font-size:22px;color:#0B1730">${escape(e.titolo)}</h1>${paragrafi}${bottone}
</td></tr>
<tr><td style="padding:14px 8px;font-size:12px;color:#5A6680;text-align:center">Wish S.r.l. · Assistenza tecnica</td></tr>
</table></td></tr></table></body></html>`;
}

export function creaMailer(cfg: Config, log: FastifyBaseLogger): Mailer {
  const posta: Mailer['posta'] = [];
  let transport: Transporter | null = null;
  if (cfg.smtp) {
    transport = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.porta,
      secure: cfg.smtp.sicuro,
      auth: cfg.smtp.utente ? { user: cfg.smtp.utente, pass: cfg.smtp.password } : undefined,
    });
  }
  return {
    posta,
    async invia(email) {
      if (!email.a) return;
      const html = htmlEmail(email);
      const testo = [email.titolo, '', ...email.paragrafi, email.bottone ? `${email.bottone.testo}: ${email.bottone.url}` : '']
        .join('\n');
      if (!transport) {
        posta.push({ ...email, html });
        log.info({ a: email.a, oggetto: email.oggetto, link: email.bottone?.url }, 'Email (SMTP non configurato)');
        return;
      }
      try {
        await transport.sendMail({ from: cfg.mittente, to: email.a, subject: email.oggetto, html, text: testo });
      } catch (err) {
        // L'invio fallito non deve bloccare l'operazione: si registra e si va avanti.
        log.error({ err, a: email.a, oggetto: email.oggetto }, 'Invio email fallito');
      }
    },
  };
}
