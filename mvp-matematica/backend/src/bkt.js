// Modelo do aluno: Bayesian Knowledge Tracing em funções puras, sem banco e sem
// Express. Daqui só sai P(L); quem escolhe a próxima questão é o motor.js.

/** Parâmetros padrão do BKT. Uma habilidade pode sobrescrevê-los (campo `bkt`). */
export const PARAMETROS = {
  P_L0: 0.3, // domínio inicial quando ainda não há diagnóstico da habilidade
  P_T: 0.15, // probabilidade de aprender entre uma resposta e a próxima
  P_S: 0.1, // slip: sabe, mas erra por distração
  P_G: 0.2, // guess: não sabe, mas acerta no chute
};

/** A partir deste valor de P(L) consideramos a habilidade dominada. */
export const LIMIAR_DOMINIO = 0.6;

/**
 * O diagnóstico inicializa P(L0) "nem zero, nem expert": duas respostas não
 * bastam para cravar que a criança domina ou ignora a habilidade.
 */
export const LIMITES_P_L0 = { MIN: 0.1, MAX: 0.85 };

/** P(S)/P(G) não são globais: cada habilidade pode calibrar os seus. */
export function parametrosDa(habilidade) {
  return { ...PARAMETROS, ...(habilidade?.bkt ?? {}) };
}

/**
 * Só a evidência da observação, sem a transição de aprendizagem:
 *
 *   correto:   P(L|obs) = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
 *   incorreto: P(L|obs) = P(L)S     / [P(L)S     + (1-P(L))(1-G)]
 */
export function posterior(pL, correto, params = PARAMETROS) {
  const { P_S, P_G } = params;
  return correto
    ? (pL * (1 - P_S)) / (pL * (1 - P_S) + (1 - pL) * P_G)
    : (pL * P_S) / (pL * P_S + (1 - pL) * (1 - P_G));
}

/**
 * Atualização BKT completa de uma resposta de prática:
 *   P(L_novo) = P(L|obs) + (1 - P(L|obs)) * T
 *
 * @param {number} pL P(L) atual, entre 0 e 1.
 * @param {boolean} correto Se o aluno acertou a questão.
 * @param {object} [params] Sobrescreve PARAMETROS (útil nos testes).
 * @returns {number} novo P(L).
 */
export function atualizarPL(pL, correto, params = PARAMETROS) {
  const p = posterior(pL, correto, params);
  return p + (1 - p) * params.P_T;
}

/**
 * P(L0) de uma habilidade a partir das respostas do diagnóstico. Aplica só a
 * evidência (sem P(T)): o teste mede o que a criança já sabe, não ensina.
 *
 * @param {boolean[]} respostas Acertos/erros nos itens-âncora da habilidade.
 */
export function estimarPL0(respostas, params = PARAMETROS) {
  let pL = params.P_L0;
  for (const correto of respostas) pL = posterior(pL, correto, params);
  return Math.min(LIMITES_P_L0.MAX, Math.max(LIMITES_P_L0.MIN, pL));
}

/**
 * Recalcula o domínio inteiro a partir da sequência ordenada de eventos.
 * P(L) nunca é gravado: ele é sempre derivado daqui, o que mantém os eventos
 * como fonte da verdade (e resolve conflitos se um dia houver sync offline).
 *
 * Eventos `diagnostico` definem o ponto de partida P(L0) de cada habilidade;
 * eventos `pratica` aplicam a atualização BKT na ordem em que aconteceram.
 *
 * @param {Array<{id, habilidade_id, correto: boolean, tipo: 'diagnostico'|'pratica'}>} eventos
 *   Em ordem cronológica.
 * @param {Array} habilidades
 * @returns {{dominio: Record<string, number>, pL0: Record<string, number>,
 *            trajetoria: Record<string, {p_l_antes: number, p_l_depois: number}>}}
 */
export function recalcularDominio(eventos, habilidades) {
  const porId = Object.fromEntries(habilidades.map((h) => [h.id, h]));

  const respostasDiagnostico = {};
  for (const e of eventos) {
    if (e.tipo !== 'diagnostico') continue;
    (respostasDiagnostico[e.habilidade_id] ??= []).push(e.correto);
  }

  const pL0 = {};
  for (const h of habilidades) {
    const params = parametrosDa(h);
    const respostas = respostasDiagnostico[h.id];
    pL0[h.id] = respostas ? estimarPL0(respostas, params) : params.P_L0;
  }

  const dominio = { ...pL0 };
  const trajetoria = {};
  for (const e of eventos) {
    if (e.tipo !== 'pratica' || !(e.habilidade_id in dominio)) continue;
    const antes = dominio[e.habilidade_id];
    const depois = atualizarPL(antes, e.correto, parametrosDa(porId[e.habilidade_id]));
    dominio[e.habilidade_id] = depois;
    trajetoria[e.id] = { p_l_antes: antes, p_l_depois: depois };
  }

  return { dominio, pL0, trajetoria };
}
