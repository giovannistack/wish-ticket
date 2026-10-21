export class ErroreApi extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public codice?: string,
  ) {
    super(message);
  }
}

export const nonTrovato = (cosa = 'Risorsa') => new ErroreApi(404, `${cosa} non trovato`, 'NON_TROVATO');
export const nonAutorizzato = (msg = 'Accesso richiesto') => new ErroreApi(401, msg, 'NON_AUTENTICATO');
export const vietato = (msg = 'Operazione non consentita') => new ErroreApi(403, msg, 'VIETATO');
