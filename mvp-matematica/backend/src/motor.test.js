import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMIAR_DOMINIO, recalcularDominio } from './bkt.js';
import {
  ERROS_PARA_SCAFFOLDING,
  contarErrosSeguidos,
  dificuldadeAlvo,
  escolherHabilidade,
  estadoDiagnostico,
  itensDoDiagnostico,
  selecionarProximaQuestao,
} from './motor.js';
import { HABILIDADES, QUESTOES } from './seed-data.js';

const pratica = (habilidade_id, correto, questao_id = 'x') => ({
  habilidade_id,
  correto,
  questao_id,
  tipo: 'pratica',
});

// ---------- diagnóstico ----------

test('itensDoDiagnostico: 2 itens por habilidade, fácil e médio, na ordem do grafo', () => {
  const itens = itensDoDiagnostico(HABILIDADES, QUESTOES);
  assert.equal(itens.length, HABILIDADES.length * 2);
  assert.deepEqual(
    itens.map((q) => q.habilidade),
    HABILIDADES.flatMap((h) => [h.id, h.id]),
  );
  for (let i = 0; i < itens.length; i += 2) {
    assert.equal(itens[i].dificuldade, 1);
    assert.equal(itens[i + 1].dificuldade, 2);
  }
});

test('estadoDiagnostico: avança item a item e conclui no fim', () => {
  const itens = itensDoDiagnostico(HABILIDADES, QUESTOES);

  const inicio = estadoDiagnostico([], itens);
  assert.equal(inicio.concluido, false);
  assert.equal(inicio.respondidos, 0);
  assert.equal(inicio.proximo.id, itens[0].id);

  const meio = estadoDiagnostico(
    [{ tipo: 'diagnostico', questao_id: itens[0].id }],
    itens,
  );
  assert.equal(meio.respondidos, 1);
  assert.equal(meio.proximo.id, itens[1].id);

  const fim = estadoDiagnostico(
    itens.map((q) => ({ tipo: 'diagnostico', questao_id: q.id })),
    itens,
  );
  assert.equal(fim.concluido, true);
  assert.equal(fim.proximo, null);
});

test('estadoDiagnostico: respostas de prática não contam como diagnóstico', () => {
  const itens = itensDoDiagnostico(HABILIDADES, QUESTOES);
  const estado = estadoDiagnostico([pratica('contagem_ate_10', true, itens[0].id)], itens);
  assert.equal(estado.respondidos, 0);
});

// ---------- regras 1 e 2: qual habilidade ----------

test('regra 1 (zona proximal): ignora habilidade sem pré-requisito dominado', () => {
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

test('regra 1 (zona proximal): avança quando o pré-requisito já está dominado', () => {
  const dominio = {
    contagem_ate_10: 0.8,
    adicao_ate_10: 0.3,
    subtracao_ate_10: 0.3,
    adicao_com_reagrupamento: 0.3,
  };
  assert.equal(escolherHabilidade(dominio, HABILIDADES).habilidade_id, 'adicao_ate_10');
});

test('regra 1 (zona proximal): exige todos os pré-requisitos, não só um', () => {
  const dominio = {
    contagem_ate_10: 0.9,
    adicao_ate_10: 0.9,
    subtracao_ate_10: 0.4,
    adicao_com_reagrupamento: 0.2,
  };
  assert.equal(escolherHabilidade(dominio, HABILIDADES).habilidade_id, 'subtracao_ate_10');
});

test('regra 2 (reforço): reforça a mais frágil quando tudo está dominado', () => {
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

// ---------- regra 3: dificuldade ----------

test('regra 3 (dificuldade): cresce junto com P(L)', () => {
  assert.equal(dificuldadeAlvo(0.3), 1);
  assert.equal(dificuldadeAlvo(0.5), 2);
  assert.equal(dificuldadeAlvo(0.9), 3);
});

test('selecionarProximaQuestao: não repete a última questão', () => {
  const { questao } = selecionarProximaQuestao({
    dominio: { contagem_ate_10: 0.3 },
    habilidades: HABILIDADES,
    questoes: QUESTOES,
    eventos: [pratica('contagem_ate_10', true, 'cont_1')],
  });
  assert.notEqual(questao.id, 'cont_1');
  assert.equal(questao.habilidade, 'contagem_ate_10');
});

// ---------- regra 4: scaffolding ----------

test('contarErrosSeguidos: conta só os erros finais da habilidade', () => {
  const eventos = [
    pratica('contagem_ate_10', false),
    pratica('contagem_ate_10', true),
    pratica('contagem_ate_10', false),
    pratica('adicao_ate_10', false), // outra habilidade não interrompe nem soma
    pratica('contagem_ate_10', false),
  ];
  assert.equal(contarErrosSeguidos(eventos, 'contagem_ate_10'), 2);
  assert.equal(contarErrosSeguidos(eventos, 'adicao_ate_10'), 1);
  assert.equal(contarErrosSeguidos(eventos, 'subtracao_ate_10'), 0);
});

test('regra 4 (scaffolding): 2 erros seguidos → dificuldade 1 com dica', () => {
  const erros = Array.from({ length: ERROS_PARA_SCAFFOLDING }, () =>
    pratica('contagem_ate_10', false, 'cont_5'),
  );
  const { questao, explicacao, mostrar_dica } = selecionarProximaQuestao({
    dominio: { contagem_ate_10: 0.5 },
    habilidades: HABILIDADES,
    questoes: QUESTOES,
    eventos: erros,
  });
  assert.equal(questao.dificuldade, 1);
  assert.equal(explicacao.regra, 'scaffolding');
  assert.equal(mostrar_dica, true);
  assert.ok(questao.dica, 'toda questão do seed precisa de dica');
});

test('regra 4 (scaffolding): 1 erro ainda não aciona', () => {
  const { explicacao, mostrar_dica } = selecionarProximaQuestao({
    dominio: { contagem_ate_10: 0.5 },
    habilidades: HABILIDADES,
    questoes: QUESTOES,
    eventos: [pratica('contagem_ate_10', false)],
  });
  assert.equal(explicacao.regra, 'zona_proximal');
  assert.equal(mostrar_dica, false);
});

// ---------- alunos sintéticos: diagnóstico + motor de ponta a ponta ----------

/**
 * Simula um aluno que acerta toda questão das habilidades que "sabe" e erra as
 * outras. Roda o diagnóstico e devolve o domínio e a próxima recomendação.
 */
function simularDiagnostico(sabe) {
  const itens = itensDoDiagnostico(HABILIDADES, QUESTOES);
  const eventos = itens.map((q) => ({
    questao_id: q.id,
    habilidade_id: q.habilidade,
    correto: sabe.includes(q.habilidade),
    tipo: 'diagnostico',
  }));
  const { dominio } = recalcularDominio(eventos, HABILIDADES);
  const recomendacao = selecionarProximaQuestao({
    dominio,
    habilidades: HABILIDADES,
    questoes: QUESTOES,
    eventos,
  });
  return { dominio, recomendacao };
}

test('aluno sintético: quem já soma mas não subtrai começa pela subtração', () => {
  const { dominio, recomendacao } = simularDiagnostico(['contagem_ate_10', 'adicao_ate_10']);
  assert.ok(dominio.adicao_ate_10 >= LIMIAR_DOMINIO);
  assert.ok(dominio.subtracao_ate_10 < LIMIAR_DOMINIO);
  assert.equal(recomendacao.explicacao.habilidade_id, 'subtracao_ate_10');
  assert.equal(recomendacao.questao.dificuldade, 1);
});

test('aluno sintético: quem erra tudo no diagnóstico começa pela contagem', () => {
  const { recomendacao } = simularDiagnostico([]);
  assert.equal(recomendacao.explicacao.habilidade_id, 'contagem_ate_10');
  assert.equal(recomendacao.explicacao.regra, 'zona_proximal');
});

test('aluno sintético: quem acerta tudo vai direto para reforço', () => {
  const { recomendacao } = simularDiagnostico(HABILIDADES.map((h) => h.id));
  assert.equal(recomendacao.explicacao.regra, 'reforco');
});

test('aluno sintético: praticando com acertos, percorre o grafo sem pular etapa', () => {
  const eventos = [];
  const visitadas = [];
  for (let i = 0; i < 40; i++) {
    const { dominio } = recalcularDominio(eventos, HABILIDADES);
    const { questao, explicacao } = selecionarProximaQuestao({
      dominio,
      habilidades: HABILIDADES,
      questoes: QUESTOES,
      eventos,
    });
    if (explicacao.regra === 'reforco') break;
    if (visitadas.at(-1) !== questao.habilidade) {
      // Ao entrar numa habilidade nova, todos os pré-requisitos já estão dominados.
      const h = HABILIDADES.find((x) => x.id === questao.habilidade);
      for (const pre of h.pre_requisitos) assert.ok(dominio[pre] >= LIMIAR_DOMINIO);
      visitadas.push(questao.habilidade);
    }
    eventos.push(pratica(questao.habilidade, true, questao.id));
  }
  assert.deepEqual(visitadas, HABILIDADES.map((h) => h.id));
});
