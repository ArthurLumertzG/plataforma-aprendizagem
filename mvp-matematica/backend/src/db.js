// SQLite local (arquivo data/mvp.db). Na primeira execução cria o esquema
// e popula alunos, habilidades e questões a partir de seed-data.js.

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

db.exec(`
  CREATE TABLE IF NOT EXISTS alunos (
    id    INTEGER PRIMARY KEY,
    nome  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS habilidades (
    id             TEXT PRIMARY KEY,
    nome           TEXT NOT NULL,
    pre_requisitos TEXT NOT NULL,  -- JSON array de ids
    ordem          INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questoes (
    id               TEXT PRIMARY KEY,
    habilidade       TEXT NOT NULL REFERENCES habilidades(id),
    dificuldade      INTEGER NOT NULL,
    enunciado        TEXT NOT NULL,
    alternativas     TEXT NOT NULL,  -- JSON array
    resposta_correta TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dominio (
    aluno_id      INTEGER NOT NULL REFERENCES alunos(id),
    habilidade_id TEXT    NOT NULL REFERENCES habilidades(id),
    p_l           REAL    NOT NULL,
    atualizado_em TEXT    NOT NULL,
    PRIMARY KEY (aluno_id, habilidade_id)
  );

  CREATE TABLE IF NOT EXISTS respostas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    aluno_id      INTEGER NOT NULL REFERENCES alunos(id),
    questao_id    TEXT    NOT NULL REFERENCES questoes(id),
    habilidade_id TEXT    NOT NULL REFERENCES habilidades(id),
    resposta_dada TEXT    NOT NULL,
    correto       INTEGER NOT NULL,
    p_l_antes     REAL    NOT NULL,
    p_l_depois    REAL    NOT NULL,
    criado_em     TEXT    NOT NULL
  );
`);

function semear() {
  const inserirAluno = db.prepare('INSERT OR IGNORE INTO alunos (id, nome) VALUES (?, ?)');
  const inserirHabilidade = db.prepare(
    `INSERT OR IGNORE INTO habilidades (id, nome, pre_requisitos, ordem)
     VALUES (?, ?, ?, ?)`,
  );
  const inserirQuestao = db.prepare(
    `INSERT OR IGNORE INTO questoes
       (id, habilidade, dificuldade, enunciado, alternativas, resposta_correta)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    for (const a of ALUNOS) inserirAluno.run(a.id, a.nome);
    HABILIDADES.forEach((h, i) =>
      inserirHabilidade.run(h.id, h.nome, JSON.stringify(h.pre_requisitos), i),
    );
    for (const q of QUESTOES) {
      inserirQuestao.run(
        q.id,
        q.habilidade,
        q.dificuldade,
        q.enunciado,
        JSON.stringify(q.alternativas),
        q.resposta_correta,
      );
    }
  })();
}

semear();

/** Habilidades em ordem topológica (a ordem do seed já respeita os pré-requisitos). */
export function listarHabilidades() {
  return db
    .prepare('SELECT id, nome, pre_requisitos FROM habilidades ORDER BY ordem')
    .all()
    .map((h) => ({ ...h, pre_requisitos: JSON.parse(h.pre_requisitos) }));
}

export function listarQuestoes() {
  return db
    .prepare('SELECT * FROM questoes')
    .all()
    .map((q) => ({ ...q, alternativas: JSON.parse(q.alternativas) }));
}

export function listarAlunos() {
  return db.prepare('SELECT id, nome FROM alunos ORDER BY id').all();
}

export function buscarAluno(id) {
  return db.prepare('SELECT id, nome FROM alunos WHERE id = ?').get(id);
}

export function buscarQuestao(id) {
  const q = db.prepare('SELECT * FROM questoes WHERE id = ?').get(id);
  return q ? { ...q, alternativas: JSON.parse(q.alternativas) } : undefined;
}

/**
 * P(L) do aluno por habilidade. Habilidade ainda sem registro assume P(L0),
 * então não é preciso pré-popular a tabela `dominio` no seed.
 */
export function dominioDoAluno(alunoId, pL0) {
  const linhas = db
    .prepare('SELECT habilidade_id, p_l FROM dominio WHERE aluno_id = ?')
    .all(alunoId);

  const dominio = {};
  for (const h of listarHabilidades()) dominio[h.id] = pL0;
  for (const l of linhas) dominio[l.habilidade_id] = l.p_l;
  return dominio;
}

export function salvarDominio(alunoId, habilidadeId, pL) {
  db.prepare(
    `INSERT INTO dominio (aluno_id, habilidade_id, p_l, atualizado_em)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (aluno_id, habilidade_id)
       DO UPDATE SET p_l = excluded.p_l, atualizado_em = excluded.atualizado_em`,
  ).run(alunoId, habilidadeId, pL);
}

export function registrarResposta(resposta) {
  db.prepare(
    `INSERT INTO respostas
       (aluno_id, questao_id, habilidade_id, resposta_dada, correto,
        p_l_antes, p_l_depois, criado_em)
     VALUES (@aluno_id, @questao_id, @habilidade_id, @resposta_dada, @correto,
             @p_l_antes, @p_l_depois, datetime('now'))`,
  ).run(resposta);
}

export function ultimaResposta(alunoId) {
  return db
    .prepare('SELECT * FROM respostas WHERE aluno_id = ? ORDER BY id DESC LIMIT 1')
    .get(alunoId);
}

/** Histórico mais recente primeiro (o painel do professor mostra as 10 últimas). */
export function historico(alunoId, limite = 10) {
  return db
    .prepare(
      `SELECT r.id, r.questao_id, r.habilidade_id, r.resposta_dada, r.correto,
              r.p_l_depois, r.criado_em, q.enunciado
         FROM respostas r
         JOIN questoes q ON q.id = r.questao_id
        WHERE r.aluno_id = ?
        ORDER BY r.id DESC
        LIMIT ?`,
    )
    .all(alunoId, limite)
    .map((r) => ({ ...r, correto: Boolean(r.correto) }));
}

/** Quantos erros seguidos o aluno acumulou na habilidade (regra 4 do motor). */
export function errosSeguidos(alunoId, habilidadeId) {
  const recentes = db
    .prepare(
      `SELECT correto FROM respostas
        WHERE aluno_id = ? AND habilidade_id = ?
        ORDER BY id DESC LIMIT 10`,
    )
    .all(alunoId, habilidadeId);

  let n = 0;
  for (const r of recentes) {
    if (r.correto) break;
    n++;
  }
  return n;
}
