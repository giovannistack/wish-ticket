import mongoose from 'mongoose';
import './models/index.js';

export async function connettiDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  // Crea gli indici (unici compresi) prima di accettare richieste
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).createIndexes()));
}

export async function chiudiDb(): Promise<void> {
  await mongoose.disconnect();
}
