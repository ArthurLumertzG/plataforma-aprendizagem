import test from 'node:test';
import assert from 'node:assert/strict';

import { comparativoDeTurmas, fronteiraDoAluno, relatorioDaTurma, resumoDoAluno } from './relatorio.js';

// Um resumo de habilidade no formato de resumoDominio (routes.js), só com o que importa.
const hab = (habilidade_id, extra = {}) => ({
  habilidade_id,
  nome: habilidade_id.toUpperCase(),
  pre_requisitos: [],
  p_l: 0.3,
  p_l0: 0.3,
  ganho: null,
  dominada: false,
  consolidada: false,
  travou: false,
  respostas_pratica: 0,
  recente: { divergente: false },
  ate_dominio: null,
  retencao: { retornos: 0, acertos: 0 },
  ...extra,
});
const habilidades = [{ id: 'a' }, { id: 'b' }];
const pratica = (correto) => ({ tipo: 'pratica', correto, criado_em: '2026-10-10 12:00:00' });
const concluido = { concluido: true, respondidos: 2, total: 2 };

test('fronteira: a primeira não consolidada com os pré-requisitos consolidados', () => {
  const dominio = [hab('a', { consolidada: true }), hab('b', { pre_requisitos: ['a'] })];
  assert.equal(fronteiraDoAluno(dominio).habilidade_id, 'b');
  assert.equal(fronteiraDoAluno([hab('a', { consolidada: true })]), null);
});

test('resumo do aluno: situação do mais urgente ao menos', () => {
  const base = { aluno: { id: 1, nome: 'X' }, diagnostico: concluido };
  const situacao = (extra) => resumoDoAluno({ ...base, ...extra }).situacao;
  assert.equal(situacao({ eventos: [], dominio: [hab('a')] }), 'sem_respostas');
  assert.equal(
    situacao({ eventos: [pratica(true)], diagnostico: { concluido: false }, dominio: [hab('a')] }),
    'teste_rapido',
  );
  assert.equal(situacao({ eventos: [pratica(false)], dominio: [hab('a', { travou: true })] }), 'travou');
  assert.equal(
    situacao({ eventos: [pratica(true)], dominio: [hab('a', { recente: { divergente: true } })] }),
    'investigar',
  );
  assert.equal(situacao({ eventos: [pratica(true)], dominio: [hab('a')] }), 'em_dia');
});

test('relatório: conta quem ficou de fora e não mistura P(L) padrão na média', () => {
  const r = relatorioDaTurma({
    turma: { id: 1, nome: 'T' },
    habilidades,
    entradas: [
      {
        aluno: { id: 1, nome: 'Com dados' },
        eventos: [pratica(true), pratica(false)],
        diagnostico: concluido,
        dominio: [
          hab('a', { p_l: 0.9, dominada: true, consolidada: true, ganho: 0.2, respostas_pratica: 2 }),
          hab('b', { p_l: 0.5, pre_requisitos: ['a'] }),
        ],
      },
      {
        aluno: { id: 2, nome: 'Sem respostas' },
        eventos: [],
        diagnostico: { concluido: false, respondidos: 0, total: 2 },
        dominio: [hab('a'), hab('b')],
      },
    ],
  });
  assert.equal(r.indicadores.alunos, 2);
  assert.equal(r.indicadores.sem_respostas, 1);
  assert.equal(r.indicadores.taxa_acerto, 0.5);
  assert.equal(r.indicadores.dominadas_media, 1);
  assert.equal(r.indicadores.com_diagnostico, 1);
  const [a] = r.habilidades;
  assert.equal(a.p_l_medio, 0.9); // o 0,3 padrão de quem não fez o teste não entra
  assert.equal(a.dominaram, 1);
  assert.equal(a.alunos, 2);
  assert.deepEqual(r.grupos.por_habilidade.map((g) => [g.habilidade_id, g.alunos.length]), [['b', 1]]);
  assert.equal(r.grupos.sem_respostas.length, 1);
  assert.equal(comparativoDeTurmas([r])[0].turma.nome, 'T');
});
