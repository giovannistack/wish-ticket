import type { EventoStoricoDTO } from '@wish/shared';
import { dataBreve } from './ui';

const COLORE: Record<string, string> = {
  creato: 'bg-brand',
  stato: 'bg-[#c77700]',
  assegnato: 'bg-[#6b47d6]',
  nota: 'bg-ambra',
};

/** Cronologia verticale degli eventi di un ticket. */
export function Storico({ eventi, titolo = 'Cronologia' }: { eventi: EventoStoricoDTO[]; titolo?: string }) {
  if (!eventi.length) return null;
  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="text-base font-extrabold">{titolo}</h2>
      <ol className="flex flex-col">
        {eventi.map((e, i) => (
          <li key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${COLORE[e.azione] ?? 'bg-muto'}`} aria-hidden="true" />
              {i < eventi.length - 1 && <span className="w-px flex-1 bg-riga" aria-hidden="true" />}
            </div>
            <div className="flex flex-col pb-4">
              <span className="text-sm font-semibold">{e.descrizione}</span>
              <span className="text-xs text-muto">
                {e.autore} · {dataBreve(e.data)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
