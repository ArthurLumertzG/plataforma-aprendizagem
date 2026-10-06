// Métricas do painel do professor, em funções puras derivadas dos eventos e do
// P(L) já calculado. Não atualizam P(L) (bkt.js) nem escolhem questões (motor.js).
//
// Nenhuma métrica deve aparecer sozinha (Lei de Goodhart): domínio, ganho e taxa
// de acerto vão juntos, e o painel sempre diz quantos alunos têm dados para
// análise (viés de sobrevivência). Decisões na seção "Métricas do painel" do README.

import { LIMIAR_DOMINIO, probabilidadeAcerto } from './bkt.js';

/** Acertos seguidos na prática para confirmar o domínio, além de P(L) ≥ limiar. */
export const ACERTOS_PARA_DOMINIO = 2;

/** Quantas respostas recentes de cada habilidade entram na taxa de acerto. */
export const JANELA_RECENTE = 10;

/**
 * Alerta de divergência entre a taxa de acerto recente e o acerto que o modelo
 * previa para essas mesmas respostas. Valores provisórios, sem validação.
 */
export const DIVERGENCIA = { DIFERENCA: 0.3, RESPOSTAS_MIN: 5 };

/** Respostas de prática para um aluno entrar na análise. O teste rápido não conta. */
export const RESPOSTAS_MIN_ANALISE = 10;

const praticaDa = (eventos, habilidadeId) =>
  eventos.filter((e) => e.tipo === 'pratica' && e.habilidade_id === habilidadeId);

/** Acertos consecutivos mais recentes na habilidade (só prática). Zera no erro. */
export function acertosSeguidos(eventos, habilidadeId) {
  const daHabilidade = praticaDa(eventos, habilidadeId);
  let n = 0;
  for (let i = daHabilidade.length - 1; i >= 0 && daHabilidade[i].correto; i--) n++;
  return n;
}

/**
 * Domínio confirmado: P(L) no limiar **e** acertos seguidos na prática. Cruzar o
 * limiar uma vez (ou chegar lá só pelo teste rápido) ainda pode ser sorte.
 * Só o painel usa isto; o motor continua decidindo pelo P(L).
 */
export function dominioRobusto(pL, acertos) {
  return pL >= LIMIAR_DOMINIO && acertos >= ACERTOS_PARA_DOMINIO;
}

/**
 * Ganho estimado desde o ponto de partida: P(L) atual − P(L0). É o modelo
 * medindo a si mesmo; o ganho de verdade vem do pré/pós-teste do piloto.
 * @param {number|null} pL0 null enquanto o teste rápido não termina.
 */
export function ganhoAprendizagem(pL, pL0) {
  return pL0 === null || pL0 === undefined ? null : pL - pL0;
}

/**
 * Taxa de acerto nas últimas respostas da habilidade, lado a lado com o acerto
 * que o modelo previa para essas mesmas respostas (média de P(acerto) com o P(L)
 * de antes de cada uma).
 *
 * Comparar com o P(L) atual seria trocar unidades (quem não sabe ainda acerta
 * P(G) no chute) e dispararia à toa: o P(L) atual depende muito da última
 * resposta, a taxa não. Assim o alerta só aparece quando o modelo errou a
 * previsão de forma consistente: chute, distração ou parâmetro mal calibrado.
 *
 * @param {Array} eventos Eventos do aluno em ordem cronológica.
 * @param {Record<number, {p_l_antes: number}>} trajetoria De recalcularDominio.
 * @param {object} params Parâmetros BKT da habilidade (parametrosDa).
 */
export function desempenhoRecente(eventos, trajetoria, habilidadeId, params, janela = JANELA_RECENTE) {
  const recentes = praticaDa(eventos, habilidadeId).slice(-janela);
  const respostas = recentes.length;
  if (respostas === 0) {
    return { respostas, acertos: 0, taxa: null, acerto_esperado: null, divergente: false };
  }

  const acertos = recentes.filter((e) => e.correto).length;
  const taxa = acertos / respostas;
  const acertoEsperado =
    recentes.reduce((soma, e) => soma + probabilidadeAcerto(trajetoria[e.id].p_l_antes, params), 0) /
    respostas;

  return {
    respostas,
    acertos,
    taxa,
    acerto_esperado: acertoEsperado,
    divergente:
      respostas >= DIVERGENCIA.RESPOSTAS_MIN &&
      Math.abs(taxa - acertoEsperado) > DIVERGENCIA.DIFERENCA,
  };
}

export function respostasDePratica(eventos) {
  return eventos.filter((e) => e.tipo === 'pratica').length;
}

/**
 * Quantos alunos cadastrados têm dados para análise. O painel mostra os dois
 * números sempre: nenhum relatório pode esconder quem ficou de fora.
 *
 * @param {Array<Array>} eventosPorAluno Os eventos de cada aluno cadastrado.
 */
export function transparenciaAmostra(eventosPorAluno, minimo = RESPOSTAS_MIN_ANALISE) {
  return {
    total: eventosPorAluno.length,
    com_dados: eventosPorAluno.filter((eventos) => respostasDePratica(eventos) >= minimo).length,
    minimo,
  };
}
