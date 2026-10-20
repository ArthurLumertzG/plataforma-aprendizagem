import { Router } from 'express';

import {
  PARAMETROS,
  LIMIAR_DOMINIO,
  LIMITES_P_L0,
  VERSAO_PARAMETROS,
  parametrosDa,
  recalcularDominio,
} from './bkt.js';
import {
  ACERTOS_PARA_DOMINIO,
  DIVERGENCIA,
  JANELA_RECENTE,
  acertosSeguidos,
  desempenhoRecente,
  dominioRobusto,
  ganhoAprendizagem,
  retencaoDaTurma,
  retencaoPorHabilidade,
  tempoAteDominio,
  tempoAteDominioDaTurma,
  transparenciaAmostra,
} from './metricas.js';
import {
  ACERTOS_PARA_SUBIR,
  ERROS_PARA_SCAFFOLDING,
  INTERVALOS_REVISAO,
  contarErrosSeguidos,
  estadoDasHabilidades,
  estadoDiagnostico,
  selecionarProximaQuestao,
} from './motor.js';
import {
  buscarQuestao,
  buscarTurma,
  listarHabilidades,
  listarQuestoes,
  listarTurmas,
} from './conteudo.js';
import { comparativoDeTurmas, relatorioDaTurma } from './relatorio.js';
import { obterRepositorio } from './repositorio.js';
import { simularTurma } from './simulacao.js';

export const SENHA_PROFESSOR = process.env.SENHA_PROFESSOR || 'professor123';

const TAMANHO_MAX_NOME = 30;

export const router = Router();

/** Express 4 não captura erros de funções assíncronas: repassa ao tratador de erro. */
const rota = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** A criança nunca recebe a resposta correta; a dica só vem no scaffolding. */
function questaoParaAluno(q, { comDica = false } = {}) {
  const { resposta_correta, dica, ...publica } = q;
  return comDica && dica ? { ...publica, dica } : publica;
}

/**
 * Tudo que se sabe do aluno, derivado dos eventos dele. Rotas só chamam isto
 * e formatam a resposta: P(L) nunca é lido de uma tabela.
 */
function estadoDe(eventos) {
  const habilidades = listarHabilidades();
  const questoes = listarQuestoes();
  const { dominio, pL0, trajetoria } = recalcularDominio(eventos, habilidades);
  const diagnostico = estadoDiagnostico(eventos, habilidades, questoes);
  return { habilidades, questoes, eventos, dominio, pL0, trajetoria, diagnostico };
}

/**
 * Por habilidade: P(L) e as métricas que precisam aparecer junto dele.
 * `acima_do_limiar` é o que o motor usa; `dominada` é o domínio confirmado
 * (limiar + acertos seguidos), o único que o painel mostra como "dominada".
 */
function resumoDominio({ habilidades, questoes, dominio, pL0, eventos, trajetoria, diagnostico }) {
  const retencao = retencaoPorHabilidade(eventos, trajetoria);
  const motor = estadoDasHabilidades({ dominio, pL0, habilidades, questoes, eventos });
  return habilidades.map((h) => {
    const errosSeguidos = contarErrosSeguidos(eventos, h.id);
    const acertos = acertosSeguidos(eventos, h.id);
    const respostasPratica = eventos.filter(
      (e) => e.tipo === 'pratica' && e.habilidade_id === h.id,
    ).length;
    const p_l0 = diagnostico.concluido ? pL0[h.id] : null;
    return {
      habilidade_id: h.id,
      nome: h.nome,
      pre_requisitos: h.pre_requisitos,
      p_l: dominio[h.id],
      p_l0,
      ganho: ganhoAprendizagem(dominio[h.id], p_l0),
      acima_do_limiar: dominio[h.id] >= LIMIAR_DOMINIO,
      acertos_seguidos: acertos,
      dominada: dominioRobusto(dominio[h.id], acertos),
      recente: desempenhoRecente(eventos, trajetoria, h.id, parametrosDa(h)),
      respostas_pratica: respostasPratica,
      ate_dominio: tempoAteDominio(eventos, trajetoria, h.id),
      retencao: retencao[h.id] ?? { retornos: 0, acertos: 0 },
      erros_seguidos: errosSeguidos,
      travou: errosSeguidos >= ERROS_PARA_SCAFFOLDING,
      // Como o motor enxerga a habilidade: escada de dificuldade e revisão espaçada.
      nivel: motor[h.id].nivel,
      nivel_maximo: motor[h.id].nivel_maximo,
      consolidada: motor[h.id].consolidada,
      revisao: motor[h.id].revisao,
    };
  });
}

/** Mais recente primeiro, com o P(L) de cada resposta de prática reconstruído. */
function historicoRecente({ eventos, trajetoria }, limite) {
  return eventos
    .slice(-limite)
    .reverse()
    .map((e) => ({
      id: e.id,
      tipo: e.tipo,
      questao_id: e.questao_id,
      habilidade_id: e.habilidade_id,
      enunciado: e.enunciado,
      resposta_dada: e.resposta_dada,
      correto: e.correto,
      regra: e.regra,
      dificuldade_servida: e.dificuldade_servida,
      criado_em: e.criado_em,
      p_l_antes: trajetoria[e.id]?.p_l_antes ?? null,
      p_l_depois: trajetoria[e.id]?.p_l_depois ?? null,
    }));
}

async function estadoDoAluno(alunoId) {
  const repo = await obterRepositorio();
  return estadoDe(await repo.eventosDoAluno(alunoId));
}

const exigeAluno = rota(async (req, res, next) => {
  const id = Number(req.params.id);
  const aluno = Number.isInteger(id) && (await (await obterRepositorio()).buscarAluno(id));
  if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });
  req.aluno = aluno;
  next();
});

router.get(
  '/saude',
  rota(async (_req, res) => {
    const repo = await obterRepositorio();
    res.json({ ok: true, banco: repo.banco });
  }),
);

router.get(
  '/alunos',
  rota(async (_req, res) => {
    // A turma simulada só aparece no painel: a tela da criança lista os perfis de verdade.
    const repo = await obterRepositorio();
    const [alunos, simulados] = await Promise.all([repo.listarAlunos(), repo.alunosSimulados()]);
    const ehSimulado = new Set(simulados);
    res.json(alunos.filter((a) => !ehSimulado.has(a.id)));
  }),
);

router.post(
  '/alunos',
  rota(async (req, res) => {
    const nome = String(req.body?.nome ?? '').trim();
    if (!nome || nome.length > TAMANHO_MAX_NOME) {
      return res
        .status(400)
        .json({ erro: `Informe um apelido de 1 a ${TAMANHO_MAX_NOME} caracteres` });
    }
    // Sem turma escolhida, a primeira (a tela da criança ainda não pergunta).
    const turmaId = req.body?.turma_id ?? listarTurmas()[0].id;
    if (!buscarTurma(turmaId)) return res.status(400).json({ erro: 'Turma não encontrada' });
    res.status(201).json(await (await obterRepositorio()).criarAluno(nome, turmaId));
  }),
);

router.get('/habilidades', (_req, res) => {
  res.json(listarHabilidades());
});

router.get('/turmas', (_req, res) => {
  res.json(listarTurmas());
});

router.get(
  '/alunos/:id/dominio',
  exigeAluno,
  rota(async (req, res) => {
    const estado = await estadoDoAluno(req.aluno.id);
    const { proximo, ...diagnostico } = estado.diagnostico;
    res.json({
      aluno: req.aluno,
      limiar_dominio: LIMIAR_DOMINIO,
      acertos_para_dominio: ACERTOS_PARA_DOMINIO,
      diagnostico,
      habilidades: resumoDominio(estado),
    });
  }),
);

router.get(
  '/alunos/:id/historico',
  exigeAluno,
  rota(async (req, res) => {
    const limite = Number(req.query.limite) || 10;
    res.json(historicoRecente(await estadoDoAluno(req.aluno.id), limite));
  }),
);

router.get(
  '/alunos/:id/proxima-questao',
  exigeAluno,
  rota(async (req, res) => {
    const { habilidades, questoes, eventos, dominio, pL0, diagnostico } = await estadoDoAluno(
      req.aluno.id,
    );
    const progresso = { respondidos: diagnostico.respondidos, total: diagnostico.total };

    // Cold start: enquanto o teste rápido não termina, só saem itens-âncora.
    if (!diagnostico.concluido) {
      return res.json({
        questao: questaoParaAluno(diagnostico.proximo),
        diagnostico: progresso,
        explicacao: {
          regra: 'diagnostico',
          habilidade_id: diagnostico.proximo.habilidade,
          p_l: null,
          dificuldade_alvo: diagnostico.proximo.dificuldade,
          motivo:
            `Teste rápido, item ${diagnostico.respondidos + 1} de ${diagnostico.total}: ` +
            'as respostas definem o ponto de partida P(L0) de cada habilidade.',
        },
      });
    }

    const { questao, explicacao, mostrar_dica } = selecionarProximaQuestao({
      dominio,
      pL0,
      habilidades,
      questoes,
      eventos,
    });
    res.json({
      questao: questaoParaAluno(questao, { comDica: mostrar_dica }),
      diagnostico: progresso,
      explicacao,
    });
  }),
);

router.post(
  '/alunos/:id/respostas',
  exigeAluno,
  rota(async (req, res) => {
    const { questao_id, resposta_dada } = req.body ?? {};
    if (!questao_id || resposta_dada === undefined) {
      return res.status(400).json({ erro: 'Informe questao_id e resposta_dada' });
    }

    const questao = buscarQuestao(questao_id);
    if (!questao) return res.status(404).json({ erro: 'Questão não encontrada' });

    const repo = await obterRepositorio();
    const antes = await estadoDoAluno(req.aluno.id);
    const { diagnostico } = antes;
    const tipo = diagnostico.concluido ? 'pratica' : 'diagnostico';

    // O diagnóstico tem ordem fixa: aceitar outra questão bagunçaria o P(L0).
    if (tipo === 'diagnostico' && questao.id !== diagnostico.proximo.id) {
      return res
        .status(409)
        .json({ erro: 'Diagnóstico em andamento: responda a questão atual do teste rápido' });
    }

    // Qual regra serviu esta questão. O motor é determinístico, então recalcular a
    // recomendação com os eventos de antes da resposta dá a mesma que o GET deu.
    let regra = 'diagnostico';
    if (tipo === 'pratica') {
      const recomendada = selecionarProximaQuestao(antes);
      regra = recomendada.questao.id === questao.id ? recomendada.explicacao.regra : null;
    }

    const correto = String(resposta_dada).trim() === String(questao.resposta_correta).trim();
    const eventoId = await repo.registrarEvento({
      aluno_id: req.aluno.id,
      questao_id: questao.id,
      habilidade_id: questao.habilidade,
      tipo,
      resposta_dada: String(resposta_dada),
      correto,
      versao_parametros: VERSAO_PARAMETROS,
      dificuldade_servida: questao.dificuldade,
      regra,
    });

    const depois = await estadoDoAluno(req.aluno.id);
    const { proximo, ...diagnosticoDepois } = depois.diagnostico;
    res.status(201).json({
      tipo,
      correto,
      resposta_correta: questao.resposta_correta,
      habilidade_id: questao.habilidade,
      p_l_antes: depois.trajetoria[eventoId]?.p_l_antes ?? null,
      p_l_depois: depois.trajetoria[eventoId]?.p_l_depois ?? null,
      diagnostico: diagnosticoDepois,
    });
  }),
);

/** Painel do professor: senha única no header (MVP — não é autenticação real). */
function exigeProfessor(req, res, next) {
  if (req.get('x-senha-professor') !== SENHA_PROFESSOR) {
    return res.status(401).json({ erro: 'Senha incorreta' });
  }
  next();
}

/**
 * Todos os alunos com o estado derivado dos eventos, numa consulta para a escola
 * inteira (não uma por aluno): o painel faz polling.
 */
async function carregarAlunos() {
  const repo = await obterRepositorio();
  const [lista, eventosPorAluno, simulados] = await Promise.all([
    repo.listarAlunos(),
    repo.eventosPorAluno(),
    repo.alunosSimulados(),
  ]);
  const ehSimulado = new Set(simulados);
  return lista.map((aluno) => ({
    aluno: { ...aluno, simulado: ehSimulado.has(aluno.id) },
    estado: estadoDe(eventosPorAluno.get(aluno.id) ?? []),
  }));
}

/** `?turma=<id>` escolhe uma turma; sem ele, todas. null se a turma não existe. */
function turmaDaConsulta(req) {
  if (req.query.turma === undefined || req.query.turma === '') return { todas: true };
  return buscarTurma(Number(req.query.turma)) ?? null;
}

/** As turmas com quantos alunos cada uma tem (para o seletor). */
function turmasComContagem(carregados) {
  return listarTurmas().map((t) => ({
    ...t,
    alunos: carregados.filter(({ aluno }) => aluno.turma_id === t.id).length,
  }));
}

/** Devolve tudo que a tela precisa em uma chamada só, para o polling ser barato. */
router.get(
  '/professor/painel',
  exigeProfessor,
  rota(async (req, res) => {
    const selecionada = turmaDaConsulta(req);
    if (!selecionada) return res.status(404).json({ erro: 'Turma não encontrada' });
    const carregados = await carregarAlunos();
    const estados = selecionada.todas
      ? carregados
      : carregados.filter(({ aluno }) => aluno.turma_id === selecionada.id);

    const alunos = estados.map(({ aluno, estado }) => {
      const { proximo, ...diagnostico } = estado.diagnostico;
      return {
        ...aluno,
        diagnostico,
        dominio: resumoDominio(estado),
        historico: historicoRecente(estado, 10),
      };
    });

    // Por habilidade, somando a turma. Só entra quem praticou a habilidade, e o
    // resumo diz quantos foram: a mediana sozinha esconderia quem não chegou lá.
    const turma = listarHabilidades().map((h) => {
      const daHabilidade = alunos
        .map((a) => a.dominio.find((d) => d.habilidade_id === h.id))
        .filter((d) => d.respostas_pratica > 0);
      return {
        habilidade_id: h.id,
        ate_dominio: tempoAteDominioDaTurma(daHabilidade.map((d) => d.ate_dominio)),
        retencao: retencaoDaTurma(daHabilidade.map((d) => d.retencao)),
      };
    });

    res.json({
      // Todos os cadastrados, com e sem dados suficientes: nunca esconder quem ficou de fora.
      amostra: transparenciaAmostra(estados.map(({ estado }) => estado.eventos)),
      // Contados na escola toda: o controle da simulação não depende da turma em vista.
      simulados: carregados.filter(({ aluno }) => aluno.simulado).length,
      turma_selecionada: selecionada.todas ? null : selecionada,
      turmas: turmasComContagem(carregados),
      turma,
      limiar_dominio: LIMIAR_DOMINIO,
      acertos_para_dominio: ACERTOS_PARA_DOMINIO,
      janela_recente: JANELA_RECENTE,
      divergencia: DIVERGENCIA,
      erros_para_scaffolding: ERROS_PARA_SCAFFOLDING,
      acertos_para_subir: ACERTOS_PARA_SUBIR,
      intervalos_revisao: INTERVALOS_REVISAO,
      limites_p_l0: LIMITES_P_L0,
      parametros: PARAMETROS,
      versao_parametros: VERSAO_PARAMETROS,
      alunos,
    });
  }),
);

/**
 * Relatório de desempenho: o de uma turma (`?turma=<id>`, padrão a primeira) e o
 * comparativo entre todas, calculados dos mesmos eventos do painel.
 */
router.get(
  '/professor/relatorio',
  exigeProfessor,
  rota(async (req, res) => {
    const pedida = turmaDaConsulta(req);
    if (!pedida) return res.status(404).json({ erro: 'Turma não encontrada' });
    const selecionada = pedida.todas ? listarTurmas()[0] : pedida;

    const habilidades = listarHabilidades();
    const carregados = await carregarAlunos();
    const relatorios = listarTurmas().map((turma) =>
      relatorioDaTurma({
        turma,
        habilidades,
        entradas: carregados
          .filter(({ aluno }) => aluno.turma_id === turma.id)
          .map(({ aluno, estado }) => ({
            aluno,
            eventos: estado.eventos,
            diagnostico: estado.diagnostico,
            dominio: resumoDominio(estado),
          })),
      }),
    );

    res.json({
      gerado_em: new Date().toISOString(),
      limiar_dominio: LIMIAR_DOMINIO,
      acertos_para_dominio: ACERTOS_PARA_DOMINIO,
      versao_parametros: VERSAO_PARAMETROS,
      simulados: carregados.filter(({ aluno }) => aluno.simulado).length,
      turmas: turmasComContagem(carregados),
      comparativo: comparativoDeTurmas(relatorios),
      relatorio: relatorios.find((r) => r.turma.id === selecionada.id),
    });
  }),
);

/**
 * Alunos simulados (simulacao.js): fictícios, com semanas de uso, distribuídos
 * pelas turmas, para mostrar o painel como seria em produção. Popular de novo
 * substitui os anteriores; alunos de verdade e os de exemplo não são tocados.
 */
router.post(
  '/professor/simulacao',
  exigeProfessor,
  rota(async (_req, res) => {
    const alunos = simularTurma({ habilidades: listarHabilidades(), questoes: listarQuestoes() });
    await (await obterRepositorio()).substituirSimulados(alunos);
    res.status(201).json({
      alunos: alunos.length,
      respostas: alunos.reduce((soma, a) => soma + a.eventos.length, 0),
    });
  }),
);

router.delete(
  '/professor/simulacao',
  exigeProfessor,
  rota(async (_req, res) => {
    await (await obterRepositorio()).removerSimulados();
    res.json({ alunos: 0 });
  }),
);

/**
 * "Limpar informações": volta ao estado inicial da demonstração. Apaga todas as
 * respostas e todos os alunos criados depois, inclusive os simulados; ficam os
 * alunos de exemplo, zerados. Não tem desfazer.
 */
router.delete(
  '/professor/dados',
  exigeProfessor,
  rota(async (_req, res) => {
    await (await obterRepositorio()).limparTudo();
    res.json({ ok: true });
  }),
);
