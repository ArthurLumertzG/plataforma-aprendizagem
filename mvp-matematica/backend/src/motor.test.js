import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMIAR_DOMINIO, recalcularDominio } from './bkt.js';
import {
  ACERTOS_PARA_SUBIR,
  ERROS_PARA_SCAFFOLDING,
  INTERVALOS_REVISAO,
  contarErrosSeguidos,
  dificuldadeAlvo,
  estadoDasHabilidades,
  estadoDiagnostico,
  estadoRevisao,
  itemDoDiagnostico,
  nivelDaHabilidade,
  selecionarProximaQuestao,
} from './motor.js';
import { HABILIDADES, QUESTOES } from './seed-data.js';

// Grafo pequeno e fixo para os testes de cada regra: o conteúdo do seed pode
// crescer sem mudar o que estas regras significam.
//   a ─┬─→ b ─┐
//      └─→ c ─┴─→ d
const G = [
  { id: 'a', nome: 'A', pre_requisitos: [] },
  { id: 'b', nome: 'B', pre_requisitos: ['a'] },
  { id: 'c', nome: 'C', pre_requisitos: ['a'] },
  { id: 'd', nome: 'D', pre_requisitos: ['b', 'c'] },
];
const QG = G.flatMap((h) =>
  [1, 1, 2, 2, 3].map((dificuldade, i) => ({
    id: `${h.id}${i + 1}`,
    habilidade: h.id,
    dificuldade,
    dica: `dica de ${h.id}`,
  })),
);

const pratica = (habilidade_id, correto, extra = {}) => ({
  habilidade_id,
  correto,
  tipo: 'pratica',
  questao_id: 'x',
  ...extra,
});
const diag = (habilidade_id, correto, questao_id) => ({
  habilidade_id,
  correto,
  tipo: 'diagnostico',
  questao_id,
});
const repetir = (n, fazer) => Array.from({ length: n }, fazer);

/** Domínio com o mesmo P(L) para todas as habilidades do grafo de teste, exceto as dadas. */
const dominioDe = (base, outros = {}) => ({
  ...Object.fromEntries(G.map((h) => [h.id, base])),
  ...outros,
});

const escolher = (ctx) => selecionarProximaQuestao({ habilidades: G, questoes: QG, ...ctx });

// ---------- diagnóstico ----------

test('itemDoDiagnostico: o primeiro item de dificuldade média da habilidade', () => {
  assert.equal(itemDoDiagnostico(G[0], QG).id, 'a3');
});

test('estadoDiagnostico: um item por habilidade, na ordem do grafo', () => {
  const inicio = estadoDiagnostico([], G, QG);
  assert.equal(inicio.concluido, false);
  assert.equal(inicio.total, G.length);
  assert.equal(inicio.proximo.id, 'a3');

  const meio = estadoDiagnostico([diag('a', true, 'a3')], G, QG);
  assert.equal(meio.respondidos, 1);
  assert.equal(meio.proximo.id, 'b3');
});

test('estadoDiagnostico: quem erra o pré-requisito não é perguntado sobre o que depende dele', () => {
  const estado = estadoDiagnostico([diag('a', false, 'a3')], G, QG);
  assert.equal(estado.concluido, true);
  assert.equal(estado.total, 1);
  assert.deepEqual(estado.puladas, ['b', 'c', 'd']);
});

test('estadoDiagnostico: a poda segue o grafo, sem cortar caminhos que ainda fazem sentido', () => {
  const eventos = [diag('a', true, 'a3'), diag('b', false, 'b3')];
  const estado = estadoDiagnostico(eventos, G, QG);
  assert.equal(estado.proximo.id, 'c3'); // c só depende de a
  assert.equal(estado.total, 3); // d sai: depende de b
  assert.deepEqual(estado.puladas, ['d']);
});

test('estadoDiagnostico: respostas de prática não contam como teste rápido', () => {
  const estado = estadoDiagnostico([pratica('a', true, { questao_id: 'a3' })], G, QG);
  assert.equal(estado.respondidos, 0);
});

test('estadoDiagnostico: com o seed, fica dentro dos 10 a 15 itens do produto', () => {
  assert.ok(estadoDiagnostico([], HABILIDADES, QUESTOES).total <= 15);
});

// ---------- regra 4: progressão (escada de dificuldade) ----------

test('dificuldadeAlvo: o nível de partida acompanha o P(L0), e o limiar já é o topo', () => {
  assert.equal(dificuldadeAlvo(0.3), 1);
  assert.equal(dificuldadeAlvo(0.5), 2);
  assert.equal(dificuldadeAlvo(LIMIAR_DOMINIO), 3);
});

test('nivelDaHabilidade: sobe um nível a cada 2 acertos seguidos, sem passar do topo', () => {
  const acertos = (n, dificuldade) =>
    repetir(n, () => pratica('a', true, { dificuldade_servida: dificuldade }));
  assert.equal(nivelDaHabilidade([], 'a', 0.3, 3), 1);
  assert.equal(nivelDaHabilidade(acertos(ACERTOS_PARA_SUBIR, 1), 'a', 0.3, 3), 2);
  const tudo = [...acertos(2, 1), ...acertos(2, 2), ...acertos(4, 3)];
  assert.equal(nivelDaHabilidade(tudo, 'a', 0.3, 3), 3);
});

test('nivelDaHabilidade: acerto em questão mais fácil que o nível (scaffolding) não sobe', () => {
  const eventos = repetir(3, () => pratica('a', true, { dificuldade_servida: 1 }));
  assert.equal(nivelDaHabilidade(eventos, 'a', 0.5, 3), 2);
});

test('nivelDaHabilidade: um erro zera os acertos; dois erros seguidos descem um nível', () => {
  const p = (correto) => pratica('a', correto, { dificuldade_servida: 2 });
  assert.equal(nivelDaHabilidade([p(true), p(false), p(true)], 'a', 0.5, 3), 2);
  assert.equal(nivelDaHabilidade([p(false), p(false)], 'a', 0.5, 3), 1);
});

test('regra 4 (progressão): passou do limiar com questões fáceis, mas sobe a dificuldade antes de avançar', () => {
  // P(L) de "a" já passou do limiar, mas a escada partiu do nível 1 (P(L0) baixo).
  const { questao, explicacao } = escolher({
    dominio: dominioDe(0.2, { a: 0.8 }),
    pL0: dominioDe(0.3),
  });
  assert.equal(explicacao.regra, 'progressao');
  assert.equal(explicacao.habilidade_id, 'a');
  assert.equal(questao.habilidade, 'a');
  assert.equal(questao.dificuldade, 1);
});

// ---------- regra 1: zona proximal ----------

test('regra 1 (zona proximal): começa pela raiz e serve o nível da escada', () => {
  const { explicacao, questao } = escolher({ dominio: dominioDe(0.3), pL0: dominioDe(0.3) });
  assert.equal(explicacao.regra, 'zona_proximal');
  assert.equal(explicacao.habilidade_id, 'a');
  assert.equal(questao.dificuldade, 1);
  assert.equal(explicacao.nivel, 1);
  assert.equal(explicacao.nivel_maximo, 3);
});

test('regra 1 (zona proximal): avança quando o pré-requisito está consolidado', () => {
  // "a" acima do limiar desde o teste rápido: começa no topo da escada, consolidada.
  const { explicacao } = escolher({
    dominio: dominioDe(0.3, { a: 0.8 }),
    pL0: dominioDe(0.3, { a: 0.8 }),
  });
  assert.equal(explicacao.habilidade_id, 'b');
});

test('regra 1 (zona proximal): exige todos os pré-requisitos consolidados, não só um', () => {
  const alto = { a: 0.9, b: 0.9, c: 0.3 };
  const { explicacao } = escolher({ dominio: dominioDe(0.2, alto), pL0: dominioDe(0.2, alto) });
  assert.equal(explicacao.habilidade_id, 'c');
});

test('estadoDasHabilidades: consolidada = limiar e topo da escada', () => {
  const estados = estadoDasHabilidades({
    dominio: dominioDe(0.9),
    pL0: dominioDe(0.3, { b: 0.9 }),
    habilidades: G,
    questoes: QG,
  });
  assert.equal(estados.a.consolidada, false); // P(L) alto, mas ainda no nível 1
  assert.equal(estados.b.consolidada, true);
});

// ---------- regra 2: revisão espaçada ----------

test('estadoRevisao: conta as respostas de outras habilidades desde a última vez', () => {
  const eventos = [pratica('a', true), pratica('b', true), pratica('b', false), pratica('c', true)];
  assert.equal(estadoRevisao(eventos, 'a').desde, 3);
  assert.equal(estadoRevisao(eventos, 'c').desde, 0);
  assert.equal(estadoRevisao(eventos, 'd').desde, null);
  // O teste rápido conta como a última aparição.
  assert.equal(estadoRevisao([diag('d', true, 'd3'), pratica('a', true)], 'd').desde, 1);
});

test('estadoRevisao: cada revisão acertada alonga o intervalo; um erro volta ao primeiro', () => {
  const revisao = (correto) => pratica('a', correto, { regra: 'revisao' });
  assert.equal(estadoRevisao([revisao(true)], 'a').intervalo, INTERVALOS_REVISAO[1]);
  assert.equal(estadoRevisao([revisao(true), revisao(true)], 'a').intervalo, INTERVALOS_REVISAO[2]);
  assert.equal(
    estadoRevisao([revisao(true), revisao(false)], 'a').intervalo,
    INTERVALOS_REVISAO[0],
  );
  // Acertos fora de revisão não alongam.
  assert.equal(estadoRevisao([pratica('a', true)], 'a').intervalo, INTERVALOS_REVISAO[0]);
});

/** "a" consolidada desde o teste rápido; depois, N respostas de prática em "b". */
function comRevisaoVencendo(respostasEmB) {
  const consolidadaA = { a: 0.9 };
  return {
    dominio: dominioDe(0.3, consolidadaA),
    pL0: dominioDe(0.3, consolidadaA),
    eventos: [
      diag('a', true, 'a3'),
      ...repetir(respostasEmB, () => pratica('b', true, { dificuldade_servida: 1 })),
    ],
  };
}

test('regra 2 (revisão): habilidade consolidada sem prática há tempo volta antes da zona proximal', () => {
  const ainda = escolher(comRevisaoVencendo(INTERVALOS_REVISAO[0] - 1));
  assert.notEqual(ainda.explicacao.regra, 'revisao');

  const { explicacao, questao } = escolher(comRevisaoVencendo(INTERVALOS_REVISAO[0]));
  assert.equal(explicacao.regra, 'revisao');
  assert.equal(explicacao.habilidade_id, 'a');
  assert.equal(questao.dificuldade, 3); // revisa no nível em que ela está
});

test('regra 2 (revisão): várias vencidas juntas vêm intercaladas com a trilha, não em bloco', () => {
  const alto = { a: 0.9, b: 0.9, c: 0.9 };
  const eventos = [diag('a', true, 'a3'), diag('b', true, 'b3'), diag('c', true, 'c3')];
  // "d" fica na zona; a, b e c vencem ao mesmo tempo depois de 8 respostas em d.
  eventos.push(...repetir(INTERVALOS_REVISAO[0], () => pratica('d', false, { questao_id: 'd1' })));
  eventos.at(-1).correto = true; // sem scaffolding no fim
  const regras = [];
  for (let i = 0; i < 6; i++) {
    const { questao, explicacao } = escolher({
      dominio: dominioDe(0.2, alto),
      pL0: dominioDe(0.2, alto),
      eventos,
    });
    regras.push(explicacao.regra === 'revisao' ? 'R' : '-');
    eventos.push(
      pratica(questao.habilidade, i % 2 === 0, {
        questao_id: questao.id,
        regra: explicacao.regra,
        dificuldade_servida: questao.dificuldade,
      }),
    );
  }
  assert.equal(regras.join(''), 'R--R--');
});

test('regra 2 (revisão): sem nada novo para aprender, revisões podem vir seguidas', () => {
  const tudo = { a: 0.9, b: 0.9, c: 0.9, d: 0.9 };
  const eventos = [
    ...G.map((h) => diag(h.id, true, `${h.id}3`)),
    pratica('a', true, { regra: 'revisao' }),
    ...repetir(INTERVALOS_REVISAO[0], () => pratica('b', true)),
  ];
  // A última resposta já foi uma revisão e c e d estão vencidas: sem trilha para
  // intercalar, a próxima revisão vem logo em seguida.
  eventos.push(pratica('b', true, { regra: 'revisao' }));
  const { explicacao } = escolher({ dominio: tudo, pL0: tudo, eventos });
  assert.equal(explicacao.regra, 'revisao');
});

test('regra 2 (revisão): não revisa o que ainda não está consolidado', () => {
  const eventos = [pratica('a', true), ...repetir(20, () => pratica('b', true))];
  const { explicacao } = escolher({ dominio: dominioDe(0.3), pL0: dominioDe(0.3), eventos });
  assert.notEqual(explicacao.regra, 'revisao');
});

test('regra 2 (revisão): entre as vencidas, a mais atrasada primeiro', () => {
  const alto = { a: 0.9, b: 0.9 };
  const eventos = [
    diag('a', true, 'a3'),
    diag('b', true, 'b3'),
    pratica('b', true, { dificuldade_servida: 3 }), // b apareceu depois: menos atrasada
    ...repetir(INTERVALOS_REVISAO[0] + 2, () => pratica('c', true)),
  ];
  const { explicacao } = escolher({
    dominio: dominioDe(0.3, alto),
    pL0: dominioDe(0.3, alto),
    eventos,
  });
  assert.equal(explicacao.habilidade_id, 'a');
});

// ---------- regra 3: scaffolding ----------

test('contarErrosSeguidos: conta só os erros finais da habilidade', () => {
  const eventos = [
    pratica('a', false),
    pratica('a', true),
    pratica('a', false),
    pratica('b', false), // outra habilidade não interrompe nem soma
    pratica('a', false),
  ];
  assert.equal(contarErrosSeguidos(eventos, 'a'), 2);
  assert.equal(contarErrosSeguidos(eventos, 'b'), 1);
  assert.equal(contarErrosSeguidos(eventos, 'c'), 0);
});

test('regra 3 (scaffolding): 2 erros seguidos → mesma habilidade, dificuldade 1 com dica', () => {
  const erros = repetir(ERROS_PARA_SCAFFOLDING, () => pratica('a', false, { questao_id: 'a5' }));
  const { questao, explicacao, mostrar_dica } = escolher({
    dominio: dominioDe(0.5),
    eventos: erros,
  });
  assert.equal(questao.habilidade, 'a');
  assert.equal(questao.dificuldade, 1);
  assert.equal(explicacao.regra, 'scaffolding');
  assert.equal(mostrar_dica, true);
});

test('regra 3 (scaffolding): 1 erro ainda não aciona', () => {
  const { explicacao, mostrar_dica } = escolher({
    dominio: dominioDe(0.3),
    eventos: [pratica('a', false)],
  });
  assert.equal(explicacao.regra, 'zona_proximal');
  assert.equal(mostrar_dica, false);
});

test('regra 3 (scaffolding): travada, a criança não é tirada da habilidade nem por revisão vencida', () => {
  const ctx = comRevisaoVencendo(INTERVALOS_REVISAO[0] + 5);
  ctx.eventos.push(pratica('b', false), pratica('b', false));
  const { explicacao } = escolher(ctx);
  assert.equal(explicacao.regra, 'scaffolding');
  assert.equal(explicacao.habilidade_id, 'b');
});

// ---------- reforço e escolha da questão ----------

test('reforço: tudo consolidado e nenhuma revisão vencida → a mais frágil', () => {
  const dominio = { a: 0.9, b: 0.65, c: 0.8, d: 0.85 };
  const { explicacao } = escolher({ dominio, pL0: dominio });
  assert.equal(explicacao.regra, 'reforco');
  assert.equal(explicacao.habilidade_id, 'b');
});

test('selecionarProximaQuestao: não repete a última e prefere a que nunca viu', () => {
  const questoes = ['x1', 'x2', 'x3'].map((id) => ({
    id,
    habilidade: 'a',
    dificuldade: 1,
    dica: 'd',
  }));
  // Erro e depois acerto: não sobe de nível nem aciona o scaffolding.
  const eventos = [
    pratica('a', false, { questao_id: 'x2' }),
    pratica('a', true, { questao_id: 'x1' }),
  ];
  const { questao } = selecionarProximaQuestao({
    dominio: dominioDe(0.3),
    pL0: dominioDe(0.3),
    habilidades: G,
    questoes,
    eventos,
  });
  // x1 foi a última; entre x2 (já vista) e x3 (nunca vista), vem x3.
  assert.equal(questao.id, 'x3');
});

// ---------- alunos sintéticos com o grafo real ----------

/** Responde o teste rápido do seed acertando só as habilidades que "sabe". */
function fazerTesteRapido(sabe) {
  const eventos = [];
  for (let estado = estadoDiagnostico(eventos, HABILIDADES, QUESTOES); !estado.concluido;) {
    const item = estado.proximo;
    eventos.push(diag(item.habilidade, sabe.includes(item.habilidade), item.id));
    estado = estadoDiagnostico(eventos, HABILIDADES, QUESTOES);
  }
  return eventos;
}

function recomendar(eventos) {
  const { dominio, pL0 } = recalcularDominio(eventos, HABILIDADES);
  return {
    dominio,
    ...selecionarProximaQuestao({
      dominio,
      pL0,
      habilidades: HABILIDADES,
      questoes: QUESTOES,
      eventos,
    }),
  };
}

test('aluno sintético: quem erra tudo faz só as raízes no teste e começa pelo começo', () => {
  const eventos = fazerTesteRapido([]);
  const raizes = HABILIDADES.filter((h) => h.pre_requisitos.length === 0);
  assert.equal(eventos.length, raizes.length);
  const { explicacao, questao } = recomendar(eventos);
  assert.equal(explicacao.habilidade_id, HABILIDADES[0].id);
  assert.equal(explicacao.regra, 'zona_proximal');
  assert.equal(questao.dificuldade, 1);
});

test('aluno sintético: quem já soma mas não subtrai começa pela subtração, no nível 1', () => {
  const ate = HABILIDADES.findIndex((h) => h.id === 'adicao_ate_10');
  const eventos = fazerTesteRapido(HABILIDADES.slice(0, ate + 1).map((h) => h.id));
  const { dominio, explicacao, questao } = recomendar(eventos);
  assert.ok(dominio.adicao_ate_10 >= LIMIAR_DOMINIO);
  assert.equal(explicacao.habilidade_id, 'subtracao_ate_10');
  assert.equal(questao.dificuldade, 1);
});

test('aluno sintético: quem acerta tudo no teste vai para reforço, e as revisões chegam', () => {
  const eventos = fazerTesteRapido(HABILIDADES.map((h) => h.id));
  assert.equal(eventos.length, HABILIDADES.length);
  assert.equal(recomendar(eventos).explicacao.regra, 'reforco');

  const regras = new Set();
  for (let i = 0; i < 30; i++) {
    const { questao, explicacao } = recomendar(eventos);
    regras.add(explicacao.regra);
    eventos.push(
      pratica(questao.habilidade, true, {
        questao_id: questao.id,
        dificuldade_servida: questao.dificuldade,
        regra: explicacao.regra,
      }),
    );
  }
  assert.ok(regras.has('revisao'), [...regras].join(', '));
});

test('aluno sintético: acertando sempre, percorre o grafo inteiro sem pular etapa', () => {
  const eventos = [];
  const entrou = [];
  for (let i = 0; i < 200; i++) {
    const { dominio, questao, explicacao } = recomendar(eventos);
    if (explicacao.regra === 'reforco') break;
    if (
      ['zona_proximal', 'progressao'].includes(explicacao.regra) &&
      !entrou.includes(questao.habilidade)
    ) {
      // Ao entrar numa habilidade nova, todos os pré-requisitos estão consolidados.
      const { pL0 } = recalcularDominio(eventos, HABILIDADES);
      const estados = estadoDasHabilidades({
        dominio,
        pL0,
        habilidades: HABILIDADES,
        questoes: QUESTOES,
        eventos,
      });
      const h = HABILIDADES.find((x) => x.id === questao.habilidade);
      for (const pre of h.pre_requisitos)
        assert.ok(estados[pre].consolidada, `${h.id} antes de ${pre}`);
      entrou.push(questao.habilidade);
    }
    eventos.push(
      pratica(questao.habilidade, true, {
        questao_id: questao.id,
        dificuldade_servida: questao.dificuldade,
        regra: explicacao.regra,
      }),
    );
  }
  assert.deepEqual(
    entrou,
    HABILIDADES.map((h) => h.id),
  );
});
