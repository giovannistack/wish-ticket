import { TIPOLOGIA_CLIENTE_LABEL, TIPOLOGIE_CLIENTE, type TipologiaCliente } from '@wish/shared';

const STILE: Record<TipologiaCliente, string> = {
  contratto: 'bg-[#e6f6ec] text-[#14632f]',
  senza_contratto: 'bg-[#fff1e6] text-[#8f3600]',
  privato: 'bg-[#f0ebff] text-[#5a37c4]',
};

const BREVE: Record<TipologiaCliente, string> = {
  contratto: 'Con contratto',
  senza_contratto: 'Senza contratto',
  privato: 'Privato',
};

/** Bollino con la tipologia del cliente: con contratto, senza contratto, privato. */
export function TipologiaPill({ tipologia, breve = true, piccola = false }: { tipologia: TipologiaCliente; breve?: boolean; piccola?: boolean }) {
  return (
    <span className={`pill ${STILE[tipologia]} ${piccola ? 'px-2 py-0.5 text-[11px]' : ''}`} title={TIPOLOGIA_CLIENTE_LABEL[tipologia]}>
      {breve ? BREVE[tipologia] : TIPOLOGIA_CLIENTE_LABEL[tipologia]}
    </span>
  );
}

/** Filtro a pulsanti: tutte le tipologie oppure una sola. */
export function FiltroTipologia({ valore, onCambio }: { valore: TipologiaCliente | ''; onCambio: (t: TipologiaCliente | '') => void }) {
  const voci: Array<{ id: TipologiaCliente | ''; nome: string }> = [
    { id: '', nome: 'Tutti' },
    ...TIPOLOGIE_CLIENTE.map((t) => ({ id: t, nome: BREVE[t] })),
  ];
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl bg-fondo p-1" role="group" aria-label="Filtra per tipologia di cliente">
      {voci.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={valore === v.id}
          onClick={() => onCambio(v.id)}
          className={`h-9 rounded-[9px] px-3.5 text-[13px] ${valore === v.id ? 'bg-white font-bold text-inchiostro shadow-sm' : 'font-semibold text-testo hover:text-inchiostro'}`}
        >
          {v.nome}
        </button>
      ))}
    </div>
  );
}

/** Opzioni di una <select> di clienti, raggruppate per tipologia. */
export function OpzioniClienti({ clienti }: { clienti: Array<{ id: string; nome: string; tipologia: TipologiaCliente }> }) {
  return (
    <>
      {TIPOLOGIE_CLIENTE.map((t) => {
        const gruppo = clienti.filter((c) => c.tipologia === t);
        if (!gruppo.length) return null;
        return (
          <optgroup key={t} label={TIPOLOGIA_CLIENTE_LABEL[t]}>
            {gruppo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
