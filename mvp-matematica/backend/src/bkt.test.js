import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARAMETROS,
  LIMIAR_DOMINIO,
  atualizarPL,
  escolherHabilidade,
  dificuldadeAlvo,
  selecionarProximaQuestao,
} from './bkt.js';
import { HABILIDADES, QUESTOES } from './seed-data.js';

const proximo = (v) => Number(v.toFixed(6));

test('atualizarPL: acerto aumenta P(L)', () => {
  const novo = atualizarPL(PARAMETROS.P_L0, true);
  // P(L|obs) = 0.27 / 0.41 = 0.658537 ; P(L') = 0.658537 + 0.341463*0.15
  assert.equal(proximo(novo), 0.709756);
  assert.ok(novo > PARAMETROS.P_L0);
});

test('atualizarPL: erro diminui P(L)', () => {
  const novo = atualizarPL(PARAMETROS.P_L0, false);
  // P(L|obs) = 0.03 / 0.59 = 0.050847 ; P(L') = 0.050847 + 0.949153*0.15
  assert.equal(proximo(novo), 0.19322);
  assert.ok(novo < PARAMETROS.P_L0);
});

test('atualizarPL: mantém o resultado entre 0 e 1', () => {
  let pL = PARAMETROS.P_L0;
  for (let i = 0; i < 20; i++) pL = atualizarPL(pL, i % 2 === 0);
  assert.ok(pL > 0 && pL < 1);
});

test('atualizarPL: acertos seguidos levam ao domínio', () => {
  let pL = PARAMETROS.P_L0;
  for (let i = 0; i < 3; i++) pL = atualizarPL(pL, true);
  assert.ok(pL >= LIMIAR_DOMINIO);
});

test('escolherHabilidade: regra 1 ignora habilidade sem pré-requisito dominado', () => {
  const dominio = {
    contagem_ate_10: 0.3,
    adicao_ate_10: 0.2,
    subtracao_ate_10: 0.2,
    adicao_com_reagrupamento: 0.2,
  };
  const escolha = escolherHabilidade(dominio, HABILIDADES);
  assert.equal(escolha.habilidade_id, 'contagem_ate_10');
  assert.equal(escolha.regra, 'zona_proximal');
});

test('escolherHabilidade: avança quando o pré-requisito já está dominado', () => {
  const dominio = {
    contagem_ate_10: 0.8,
    adicao_ate_10: 0.3,
    subtracao_ate_10: 0.3,
    adicao_com_reagrupamento: 0.3,
  };
  assert.equal(escolherHabilidade(dominio, HABILIDADES).habilidade_id, 'adicao_ate_10');
});

test('escolherHabilidade: regra 2 reforça quando tudo está dominado', () => {
  const dominio = {
    contagem_ate_10: 0.9,
    adicao_ate_10: 0.65,
    subtracao_ate_10: 0.8,
    adicao_com_reagrupamento: 0.85,
  };
  const escolha = escolherHabilidade(dominio, HABILIDADES);
  assert.equal(escolha.regra, 'reforco');
  assert.equal(escolha.habilidade_id, 'adicao_ate_10');
});

test('dificuldadeAlvo cresce junto com P(L)', () => {
  assert.equal(dificuldadeAlvo(0.3), 1);
  assert.equal(dificuldadeAlvo(0.5), 2);
  assert.equal(dificuldadeAlvo(0.9), 3);
});

test('selecionarProximaQuestao: não repete a última questão', () => {
  const dominio = { contagem_ate_10: 0.3 };
  const { questao } = selecionarProximaQuestao({
    dominio,
    habilidades: HABILIDADES,
    questoes: QUESTOES,
    ultimaQuestaoId: 'cont_1',
  });
  assert.notEqual(questao.id, 'cont_1');
  assert.equal(questao.habilidade, 'contagem_ate_10');
});

test('selecionarProximaQuestao: regra 4 força dificuldade 1 após 3 erros seguidos', () => {
  const dominio = { contagem_ate_10: 0.95 };
  const { questao, explicacao } = selecionarProximaQuestao({
    dominio,
    habilidades: HABILIDADES,
    questoes: QUESTOES,
    errosSeguidos: 3,
  });
  assert.equal(questao.dificuldade, 1);
  assert.equal(explicacao.regra, 'scaffolding');
});
