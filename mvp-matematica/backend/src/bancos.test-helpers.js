// Os dois bancos que os testes exercitam com o mesmo contrato: SQLite em memória
// (desenvolvimento) e Postgres via PGlite (o mesmo SQL que roda na Neon).
import { PGlite } from '@electric-sql/pglite';

import { criarRepositorioPostgres } from './db-postgres.js';
import { criarRepositorioSqlite } from './db-sqlite.js';

/** Executor sobre o PGlite, com a mesma forma do executor da Neon. */
export function executorPGlite(db) {
  return {
    consultar: async (texto, params = []) => (await db.query(texto, params)).rows,
    lote: async (comandos) => {
      await db.transaction(async (tx) => {
        for (const [texto, params] of comandos) await tx.query(texto, params);
      });
    },
  };
}

export const BANCOS = [
  { nome: 'sqlite', criar: () => criarRepositorioSqlite(':memory:') },
  { nome: 'postgres', criar: () => criarRepositorioPostgres(executorPGlite(new PGlite())) },
];
