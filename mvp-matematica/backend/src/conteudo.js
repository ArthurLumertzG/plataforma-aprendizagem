// Conteúdo pedagógico (habilidades e questões) servido direto do seed-data.js.
// Ele só muda com um novo deploy, então não há por que consultar o banco a cada
// requisição. O banco guarda uma cópia (tabelas `habilidades` e `questoes`) para a
// integridade referencial dos eventos e para análises em SQL; os repositórios a
// sincronizam ao subir, guiados por VERSAO_CONTEUDO.

import { createHash } from 'node:crypto';

import { ALUNOS, HABILIDADES, QUESTOES, TURMAS } from './seed-data.js';

export { ALUNOS };

/** Hash do seed: muda sempre que alguma habilidade, questão, turma ou aluno de exemplo muda. */
export const VERSAO_CONTEUDO = createHash('sha256')
  .update(JSON.stringify({ ALUNOS, HABILIDADES, QUESTOES, TURMAS }))
  .digest('hex')
  .slice(0, 16);

const habilidades = HABILIDADES.map((h) => ({
  id: h.id,
  nome: h.nome,
  pre_requisitos: h.pre_requisitos,
  bkt: h.bkt ?? null,
}));
const questoes = QUESTOES.map((q) => ({ ...q, dica: q.dica ?? null }));
const questaoPorId = new Map(questoes.map((q) => [q.id, q]));

/** Habilidades em ordem topológica (a ordem do seed já respeita os pré-requisitos). */
export const listarHabilidades = () => habilidades;

/** Questões na ordem do seed (o diagnóstico e os desempates dependem dela). */
export const listarQuestoes = () => questoes;

export const buscarQuestao = (id) => questaoPorId.get(id);

/** Turmas na ordem do seed; a primeira recebe quem se cadastra sem escolher. */
export const listarTurmas = () => TURMAS;

export const buscarTurma = (id) => TURMAS.find((t) => t.id === id);
