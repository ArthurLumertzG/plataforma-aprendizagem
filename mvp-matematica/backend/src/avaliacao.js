// Avaliação do modelo do aluno: o P(L) prevê o acerto seguinte? A fórmula do BKT
// estar certa não garante que os parâmetros descrevam crianças reais. Antes de
// afirmar que o motor "funciona", é preciso mostrar que P(L) alto vem antes de
// acerto e P(L) baixo vem antes de erro.
//
// Funções puras. Quem lê o banco é scripts/avaliar-modelo.js.

import { parametrosDa, probabilidadeAcerto, recalcularDominio } from './bkt.js';

/** Faixas de largura igual de P(acerto) previsto na tabela de calibração. */
export const FAIXAS_CALIBRACAO = 5;

/**
 * Acertos e erros mínimos para dar um intervalo ao AUC. Com menos, a fórmula
 * degenera (ex.: 4 acertos e 1 erro dão "1,00 a 1,00") e passaria falsa certeza.
 */
export const MINIMO_POR_CLASSE = 5;

/**
 * Uma previsão por resposta de prática: P(acerto) com o P(L) de antes dela, ou
 * seja, sem olhar a própria resposta. O teste rápido fica de fora: ele define o
 * P(L0), e prever as respostas que geraram a previsão seria trapaça.
 *
 * @param {Array} eventos Eventos de um aluno, em ordem cronológica.
 */
export function previsoesDoAluno(eventos, habilidades) {
  const porId = Object.fromEntries(habilidades.map((h) => [h.id, h]));
  const { trajetoria } = recalcularDominio(eventos, habilidades);
  return eventos
    .filter((e) => e.tipo === 'pratica' && trajetoria[e.id])
    .map((e) => ({
      habilidade_id: e.habilidade_id,
      regra: e.regra ?? null,
      versao_parametros: e.versao_parametros ?? null,
      previsto: probabilidadeAcerto(
        trajetoria[e.id].p_l_antes,
        parametrosDa(porId[e.habilidade_id]),
      ),
      correto: e.correto,
    }));
}

/**
 * AUC: sorteando um acerto e um erro, a chance de o acerto ter tido a previsão
 * maior. 0,5 é chute; 1 é separação perfeita. Empates contam meio (Mann-Whitney).
 * @returns {number|null} null se só houver acertos ou só erros.
 */
export function auc(previsoes) {
  const acertos = previsoes.filter((p) => p.correto).length;
  const erros = previsoes.length - acertos;
  if (acertos === 0 || erros === 0) return null;

  // Posto médio de cada previsão (empates dividem o posto).
  const ordenadas = [...previsoes].sort((a, b) => a.previsto - b.previsto);
  let somaPostosAcertos = 0;
  for (let i = 0; i < ordenadas.length; ) {
    let j = i;
    while (j < ordenadas.length && ordenadas[j].previsto === ordenadas[i].previsto) j++;
    const postoMedio = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (ordenadas[k].correto) somaPostosAcertos += postoMedio;
    i = j;
  }
  return (somaPostosAcertos - (acertos * (acertos + 1)) / 2) / (acertos * erros);
}

/**
 * Intervalo de 95% do AUC (Hanley e McNeil, 1982). Supõe respostas independentes,
 * o que não é verdade (são várias por criança): o intervalo real é mais largo.
 * @returns {{de: number, ate: number}|null} null com poucos acertos ou erros.
 */
export function intervaloAuc(valor, acertos, erros) {
  if (valor === null || acertos < MINIMO_POR_CLASSE || erros < MINIMO_POR_CLASSE) return null;
  const q1 = valor / (2 - valor);
  const q2 = (2 * valor * valor) / (1 + valor);
  const variancia =
    (valor * (1 - valor) +
      (acertos - 1) * (q1 - valor * valor) +
      (erros - 1) * (q2 - valor * valor)) /
    (acertos * erros);
  const margem = 1.96 * Math.sqrt(Math.max(0, variancia));
  return { de: Math.max(0, valor - margem), ate: Math.min(1, valor + margem) };
}

/**
 * Brier: erro quadrático médio da previsão (0 é perfeito). A referência é prever
 * sempre a taxa de acerto geral; um modelo útil precisa ficar abaixo dela.
 */
export function brier(previsoes) {
  if (previsoes.length === 0) return { valor: null, referencia: null };
  const n = previsoes.length;
  const taxa = previsoes.filter((p) => p.correto).length / n;
  const valor = previsoes.reduce((s, p) => s + (p.previsto - Number(p.correto)) ** 2, 0) / n;
  return { valor, referencia: taxa * (1 - taxa) };
}

/**
 * Calibração: em cada faixa de previsão, quanto o modelo previa e quanto a
 * criança acertou de fato. Um modelo calibrado tem as duas colunas parecidas.
 */
export function calibracao(previsoes, faixas = FAIXAS_CALIBRACAO) {
  return Array.from({ length: faixas }, (_, i) => {
    const de = i / faixas;
    const ate = (i + 1) / faixas;
    const naFaixa = previsoes.filter(
      (p) => p.previsto >= de && (p.previsto < ate || (i === faixas - 1 && p.previsto <= ate)),
    );
    const n = naFaixa.length;
    return {
      de,
      ate,
      respostas: n,
      previsto_medio: n ? naFaixa.reduce((s, p) => s + p.previsto, 0) / n : null,
      taxa_real: n ? naFaixa.filter((p) => p.correto).length / n : null,
    };
  });
}

function resumo(previsoes) {
  const acertos = previsoes.filter((p) => p.correto).length;
  const valor = auc(previsoes);
  return {
    respostas: previsoes.length,
    taxa_acerto: previsoes.length ? acertos / previsoes.length : null,
    auc: valor,
    intervalo_auc: intervaloAuc(valor, acertos, previsoes.length - acertos),
  };
}

function agruparPor(previsoes, campo) {
  const grupos = {};
  for (const p of previsoes) (grupos[p[campo] ?? 'sem_registro'] ??= []).push(p);
  return Object.entries(grupos).map(([chave, lista]) => ({ [campo]: chave, ...resumo(lista) }));
}

/**
 * Relatório completo sobre **todos** os alunos cadastrados: ninguém é excluído, e
 * o relatório diz quantos tinham prática para entrar na conta.
 *
 * Os P(L) são recalculados com os parâmetros atuais. `versoes` mostra com quais
 * versões os eventos foram gravados: mais de uma é sinal de que a avaliação mistura
 * dados coletados sob regras diferentes.
 *
 * @param {Array<Array>} eventosPorAluno Eventos de cada aluno cadastrado.
 */
export function avaliarModelo(eventosPorAluno, habilidades) {
  const porAluno = eventosPorAluno.map((eventos) => previsoesDoAluno(eventos, habilidades));
  const previsoes = porAluno.flat();

  const versoes = {};
  for (const p of previsoes) {
    const v = p.versao_parametros ?? 'sem_registro';
    versoes[v] = (versoes[v] ?? 0) + 1;
  }

  return {
    alunos: {
      cadastrados: eventosPorAluno.length,
      com_pratica: porAluno.filter((lista) => lista.length > 0).length,
    },
    ...resumo(previsoes),
    brier: brier(previsoes),
    calibracao: calibracao(previsoes),
    por_habilidade: agruparPor(previsoes, 'habilidade_id'),
    por_regra: agruparPor(previsoes, 'regra'),
    versoes,
  };
}
