import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { PRIORITA_LABEL, STATO_TICKET_LABEL, type Priorita, type StatoTicket } from '@wish/shared';

export function Logo({ sottotitolo, chiaro = true }: { sottotitolo?: string; chiaro?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-[10px] bg-white text-[15px] font-extrabold text-brand shadow-sm">W</div>
      <div className="flex flex-col leading-tight">
        <span className={`text-[15px] font-bold ${chiaro ? 'text-white' : 'text-inchiostro'}`}>Wish Assistenza</span>
        {sottotitolo && <span className={`text-xs ${chiaro ? 'text-[#b9c8ec]' : 'text-muto'}`}>{sottotitolo}</span>}
      </div>
    </div>
  );
}

interface CampoBase {
  etichetta: ReactNode;
  errore?: string;
  aiuto?: ReactNode;
}

export function Campo({ etichetta, errore, aiuto, ...props }: CampoBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="etichetta">{etichetta}</label>
      <input id={id} className="campo" aria-invalid={!!errore} aria-describedby={errore ? `${id}-e` : undefined} {...props} />
      {aiuto && !errore && <span className="text-xs text-muto">{aiuto}</span>}
      {errore && <span id={`${id}-e`} className="text-xs font-medium text-[#a31b1b]">{errore}</span>}
    </div>
  );
}

export function Selezione({ etichetta, errore, aiuto, children, ...props }: CampoBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="etichetta">{etichetta}</label>
      <select id={id} className="campo pr-8" aria-invalid={!!errore} {...props}>{children}</select>
      {aiuto && !errore && <span className="text-xs text-muto">{aiuto}</span>}
      {errore && <span className="text-xs font-medium text-[#a31b1b]">{errore}</span>}
    </div>
  );
}

export function AreaTesto({ etichetta, errore, ...props }: CampoBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="etichetta">{etichetta}</label>
      <textarea id={id} className="campo resize-y" aria-invalid={!!errore} {...props} />
      {errore && <span className="text-xs font-medium text-[#a31b1b]">{errore}</span>}
    </div>
  );
}

export function Avviso({ tipo = 'errore', children }: { tipo?: 'errore' | 'ok' | 'info'; children: ReactNode }) {
  const stile = {
    errore: 'border-[#f1c3c3] bg-[#fff5f5] text-[#8a2a2a]',
    ok: 'border-[#bfe3cb] bg-[#e7f6ec] text-[#14632f]',
    info: 'border-[#c8d3ea] bg-brand-chiaro text-brand-scuro',
  }[tipo];
  return (
    <div role={tipo === 'errore' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${stile}`}>
      {children}
    </div>
  );
}

export function Sezione({ numero, titolo, children }: { numero?: number; titolo: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        {numero !== undefined && (
          <span className="flex size-[26px] items-center justify-center rounded-lg bg-brand-chiaro text-[13px] font-bold text-brand">{numero}</span>
        )}
        <h2 className="text-base font-bold">{titolo}</h2>
      </div>
      {children}
    </section>
  );
}

const STILE_STATO: Record<StatoTicket, string> = {
  in_lavorazione: 'bg-[#fff4de] text-[#7a4300]',
  in_attesa_cliente: 'bg-[#f1ecff] text-[#4b2c99]',
  risolto: 'bg-[#e7f6ec] text-[#14632f]',
  chiuso: 'bg-[#f4f6fa] text-testo',
};
export const StatoPill = ({ stato }: { stato: StatoTicket }) => (
  <span className={`pill ${STILE_STATO[stato]}`}>{STATO_TICKET_LABEL[stato]}</span>
);

const STILE_PRIORITA: Record<Priorita, string> = {
  bloccante: 'bg-[#fdecec] text-[#a31b1b]',
  alta: 'bg-[#fff1e6] text-[#8f3600]',
  media: 'bg-fondo text-[#2b3852]',
  bassa: 'bg-[#f4f6fa] text-[#4a5670]',
};
export const PrioritaPill = ({ priorita }: { priorita: Priorita }) => (
  <span className={`pill ${STILE_PRIORITA[priorita]}`}>{PRIORITA_LABEL[priorita].nome}</span>
);

export const Caricamento = ({ testo = 'Caricamento…' }: { testo?: string }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-sm text-muto" role="status">
    <span className="size-5 animate-spin rounded-full border-2 border-bordo border-t-brand" aria-hidden="true" />
    {testo}
  </div>
);

export function Vuoto({ titolo, children }: { titolo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-chiaro text-brand">
        <Icona nome="ticket" />
      </span>
      <p className="font-bold">{titolo}</p>
      {children && <div className="text-sm text-muto">{children}</div>}
    </div>
  );
}

const PERCORSI: Record<string, ReactNode> = {
  ticket: <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  utenti: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  piu: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  freccia: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  indietro: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  esci: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  orologio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  ok: <path d="M5 12l5 5L20 7" />,
  cerca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  cestino: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </>
  ),
  team: (
    <>
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  graffetta: (
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  documento: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 12v6" />
      <path d="m9 15 3 3 3-3" />
    </>
  ),
  matita: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  azienda: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  posta: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
};

export function Icona({ nome, dimensione = 18, spessore = 2 }: { nome: keyof typeof PERCORSI | string; dimensione?: number; spessore?: number }) {
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={spessore}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PERCORSI[nome]}
    </svg>
  );
}

export const dataBreve = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
