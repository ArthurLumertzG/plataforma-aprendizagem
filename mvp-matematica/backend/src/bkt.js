// Núcleo da personalização: funções puras, sem banco e sem Express.
// Tudo aqui é determinístico e testável isoladamente (ver bkt.test.js).

/** Parâmetros fixos do MVP — iguais para todas as habilidades e alunos. */
export const PARAMETROS = {
  P_L0: 0.3, // domínio inicial de toda habilidade de um aluno novo
  P_T: 0.15, // probabilidade de aprender entre uma resposta e a próxima
  P_S: 0.1, // slip: sabe, mas erra por distração
  P_G: 0.2, // guess: não sabe, mas acerta no chute
};

/** A partir deste valor de P(L) consideramos a habilidade dominada. */
export const LIMIAR_DOMINIO = 0.6;

/** Erros seguidos na mesma habilidade que disparam o "volta para o fácil". */
export const ERROS_PARA_FACILITAR = 3;

/**
 * Atualização Bayesian Knowledge Tracing de uma observação.
 *
 *   correto:   P(L|obs) = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
 *   incorreto: P(L|obs) = P(L)S     / [P(L)S     + (1-P(L))(1-G)]
 *   P(L_novo) = P(L|obs) + (1 - P(L|obs)) * T
 *
 * @param {number} pL P(L) atual, entre 0 e 1.
 * @param {boolean} correto Se o aluno acertou a questão.
 * @param {object} [params] Sobrescreve PARAMETROS (útil nos testes).
 * @returns {number} novo P(L).
 */
export function atualizarPL(pL, correto, params = PARAMETROS) {
  const { P_T, P_S, P_G } = params;

  const posterior = correto
    ? (pL * (1 - P_S)) / (pL * (1 - P_S) + (1 - pL) * P_G)
    : (pL * P_S) / (pL * P_S + (1 - pL) * (1 - P_G));

  return posterior + (1 - posterior) * P_T;
}

/** Um pré-requisito está satisfeito quando seu P(L) alcançou o limiar. */
function preRequisitosSatisfeitos(habilidade, dominio) {
  return habilidade.pre_requisitos.every(
    (id) => (dominio[id] ?? PARAMETROS.P_L0) >= LIMIAR_DOMINIO,
  );
}

/**
 * Regras 1 e 2: qual habilidade praticar agora.
 * @returns {{habilidade_id: string, regra: string, motivo: string}}
 */
export function escolherHabilidade(dominio, habilidades) {
  const pL = (id) => dominio[id] ?? PARAMETROS.P_L0;

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
 * Seleciona a próxima questão aplicando as regras 1 a 4.
 *
 * @param {object} ctx
 * @param {Record<string, number>} ctx.dominio P(L) por habilidade.
 * @param {Array} ctx.habilidades Habilidades em ordem de pré-requisito.
 * @param {Array} ctx.questoes Banco de questões.
 * @param {string|null} [ctx.ultimaQuestaoId] Última questão respondida pelo aluno.
 * @param {number} [ctx.errosSeguidos] Erros consecutivos na habilidade escolhida.
 * @returns {{questao: object, explicacao: object}}
 */
export function selecionarProximaQuestao({
  dominio,
  habilidades,
  questoes,
  ultimaQuestaoId = null,
  errosSeguidos = 0,
}) {
  const escolha = escolherHabilidade(dominio, habilidades);
  const pL = dominio[escolha.habilidade_id] ?? PARAMETROS.P_L0;

  // Regra 4 — travou (3 erros seguidos): volta para a dificuldade 1, ignorando P(L).
  const forcouFacil = errosSeguidos >= ERROS_PARA_FACILITAR;
  const alvo = forcouFacil ? 1 : dificuldadeAlvo(pL);

  const candidatas = questoes.filter((q) => q.habilidade === escolha.habilidade_id);
  const semRepetir = candidatas.filter((q) => q.id !== ultimaQuestaoId);
  const pool = semRepetir.length > 0 ? semRepetir : candidatas;

  // Dificuldade mais próxima do alvo; empate resolvido pela ordem do banco.
  const questao = pool.reduce((melhor, q) =>
    Math.abs(q.dificuldade - alvo) < Math.abs(melhor.dificuldade - alvo) ? q : melhor,
  );

  return {
    questao,
    explicacao: {
      regra: forcouFacil ? 'scaffolding' : escolha.regra,
      habilidade_id: escolha.habilidade_id,
      p_l: pL,
      dificuldade_alvo: alvo,
      motivo: forcouFacil
        ? `${errosSeguidos} erros seguidos em "${escolha.habilidade_id}": ` +
          'voltando para uma questão de dificuldade 1.'
        : escolha.motivo,
    },
  };
}
