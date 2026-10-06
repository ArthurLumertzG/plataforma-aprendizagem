import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARAMETROS,
  LIMIAR_DOMINIO,
  atualizarPL,
  probabilidadeAcerto,
  recalcularDominio,
} from './bkt.js';
import {
  ACERTOS_PARA_DOMINIO,
  DIVERGENCIA,
  JANELA_RECENTE,
  RESPOSTAS_MIN_ANALISE,
  acertosSeguidos,
  desempenhoRecente,
  dominioRobusto,
  ganhoAprendizagem,
  mediana,
  retencaoDaTurma,
  retencaoPorHabilidade,
  tempoAteDominio,
  tempoAteDominioDaTurma,
  transparenciaAmostra,
} from './metricas.js';
import { selecionarProximaQuestao } from './motor.js';
import { HABILIDADES, QUESTOES } from './seed-data.js';

let proximoId = 1;
const evento = (habilidade_id, correto, tipo = 'pratica') => ({
  id: proximoId++,
  habilidade_id,
  correto,
  tipo,
});

/** Eventos de uma habilidade a partir de uma string: "CCE" = certo, certo, errado. */
const sequencia = (habilidade_id, padrao, tipo = 'pratica') =>
  [...padrao].map((c) => evento(habilidade_id, c === 'C', tipo));

const H = HABILIDADES[0];

/** desempenhoRecente com a trajetória real do BKT, como a rota faz. */
function recente(eventos, habilidade = H, janela) {
  const { trajetoria } = recalcularDominio(eventos, HABILIDADES);
  return desempenhoRecente(eventos, trajetoria, habilidade.id, PARAMETROS, janela);
}

/** Gerador pseudoaleatório com semente: o aluno sintético é sempre o mesmo. */
function aleatorio(semente) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

// ---------- domínio robusto ----------

test('acertosSeguidos: conta do fim para trás e zera no erro', () => {
  assert.equal(acertosSeguidos(sequencia(H.id, 'CCECC'), H.id), 2);
  assert.equal(acertosSeguidos(sequencia(H.id, 'CCCE'), H.id), 0);
  assert.equal(acertosSeguidos([], H.id), 0);
});

test('acertosSeguidos: ignora o teste rápido e as outras habilidades', () => {
  const eventos = [
    ...sequencia(H.id, 'CC', 'diagnostico'),
    evento(H.id, true),
    evento('outra', false),
  ];
  assert.equal(acertosSeguidos(eventos, H.id), 1);
});

test('dominioRobusto: exige o limiar e os acertos seguidos ao mesmo tempo', () => {
  assert.equal(dominioRobusto(LIMIAR_DOMINIO, ACERTOS_PARA_DOMINIO), true);
  assert.equal(dominioRobusto(0.95, ACERTOS_PARA_DOMINIO - 1), false);
  assert.equal(dominioRobusto(LIMIAR_DOMINIO - 0.01, 10), false);
});

test('dominioRobusto: cruzar o limiar com um acerto só não confirma o domínio', () => {
  // Partindo de 0,3, um acerto leva P(L) a ~0,71: passou do limiar, mas pode ser chute.
  const pL = atualizarPL(PARAMETROS.P_L0, true);
  assert.ok(pL >= LIMIAR_DOMINIO);
  assert.equal(dominioRobusto(pL, 1), false);
});

test('dominioRobusto: P(L) alto logo depois de um erro não é domínio', () => {
  // De 0,95, um erro ainda deixa P(L) em ~0,75 — acima do limiar, com 0 acertos seguidos.
  const pL = atualizarPL(0.95, false);
  assert.ok(pL >= LIMIAR_DOMINIO);
  assert.equal(dominioRobusto(pL, 0), false);
});

// ---------- ganho ----------

test('ganhoAprendizagem: P(L) atual − P(L0), e null sem ponto de partida', () => {
  assert.equal(ganhoAprendizagem(0.8, 0.3).toFixed(6), '0.500000');
  assert.ok(ganhoAprendizagem(0.2, 0.5) < 0);
  assert.equal(ganhoAprendizagem(0.8, null), null);
});

// ---------- desempenho recente e divergência ----------

test('desempenhoRecente: sem prática não há taxa nem alerta', () => {
  const r = recente(sequencia(H.id, 'CC', 'diagnostico'));
  assert.deepEqual(r, {
    respostas: 0,
    acertos: 0,
    taxa: null,
    acerto_esperado: null,
    divergente: false,
  });
});

test('desempenhoRecente: só as últimas respostas da janela entram na taxa', () => {
  const r = recente(sequencia(H.id, `${'E'.repeat(5)}${'C'.repeat(JANELA_RECENTE)}`));
  assert.equal(r.respostas, JANELA_RECENTE);
  assert.equal(r.taxa, 1);
});

test('desempenhoRecente: acerto esperado é a média da previsão antes de cada resposta', () => {
  const eventos = sequencia(H.id, 'CE');
  const pL1 = atualizarPL(PARAMETROS.P_L0, true);
  const esperado = (probabilidadeAcerto(PARAMETROS.P_L0) + probabilidadeAcerto(pL1)) / 2;
  assert.equal(recente(eventos).acerto_esperado.toFixed(6), esperado.toFixed(6));
});

test('desempenhoRecente: não alerta com poucas respostas, por maior que seja a diferença', () => {
  const diagnosticoAlto = sequencia(H.id, 'CC', 'diagnostico'); // P(L0) = 0,85
  const r = recente([
    ...diagnosticoAlto,
    ...sequencia(H.id, 'E'.repeat(DIVERGENCIA.RESPOSTAS_MIN - 1)),
  ]);
  assert.ok(r.acerto_esperado - r.taxa > DIVERGENCIA.DIFERENCA);
  assert.equal(r.divergente, false);
});

test('desempenhoRecente: alerta quando o modelo errou a previsão de forma consistente', () => {
  // O teste rápido deu P(L0) = 0,85, mas na prática a criança erra 4 de 5:
  // o modelo previa ~0,5 de acerto. Diagnóstico superestimado ou chute no teste.
  const eventos = [...sequencia(H.id, 'CC', 'diagnostico'), ...sequencia(H.id, 'ECEEE')];
  const r = recente(eventos);
  assert.equal(r.taxa, 0.2);
  assert.ok(r.acerto_esperado - r.taxa > DIVERGENCIA.DIFERENCA);
  assert.equal(r.divergente, true);
});

test('aluno sintético: quem acerta consistentemente não dispara alerta', () => {
  // Aprende rápido a partir de P(L0) baixo: o BKT acompanha, então não é divergência.
  const eventos = [...sequencia(H.id, 'EE', 'diagnostico'), ...sequencia(H.id, 'C'.repeat(10))];
  assert.equal(recente(eventos).divergente, false);
});

test('aluno sintético: desempenho estável quase nunca dispara alerta falso', () => {
  // 200 crianças que acertam 60% sem aprender, partindo do P(L0) padrão. Comparar
  // com o P(L) atual dispararia para ~12% delas; a previsão da janela, para ~0%.
  const sorteio = aleatorio(42);
  let alertas = 0;
  for (let aluno = 0; aluno < 200; aluno++) {
    const eventos = Array.from({ length: JANELA_RECENTE }, () => evento(H.id, sorteio() < 0.6));
    if (recente(eventos).divergente) alertas++;
  }
  assert.ok(alertas / 200 < 0.02, `${alertas} alertas em 200`);
});

// ---------- transparência da amostra ----------

test('transparenciaAmostra: conta todos os cadastrados, inclusive quem não começou', () => {
  const comDados = sequencia(H.id, 'C'.repeat(RESPOSTAS_MIN_ANALISE));
  const quaseLa = sequencia(H.id, 'C'.repeat(RESPOSTAS_MIN_ANALISE - 1));
  const semNada = [];
  assert.deepEqual(transparenciaAmostra([comDados, quaseLa, semNada]), {
    total: 3,
    com_dados: 1,
    minimo: RESPOSTAS_MIN_ANALISE,
  });
});

test('transparenciaAmostra: o teste rápido não conta como dado para análise', () => {
  const soDiagnostico = sequencia(H.id, 'C'.repeat(RESPOSTAS_MIN_ANALISE), 'diagnostico');
  assert.equal(transparenciaAmostra([soDiagnostico]).com_dados, 0);
});

// ---------- tempo até o domínio ----------

const trajetoriaDe = (eventos) => recalcularDominio(eventos, HABILIDADES).trajetoria;

test('tempoAteDominio: conta as respostas até o primeiro domínio confirmado', () => {
  // De 0,3: o 1º acerto passa do limiar, o 2º confirma (2 acertos seguidos).
  const eventos = sequencia(H.id, 'CC');
  assert.equal(tempoAteDominio(eventos, trajetoriaDe(eventos), H.id), 2);
});

test('tempoAteDominio: um erro no meio zera os acertos seguidos', () => {
  const eventos = sequencia(H.id, 'CECC');
  assert.equal(tempoAteDominio(eventos, trajetoriaDe(eventos), H.id), 4);
});

test('tempoAteDominio: null se nunca chegou lá, e o teste rápido não conta', () => {
  const nunca = sequencia(H.id, 'ECECE');
  assert.equal(tempoAteDominio(nunca, trajetoriaDe(nunca), H.id), null);

  const soDiagnostico = sequencia(H.id, 'CC', 'diagnostico');
  assert.equal(tempoAteDominio(soDiagnostico, trajetoriaDe(soDiagnostico), H.id), null);
});

test('tempoAteDominio: perder o domínio depois não muda quando ele foi alcançado', () => {
  const eventos = sequencia(H.id, 'CCEEE');
  assert.equal(tempoAteDominio(eventos, trajetoriaDe(eventos), H.id), 2);
});

test('mediana: ímpar, par e vazio', () => {
  assert.equal(mediana([5, 1, 3]), 3);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  assert.equal(mediana([]), null);
});

test('tempoAteDominioDaTurma: a mediana só de quem chegou, sempre com quantos praticaram', () => {
  assert.deepEqual(tempoAteDominioDaTurma([2, null, 6, null]), {
    praticaram: 4,
    chegaram: 2,
    mediana: 4,
  });
  assert.deepEqual(tempoAteDominioDaTurma([null]), { praticaram: 1, chegaram: 0, mediana: null });
});

// ---------- retenção ----------

const [A, B] = HABILIDADES;

test('retencaoPorHabilidade: conta a primeira resposta ao voltar a uma habilidade dominada', () => {
  const eventos = [
    ...sequencia(A.id, 'CC'), // domina A
    ...sequencia(B.id, 'CE'), // pratica outra
    ...sequencia(A.id, 'CE'), // volta: só o primeiro (acerto) conta
  ];
  assert.deepEqual(retencaoPorHabilidade(eventos, trajetoriaDe(eventos)), {
    [A.id]: { retornos: 1, acertos: 1 },
  });
});

test('retencaoPorHabilidade: voltar errando conta como retorno sem acerto', () => {
  const eventos = [...sequencia(A.id, 'CC'), evento(B.id, true), evento(A.id, false)];
  assert.deepEqual(retencaoPorHabilidade(eventos, trajetoriaDe(eventos))[A.id], {
    retornos: 1,
    acertos: 0,
  });
});

test('retencaoPorHabilidade: só conta volta a habilidade que saiu dominada', () => {
  // Saiu de A depois de um erro (domínio perdido): voltar não mede retenção.
  const eventos = [...sequencia(A.id, 'CCE'), evento(B.id, true), evento(A.id, true)];
  assert.deepEqual(retencaoPorHabilidade(eventos, trajetoriaDe(eventos)), {});
});

test('retencaoPorHabilidade: prática seguida na mesma habilidade não é volta', () => {
  const eventos = sequencia(A.id, 'CCCCC');
  assert.deepEqual(retencaoPorHabilidade(eventos, trajetoriaDe(eventos)), {});
});

test('retencaoPorHabilidade: o teste rápido no meio não interrompe a prática', () => {
  const eventos = [...sequencia(A.id, 'CC'), evento(B.id, true, 'diagnostico'), evento(A.id, true)];
  assert.deepEqual(retencaoPorHabilidade(eventos, trajetoriaDe(eventos)), {});
});

test('retencaoDaTurma: soma as voltas e conta só alunos que voltaram', () => {
  assert.deepEqual(
    retencaoDaTurma([
      { retornos: 2, acertos: 1 },
      { retornos: 0, acertos: 0 },
      { retornos: 1, acertos: 1 },
    ]),
    { alunos: 2, retornos: 3, acertos: 2 },
  );
});

test('aluno sintético: quem domina tudo e segue acertando volta às habilidades pelo reforço', () => {
  // Diagnóstico perfeito e depois sempre acerta: o motor só tem reforço a oferecer,
  // então a criança circula entre habilidades dominadas e toda volta é medida.
  const eventos = HABILIDADES.flatMap((h) => sequencia(h.id, 'CC', 'diagnostico'));
  for (let i = 0; i < 24; i++) {
    const { dominio } = recalcularDominio(eventos, HABILIDADES);
    const { questao } = selecionarProximaQuestao({
      dominio,
      habilidades: HABILIDADES,
      questoes: QUESTOES,
      eventos,
    });
    eventos.push({ ...evento(questao.habilidade, true), questao_id: questao.id });
  }

  const retencao = retencaoPorHabilidade(eventos, trajetoriaDe(eventos));
  const total = retencaoDaTurma(Object.values(retencao));
  assert.ok(total.retornos > 0, 'nenhuma volta medida');
  assert.equal(total.acertos, total.retornos);
});
