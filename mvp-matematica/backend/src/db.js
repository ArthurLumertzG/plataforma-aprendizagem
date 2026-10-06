// SQLite local (arquivo data/mvp.db). Cria o esquema, migra versões antigas e
// sincroniza alunos de exemplo, habilidades e questões com seed-data.js.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { ALUNOS, HABILIDADES, QUESTOES } from './seed-data.js';

const aquiDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(aquiDir, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'mvp.db'));
db.pragma('foreign_keys = ON');

/**
 * v1: P(L) gravado na tabela `dominio` e sobrescrito a cada resposta.
 * v2: só eventos append-only; P(L) é recalculado a partir deles (bkt.js).
 * v3: o evento grava a versão dos parâmetros do BKT, a dificuldade servida e a
 *     regra do motor que escolheu a questão (auditoria do próprio modelo).
 * Os dados são fictícios, então a migração simplesmente recria tudo.
 */
const VERSAO_ESQUEMA = 3;

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
  CREATE TABLE IF NOT EXISTS alunos (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL  -- pseudônimo/apelido, nunca o nome completo
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

/** Conteúdo vem do seed: edições em seed-data.js valem no próximo start. */
function semear() {
  const inserirAluno = db.prepare('INSERT OR IGNORE INTO alunos (id, nome) VALUES (?, ?)');
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
    for (const a of ALUNOS) inserirAluno.run(a.id, a.nome);
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
      upsertQuestao.run({ ...q, alternativas: JSON.stringify(q.alternativas), dica: q.dica ?? null });
    }
  })();
}

semear();

/** Habilidades em ordem topológica (a ordem do seed já respeita os pré-requisitos). */
export function listarHabilidades() {
  return db
    .prepare('SELECT id, nome, pre_requisitos, bkt FROM habilidades ORDER BY ordem')
    .all()
    .map((h) => ({
      ...h,
      pre_requisitos: JSON.parse(h.pre_requisitos),
      bkt: h.bkt ? JSON.parse(h.bkt) : null,
    }));
}

/** Questões na ordem do seed (o diagnóstico depende de uma ordem estável). */
export function listarQuestoes() {
  return db
    .prepare('SELECT * FROM questoes ORDER BY rowid')
    .all()
    .map((q) => ({ ...q, alternativas: JSON.parse(q.alternativas) }));
}

export function listarAlunos() {
  return db.prepare('SELECT id, nome FROM alunos ORDER BY id').all();
}

export function buscarAluno(id) {
  return db.prepare('SELECT id, nome FROM alunos WHERE id = ?').get(id);
}

export function criarAluno(nome) {
  const { lastInsertRowid } = db.prepare('INSERT INTO alunos (nome) VALUES (?)').run(nome);
  return buscarAluno(Number(lastInsertRowid));
}

export function buscarQuestao(id) {
  const q = db.prepare('SELECT * FROM questoes WHERE id = ?').get(id);
  return q ? { ...q, alternativas: JSON.parse(q.alternativas) } : undefined;
}

/** Todos os eventos do aluno em ordem cronológica — a entrada do recálculo de P(L). */
export function eventosDoAluno(alunoId) {
  return db
    .prepare(
      `SELECT e.id, e.questao_id, e.habilidade_id, e.tipo, e.resposta_dada, e.correto,
              e.versao_parametros, e.dificuldade_servida, e.regra, e.criado_em, q.enunciado
         FROM eventos e
         JOIN questoes q ON q.id = e.questao_id
        WHERE e.aluno_id = ?
        ORDER BY e.id`,
    )
    .all(alunoId)
    .map((e) => ({ ...e, correto: Boolean(e.correto) }));
}

export function registrarEvento(evento) {
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
}
