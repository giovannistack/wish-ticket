import type { ContrattoDTO } from '@wish/shared';

export const dataIt = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Barra delle chiamate rimaste: blu, ambra sotto il 20%, rossa a zero. */
export function BarraChiamate({ c, compatta = false }: { c: ContrattoDTO; compatta?: boolean }) {
  if (!c.attivo) return <span className="text-[13px] text-muto">Nessun contratto: interventi fuori contratto</span>;
  const quota = c.chiamateAnnue ? Math.max(0, Math.min(1, c.residue / c.chiamateAnnue)) : 0;
  const colore = c.residue <= 0 ? 'bg-[#d42a2a]' : quota <= 0.2 ? 'bg-ambra' : 'bg-brand';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={compatta ? 'text-sm' : 'text-[15px]'}>
          <strong className={`${compatta ? 'text-lg' : 'text-2xl'} font-extrabold tracking-tight ${c.residue <= 0 ? 'text-[#a31b1b]' : ''}`}>{c.residue}</strong>
          <span className="text-muto"> di {c.chiamateAnnue} chiamate rimaste</span>
        </span>
        {!compatta && <span className="text-xs text-muto">fino al {dataIt(c.fine)}</span>}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-fondo"
        role="meter"
        aria-label="Chiamate rimaste"
        aria-valuemin={0}
        aria-valuemax={c.chiamateAnnue}
        aria-valuenow={c.residue}
      >
        <div className={`h-2 rounded-full ${colore}`} style={{ width: `${quota * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {c.bloccato && <span className="pill bg-[#fdecec] text-[#a31b1b]">Richieste bloccate</span>}
        {c.sblocchi > 0 && (
          <span className="pill bg-[#fff4de] text-[#7a4300]">
            Sblocco emergenza: {c.sblocchi} {c.sblocchi === 1 ? 'richiesta' : 'richieste'}
          </span>
        )}
        {c.scaduto && <span className="pill bg-[#fff1e6] text-[#8f3600]">Periodo scaduto il {dataIt(c.fine)}</span>}
      </div>
    </div>
  );
}

export const CoperturaPill = ({ fuori }: { fuori: boolean }) =>
  fuori ? <span className="pill bg-[#fff1e6] text-[#8f3600]">Fuori contratto</span> : <span className="pill bg-[#e7f6ec] text-[#14632f]">A contratto</span>;
