import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auc,
  avaliarModelo,
  brier,
  calibracao,
  intervaloAuc,
  MINIMO_POR_CLASSE,
  previsoesDoAluno,
} from './avaliacao.js';
import { PARAMETROS, probabilidadeAcerto } from './bkt.js';
import { HABILIDADES } from './seed-data.js';

const p = (previsto, correto) => ({ previsto, correto });

let proximoId = 1;
const evento = (habilidade_id, correto, tipo = 'pratica', extra = {}) => ({
  id: proximoId++,
  habilidade_id,
  correto,
  tipo,
  ...extra,
});

/** Gerador pseudoaleatório com semente: os alunos sintéticos são sempre os mesmos. */
function aleatorio(semente) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

/**
 * Aluno sintético que se comporta exatamente como o BKT supõe: começa sabendo com
 * chance P(L0), erra por distração (S), acerta no chute (G) e aprende com chance T.
 */
function alunoBkt(sorteio, respostasPorHabilidade) {
  return HABILIDADES.flatMap((h) => {
    let sabe = sorteio() < PARAMETROS.P_L0;
    return Array.from({ length: respostasPorHabilidade }, () => {
      const correto = sabe ? sorteio() >= PARAMETROS.P_S : sorteio() < PARAMETROS.P_G;
      if (!sabe && sorteio() < PARAMETROS.P_T) sabe = true;
      return evento(h.id, correto);
    });
  });
}

/** Aluno que acerta 60% ao acaso, sem saber nem aprender nada. */
function alunoAleatorio(sorteio, respostasPorHabilidade) {
  return HABILIDADES.flatMap((h) =>
    Array.from({ length: respostasPorHabilidade }, () => evento(h.id, sorteio() < 0.6)),
  );
}

// ---------- AUC ----------

test('auc: separação perfeita dá 1, invertida dá 0', () => {
  assert.equal(auc([p(0.9, true), p(0.8, true), p(0.2, false)]), 1);
  assert.equal(auc([p(0.1, true), p(0.9, false)]), 0);
});

test('auc: empate entre acerto e erro conta meio', () => {
  assert.equal(auc([p(0.5, true), p(0.5, false)]), 0.5);
  // pares (acerto, erro): (0.7, 0.5) = 1 e (0.5, 0.5) = 0,5 → 0,75
  assert.equal(auc([p(0.7, true), p(0.5, true), p(0.5, false)]), 0.75);
});

test('auc: null quando só há acertos ou só erros', () => {
  assert.equal(auc([p(0.9, true), p(0.4, true)]), null);
  assert.equal(auc([]), null);
});

test('intervaloAuc: contém o valor e estreita com mais respostas', () => {
  const pequeno = intervaloAuc(0.7, 10, 10);
  const grande = intervaloAuc(0.7, 500, 500);
  assert.ok(pequeno.de < 0.7 && pequeno.ate > 0.7);
  assert.ok(grande.ate - grande.de < pequeno.ate - pequeno.de);
  assert.equal(intervaloAuc(null, 0, 3), null);
});

test('intervaloAuc: com poucos acertos ou erros não dá intervalo (seria falsa certeza)', () => {
  assert.equal(intervaloAuc(1, 4, 1), null);
  assert.equal(intervaloAuc(0.7, 20, MINIMO_POR_CLASSE - 1), null);
  assert.ok(intervaloAuc(0.7, MINIMO_POR_CLASSE, MINIMO_POR_CLASSE));
});

// ---------- Brier e calibração ----------

test('brier: erro quadrático médio, com a taxa geral como referência', () => {
  const { valor, referencia } = brier([p(1, true), p(0, false), p(0.5, true), p(0.5, false)]);
  assert.equal(valor, 0.125); // (0 + 0 + 0,25 + 0,25) / 4
  assert.equal(referencia, 0.25); // taxa 0,5 → 0,5 × 0,5
});

test('calibracao: agrupa por faixa de previsão e compara com o acerto real', () => {
  const faixas = calibracao([p(0.1, false), p(0.15, true), p(0.9, true), p(1, true)], 5);
  assert.equal(faixas.length, 5);
  assert.deepEqual(
    { respostas: faixas[0].respostas, taxa_real: faixas[0].taxa_real },
    { respostas: 2, taxa_real: 0.5 },
  );
  assert.equal(faixas[0].previsto_medio.toFixed(3), '0.125');
  // A última faixa inclui o 1.
  assert.equal(faixas[4].respostas, 2);
  assert.equal(faixas[2].respostas, 0);
  assert.equal(faixas[2].taxa_real, null);
});

// ---------- previsões ----------

test('previsoesDoAluno: prevê cada prática com o P(L) de antes, sem o teste rápido', () => {
  const [H] = HABILIDADES;
  const eventos = [
    evento(H.id, true, 'diagnostico'),
    evento(H.id, true, 'pratica', { regra: 'zona_proximal', versao_parametros: 'v1' }),
  ];
  const previsoes = previsoesDoAluno(eventos, HABILIDADES);
  assert.equal(previsoes.length, 1);
  assert.equal(previsoes[0].regra, 'zona_proximal');
  // O diagnóstico já moveu P(L0); a previsão usa esse ponto, não a própria resposta.
  assert.ok(previsoes[0].previsto > probabilidadeAcerto(PARAMETROS.P_L0));
});

// ---------- relatório ----------

test('avaliarModelo: conta todos os cadastrados, inclusive quem não praticou', () => {
  const [H] = HABILIDADES;
  const relatorio = avaliarModelo(
    [[evento(H.id, true), evento(H.id, false)], [evento(H.id, true, 'diagnostico')], []],
    HABILIDADES,
  );
  assert.deepEqual(relatorio.alunos, { cadastrados: 3, com_pratica: 1 });
  assert.equal(relatorio.respostas, 2);
});

test('avaliarModelo: mostra com quais versões de parâmetros os eventos foram gravados', () => {
  const [H] = HABILIDADES;
  const relatorio = avaliarModelo(
    [
      [
        evento(H.id, true, 'pratica', { versao_parametros: 'v1' }),
        evento(H.id, true, 'pratica', { versao_parametros: 'v2' }),
        evento(H.id, false),
      ],
    ],
    HABILIDADES,
  );
  assert.deepEqual(relatorio.versoes, { v1: 1, v2: 1, sem_registro: 1 });
});

test('aluno sintético: quando as crianças seguem o BKT, o modelo prevê bem', () => {
  const sorteio = aleatorio(7);
  const alunos = Array.from({ length: 40 }, () => alunoBkt(sorteio, 8));
  const r = avaliarModelo(alunos, HABILIDADES);

  assert.ok(r.auc > 0.7, `AUC ${r.auc}`);
  assert.ok(r.intervalo_auc.de > 0.5);
  assert.ok(r.brier.valor < r.brier.referencia);
  // Calibrado: em toda faixa com dados suficientes, previsto e real ficam perto.
  for (const f of r.calibracao.filter((c) => c.respostas >= 100)) {
    assert.ok(Math.abs(f.previsto_medio - f.taxa_real) < 0.1, JSON.stringify(f));
  }
});

test('aluno sintético: quando as crianças respondem ao acaso, o modelo não é útil', () => {
  // É o que o relatório precisa conseguir mostrar: AUC perto de 0,5 e Brier pior
  // que simplesmente prever a taxa geral.
  const sorteio = aleatorio(7);
  const alunos = Array.from({ length: 40 }, () => alunoAleatorio(sorteio, 8));
  const r = avaliarModelo(alunos, HABILIDADES);

  assert.ok(Math.abs(r.auc - 0.5) < 0.08, `AUC ${r.auc}`);
  assert.ok(r.brier.valor > r.brier.referencia);
});
