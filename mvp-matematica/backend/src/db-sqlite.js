// Repositório SQLite (arquivo data/mvp.db): o banco de desenvolvimento, que roda
// sem nenhuma configuração. Em produção o repositório é o Postgres (db-postgres.js).
// Cria o esquema, migra versões antigas e sincroniza alunos de exemplo,
// habilidades e questões com o seed.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { ALUNOS, HABILIDADES, QUESTOES, TURMAS } from './seed-data.js';

const aquiDir = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_PADRAO = path.join(aquiDir, '..', 'data', 'mvp.db');

/**
 * v1: P(L) gravado na tabela `dominio` e sobrescrito a cada resposta.
 * v2: só eventos append-only; P(L) é recalculado a partir deles (bkt.js).
 * v3: o evento grava a versão dos parâmetros do BKT, a dificuldade servida e a
 *     regra do motor que escolheu a questão (auditoria do próprio modelo).
 * Os dados são fictícios, então a migração simplesmente recria tudo.
 */
const VERSAO_ESQUEMA = 3;

function migrar(db) {
  if (db.pragma('user_version', { simple: true }) < VERSAO_ESQUEMA) {
    db.exec(`
      DROP TABLE IF EXISTS respostas;
      DROP TABLE IF EXISTS dominio;
      DROP TABLE IF EXISTS eventos;
      DROP TABLE IF EXISTS questoes;
      DROP TABLE IF EXISTS habilidades;
      DROP TABLE IF EXISTS alunos;
    `);
    db.pragma(`user_version = ${VERSAO_ESQUEMA}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS turmas (
      id    INTEGER PRIMARY KEY,
      nome  TEXT NOT NULL,
      ordem INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alunos (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      nome  TEXT NOT NULL,  -- pseudônimo/apelido, nunca o nome completo
      simulado INTEGER NOT NULL DEFAULT 0,  -- turma simulada da demonstração (simulacao.js)
      turma_id INTEGER REFERENCES turmas(id)
    );

    CREATE TABLE IF NOT EXISTS habilidades (
      id             TEXT PRIMARY KEY,
      nome           TEXT NOT NULL,
      pre_requisitos TEXT NOT NULL,  -- JSON array de ids
      bkt            TEXT,           -- JSON opcional: P_L0/P_T/P_S/P_G da habilidade
      ordem          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questoes (
      id               TEXT PRIMARY KEY,
      habilidade       TEXT NOT NULL REFERENCES habilidades(id),
      dificuldade      INTEGER NOT NULL,
      enunciado        TEXT NOT NULL,
      alternativas     TEXT NOT NULL,  -- JSON array
      resposta_correta TEXT NOT NULL,
      dica             TEXT
    );

    -- Append-only: nenhuma rota faz UPDATE ou DELETE aqui.
    CREATE TABLE IF NOT EXISTS eventos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      aluno_id      INTEGER NOT NULL REFERENCES alunos(id),
      questao_id    TEXT    NOT NULL REFERENCES questoes(id),
      habilidade_id TEXT    NOT NULL REFERENCES habilidades(id),
      tipo          TEXT    NOT NULL CHECK (tipo IN ('diagnostico', 'pratica')),
      resposta_dada TEXT    NOT NULL,
      correto       INTEGER NOT NULL,
      finalidade    TEXT    NOT NULL DEFAULT 'pedagogica' CHECK (finalidade = 'pedagogica'),
      -- Auditoria: o motor decide o que o aluno vê, então os dados já nascem
      -- enviesados por ele. Guardar como cada questão foi servida permite medir isso.
      versao_parametros   TEXT    NOT NULL,  -- VERSAO_PARAMETROS do bkt.js em vigor
      dificuldade_servida INTEGER NOT NULL,
      regra               TEXT,              -- regra do motor; NULL se não era a recomendada
      criado_em     TEXT    NOT NULL
    );
  `);

  // Bancos anteriores à turma simulada: a coluna entra sem apagar nada.
  const colunas = db.prepare('PRAGMA table_info(alunos)').all().map((c) => c.name);
  if (!colunas.includes('simulado')) {
    db.exec('ALTER TABLE alunos ADD COLUMN simulado INTEGER NOT NULL DEFAULT 0');
  }
  if (!colunas.includes('turma_id')) {
    db.exec('ALTER TABLE alunos ADD COLUMN turma_id INTEGER REFERENCES turmas(id)');
  }
}

/** Conteúdo vem do seed: edições em seed-data.js valem no próximo start. */
function semear(db) {
  const upsertTurma = db.prepare(
    `INSERT INTO turmas (id, nome, ordem) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, ordem = excluded.ordem`,
  );
  const inserirAluno = db.prepare(
    'INSERT OR IGNORE INTO alunos (id, nome, turma_id) VALUES (?, ?, ?)',
  );
  const upsertHabilidade = db.prepare(
    `INSERT INTO habilidades (id, nome, pre_requisitos, bkt, ordem)
     VALUES (@id, @nome, @pre_requisitos, @bkt, @ordem)
     ON CONFLICT (id) DO UPDATE SET
       nome = excluded.nome, pre_requisitos = excluded.pre_requisitos,
       bkt = excluded.bkt, ordem = excluded.ordem`,
  );
  const upsertQuestao = db.prepare(
    `INSERT INTO questoes
       (id, habilidade, dificuldade, enunciado, alternativas, resposta_correta, dica)
     VALUES (@id, @habilidade, @dificuldade, @enunciado, @alternativas, @resposta_correta, @dica)
     ON CONFLICT (id) DO UPDATE SET
       habilidade = excluded.habilidade, dificuldade = excluded.dificuldade,
       enunciado = excluded.enunciado, alternativas = excluded.alternativas,
       resposta_correta = excluded.resposta_correta, dica = excluded.dica`,
  );

  db.transaction(() => {
    TURMAS.forEach((t, i) => upsertTurma.run(t.id, t.nome, i));
    for (const a of ALUNOS) inserirAluno.run(a.id, a.nome, a.turma_id);
    // Alunos de antes das turmas vão para a primeira.
    db.prepare('UPDATE alunos SET turma_id = ? WHERE turma_id IS NULL').run(TURMAS[0].id);
    HABILIDADES.forEach((h, i) =>
      upsertHabilidade.run({
        id: h.id,
        nome: h.nome,
        pre_requisitos: JSON.stringify(h.pre_requisitos),
        bkt: h.bkt ? JSON.stringify(h.bkt) : null,
        ordem: i,
      }),
    );
    for (const q of QUESTOES) {
      upsertQuestao.run({
        ...q,
        alternativas: JSON.stringify(q.alternativas),
        dica: q.dica ?? null,
      });
    }
  })();
}

const SELECT_EVENTOS = `
  SELECT e.id, e.aluno_id, e.questao_id, e.habilidade_id, e.tipo, e.resposta_dada, e.correto,
         e.versao_parametros, e.dificuldade_servida, e.regra, e.criado_em, q.enunciado
    FROM eventos e
    JOIN questoes q ON q.id = e.questao_id`;

const comoEvento = (e) => ({ ...e, correto: Boolean(e.correto) });

/**
 * @param {string} [caminho] Arquivo do banco, ou ':memory:' (testes).
 * @returns {Promise<object>} Repositório com a mesma interface do Postgres.
 */
export async function criarRepositorioSqlite(caminho = CAMINHO_PADRAO) {
  if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  db.pragma('foreign_keys = ON');
  migrar(db);
  semear(db);

  // A única exceção ao append-only: apagar a turma simulada inteira, nunca um evento solto.
  const removerSimulados = () => {
    db.exec(`
      DELETE FROM eventos WHERE aluno_id IN (SELECT id FROM alunos WHERE simulado = 1);
      DELETE FROM alunos WHERE simulado = 1;
    `);
  };

  return {
    banco: 'sqlite',

    async listarAlunos() {
      return db.prepare('SELECT id, nome, turma_id FROM alunos ORDER BY id').all();
    },

    async buscarAluno(id) {
      return db.prepare('SELECT id, nome, turma_id FROM alunos WHERE id = ?').get(id);
    },

    async criarAluno(nome, turmaId = TURMAS[0].id) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO alunos (nome, turma_id) VALUES (?, ?)')
        .run(nome, turmaId);
      return { id: Number(lastInsertRowid), nome, turma_id: turmaId };
    },

    /** Todos os eventos do aluno em ordem cronológica — a entrada do recálculo de P(L). */
    async eventosDoAluno(alunoId) {
      return db
        .prepare(`${SELECT_EVENTOS} WHERE e.aluno_id = ? ORDER BY e.id`)
        .all(alunoId)
        .map(comoEvento);
    },

    /** Os eventos de todos os alunos de uma vez, agrupados por aluno (painel). */
    async eventosPorAluno() {
      const porAluno = new Map();
      for (const e of db.prepare(`${SELECT_EVENTOS} ORDER BY e.id`).all()) {
        if (!porAluno.has(e.aluno_id)) porAluno.set(e.aluno_id, []);
        porAluno.get(e.aluno_id).push(comoEvento(e));
      }
      return porAluno;
    },

    async alunosSimulados() {
      return db.prepare('SELECT id FROM alunos WHERE simulado = 1 ORDER BY id').pluck().all();
    },

    /**
     * Troca a turma simulada inteira (alunos e eventos) numa transação. Não mexe
     * em nenhum aluno de verdade nem nos alunos de exemplo.
     */
    async substituirSimulados(alunos) {
      const inserirAluno = db.prepare(
        'INSERT INTO alunos (nome, simulado, turma_id) VALUES (?, 1, ?)',
      );
      const inserirEvento = db.prepare(
        `INSERT INTO eventos
           (aluno_id, questao_id, habilidade_id, tipo, resposta_dada, correto,
            versao_parametros, dificuldade_servida, regra, criado_em)
         VALUES (@aluno_id, @questao_id, @habilidade_id, @tipo, @resposta_dada, @correto,
                 @versao_parametros, @dificuldade_servida, @regra, @criado_em)`,
      );
      db.transaction(() => {
        removerSimulados();
        for (const aluno of alunos) {
          const alunoId = Number(inserirAluno.run(aluno.nome, aluno.turma_id).lastInsertRowid);
          for (const { id, ...e } of aluno.eventos) {
            inserirEvento.run({ ...e, aluno_id: alunoId, correto: e.correto ? 1 : 0 });
          }
        }
      })();
    },

    async removerSimulados() {
      db.transaction(removerSimulados)();
    },

    /**
     * "Limpar informações": volta ao estado inicial. Apaga todas as respostas e todos
     * os alunos criados depois (inclusive os simulados); ficam os de exemplo, zerados.
     */
    async limparTudo() {
      const exemplo = ALUNOS.map((a) => a.id);
      db.transaction(() => {
        db.exec('DELETE FROM eventos');
        db.prepare(
          `DELETE FROM alunos WHERE id NOT IN (${exemplo.map(() => '?').join(', ')})`,
        ).run(...exemplo);
        db.exec(`
          DELETE FROM sqlite_sequence WHERE name = 'eventos';
          UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM alunos) WHERE name = 'alunos';
        `);
      })();
    },

    async registrarEvento(evento) {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO eventos
             (aluno_id, questao_id, habilidade_id, tipo, resposta_dada, correto,
              versao_parametros, dificuldade_servida, regra, criado_em)
           VALUES (@aluno_id, @questao_id, @habilidade_id, @tipo, @resposta_dada, @correto,
                   @versao_parametros, @dificuldade_servida, @regra, datetime('now'))`,
        )
        .run({ ...evento, correto: evento.correto ? 1 : 0 });
      return Number(lastInsertRowid);
    },
  };
}
