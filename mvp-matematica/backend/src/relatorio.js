// Relatório de desempenho por turma: o que o painel mostra aluno a aluno, somado
// para a turma, mais um comparativo entre turmas. Funções puras sobre o resumo que
// as rotas já calculam (resumoDominio em routes.js); nada aqui calcula BKT ou
// escolhe questões.
//
// Toda média vem com o número de alunos que entrou nela, e quem ainda não tem dados
// aparece contado, nunca some: o mesmo cuidado contra o viés de sobrevivência que o
// painel tem.

import { RESPOSTAS_MIN_ANALISE, retencaoDaTurma, tempoAteDominioDaTurma } from './metricas.js';

const media = (valores) =>
  valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length;

/**
 * Onde o aluno está na trilha: a primeira habilidade não consolidada cujos
 * pré-requisitos estão consolidados (a fronteira da zona proximal). Diferente da
 * próxima questão, não muda a cada revisão espaçada.
 */
export function fronteiraDoAluno(dominio) {
  const consolidada = new Set(dominio.filter((h) => h.consolidada).map((h) => h.habilidade_id));
  return (
    dominio.find(
      (h) => !h.consolidada && h.pre_requisitos.every((p) => consolidada.has(p)),
    ) ?? null
  );
}

/** Uma linha por aluno: o essencial para a professora decidir onde intervir. */
export function resumoDoAluno({ aluno, eventos, diagnostico, dominio }) {
  const pratica = eventos.filter((e) => e.tipo === 'pratica');
  const travadas = dominio.filter((h) => h.travou);
  const divergentes = dominio.filter((h) => !h.travou && h.recente.divergente);
  const ganhos = dominio
    .filter((h) => h.ganho !== null && h.respostas_pratica > 0)
    .map((h) => h.ganho);
  const fronteira = diagnostico.concluido ? fronteiraDoAluno(dominio) : null;

  let situacao;
  if (eventos.length === 0) situacao = 'sem_respostas';
  else if (!diagnostico.concluido) situacao = 'teste_rapido';
  else if (travadas.length > 0) situacao = 'travou';
  else if (divergentes.length > 0) situacao = 'investigar';
  else situacao = 'em_dia';

  return {
    id: aluno.id,
    nome: aluno.nome,
    simulado: Boolean(aluno.simulado),
    situacao,
    diagnostico,
    respostas_pratica: pratica.length,
    com_dados: pratica.length >= RESPOSTAS_MIN_ANALISE,
    taxa_acerto: pratica.length === 0 ? null : pratica.filter((e) => e.correto).length / pratica.length,
    dominadas: dominio.filter((h) => h.dominada).length,
    total_habilidades: dominio.length,
    ganho_medio: media(ganhos),
    trabalhando_em: fronteira && { habilidade_id: fronteira.habilidade_id, nome: fronteira.nome },
    travou_em: travadas.map((h) => ({ habilidade_id: h.habilidade_id, nome: h.nome })),
    investigar_em: divergentes.map((h) => ({ habilidade_id: h.habilidade_id, nome: h.nome })),
    ultima_resposta: eventos.at(-1)?.criado_em ?? null,
  };
}

/** Por habilidade, somando os alunos da turma. */
function porHabilidade(habilidades, entradas) {
  return habilidades.map((h) => {
    const linhas = entradas.map(({ aluno, diagnostico, dominio }) => ({
      aluno,
      diagnostico,
      d: dominio.find((x) => x.habilidade_id === h.id),
    }));
    const comPontoDePartida = linhas.filter((l) => l.diagnostico.concluido);
    const praticaram = linhas.filter((l) => l.d.respostas_pratica > 0);
    const ganhos = praticaram.filter((l) => l.d.ganho !== null).map((l) => l.d.ganho);
    return {
      habilidade_id: h.id,
      nome: h.nome,
      alunos: linhas.length,
      com_ponto_de_partida: comPontoDePartida.length,
      praticaram: praticaram.length,
      dominaram: linhas.filter((l) => l.d.dominada).length,
      // P(L) médio só de quem fez o teste rápido: os outros ainda estão no valor padrão.
      p_l_medio: media(comPontoDePartida.map((l) => l.d.p_l)),
      ganho_medio: media(ganhos),
      com_ganho: ganhos.length,
      travados: linhas.filter((l) => l.d.travou).map((l) => ({ id: l.aluno.id, nome: l.aluno.nome })),
      ate_dominio: tempoAteDominioDaTurma(praticaram.map((l) => l.d.ate_dominio)),
      retencao: retencaoDaTurma(praticaram.map((l) => l.d.retencao)),
    };
  });
}

/**
 * Alunos agrupados pela habilidade em que estão trabalhando: os grupos que a
 * professora pode atender juntos. Quem não terminou o teste rápido fica à parte.
 */
function gruposDeTrabalho(habilidades, alunos) {
  const grupos = habilidades
    .map((h) => ({
      habilidade_id: h.id,
      nome: h.nome,
      alunos: alunos
        .filter((a) => a.trabalhando_em?.habilidade_id === h.id)
        .map(({ id, nome, situacao }) => ({ id, nome, situacao })),
    }))
    .filter((g) => g.alunos.length > 0);
  const resto = (filtro) => alunos.filter(filtro).map(({ id, nome, situacao }) => ({ id, nome, situacao }));
  return {
    por_habilidade: grupos,
    trilha_completa: resto((a) => a.diagnostico.concluido && !a.trabalhando_em),
    teste_rapido: resto((a) => a.situacao === 'teste_rapido'),
    sem_respostas: resto((a) => a.situacao === 'sem_respostas'),
  };
}

/** Números de cabeçalho: os mesmos do comparativo entre turmas. */
function indicadores(alunos, eventosDaTurma) {
  const pratica = eventosDaTurma.filter((e) => e.tipo === 'pratica');
  const comDiagnostico = alunos.filter((a) => a.diagnostico.concluido);
  const comGanho = alunos.filter((a) => a.ganho_medio !== null);
  const datas = eventosDaTurma.map((e) => e.criado_em).sort();
  return {
    alunos: alunos.length,
    com_dados: alunos.filter((a) => a.com_dados).length,
    sem_respostas: alunos.filter((a) => a.situacao === 'sem_respostas').length,
    em_teste_rapido: alunos.filter((a) => a.situacao === 'teste_rapido').length,
    precisam_atencao: alunos.filter((a) => a.situacao === 'travou' || a.situacao === 'investigar')
      .length,
    respostas_pratica: pratica.length,
    taxa_acerto: pratica.length === 0 ? null : pratica.filter((e) => e.correto).length / pratica.length,
    // Média de habilidades dominadas por aluno, só entre quem já terminou o teste rápido.
    dominadas_media: media(comDiagnostico.map((a) => a.dominadas)),
    com_diagnostico: comDiagnostico.length,
    ganho_medio: media(comGanho.map((a) => a.ganho_medio)),
    com_ganho: comGanho.length,
    periodo: datas.length === 0 ? null : { de: datas[0], ate: datas.at(-1) },
  };
}

/**
 * @param {object} ctx
 * @param {{id: number, nome: string}} ctx.turma
 * @param {Array} ctx.habilidades Em ordem topológica.
 * @param {Array<{aluno, eventos, diagnostico, dominio}>} ctx.entradas Um por aluno da
 *        turma; `dominio` é o resumoDominio das rotas.
 */
export function relatorioDaTurma({ turma, habilidades, entradas }) {
  const alunos = entradas.map(resumoDoAluno);
  return {
    turma,
    minimo_respostas: RESPOSTAS_MIN_ANALISE,
    indicadores: indicadores(alunos, entradas.flatMap((e) => e.eventos)),
    habilidades: porHabilidade(habilidades, entradas),
    grupos: gruposDeTrabalho(habilidades, alunos),
    alunos,
  };
}

/** Uma linha por turma, com os mesmos indicadores do cabeçalho do relatório. */
export function comparativoDeTurmas(relatorios) {
  return relatorios.map((r) => ({ turma: r.turma, ...r.indicadores }));
}
