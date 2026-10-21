import { Link, useLocation, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  CATEGORIA_LABEL,
  DISPONIBILITA_LABEL,
  MODALITA_LABEL,
  TIPO_APPARATO_LABEL,
  type EventoStoricoDTO,
  type TicketDTO,
} from '@wish/shared';
import { api } from '../../api';
import { Storico } from '../../components/Storico';
import { Avviso, Caricamento, Icona, PrioritaPill, StatoPill, dataBreve } from '../../components/ui';

export function SchedaTicket({ t }: { t: TicketDTO }) {
  const righe: Array<[string, string]> = [
    ['Azienda', t.azienda.nome],
    ['Richiedente', t.richiedente.nome],
    ['Categoria', CATEGORIA_LABEL[t.categoria]],
    ['Apparato', [TIPO_APPARATO_LABEL[t.tipoApparato], t.marcaModello].filter(Boolean).join(' · ')],
    ['Serial number', t.seriale || '—'],
    ['Disponibilità', DISPONIBILITA_LABEL[t.disponibilita]],
    ['Telefono', t.telefono || '—'],
    ['Aperto', dataBreve(t.createdAt)],
    ['Tecnico', t.tecnico?.nome || 'Non ancora assegnato'],
    ['Intervento', t.modalita ? MODALITA_LABEL[t.modalita] : '—'],
    ['Copertura', t.fuoriContratto ? 'Fuori contratto' : 'A contratto (1 chiamata)'],
  ];
  return (
    <article className="card flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] text-brand">{t.numero}</span>
          <PrioritaPill priorita={t.priorita} />
          <StatoPill stato={t.stato} />
        </div>
        <h1 className="text-xl font-extrabold leading-snug tracking-tight">{t.oggetto}</h1>
        <p className="whitespace-pre-line text-sm leading-relaxed text-testo">{t.descrizione}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-[13px]">
        {righe.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-muto">{k}</dt>
            <dd className={`font-semibold ${k === 'Serial number' ? 'font-mono' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function BoxSoluzione({ t }: { t: TicketDTO }) {
  if (!t.soluzione || (t.stato !== 'risolto' && t.stato !== 'chiuso')) return null;
  return (
    <section className="flex flex-col gap-2 rounded-[18px] border border-[#bfe3cb] bg-[#e7f6ec] p-5">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-[#14632f]">
        <Icona nome="ok" spessore={2.6} /> Soluzione
      </h2>
      <p className="whitespace-pre-line text-sm leading-relaxed text-[#1d3a26]">{t.soluzione}</p>
      {t.chiusoIl && <span className="text-xs text-[#2f6b43]">Risolto {dataBreve(t.chiusoIl)}</span>}
    </section>
  );
}

export default function DettaglioTicket() {
  const { id } = useParams();
  const creato = (useLocation().state as { creato?: boolean } | null)?.creato;
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api<TicketDTO>(`/ticket/${id}`), refetchInterval: 60_000 });
  const storico = useQuery({
    queryKey: ['ticket', id, 'storico'],
    queryFn: () => api<EventoStoricoDTO[]>(`/ticket/${id}/storico`),
    enabled: q.isSuccess,
    refetchInterval: 60_000,
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <Link to="/" className="flex w-fit items-center gap-1.5 rounded-lg text-sm font-semibold text-brand">
        <Icona nome="indietro" dimensione={16} /> I tuoi ticket
      </Link>
      {creato && q.data && (
        <Avviso tipo="ok">
          Ticket <strong>{q.data.numero}</strong> inviato. Ti abbiamo mandato una mail di conferma.
        </Avviso>
      )}
      {q.isLoading && <Caricamento />}
      {q.isError && <Avviso>Ticket non trovato.</Avviso>}
      {q.data && (
        <>
          {q.data.stato === 'in_attesa_cliente' && (
            <Avviso tipo="info">Il tecnico ha bisogno di informazioni da te: rispondi all'email ricevuta o contatta Wish.</Avviso>
          )}
          <BoxSoluzione t={q.data} />
          <SchedaTicket t={q.data} />
          <Storico eventi={storico.data ?? []} />
        </>
      )}
    </main>
  );
}
