// Repositório Postgres: o banco de produção (Neon, conectado pelo Marketplace da
// Vercel). Mesma interface do db-sqlite.js. O SQL não depende do driver: quem
// executa é um "executor", que em produção é o driver HTTP da Neon e nos testes é
// o PGlite (Postgres rodando dentro do Node).

import { ALUNOS, HABILIDADES, QUESTOES } from './seed-data.js';
import { VERSAO_CONTEUDO } from './conteudo.js';

/** Sobe quando o esquema mudar; uma migração nova entra em `migrar`. */
const VERSAO_ESQUEMA = '1';

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
     chave TEXT PRIMARY KEY,
     valor TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS alunos (
     id   SERIAL PRIMARY KEY,
     nome TEXT NOT NULL  -- pseudônimo/apelido, nunca o nome completo
   )`,
  `CREATE TABLE IF NOT EXISTS habilidades (
     id             TEXT PRIMARY KEY,
     nome           TEXT NOT NULL,
     pre_requisitos JSONB NOT NULL,
     bkt            JSONB,
     ordem          INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS questoes (
     id               TEXT PRIMARY KEY,
     habilidade       TEXT NOT NULL REFERENCES habilidades(id),
     dificuldade      INTEGER NOT NULL,
     enunciado        TEXT NOT NULL,
     alternativas     JSONB NOT NULL,
     resposta_correta TEXT NOT NULL,
     dica             TEXT,
     ordem            INTEGER NOT NULL
   )`,
  // Append-only: nenhuma rota faz UPDATE ou DELETE aqui.
  `CREATE TABLE IF NOT EXISTS eventos (
     id                  SERIAL PRIMARY KEY,
     aluno_id            INTEGER NOT NULL REFERENCES alunos(id),
     questao_id          TEXT NOT NULL REFERENCES questoes(id),
     habilidade_id       TEXT NOT NULL REFERENCES habilidades(id),
     tipo                TEXT NOT NULL CHECK (tipo IN ('diagnostico', 'pratica')),
     resposta_dada       TEXT NOT NULL,
     correto             BOOLEAN NOT NULL,
     finalidade          TEXT NOT NULL DEFAULT 'pedagogica' CHECK (finalidade = 'pedagogica'),
     versao_parametros   TEXT NOT NULL,
     dificuldade_servida INTEGER NOT NULL,
     regra               TEXT,
     criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  'CREATE INDEX IF NOT EXISTS eventos_por_aluno ON eventos (aluno_id, id)',
];

/** Upserts do conteúdo e dos alunos de exemplo, numa transação só. */
function sincronizacaoDoConteudo() {
  const comandos = [];
  for (const a of ALUNOS) {
    comandos.push([
      'INSERT INTO alunos (id, nome) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [a.id, a.nome],
    ]);
  }
  // Os alunos de exemplo têm id fixo: a sequência precisa continuar depois deles.
  comandos.push([
    `SELECT setval(pg_get_serial_sequence('alunos', 'id'),
                   GREATEST((SELECT MAX(id) FROM alunos), 1))`,
    [],
  ]);
  HABILIDADES.forEach((h, ordem) =>
    comandos.push([
      `INSERT INTO habilidades (id, nome, pre_requisitos, bkt, ordem)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (id) DO UPDATE SET
         nome = excluded.nome, pre_requisitos = excluded.pre_requisitos,
         bkt = excluded.bkt, ordem = excluded.ordem`,
      [h.id, h.nome, JSON.stringify(h.pre_requisitos), h.bkt ? JSON.stringify(h.bkt) : null, ordem],
    ]),
  );
  QUESTOES.forEach((q, ordem) =>
    comandos.push([
      `INSERT INTO questoes
         (id, habilidade, dificuldade, enunciado, alternativas, resposta_correta, dica, ordem)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         habilidade = excluded.habilidade, dificuldade = excluded.dificuldade,
         enunciado = excluded.enunciado, alternativas = excluded.alternativas,
         resposta_correta = excluded.resposta_correta, dica = excluded.dica,
         ordem = excluded.ordem`,
      [
        q.id,
        q.habilidade,
        q.dificuldade,
        q.enunciado,
        JSON.stringify(q.alternativas),
        q.resposta_correta,
        q.dica ?? null,
        ordem,
      ],
    ]),
  );
  for (const [chave, valor] of [
    ['versao_esquema', VERSAO_ESQUEMA],
    ['versao_conteudo', VERSAO_CONTEUDO],
  ]) {
    comandos.push([
      `INSERT INTO meta (chave, valor) VALUES ($1, $2)
       ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
      [chave, valor],
    ]);
  }
  return comandos;
}

/**
 * Cria as tabelas que faltam e sincroniza o conteúdo só quando o seed mudou: na
 * maior parte das vezes isto custa uma consulta.
 */
async function preparar(executor) {
  await executor.lote(ESQUEMA.map((comando) => [comando, []]));
  const [linha] = await executor.consultar(
    "SELECT valor FROM meta WHERE chave = 'versao_conteudo'",
  );
  if (linha?.valor !== VERSAO_CONTEUDO) await executor.lote(sincronizacaoDoConteudo());
}

// criado_em sai no mesmo formato do SQLite ("2026-10-06 14:03:12", em UTC).
const SELECT_EVENTOS = `
  SELECT e.id, e.aluno_id, e.questao_id, e.habilidade_id, e.tipo, e.resposta_dada, e.correto,
         e.versao_parametros, e.dificuldade_servida, e.regra,
         to_char(e.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS criado_em,
         q.enunciado
    FROM eventos e
    JOIN questoes q ON q.id = e.questao_id`;

/**
 * @param {{consultar: (sql: string, params?: any[]) => Promise<object[]>,
 *          lote: (comandos: Array<[string, any[]]>) => Promise<void>}} executor
 * @returns {Promise<object>} Repositório com a mesma interface do SQLite.
 */
export async function criarRepositorioPostgres(executor) {
  await preparar(executor);

  return {
    banco: 'postgres',

    async listarAlunos() {
      return executor.consultar('SELECT id, nome FROM alunos ORDER BY id');
    },

    async buscarAluno(id) {
      const [aluno] = await executor.consultar('SELECT id, nome FROM alunos WHERE id = $1', [id]);
      return aluno;
    },

    async criarAluno(nome) {
      const [aluno] = await executor.consultar(
        'INSERT INTO alunos (nome) VALUES ($1) RETURNING id, nome',
        [nome],
      );
      return aluno;
    },

    async eventosDoAluno(alunoId) {
      return executor.consultar(`${SELECT_EVENTOS} WHERE e.aluno_id = $1 ORDER BY e.id`, [alunoId]);
    },

    async eventosPorAluno() {
      const porAluno = new Map();
      for (const e of await executor.consultar(`${SELECT_EVENTOS} ORDER BY e.id`)) {
        if (!porAluno.has(e.aluno_id)) porAluno.set(e.aluno_id, []);
        porAluno.get(e.aluno_id).push(e);
      }
      return porAluno;
    },

    async registrarEvento(e) {
      const [{ id }] = await executor.consultar(
        `INSERT INTO eventos
           (aluno_id, questao_id, habilidade_id, tipo, resposta_dada, correto,
            versao_parametros, dificuldade_servida, regra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          e.aluno_id,
          e.questao_id,
          e.habilidade_id,
          e.tipo,
          e.resposta_dada,
          e.correto,
          e.versao_parametros,
          e.dificuldade_servida,
          e.regra,
        ],
      );
      return id;
    },
  };
}

/** Executor de produção: driver HTTP da Neon, feito para funções serverless. */
export async function executorNeon(url) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return {
    consultar: (texto, params = []) => sql.query(texto, params),
    lote: async (comandos) => {
      await sql.transaction(comandos.map(([texto, params]) => sql.query(texto, params)));
    },
  };
}
