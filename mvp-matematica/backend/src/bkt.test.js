import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARAMETROS,
  LIMIAR_DOMINIO,
  LIMITES_P_L0,
  atualizarPL,
  estimarPL0,
  parametrosDa,
  posterior,
  recalcularDominio,
} from './bkt.js';
import { HABILIDADES } from './seed-data.js';

const proximo = (v) => Number(v.toFixed(6));

let proximoId = 1;
const evento = (habilidade_id, correto, tipo = 'pratica') => ({
  id: proximoId++,
  habilidade_id,
  correto,
  tipo,
});

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

test('posterior: não inclui a transição de aprendizagem', () => {
  assert.equal(proximo(posterior(0.3, true)), 0.658537);
  assert.equal(proximo(posterior(0.3, false)), 0.050847);
});

test('parametrosDa: a habilidade sobrescreve só o que declara', () => {
  const p = parametrosDa({ id: 'x', bkt: { P_G: 0.25 } });
  assert.equal(p.P_G, 0.25);
  assert.equal(p.P_S, PARAMETROS.P_S);
  assert.deepEqual(parametrosDa({ id: 'y', bkt: null }), PARAMETROS);
});

test('estimarPL0: dois acertos sobem, dois erros descem, sem extremos', () => {
  const alto = estimarPL0([true, true]);
  const misto = estimarPL0([true, false]);
  const baixo = estimarPL0([false, false]);

  assert.ok(alto > misto && misto > baixo);
  // Bayes puro daria ~0.897 e ~0.006: os limites seguram o "nem expert, nem zero".
  assert.equal(alto, LIMITES_P_L0.MAX);
  assert.equal(baixo, LIMITES_P_L0.MIN);
});

test('estimarPL0: sem respostas fica no P(L0) padrão', () => {
  assert.equal(estimarPL0([]), PARAMETROS.P_L0);
});

test('recalcularDominio: sem eventos todo mundo começa no P(L0) padrão', () => {
  const { dominio } = recalcularDominio([], HABILIDADES);
  for (const h of HABILIDADES) assert.equal(dominio[h.id], PARAMETROS.P_L0);
});

test('recalcularDominio: diagnóstico define o ponto de partida da prática', () => {
  const eventos = [
    evento('contagem_ate_10', true, 'diagnostico'),
    evento('contagem_ate_10', true, 'diagnostico'),
    evento('adicao_ate_10', false, 'diagnostico'),
    evento('adicao_ate_10', false, 'diagnostico'),
  ];
  const { dominio, pL0 } = recalcularDominio(eventos, HABILIDADES);

  assert.equal(pL0.contagem_ate_10, LIMITES_P_L0.MAX);
  assert.equal(pL0.adicao_ate_10, LIMITES_P_L0.MIN);
  // Habilidade fora do diagnóstico continua no padrão.
  assert.equal(pL0.subtracao_ate_10, PARAMETROS.P_L0);
  // Diagnóstico não aplica P(T): domínio = P(L0) até a primeira prática.
  assert.deepEqual(dominio, pL0);
});

test('recalcularDominio: reproduz a atualização passo a passo e registra a trajetória', () => {
  const eventos = [
    evento('contagem_ate_10', true),
    evento('contagem_ate_10', false),
    evento('adicao_ate_10', true),
  ];
  const { dominio, trajetoria } = recalcularDominio(eventos, HABILIDADES);

  const esperado = atualizarPL(atualizarPL(PARAMETROS.P_L0, true), false);
  assert.equal(dominio.contagem_ate_10, esperado);
  assert.equal(dominio.adicao_ate_10, atualizarPL(PARAMETROS.P_L0, true));

  const [e1, e2] = eventos;
  assert.equal(trajetoria[e1.id].p_l_antes, PARAMETROS.P_L0);
  assert.equal(trajetoria[e2.id].p_l_antes, trajetoria[e1.id].p_l_depois);
  assert.equal(trajetoria[e2.id].p_l_depois, esperado);
});

test('recalcularDominio: é determinístico — mesma sequência, mesmo P(L)', () => {
  const eventos = [
    evento('contagem_ate_10', false, 'diagnostico'),
    evento('contagem_ate_10', true),
    evento('contagem_ate_10', true),
  ];
  assert.deepEqual(
    recalcularDominio(eventos, HABILIDADES).dominio,
    recalcularDominio(structuredClone(eventos), HABILIDADES).dominio,
  );
});

test('recalcularDominio: usa os parâmetros calibrados da habilidade', () => {
  const habilidades = [{ id: 'h', nome: 'H', pre_requisitos: [], bkt: { P_T: 0 } }];
  const { dominio } = recalcularDominio([evento('h', true)], habilidades);
  assert.equal(dominio.h, posterior(PARAMETROS.P_L0, true));
});
