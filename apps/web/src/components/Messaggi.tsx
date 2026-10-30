import { useEffect, useRef, useState } from 'react';
import type { MessaggioDTO } from '@wish/shared';
import { ErroreHttp } from '../api';
import { Avviso, dataBreve } from './ui';

/**
 * Conversazione tra Wish e il cliente dentro il ticket.
 * "lato" dice chi sta guardando: i propri messaggi stanno a destra.
 */
export function Messaggi({
  messaggi,
  lato,
  sottotitolo,
  chiuso,
  onInvia,
}: {
  messaggi: MessaggioDTO[];
  lato: 'wish' | 'cliente';
  sottotitolo: string;
  chiuso?: string;
  onInvia: (testo: string) => Promise<unknown>;
}) {
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inviato, setInviato] = useState(false);
  const fine = useRef<HTMLDivElement>(null);
  const quanti = messaggi.length;
  useEffect(() => {
    if (quanti) fine.current?.scrollIntoView({ block: 'nearest' });
  }, [quanti]);

  async function invia() {
    if (!testo.trim()) return;
    setInvio(true);
    setErrore(null);
    try {
      await onInvia(testo.trim());
      setTesto('');
      setInviato(true);
      setTimeout(() => setInviato(false), 3000);
    } catch (e) {
      setErrore(e instanceof ErroreHttp ? e.message : 'Messaggio non inviato, riprova');
    } finally {
      setInvio(false);
    }
  }

  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="titolo-messaggi">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titolo-messaggi" className="text-base font-extrabold">Messaggi</h2>
        <span className="text-xs text-muto">{sottotitolo}</span>
      </div>

      {quanti === 0 ? (
        <p className="text-sm text-muto">
          {lato === 'wish' ? 'Nessun messaggio. Scrivi al cliente per aggiornarlo.' : 'Nessun messaggio. Se hai bisogno, scrivi qui al team Wish.'}
        </p>
      ) : (
        <div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto pr-1" role="log" aria-live="polite">
          {messaggi.map((m) => {
            const mio = (lato === 'wish') === m.daWish;
            return (
              <div key={m.id} className={`flex max-w-[85%] flex-col gap-1 ${mio ? 'self-end items-end' : 'self-start items-start'}`}>
                <div
                  className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.daWish ? 'bg-brand text-white' : 'bg-fondo text-inchiostro'} ${
                    mio ? 'rounded-br-md' : 'rounded-bl-md'
                  }`}
                >
                  {m.testo}
                </div>
                <span className="text-[11px] text-muto">
                  {m.daWish ? `${m.autore} · Wish` : m.autore} · {dataBreve(m.data)}
                </span>
              </div>
            );
          })}
          <div ref={fine} />
        </div>
      )}

      {chiuso ? (
        <p className="rounded-xl bg-fondo px-3 py-2.5 text-[13px] text-muto">{chiuso}</p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            invia();
          }}
        >
          <label htmlFor="nuovo-messaggio" className="sr-only">
            Nuovo messaggio
          </label>
          <textarea
            id="nuovo-messaggio"
            rows={3}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) invia();
            }}
            placeholder={lato === 'wish' ? 'Scrivi al cliente: riceve il messaggio via email' : 'Scrivi al team Wish'}
            className="campo resize-y"
          />
          {errore && <Avviso>{errore}</Avviso>}
          <div className="flex items-center justify-end gap-3">
            {inviato && <span className="text-xs font-semibold text-[#14632f]">Inviato</span>}
            <button type="submit" className="btn-primario" disabled={!testo.trim() || invio}>
              {invio ? 'Invio…' : lato === 'wish' ? 'Invia al cliente' : 'Invia'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
