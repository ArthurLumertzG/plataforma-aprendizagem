// Motor de recomendação: regras pedagógicas determinísticas em funções puras.
// Lê P(L) já calculado pelo modelo do aluno (bkt.js); não calcula BKT.

import { LIMIAR_DOMINIO } from './bkt.js';

/** Erros seguidos na mesma habilidade que disparam o scaffolding. */
export const ERROS_PARA_SCAFFOLDING = 2;

/** Itens-âncora por habilidade no teste rápido (4 habilidades → 8 itens). */
export const ITENS_DIAGNOSTICO_POR_HABILIDADE = 2;

/** Um pré-requisito está satisfeito quando seu P(L) alcançou o limiar. */
function preRequisitosSatisfeitos(habilidade, dominio) {
  return habilidade.pre_requisitos.every((id) => (dominio[id] ?? 0) >= LIMIAR_DOMINIO);
}

/**
 * Itens do diagnóstico inicial, na ordem do grafo: para cada habilidade, os
 * primeiros itens de dificuldades crescentes (um fácil e um médio, no padrão).
 * Variar a dificuldade dá mais informação do que repetir dois itens fáceis.
 */
export function itensDoDiagnostico(
  habilidades,
  questoes,
  porHabilidade = ITENS_DIAGNOSTICO_POR_HABILIDADE,
) {
  return habilidades.flatMap((h) => {
    const daHabilidade = questoes.filter((q) => q.habilidade === h.id);
    const dificuldades = [...new Set(daHabilidade.map((q) => q.dificuldade))].sort();
    return dificuldades
      .slice(0, porHabilidade)
      .map((d) => daHabilidade.find((q) => q.dificuldade === d));
  });
}

/**
 * Onde o aluno está no diagnóstico, a partir dos eventos já registrados.
 * @returns {{concluido: boolean, respondidos: number, total: number, proximo: object|null}}
 */
export function estadoDiagnostico(eventos, itens) {
  const respondidas = new Set(
    eventos.filter((e) => e.tipo === 'diagnostico').map((e) => e.questao_id),
  );
  const proximo = itens.find((q) => !respondidas.has(q.id)) ?? null;
  return {
    concluido: proximo === null,
    respondidos: itens.filter((q) => respondidas.has(q.id)).length,
    total: itens.length,
    proximo,
  };
}

/** Erros consecutivos mais recentes do aluno na habilidade (só prática). */
export function contarErrosSeguidos(eventos, habilidadeId) {
  const daHabilidade = eventos.filter(
    (e) => e.tipo === 'pratica' && e.habilidade_id === habilidadeId,
  );
  let n = 0;
  for (let i = daHabilidade.length - 1; i >= 0 && !daHabilidade[i].correto; i--) n++;
  return n;
}

/**
 * Regras 1 e 2: qual habilidade praticar agora.
 * @returns {{habilidade_id: string, regra: string, motivo: string}}
 */
export function escolherHabilidade(dominio, habilidades) {
  const pL = (id) => dominio[id] ?? 0;

  // Regra 1 — zona de desenvolvimento proximal: ainda não domina, mas já tem base.
  const naZona = habilidades.find(
    (h) => pL(h.id) < LIMIAR_DOMINIO && preRequisitosSatisfeitos(h, dominio),
  );
  if (naZona) {
    return {
      habilidade_id: naZona.id,
      regra: 'zona_proximal',
      motivo:
        `P(L) de "${naZona.nome}" é ${pL(naZona.id).toFixed(2)} (abaixo de ${LIMIAR_DOMINIO}) ` +
        'e os pré-requisitos já estão dominados.',
    };
  }

  // Regra 2 — dominou tudo que estava disponível: reforça a habilidade mais frágil.
  const dominadas = habilidades
    .filter((h) => pL(h.id) >= LIMIAR_DOMINIO)
    .sort((a, b) => pL(a.id) - pL(b.id));
  if (dominadas.length > 0) {
    const alvo = dominadas[0];
    return {
      habilidade_id: alvo.id,
      regra: 'reforco',
      motivo:
        'Todas as habilidades disponíveis já estão dominadas; reforçando a mais frágil ' +
        `("${alvo.nome}", P(L) = ${pL(alvo.id).toFixed(2)}).`,
    };
  }

  // Caso degenerado (nenhuma habilidade elegível nem dominada): fica na primeira.
  return {
    habilidade_id: habilidades[0].id,
    regra: 'fallback',
    motivo: 'Nenhuma habilidade elegível; praticando a primeira do grafo.',
  };
}

/** Regra 3: P(L) baixo → dificuldade 1; médio → 2; alto → 3. */
export function dificuldadeAlvo(pL) {
  if (pL < 0.4) return 1;
  if (pL < 0.75) return 2;
  return 3;
}

/**
 * Seleciona a próxima questão de prática aplicando as regras 1 a 4.
 *
 * @param {object} ctx
 * @param {Record<string, number>} ctx.dominio P(L) por habilidade.
 * @param {Array} ctx.habilidades Habilidades em ordem de pré-requisito.
 * @param {Array} ctx.questoes Banco de questões.
 * @param {Array} [ctx.eventos] Eventos do aluno em ordem cronológica.
 * @returns {{questao: object, explicacao: object, mostrar_dica: boolean}}
 */
export function selecionarProximaQuestao({ dominio, habilidades, questoes, eventos = [] }) {
  const escolha = escolherHabilidade(dominio, habilidades);
  const pL = dominio[escolha.habilidade_id] ?? 0;
  const errosSeguidos = contarErrosSeguidos(eventos, escolha.habilidade_id);
  const ultimaQuestaoId = eventos.at(-1)?.questao_id ?? null;

  // Regra 4 — scaffolding: travou na habilidade, então não avança. Volta para a
  // dificuldade 1 (ignorando P(L)) e mostra a dica da questão.
  const scaffolding = errosSeguidos >= ERROS_PARA_SCAFFOLDING;
  const alvo = scaffolding ? 1 : dificuldadeAlvo(pL);

  const candidatas = questoes.filter((q) => q.habilidade === escolha.habilidade_id);
  const semRepetir = candidatas.filter((q) => q.id !== ultimaQuestaoId);
  const pool = semRepetir.length > 0 ? semRepetir : candidatas;

  // Dificuldade mais próxima do alvo; empate resolvido pela ordem do banco.
  const questao = pool.reduce((melhor, q) =>
    Math.abs(q.dificuldade - alvo) < Math.abs(melhor.dificuldade - alvo) ? q : melhor,
  );

  return {
    questao,
    mostrar_dica: scaffolding,
    explicacao: {
      regra: scaffolding ? 'scaffolding' : escolha.regra,
      habilidade_id: escolha.habilidade_id,
      p_l: pL,
      dificuldade_alvo: alvo,
      motivo: scaffolding
        ? `${errosSeguidos} erros seguidos em "${escolha.habilidade_id}": ` +
          'voltando para uma questão de dificuldade 1, com dica.'
        : escolha.motivo,
    },
  };
}
