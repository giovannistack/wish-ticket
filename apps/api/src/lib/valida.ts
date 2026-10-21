import type { z } from 'zod';
import { ErroreApi } from './errori.js';

export class ErroreValidazione extends ErroreApi {
  constructor(public dettagli: Record<string, string[]>) {
    super(400, Object.values(dettagli)[0]?.[0] ?? 'Dati non validi', 'VALIDAZIONE');
  }
}

export function valida<S extends z.ZodType>(schema: S, dati: unknown): z.output<S> {
  const r = schema.safeParse(dati ?? {});
  if (r.success) return r.data;
  const dettagli: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join('.') || '_';
    (dettagli[k] ??= []).push(issue.message);
  }
  throw new ErroreValidazione(dettagli);
}
