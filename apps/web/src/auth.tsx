import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginInput, LoginResponse, UtenteDTO } from '@wish/shared';
import { api, sessione } from './api';
import { queryClient } from './queryClient';

interface Auth {
  utente: UtenteDTO | null;
  pronto: boolean;
  accedi: (dati: LoginInput) => Promise<UtenteDTO>;
  esci: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utente, setUtente] = useState<UtenteDTO | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const stop = sessione.ascolta(setUtente);
    // All'apertura si prova a riprendere la sessione dal cookie
    sessione.rinnova().finally(() => setPronto(true));
    return stop;
  }, []);

  const accedi = useCallback(async (dati: LoginInput) => {
    const r = await api<LoginResponse>('/auth/login', { method: 'POST', body: dati });
    queryClient.clear();
    sessione.imposta(r);
    return r.utente;
  }, []);

  const esci = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      queryClient.clear();
      sessione.svuota();
    }
  }, []);

  const valore = useMemo(() => ({ utente, pronto, accedi, esci }), [utente, pronto, accedi, esci]);
  return <Ctx.Provider value={valore}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuori da AuthProvider');
  return c;
}
