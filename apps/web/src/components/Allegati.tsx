import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MAX_ALLEGATO_MB, MIME_ALLEGATI, type AllegatoDTO } from '@wish/shared';
import { api, apiBlob, apiUpload, ErroreHttp } from '../api';
import { Avviso, Icona, dataBreve } from './ui';

export const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

export function controllaFile(f: File): string | null {
  if (f.size > MAX_ALLEGATO_MB * 1024 * 1024) return `${f.name}: troppo grande (massimo ${MAX_ALLEGATO_MB} MB)`;
  const okTipo = (MIME_ALLEGATI as readonly string[]).includes(f.type) || /\.(jpe?g|png|webp|pdf)$/i.test(f.name);
  if (!okTipo) return `${f.name}: formato non accettato (solo foto JPG/PNG o PDF)`;
  return null;
}

export const dimensione = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** Anteprima di un'immagine protetta: scaricata con il token, mostrata da un URL locale. */
function Miniatura({ a }: { a: AllegatoDTO }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!a.mime.startsWith('image/')) return;
    let revoca: string | null = null;
    apiBlob(`/allegati/${a.id}/file`)
      .then((b) => {
        revoca = URL.createObjectURL(b);
        setUrl(revoca);
      })
      .catch(() => setUrl(null));
    return () => {
      if (revoca) URL.revokeObjectURL(revoca);
    };
  }, [a.id, a.mime]);
  if (!a.mime.startsWith('image/')) {
    return (
      <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-[#fdecec] text-xs font-extrabold text-[#a31b1b]" aria-hidden="true">
        PDF
      </span>
    );
  }
  return url ? (
    <img src={url} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
  ) : (
    <span className="size-16 shrink-0 animate-pulse rounded-xl bg-fondo" aria-hidden="true" />
  );
}

async function apri(a: AllegatoDTO) {
  // la finestra si apre subito (i browser bloccano i popup aperti dopo un'attesa), poi riceve il file
  const finestra = window.open('', '_blank');
  try {
    const b = await apiBlob(`/allegati/${a.id}/file`);
    const url = URL.createObjectURL(b);
    if (finestra) finestra.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    finestra?.close();
    alert('Impossibile aprire il file');
  }
}

/**
 * Elenco e caricamento allegati di un ticket.
 * Lato cliente: vede i propri e quelli che Wish rende visibili. Lato admin: tutto, con "solo interno" ed eliminazione.
 */
export function Allegati({
  allegati,
  percorsoUpload,
  admin = false,
  onCambio,
}: {
  allegati: AllegatoDTO[];
  percorsoUpload: string;
  admin?: boolean;
  onCambio: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [nota, setNota] = useState('');
  const [visibile, setVisibile] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useMutation({
    mutationFn: () => apiUpload(percorsoUpload, file!, admin ? { nota, visibileCliente: String(visibile) } : { nota }),
    onSuccess: () => {
      setFile(null);
      setNota('');
      setVisibile(true);
      if (input.current) input.current.value = '';
      onCambio();
    },
    onError: (e) => setErrore(e instanceof ErroreHttp ? e.message : 'Caricamento non riuscito'),
  });
  const elimina = useMutation({
    mutationFn: (id: string) => api(`/allegati/${id}`, { method: 'DELETE' }),
    onSuccess: onCambio,
  });
  const visibilita = useMutation({
    mutationFn: (v: { id: string; visibileCliente: boolean }) => api(`/allegati/${v.id}`, { method: 'PATCH', body: { visibileCliente: v.visibileCliente } }),
    onSuccess: onCambio,
  });

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold">Foto e documenti</h2>
        <span className="text-xs text-muto">JPG, PNG o PDF · max {MAX_ALLEGATO_MB} MB</span>
      </div>

      {allegati.length === 0 && <p className="text-sm text-muto">Nessun allegato.</p>}
      <ul className="flex flex-col gap-2">
        {allegati.map((a) => (
          <li key={a.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${a.visibileCliente ? 'border-riga' : 'border-[#f3e2c2] bg-[#fffbea]'}`}>
            <button type="button" onClick={() => apri(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Apri ${a.nome}`}>
              <Miniatura a={a} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-bold text-brand">{a.nome}</span>
                {a.nota && <span className="text-[13px] leading-snug text-inchiostro">{a.nota}</span>}
                <span className="text-xs text-muto">
                  {a.daWish ? 'Wish' : a.autore} · {dataBreve(a.data)} · {dimensione(a.dimensione)}
                </span>
              </span>
            </button>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {admin && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={a.visibileCliente}
                  aria-label={`${a.nome}: ${a.visibileCliente ? 'visibile al cliente' : 'non visibile al cliente'}`}
                  title={a.visibileCliente ? 'Clicca per nasconderlo al cliente' : 'Clicca per renderlo visibile al cliente'}
                  disabled={visibilita.isPending}
                  onClick={() => visibilita.mutate({ id: a.id, visibileCliente: !a.visibileCliente })}
                  className={`flex min-h-9 items-center gap-2 rounded-full border px-2.5 text-xs font-bold transition ${
                    a.visibileCliente ? 'border-[#bfe3cb] bg-[#e7f6ec] text-[#14632f]' : 'border-[#f3d9a8] bg-[#fff4de] text-[#7a4300]'
                  }`}
                >
                  <span className={`relative h-4 w-7 rounded-full transition ${a.visibileCliente ? 'bg-[#1f8a46]' : 'bg-[#d8b98a]'}`} aria-hidden="true">
                    <span className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-all ${a.visibileCliente ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                  {a.visibileCliente ? 'Visibile al cliente' : 'Non visibile al cliente'}
                </button>
              )}
              {admin && !a.daWish && <span className="text-[11px] text-muto">Caricato dal cliente</span>}
              {admin && (
                <button
                  type="button"
                  aria-label={`Elimina ${a.nome}`}
                  title="Elimina"
                  disabled={elimina.isPending}
                  onClick={() => {
                    if (window.confirm(`Eliminare "${a.nome}"?`)) elimina.mutate(a.id);
                  }}
                  className="flex size-9 items-center justify-center rounded-lg text-muto hover:bg-[#fff5f5] hover:text-[#a31b1b]"
                >
                  <Icona nome="cestino" dimensione={16} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-3 border-t border-riga pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) carica.mutate();
        }}
      >
        <label className="flex cursor-pointer items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed border-[#afc0e4] bg-[#f7f9fc] p-4 hover:border-brand">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-chiaro text-brand">
            <Icona nome="graffetta" dimensione={22} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{file ? file.name : 'Scegli una foto o un PDF'}</span>
            <span className="text-xs text-muto">{file ? dimensione(file.size) : 'Dal telefono puoi anche scattare una foto'}</span>
          </span>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setErrore(f ? controllaFile(f) : null);
              setFile(f && !controllaFile(f) ? f : null);
            }}
          />
        </label>
        {file && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="etichetta">Nota {admin ? 'per il cliente' : ''} <span className="font-normal text-muto">(facoltativa)</span></span>
              <input className="campo" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder={admin ? 'Es. Rapporto di intervento firmato' : 'Es. Il messaggio di errore che compare'} />
            </label>
            {admin && (
              <label className="flex min-h-10 items-center gap-3 text-sm">
                <input type="checkbox" checked={visibile} onChange={(e) => setVisibile(e.target.checked)} className="size-5 accent-[#1f8a46]" />
                <span>
                  <strong>Visibile al cliente</strong>{' '}
                  <span className="text-muto">{visibile ? '· lo vede nel ticket e riceve una email' : '· resta solo per Wish'}</span>
                </span>
              </label>
            )}
            <button type="submit" className="btn-primario self-end" disabled={carica.isPending}>
              {carica.isPending ? 'Caricamento…' : 'Carica'}
            </button>
          </>
        )}
        {(errore || elimina.error || visibilita.error) && <Avviso>{errore ?? ((elimina.error ?? visibilita.error) as Error).message}</Avviso>}
      </form>
    </section>
  );
}

/** Scelta di più file nel modulo di apertura: vengono caricati dopo la creazione del ticket. */
export function SceltaFile({ file, onCambio }: { file: File[]; onCambio: (f: File[]) => void }) {
  const [errore, setErrore] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed border-[#afc0e4] bg-[#f7f9fc] p-[18px] hover:border-brand">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-chiaro text-brand">
          <Icona nome="graffetta" dimensione={22} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Aggiungi foto o PDF</span>
          <span className="text-xs text-muto">JPG, PNG o PDF · max {MAX_ALLEGATO_MB} MB · fino a 5 file</span>
        </span>
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const scelti = Array.from(e.target.files ?? []);
            const errori = scelti.map(controllaFile).filter(Boolean) as string[];
            const validi = scelti.filter((f) => !controllaFile(f));
            const tutti = [...file, ...validi].slice(0, 5);
            setErrore(errori[0] ?? (file.length + validi.length > 5 ? 'Al massimo 5 file' : null));
            onCambio(tutti);
            e.target.value = '';
          }}
        />
      </label>
      {file.map((f, i) => (
        <div key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-riga px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
          <span className="text-xs text-muto">{dimensione(f.size)}</span>
          <button type="button" aria-label={`Togli ${f.name}`} className="flex size-9 items-center justify-center rounded-lg text-muto hover:text-[#a31b1b]" onClick={() => onCambio(file.filter((_, j) => j !== i))}>
            <Icona nome="cestino" dimensione={15} />
          </button>
        </div>
      ))}
      {errore && <span className="text-xs font-medium text-[#a31b1b]">{errore}</span>}
    </div>
  );
}
