import { minutiRiga, type FirmaDTO, type RapportoDTO } from '@wish/shared';

const tondo = (n: number) => Math.round(n * 100) / 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const firma = (f: any): FirmaDTO | null =>
  f && f.immagine ? { nome: f.nome, immagine: f.immagine, data: new Date(f.data).toISOString() } : null;

/** Rapportino del ticket con i totali calcolati (tempo, parti). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rapportoDTO(r: any): RapportoDTO {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interventi = (r?.interventi ?? []).map((i: any) => ({
    id: String(i._id),
    data: i.data,
    inizio: i.inizio,
    fine: i.fine,
    viaggioMinuti: i.viaggioMinuti ?? 0,
    tipologia: i.tipologia,
    minuti: minutiRiga(i),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parti = (r?.parti ?? []).map((p: any) => ({
    id: String(p._id),
    codice: p.codice ?? '',
    descrizione: p.descrizione,
    quantita: p.quantita,
    prezzoUnitario: p.prezzoUnitario ?? null,
    totale: p.prezzoUnitario == null ? null : tondo(p.prezzoUnitario * p.quantita),
  }));
  return {
    interventi,
    parti,
    importoTotale: r?.importoTotale ?? null,
    note: r?.note ?? '',
    minutiTotali: interventi.reduce((s: number, i: { minuti: number }) => s + i.minuti, 0),
    totaleParti: tondo(parti.reduce((s: number, p: { totale: number | null }) => s + (p.totale ?? 0), 0)),
    firme: { cliente: firma(r?.firmaCliente), tecnico: firma(r?.firmaTecnico) },
  };
}

/** Il contenuto firmabile (senza firme): serve a capire se una modifica invalida le firme. */
export const impronta = (r: RapportoDTO) =>
  JSON.stringify({
    i: r.interventi.map(({ id: _i, ...x }) => x),
    p: r.parti.map(({ id: _p, ...x }) => x),
    t: r.importoTotale,
    n: r.note,
  });
