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
export function desempenhoRecente(
  eventos,
  trajetoria,
  habilidadeId,
  params,
  janela = JANELA_RECENTE,
) {
  const recentes = praticaDa(eventos, habilidadeId).slice(-janela);
  const respostas = recentes.length;
  if (respostas === 0) {
    return { respostas, acertos: 0, taxa: null, acerto_esperado: null, divergente: false };
  }

  const acertos = recentes.filter((e) => e.correto).length;
  const taxa = acertos / respostas;
  const acertoEsperado =
    recentes.reduce(
      (soma, e) => soma + probabilidadeAcerto(trajetoria[e.id].p_l_antes, params),
      0,
    ) / respostas;

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

/**
 * Tempo até o domínio: quantas respostas de prática da habilidade até o primeiro
 * domínio confirmado. null se ainda não chegou lá.
 */
export function tempoAteDominio(eventos, trajetoria, habilidadeId) {
  let respostas = 0;
  let acertos = 0;
  for (const e of praticaDa(eventos, habilidadeId)) {
    respostas++;
    acertos = e.correto ? acertos + 1 : 0;
    if (dominioRobusto(trajetoria[e.id].p_l_depois, acertos)) return respostas;
  }
  return null;
}

/**
 * Retenção: a criança ainda acerta uma habilidade que deixou dominada, quando
 * volta a ela depois de praticar outras? Conta só a primeira resposta de cada
 * volta, porque as seguintes já são prática de novo.
 *
 * Não depende da regra que trouxe a criança de volta: hoje é o reforço, depois
 * será a repetição espaçada. Na demo as voltas acontecem minutos depois, então
 * isto mede resistência à interferência de outras habilidades, ainda não
 * esquecimento ao longo de dias.
 *
 * @returns {Record<string, {retornos: number, acertos: number}>} Só habilidades com volta.
 */
export function retencaoPorHabilidade(eventos, trajetoria) {
  const estado = {}; // por habilidade: acertos seguidos e se está dominada agora
  const retencao = {};
  let anterior = null;

  for (const e of eventos) {
    if (e.tipo !== 'pratica' || !trajetoria[e.id]) continue;
    const h = (estado[e.habilidade_id] ??= { acertos: 0, dominada: false });

    // Saiu dominando, praticou outra coisa e voltou agora.
    if (anterior !== null && anterior !== e.habilidade_id && h.dominada) {
      const r = (retencao[e.habilidade_id] ??= { retornos: 0, acertos: 0 });
      r.retornos++;
      if (e.correto) r.acertos++;
    }

    h.acertos = e.correto ? h.acertos + 1 : 0;
    h.dominada = dominioRobusto(trajetoria[e.id].p_l_depois, h.acertos);
    anterior = e.habilidade_id;
  }
  return retencao;
}

export function mediana(valores) {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Tempo até o domínio na turma, para uma habilidade. A mediana só existe para quem
 * chegou lá, então o resumo sempre diz quantos praticaram e quantos chegaram:
 * sem isso, a métrica repetiria o viés de sobrevivência.
 *
 * @param {Array<number|null>} valores tempoAteDominio de cada aluno que praticou.
 */
export function tempoAteDominioDaTurma(valores) {
  const chegaram = valores.filter((v) => v !== null);
  return { praticaram: valores.length, chegaram: chegaram.length, mediana: mediana(chegaram) };
}

/** Soma as voltas de todos os alunos numa habilidade. */
export function retencaoDaTurma(porAluno) {
  const comVolta = porAluno.filter((r) => r && r.retornos > 0);
  return {
    alunos: comVolta.length,
    retornos: comVolta.reduce((s, r) => s + r.retornos, 0),
    acertos: comVolta.reduce((s, r) => s + r.acertos, 0),
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
