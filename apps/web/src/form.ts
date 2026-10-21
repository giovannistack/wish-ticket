import { useState } from 'react';
import type { z } from 'zod';
import { ErroreHttp } from './api';

/**
 * Validazione dei form con gli stessi schemi Zod del server (@wish/shared).
 * Gli errori arrivano per campo, sia dal controllo locale sia dalla risposta API.
 */
export function useErroriForm() {
  const [campi, setCampi] = useState<Record<string, string>>({});
  const [generale, setGenerale] = useState<string | null>(null);

  function valida<S extends z.ZodType>(schema: S, dati: unknown): z.output<S> | null {
    const r = schema.safeParse(dati);
    if (r.success) {
      setCampi({});
      setGenerale(null);
      return r.data;
    }
    const e: Record<string, string> = {};
    for (const i of r.error.issues) e[String(i.path[0] ?? '_')] ??= i.message;
    setCampi(e);
    setGenerale('Controlla i campi evidenziati');
    return null;
  }

  function daErrore(err: unknown) {
    if (err instanceof ErroreHttp) {
      if (err.dettagli) {
        const e: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.dettagli)) e[k.split('.')[0]!] = v[0]!;
        setCampi(e);
      }
      setGenerale(err.message);
    } else {
      setGenerale('Qualcosa è andato storto, riprova');
    }
  }

  /** Da mettere su onInput del form: l'errore di un campo sparisce appena lo si corregge. */
  function pulisci(e: { target: EventTarget }) {
    const nome = (e.target as HTMLInputElement).name;
    if (!nome || !campi[nome]) return;
    const { [nome]: _, ...resto } = campi;
    setCampi(resto);
    if (Object.keys(resto).length === 0) setGenerale(null);
  }

  return { campi, generale, valida, daErrore, setGenerale, pulisci };
}

export const leggiForm = (form: HTMLFormElement) => Object.fromEntries(new FormData(form).entries());
