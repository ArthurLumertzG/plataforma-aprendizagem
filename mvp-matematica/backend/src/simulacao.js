// Turma simulada para demonstrar o painel como ele seria em uso real: duas dúzias
// de alunos fictícios, com semanas de prática, gerados pelo mesmo caminho que uma
// criança de verdade percorre (teste rápido → motor escolhe → resposta → BKT).
//
// Cada aluno simulado tem um "estado verdadeiro" escondido (o que ele sabe de fato),
// que o sistema não enxerga: o BKT só vê os acertos e erros, como com uma criança
// real. Assim o painel mostra o modelo acertando e errando de verdade, e não uma
// tabela de números inventados.
//
// Não é evidência de eficácia: o comportamento das crianças simuladas foi escrito
// por nós e se parece com o que o BKT supõe. Nunca misture com dados de piloto
// (o `npm run avaliar-modelo` ignora os simulados por padrão).

import { recalcularDominio, VERSAO_PARAMETROS } from './bkt.js';
import { estadoDiagnostico, selecionarProximaQuestao } from './motor.js';

/** Mesma semente → mesma turma. Só as datas acompanham o dia em que se popula. */
export const SEMENTE_PADRAO = 2026;

/** Janela de uso simulada: dias úteis das últimas semanas, até ontem. */
export const DIAS_DE_USO = 28;

/** Fuso das escolas (UTC-3); o banco guarda UTC. */
const FUSO_HORAS = -3;

/**
 * Perfis de criança. `sabe` é quantas habilidades, na ordem do grafo, ela já domina
 * de fato ao chegar; `aprende` é a chance de aprender a cada tentativa; `distracao`
 * é a chance de errar o que sabe. Intervalos [mín, máx], sorteados por aluno.
 */
const PERFIS = {
  adiantado: { sabe: [6, 9], aprende: [0.22, 0.35], distracao: [0.04, 0.08], respostas: [70, 120] },
  tipico: { sabe: [2, 4], aprende: [0.12, 0.2], distracao: [0.06, 0.1], respostas: [45, 100] },
  dificuldade: { sabe: [0, 1], aprende: [0.04, 0.08], distracao: [0.12, 0.18], respostas: [35, 80] },
  // Avança bem até uma habilidade específica e trava nela.
  trava: { sabe: [3, 5], aprende: [0.15, 0.25], distracao: [0.06, 0.1], respostas: [60, 100] },
  // Sabe bastante, mas erra por distração: gera alertas de "longe do previsto".
  desatento: { sabe: [5, 8], aprende: [0.2, 0.3], distracao: [0.22, 0.3], respostas: [40, 80] },
  // Começou há pouco: terminou o teste rápido e praticou um pouco.
  novato: { sabe: [1, 4], aprende: [0.2, 0.3], distracao: [0.06, 0.1], respostas: [12, 20] },
  // Acabou de entrar: ainda está no meio do teste rápido.
  chegando: {
    sabe: [5, 7],
    aprende: [0.2, 0.3],
    distracao: [0.06, 0.1],
    respostas: [3, 6],
    paraNoTesteRapido: true,
  },
};

/**
 * Pseudônimos fictícios: [nome, perfil, turma_id] (turmas do seed-data.js). O 1º ano
 * concentra quem tem dificuldade e quem acabou de chegar; o 3º, os adiantados.
 */
const ALUNOS_SIMULADOS = [
  ['Alice', 'adiantado', 3],
  ['Bento', 'tipico', 1],
  ['Caio', 'dificuldade', 1],
  ['Duda', 'tipico', 1],
  ['Enzo', 'trava', 2],
  ['Fernanda', 'adiantado', 3],
  ['Gael', 'desatento', 2],
  ['Helena', 'tipico', 1],
  ['Igor', 'dificuldade', 1],
  ['Júlia', 'tipico', 2],
  ['Kauã', 'novato', 1],
  ['Laura', 'trava', 2],
  ['Miguel', 'tipico', 2],
  ['Nina', 'adiantado', 3],
  ['Otávio', 'dificuldade', 1],
  ['Pietra', 'tipico', 2],
  ['Rafael', 'desatento', 2],
  ['Sofia', 'tipico', 3],
  ['Théo', 'trava', 3],
  ['Valentina', 'tipico', 3],
  ['Yasmin', 'chegando', 1],
  ['Lucas', 'dificuldade', 2],
  ['Mariana', 'adiantado', 3],
  ['Heitor', 'tipico', 3],
];

/** Onde os perfis "trava" emperram (uma por aluno, em rodízio). */
const PONTOS_DE_TRAVA = ['subtracao_ate_10', 'composicao_ate_10', 'valor_posicional'];

/** Gerador pseudoaleatório com semente (LCG), como nos testes. */
export function criarSorteio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const entre = (sorteio, [min, max]) => min + sorteio() * (max - min);
const inteiroEntre = (sorteio, [min, max]) => Math.floor(entre(sorteio, [min, max + 1]));

function criarCrianca(sorteio, perfil, habilidades, indiceTrava) {
  const p = PERFIS[perfil];
  const quantasSabe = inteiroEntre(sorteio, p.sabe);
  const aprende = {};
  for (const h of habilidades) aprende[h.id] = entre(sorteio, p.aprende);
  if (perfil === 'trava') aprende[PONTOS_DE_TRAVA[indiceTrava % PONTOS_DE_TRAVA.length]] = 0.005;
  return {
    // A ordem do grafo é topológica: um prefixo nunca sabe algo sem os pré-requisitos.
    sabe: new Set(habilidades.slice(0, quantasSabe).map((h) => h.id)),
    aprende,
    distracao: entre(sorteio, p.distracao),
    respostas: inteiroEntre(sorteio, p.respostas),
    paraNoTesteRapido: Boolean(p.paraNoTesteRapido),
  };
}

/** A resposta da criança simulada: sabe → acerta salvo distração; não sabe → chuta. */
function responder(sorteio, crianca, questao, comDica) {
  let chance;
  if (crianca.sabe.has(questao.habilidade)) {
    chance = 1 - crianca.distracao - 0.04 * (questao.dificuldade - 1);
  } else {
    chance = 1 / questao.alternativas.length + (comDica ? 0.1 : 0);
  }
  const correto = sorteio() < chance;
  if (correto) return { correto, resposta_dada: questao.resposta_correta };
  const erradas = questao.alternativas.filter((a) => a !== questao.resposta_correta);
  return { correto, resposta_dada: erradas[Math.floor(sorteio() * erradas.length)] };
}

/** Praticar ensina, e mais quando os pré-requisitos estão firmes e veio dica. */
function aprender(sorteio, crianca, habilidade, comDica) {
  if (crianca.sabe.has(habilidade.id)) return;
  const prontaPara = habilidade.pre_requisitos.every((p) => crianca.sabe.has(p));
  const chance = crianca.aprende[habilidade.id] * (prontaPara ? 1 : 0.2) * (comDica ? 1.5 : 1);
  if (sorteio() < chance) crianca.sabe.add(habilidade.id);
}

/** Um pouco de esquecimento, para a retenção do painel não ser sempre perfeita. */
function esquecer(sorteio, crianca, praticada) {
  for (const id of crianca.sabe) {
    if (id !== praticada && sorteio() < 0.004) crianca.sabe.delete(id);
  }
}

/**
 * As respostas de um aluno, pelo mesmo caminho da API: enquanto o teste rápido não
 * termina, o item-âncora; depois, a questão que o motor recomendaria.
 */
function simularRespostas(sorteio, crianca, habilidades, questoes) {
  const porId = Object.fromEntries(habilidades.map((h) => [h.id, h]));
  const eventos = [];
  for (let i = 0; i < crianca.respostas; i++) {
    const diagnostico = estadoDiagnostico(eventos, habilidades, questoes);
    // Sempre deixa pelo menos um item do teste rápido por responder.
    if (crianca.paraNoTesteRapido && diagnostico.total - diagnostico.respondidos <= 1) break;
    let questao, regra, comDica, tipo;
    if (!diagnostico.concluido) {
      questao = diagnostico.proximo;
      regra = 'diagnostico';
      comDica = false;
      tipo = 'diagnostico';
    } else {
      const { dominio, pL0 } = recalcularDominio(eventos, habilidades);
      const r = selecionarProximaQuestao({ dominio, pL0, habilidades, questoes, eventos });
      questao = r.questao;
      regra = r.explicacao.regra;
      comDica = r.mostrar_dica;
      tipo = 'pratica';
    }
    const habilidade = porId[questao.habilidade];
    const { correto, resposta_dada } = responder(sorteio, crianca, questao, comDica);
    if (tipo === 'pratica') {
      aprender(sorteio, crianca, habilidade, comDica);
      esquecer(sorteio, crianca, habilidade.id);
    }
    eventos.push({
      id: i + 1, // provisório: o banco dá o id de verdade, na mesma ordem
      questao_id: questao.id,
      habilidade_id: questao.habilidade,
      tipo,
      resposta_dada,
      correto,
      versao_parametros: VERSAO_PARAMETROS,
      dificuldade_servida: questao.dificuldade,
      regra,
    });
  }
  return eventos;
}

const doisDigitos = (n) => String(n).padStart(2, '0');

/** "2026-10-06 14:03:12", em UTC: o formato que o resto do código lê. */
export function formatarUtc(data) {
  return (
    `${data.getUTCFullYear()}-${doisDigitos(data.getUTCMonth() + 1)}-${doisDigitos(data.getUTCDate())} ` +
    `${doisDigitos(data.getUTCHours())}:${doisDigitos(data.getUTCMinutes())}:${doisDigitos(data.getUTCSeconds())}`
  );
}

/** Dias úteis (no fuso da escola) entre `DIAS_DE_USO` dias atrás e ontem, em ordem. */
function diasUteis(agora) {
  const local = new Date(agora.getTime() + FUSO_HORAS * 3600_000);
  const dias = [];
  for (let atras = DIAS_DE_USO; atras >= 1; atras--) {
    const dia = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - atras),
    );
    const semana = dia.getUTCDay();
    if (semana !== 0 && semana !== 6) dias.push(dia);
  }
  return dias;
}

/**
 * Espalha as respostas em sessões de 8 a 14 questões, em dias úteis diferentes,
 * de manhã, com 15 a 75 segundos entre uma questão e outra.
 */
function datarRespostas(sorteio, eventos, dias) {
  const sessoes = [];
  for (let i = 0; i < eventos.length; ) {
    const tamanho = inteiroEntre(sorteio, [8, 14]);
    sessoes.push(eventos.slice(i, i + tamanho));
    i += tamanho;
  }
  // Os dias mais recentes primeiro: quem usou pouco usou nos últimos dias.
  const escolhidos = [];
  let cursor = dias.length - 1;
  for (let s = sessoes.length - 1; s >= 0; s--) {
    escolhidos.unshift(dias[Math.max(cursor, 0)]);
    cursor -= sorteio() < 0.7 ? 1 : 2;
  }
  let ultimo = 0;
  sessoes.forEach((sessao, s) => {
    const inicioLocalMin = 8 * 60 + inteiroEntre(sorteio, [0, 180]);
    // Duas sessões no mesmo dia (quem usou muito): a segunda vem depois da primeira.
    let t = Math.max(
      escolhidos[s].getTime() + (inicioLocalMin - FUSO_HORAS * 60) * 60_000,
      ultimo + 20 * 60_000,
    );
    for (const e of sessao) {
      t += inteiroEntre(sorteio, [15, 75]) * 1000;
      e.criado_em = formatarUtc(new Date(t));
    }
    ultimo = t;
  });
  return eventos;
}

/**
 * @param {{habilidades: Array, questoes: Array, agora?: Date, semente?: number}} ctx
 * @returns {Array<{nome: string, perfil: string, turma_id: number, eventos: Array}>} Eventos em ordem
 *          cronológica, com `criado_em`; o id definitivo vem do banco.
 */
export function simularTurma({ habilidades, questoes, agora = new Date(), semente = SEMENTE_PADRAO }) {
  const sorteio = criarSorteio(semente);
  const dias = diasUteis(agora);
  let travas = 0;
  return ALUNOS_SIMULADOS.map(([nome, perfil, turma_id]) => {
    const crianca = criarCrianca(sorteio, perfil, habilidades, perfil === 'trava' ? travas++ : 0);
    const eventos = simularRespostas(sorteio, crianca, habilidades, questoes);
    return { nome, perfil, turma_id, eventos: datarRespostas(sorteio, eventos, dias) };
  });
}
