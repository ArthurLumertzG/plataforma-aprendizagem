// Onde os dados (alunos e eventos) ficam. Com DATABASE_URL, Postgres (a Neon
// conectada ao projeto na Vercel); sem ela, o SQLite local de sempre. Assim o
// `npm run dev` continua funcionando offline e sem configuração.

class ErroDeConfiguracao extends Error {
  publico = true;
}

let repositorio;

async function criar() {
  // A integração da Neon na Vercel injeta DATABASE_URL; alguns modelos usam POSTGRES_URL.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { criarRepositorioPostgres, executorNeon } = await import('./db-postgres.js');
    return criarRepositorioPostgres(await executorNeon(url));
  }
  // Num deploy da Vercel o disco não guarda nada entre requisições: SQLite lá
  // perderia os dados. (No `vercel dev` local, VERCEL_ENV é "development".)
  if (['production', 'preview'].includes(process.env.VERCEL_ENV)) {
    throw new ErroDeConfiguracao(
      'Banco não configurado: conecte um Postgres (Neon) ao projeto na Vercel para criar DATABASE_URL.',
    );
  }
  const { criarRepositorioSqlite } = await import('./db-sqlite.js');
  return criarRepositorioSqlite();
}

/** O repositório da instância, criado na primeira requisição e reaproveitado depois. */
export function obterRepositorio() {
  repositorio ??= criar().catch((erro) => {
    repositorio = undefined; // tenta de novo na próxima requisição
    throw erro;
  });
  return repositorio;
}

/** Para os testes: usa um repositório em memória no lugar do padrão. */
export function definirRepositorio(novo) {
  repositorio = Promise.resolve(novo);
}
