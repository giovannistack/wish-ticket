import type { ApiErrore, LoginResponse, UtenteDTO } from '@wish/shared';

export class ErroreHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public codice?: string,
    public dettagli?: Record<string, string[]>,
  ) {
    super(message);
  }
}

// L'access token vive solo in memoria: il refresh token sta in un cookie httpOnly.
let accessToken: string | null = null;
let rinnovoInCorso: Promise<UtenteDTO | null> | null = null;
type Ascoltatore = (u: UtenteDTO | null) => void;
const ascoltatori = new Set<Ascoltatore>();

export const sessione = {
  imposta(r: LoginResponse) {
    accessToken = r.accessToken;
    ascoltatori.forEach((f) => f(r.utente));
  },
  svuota() {
    accessToken = null;
    ascoltatori.forEach((f) => f(null));
  },
  ascolta(f: Ascoltatore) {
    ascoltatori.add(f);
    return () => void ascoltatori.delete(f);
  },
  /** Un solo rinnovo alla volta, anche se più richieste ricevono 401 insieme. */
  rinnova(): Promise<UtenteDTO | null> {
    rinnovoInCorso ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) {
          sessione.svuota();
          return null;
        }
        const dati = (await r.json()) as LoginResponse;
        sessione.imposta(dati);
        return dati.utente;
      })
      .catch(() => null)
      .finally(() => {
        rinnovoInCorso = null;
      });
    return rinnovoInCorso;
  },
};

interface Opzioni {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function api<T>(percorso: string, opzioni: Opzioni = {}, riprova = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (opzioni.body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`/api${percorso}`, {
      method: opzioni.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: opzioni.body !== undefined ? JSON.stringify(opzioni.body) : undefined,
    });
  } catch {
    throw new ErroreHttp(0, 'Connessione non disponibile. Controlla la rete e riprova.');
  }

  if (res.status === 401 && riprova && !percorso.startsWith('/auth/')) {
    const utente = await sessione.rinnova();
    if (utente) return api<T>(percorso, opzioni, false);
  }
  if (!res.ok) {
    let e: ApiErrore = { errore: 'Qualcosa è andato storto, riprova' };
    try {
      e = (await res.json()) as ApiErrore;
    } catch {
      /* risposta senza JSON */
    }
    throw new ErroreHttp(res.status, e.errore, e.codice, e.dettagli);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
