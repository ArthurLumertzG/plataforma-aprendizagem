// Motor de recomendação: regras pedagógicas determinísticas em funções puras.
// Lê P(L) e P(L0) já calculados pelo modelo do aluno (bkt.js); não calcula BKT.
//
// Ordem em que as regras são consultadas (a primeira que se aplica decide):
//   1. Scaffolding: travou na habilidade que estava praticando → não sai dela.
//   2. Revisão espaçada: uma habilidade consolidada ficou tempo demais sem prática
//      (uma revisão por vez, intercalada com o que ainda há para aprender).
//   3. Zona proximal / progressão: a primeira habilidade ainda não consolidada
//      cujos pré-requisitos estão consolidados, no nível de dificuldade da escada.
//   4. Reforço: tudo consolidado e nada para revisar → a mais frágil.
//
// O documento do produto lista a zona proximal antes da revisão. Aqui a revisão
// vencida vem antes porque, do contrário, ela nunca aconteceria enquanto houvesse
// algo novo para aprender — e o objetivo da revisão é justamente intercalar.

import { LIMIAR_DOMINIO } from './bkt.js';

/** Erros seguidos na mesma habilidade que disparam o scaffolding (e descem um nível). */
export const ERROS_PARA_SCAFFOLDING = 2;

/** Acertos seguidos no nível atual para subir um nível de dificuldade. */
export const ACERTOS_PARA_SUBIR = 2;

/**
 * Intervalos da revisão espaçada, em respostas de prática de outras habilidades.
 * Cada revisão acertada passa para o intervalo seguinte; um erro volta ao primeiro.
 * Na demo tudo acontece em minutos, por isso o intervalo é em respostas e não em
 * dias. Valores provisórios, sem validação pedagógica.
 */
export const INTERVALOS_REVISAO = [8, 16, 32];

/**
 * Respostas de aprendizagem entre duas revisões, enquanto houver algo novo para
 * aprender. Sem isso, habilidades que venceram juntas (as que o teste rápido
 * consolidou ao mesmo tempo) viriam em bloco e interromperiam a trilha.
 */
export const RESPOSTAS_ENTRE_REVISOES = 2;

/** O teste rápido usa 1 item por habilidade, de dificuldade média. */
export const DIFICULDADE_DIAGNOSTICO = 2;

const pratica = (e) => e.tipo === 'pratica';

// ---------- diagnóstico ----------

/** Item-âncora da habilidade: o primeiro do banco com a dificuldade mais próxima da média. */
export function itemDoDiagnostico(habilidade, questoes) {
  const daHabilidade = questoes.filter((q) => q.habilidade === habilidade.id);
  if (daHabilidade.length === 0) return null;
  const distancia = (q) => Math.abs(q.dificuldade - DIFICULDADE_DIAGNOSTICO);
  return daHabilidade.reduce((melhor, q) => (distancia(q) < distancia(melhor) ? q : melhor));
}

/**
 * Onde o aluno está no teste rápido. Um item por habilidade, na ordem do grafo,
 * pulando as habilidades cujo pré-requisito a criança errou: se não soma, não
 * faz sentido perguntar sobre soma passando do 10. A habilidade pulada fica com o
 * P(L0) padrão (sem evidência), e o grafo garante que ela só será praticada
 * depois dos pré-requisitos.
 *
 * @param {Array} habilidades Em ordem topológica.
 * @returns {{concluido: boolean, respondidos: number, total: number, proximo: object|null,
 *            puladas: string[]}} `total` é o máximo que ainda pode ser perguntado.
 */
export function estadoDiagnostico(eventos, habilidades, questoes) {
  const respostas = {};
  for (const e of eventos) if (e.tipo === 'diagnostico') respostas[e.questao_id] = e.correto;

  const naoSabe = new Set(); // errou o item ou foi pulada
  const puladas = [];
  let respondidos = 0;
  let restantes = 0;
  let proximo = null;

  for (const h of habilidades) {
    const item = itemDoDiagnostico(h, questoes);
    if (!item) continue;
    if (h.pre_requisitos.some((p) => naoSabe.has(p))) {
      naoSabe.add(h.id);
      puladas.push(h.id);
      continue;
    }
    if (item.id in respostas) {
      respondidos++;
      if (!respostas[item.id]) naoSabe.add(h.id);
      continue;
    }
    proximo ??= item;
    restantes++;
  }

  return {
    concluido: proximo === null,
    respondidos,
    total: respondidos + restantes,
    proximo,
    puladas,
  };
}

// ---------- estado de cada habilidade ----------

/** Erros consecutivos mais recentes do aluno na habilidade (só prática). */
export function contarErrosSeguidos(eventos, habilidadeId) {
  const daHabilidade = eventos.filter((e) => pratica(e) && e.habilidade_id === habilidadeId);
  let n = 0;
  for (let i = daHabilidade.length - 1; i >= 0 && !daHabilidade[i].correto; i--) n++;
  return n;
}

/**
 * Nível de partida pelo P(L): abaixo de 0,4 → 1; até o limiar → 2; no limiar → 3.
 * Quem o teste rápido já pôs acima do limiar começa no topo da escada (e fica
 * consolidado): não refaz o que mostrou saber. A revisão espaçada confere depois.
 */
export function dificuldadeAlvo(pL) {
  if (pL < 0.4) return 1;
  if (pL < LIMIAR_DOMINIO) return 2;
  return 3;
}

/**
 * Regra 4, progressão: a escada de dificuldade dentro da habilidade. Começa no
 * nível indicado pelo P(L0), sobe um nível a cada 2 acertos seguidos no nível
 * atual (acertos em questões mais fáceis, como as do scaffolding, não contam) e
 * desce um nível a cada 2 erros seguidos.
 */
export function nivelDaHabilidade(eventos, habilidadeId, pL0, nivelMaximo) {
  let nivel = Math.min(dificuldadeAlvo(pL0), nivelMaximo);
  let acertos = 0;
  let erros = 0;
  for (const e of eventos) {
    if (!pratica(e) || e.habilidade_id !== habilidadeId) continue;
    if (e.correto) {
      erros = 0;
      if ((e.dificuldade_servida ?? nivel) >= nivel) acertos++;
      if (acertos >= ACERTOS_PARA_SUBIR && nivel < nivelMaximo) {
        nivel++;
        acertos = 0;
      }
    } else {
      acertos = 0;
      erros++;
      if (erros >= ERROS_PARA_SCAFFOLDING) {
        nivel = Math.max(1, nivel - 1);
        erros = 0;
      }
    }
  }
  return nivel;
}

/**
 * Regra 2, revisão espaçada: há quantas respostas de prática a habilidade não
 * aparece, e qual o intervalo dela agora. O teste rápido conta como a última vez
 * que ela apareceu.
 */
export function estadoRevisao(eventos, habilidadeId) {
  let desde = null; // respostas de prática de outras habilidades desde a última aparição
  let revisoesSeguidas = 0;
  for (const e of eventos) {
    if (e.habilidade_id === habilidadeId) {
      desde = 0;
      if (pratica(e)) {
        if (!e.correto) revisoesSeguidas = 0;
        else if (e.regra === 'revisao') revisoesSeguidas++;
      }
    } else if (pratica(e) && desde !== null) {
      desde++;
    }
  }
  const intervalo = INTERVALOS_REVISAO[Math.min(revisoesSeguidas, INTERVALOS_REVISAO.length - 1)];
  return { desde, intervalo, vencida: desde !== null && desde >= intervalo };
}

/** Maior dificuldade com questão no banco: o topo da escada da habilidade. */
export function nivelMaximoDa(habilidadeId, questoes) {
  return Math.max(
    1,
    ...questoes.filter((q) => q.habilidade === habilidadeId).map((q) => q.dificuldade),
  );
}

/**
 * Tudo que o motor sabe de cada habilidade. Consolidada = P(L) no limiar **e**
 * topo da escada alcançado: passar do limiar com duas questões fáceis não basta
 * para avançar no grafo.
 *
 * @param {Record<string, number>} [ctx.pL0] Ponto de partida; sem ele, usa o P(L) atual.
 */
export function estadoDasHabilidades({ dominio, pL0 = {}, habilidades, questoes, eventos = [] }) {
  return Object.fromEntries(
    habilidades.map((h) => {
      const pL = dominio[h.id] ?? 0;
      const nivelMaximo = nivelMaximoDa(h.id, questoes);
      const nivel = nivelDaHabilidade(eventos, h.id, pL0[h.id] ?? pL, nivelMaximo);
      return [
        h.id,
        {
          p_l: pL,
          nivel,
          nivel_maximo: nivelMaximo,
          consolidada: pL >= LIMIAR_DOMINIO && nivel >= nivelMaximo,
          revisao: estadoRevisao(eventos, h.id),
        },
      ];
    }),
  );
}

// ---------- escolha ----------

const fmt = (v) => v.toFixed(2);

/**
 * Qual habilidade praticar agora, em que nível, e por quê (regras 1 a 4).
 * @returns {{habilidade_id: string, regra: string, dificuldade: number,
 *            mostrar_dica: boolean, motivo: string}}
 */
export function escolherHabilidade({ habilidades, estados, eventos = [] }) {
  const nome = (id) => habilidades.find((h) => h.id === id)?.nome ?? id;

  // 1. Scaffolding: travou na habilidade que estava praticando. Não avança nem troca.
  const ultima = eventos.filter(pratica).at(-1);
  if (ultima && estados[ultima.habilidade_id]) {
    const erros = contarErrosSeguidos(eventos, ultima.habilidade_id);
    if (erros >= ERROS_PARA_SCAFFOLDING) {
      return {
        habilidade_id: ultima.habilidade_id,
        regra: 'scaffolding',
        dificuldade: 1,
        mostrar_dica: true,
        motivo:
          `${erros} erros seguidos em "${nome(ultima.habilidade_id)}": ` +
          'voltando para uma questão de dificuldade 1, com dica.',
      };
    }
  }

  const naZona = habilidades.find(
    (h) => !estados[h.id].consolidada && h.pre_requisitos.every((p) => estados[p]?.consolidada),
  );

  // 2. Revisão espaçada: a consolidada mais atrasada; empate, a mais frágil. Com
  // algo novo para aprender, só uma revisão por vez, intercalada com a trilha.
  const praticas = eventos.filter(pratica);
  const ultimaRevisao = praticas.findLastIndex((e) => e.regra === 'revisao');
  const desdeRevisao = ultimaRevisao < 0 ? Infinity : praticas.length - 1 - ultimaRevisao;
  const podeRevisar = !naZona || desdeRevisao >= RESPOSTAS_ENTRE_REVISOES;
  const vencidas = habilidades
    .filter((h) => estados[h.id].consolidada && estados[h.id].revisao.vencida)
    .sort((a, b) => {
      const atraso = (h) => estados[h.id].revisao.desde - estados[h.id].revisao.intervalo;
      return atraso(b) - atraso(a) || estados[a.id].p_l - estados[b.id].p_l;
    });
  if (podeRevisar && vencidas.length > 0) {
    const h = vencidas[0];
    const { desde, intervalo } = estados[h.id].revisao;
    return {
      habilidade_id: h.id,
      regra: 'revisao',
      dificuldade: estados[h.id].nivel,
      mostrar_dica: false,
      motivo:
        `"${h.nome}" está consolidada, mas não aparece há ${desde} respostas ` +
        `(revisão a cada ${intervalo}). Revisar agora ajuda a não esquecer.`,
    };
  }

  // 3. Zona proximal: ainda não consolidada, com os pré-requisitos consolidados.
  if (naZona) {
    const { p_l: pL, nivel, nivel_maximo: max } = estados[naZona.id];
    const progressao = pL >= LIMIAR_DOMINIO;
    return {
      habilidade_id: naZona.id,
      regra: progressao ? 'progressao' : 'zona_proximal',
      dificuldade: nivel,
      mostrar_dica: false,
      motivo: progressao
        ? `P(L) de "${naZona.nome}" já é ${fmt(pL)} (acima de ${LIMIAR_DOMINIO}), mas antes de ` +
          `avançar no grafo a criança sobe a dificuldade: nível ${nivel} de ${max}.`
        : `P(L) de "${naZona.nome}" é ${fmt(pL)} (abaixo de ${LIMIAR_DOMINIO}) e os ` +
          `pré-requisitos já estão consolidados. Nível ${nivel} de ${max}.`,
    };
  }

  // 4. Reforço: tudo consolidado e nada vencido. Reforça a mais frágil.
  const consolidadas = habilidades
    .filter((h) => estados[h.id].consolidada)
    .sort((a, b) => estados[a.id].p_l - estados[b.id].p_l);
  if (consolidadas.length > 0) {
    const h = consolidadas[0];
    return {
      habilidade_id: h.id,
      regra: 'reforco',
      dificuldade: estados[h.id].nivel,
      mostrar_dica: false,
      motivo:
        'Todas as habilidades disponíveis já estão consolidadas e nenhuma revisão venceu; ' +
        `reforçando a mais frágil ("${h.nome}", P(L) = ${fmt(estados[h.id].p_l)}).`,
    };
  }

  // Caso degenerado (grafo sem raiz elegível): fica na primeira.
  return {
    habilidade_id: habilidades[0].id,
    regra: 'fallback',
    dificuldade: 1,
    mostrar_dica: false,
    motivo: 'Nenhuma habilidade elegível; praticando a primeira do grafo.',
  };
}

/**
 * Seleciona a próxima questão de prática aplicando as regras 1 a 4.
 *
 * @param {object} ctx
 * @param {Record<string, number>} ctx.dominio P(L) por habilidade.
 * @param {Record<string, number>} [ctx.pL0] P(L0) por habilidade (ponto de partida da escada).
 * @param {Array} ctx.habilidades Habilidades em ordem de pré-requisito.
 * @param {Array} ctx.questoes Banco de questões.
 * @param {Array} [ctx.eventos] Eventos do aluno em ordem cronológica.
 * @returns {{questao: object, explicacao: object, mostrar_dica: boolean}}
 */
export function selecionarProximaQuestao({ dominio, pL0, habilidades, questoes, eventos = [] }) {
  const estados = estadoDasHabilidades({ dominio, pL0, habilidades, questoes, eventos });
  const escolha = escolherHabilidade({ habilidades, estados, eventos });
  const estado = estados[escolha.habilidade_id];
  const ultimaQuestaoId = eventos.at(-1)?.questao_id ?? null;

  const candidatas = questoes.filter((q) => q.habilidade === escolha.habilidade_id);
  const semRepetir = candidatas.filter((q) => q.id !== ultimaQuestaoId);
  const pool = semRepetir.length > 0 ? semRepetir : candidatas;

  // Dificuldade mais próxima do alvo; entre as empatadas, a que a criança viu há
  // mais tempo (ou nunca viu), e depois a ordem do banco.
  const vistaEm = {};
  eventos.forEach((e, i) => (vistaEm[e.questao_id] = i));
  const alvo = escolha.dificuldade;
  const questao = pool.reduce((melhor, q) => {
    const d = Math.abs(q.dificuldade - alvo) - Math.abs(melhor.dificuldade - alvo);
    if (d !== 0) return d < 0 ? q : melhor;
    return (vistaEm[q.id] ?? -1) < (vistaEm[melhor.id] ?? -1) ? q : melhor;
  });

  return {
    questao,
    mostrar_dica: escolha.mostrar_dica,
    explicacao: {
      regra: escolha.regra,
      habilidade_id: escolha.habilidade_id,
      p_l: estado.p_l,
      dificuldade_alvo: alvo,
      nivel: estado.nivel,
      nivel_maximo: estado.nivel_maximo,
      motivo: escolha.motivo,
    },
  };
}
