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
  transparenciaAmostra,
} from './metricas.js';
import {
  ERROS_PARA_SCAFFOLDING,
  contarErrosSeguidos,
  estadoDiagnostico,
  itensDoDiagnostico,
  selecionarProximaQuestao,
} from './motor.js';
import {
  buscarAluno,
  buscarQuestao,
  criarAluno,
  eventosDoAluno,
  listarAlunos,
  listarHabilidades,
  listarQuestoes,
  registrarEvento,
} from './db.js';

export const SENHA_PROFESSOR = process.env.SENHA_PROFESSOR || 'professor123';

const TAMANHO_MAX_NOME = 30;

export const router = Router();

/** A criança nunca recebe a resposta correta; a dica só vem no scaffolding. */
function questaoParaAluno(q, { comDica = false } = {}) {
  const { resposta_correta, dica, ...publica } = q;
  return comDica && dica ? { ...publica, dica } : publica;
}

/**
 * Tudo que se sabe do aluno, derivado dos eventos dele. Rotas só chamam isto
 * e formatam a resposta: P(L) nunca é lido de uma tabela.
 */
function estadoDoAluno(alunoId) {
  const habilidades = listarHabilidades();
  const questoes = listarQuestoes();
  const eventos = eventosDoAluno(alunoId);
  const { dominio, pL0, trajetoria } = recalcularDominio(eventos, habilidades);
  const diagnostico = estadoDiagnostico(eventos, itensDoDiagnostico(habilidades, questoes));
  return { habilidades, questoes, eventos, dominio, pL0, trajetoria, diagnostico };
}

/**
 * Por habilidade: P(L) e as métricas que precisam aparecer junto dele.
 * `acima_do_limiar` é o que o motor usa; `dominada` é o domínio confirmado
 * (limiar + acertos seguidos), o único que o painel mostra como "dominada".
 */
function resumoDominio({ habilidades, dominio, pL0, eventos, trajetoria, diagnostico }) {
  return habilidades.map((h) => {
    const errosSeguidos = contarErrosSeguidos(eventos, h.id);
    const acertos = acertosSeguidos(eventos, h.id);
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
      erros_seguidos: errosSeguidos,
      travou: errosSeguidos >= ERROS_PARA_SCAFFOLDING,
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

function exigeAluno(req, res, next) {
  const aluno = buscarAluno(Number(req.params.id));
  if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });
  req.aluno = aluno;
  next();
}

router.get('/alunos', (_req, res) => {
  res.json(listarAlunos());
});

router.post('/alunos', (req, res) => {
  const nome = String(req.body?.nome ?? '').trim();
  if (!nome || nome.length > TAMANHO_MAX_NOME) {
    return res
      .status(400)
      .json({ erro: `Informe um apelido de 1 a ${TAMANHO_MAX_NOME} caracteres` });
  }
  res.status(201).json(criarAluno(nome));
});

router.get('/habilidades', (_req, res) => {
  res.json(listarHabilidades());
});

router.get('/alunos/:id/dominio', exigeAluno, (req, res) => {
  const estado = estadoDoAluno(req.aluno.id);
  const { proximo, ...diagnostico } = estado.diagnostico;
  res.json({
    aluno: req.aluno,
    limiar_dominio: LIMIAR_DOMINIO,
    acertos_para_dominio: ACERTOS_PARA_DOMINIO,
    diagnostico,
    habilidades: resumoDominio(estado),
  });
});

router.get('/alunos/:id/historico', exigeAluno, (req, res) => {
  const limite = Number(req.query.limite) || 10;
  res.json(historicoRecente(estadoDoAluno(req.aluno.id), limite));
});

router.get('/alunos/:id/proxima-questao', exigeAluno, (req, res) => {
  const { habilidades, questoes, eventos, dominio, diagnostico } = estadoDoAluno(req.aluno.id);
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
    habilidades,
    questoes,
    eventos,
  });
  res.json({
    questao: questaoParaAluno(questao, { comDica: mostrar_dica }),
    diagnostico: progresso,
    explicacao,
  });
});

router.post('/alunos/:id/respostas', exigeAluno, (req, res) => {
  const { questao_id, resposta_dada } = req.body ?? {};
  if (!questao_id || resposta_dada === undefined) {
    return res.status(400).json({ erro: 'Informe questao_id e resposta_dada' });
  }

  const questao = buscarQuestao(questao_id);
  if (!questao) return res.status(404).json({ erro: 'Questão não encontrada' });

  const antes = estadoDoAluno(req.aluno.id);
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
  const eventoId = registrarEvento({
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

  const depois = estadoDoAluno(req.aluno.id);
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
});

/**
 * Painel do professor: senha única no header (MVP — não é autenticação real).
 * Devolve tudo que a tela precisa em uma chamada só, para o polling ser barato.
 */
router.get('/professor/painel', (req, res) => {
  const senha = req.get('x-senha-professor');
  if (senha !== SENHA_PROFESSOR) return res.status(401).json({ erro: 'Senha incorreta' });

  const estados = listarAlunos().map((aluno) => ({ aluno, estado: estadoDoAluno(aluno.id) }));
  const alunos = estados.map(({ aluno, estado }) => {
    const { proximo, ...diagnostico } = estado.diagnostico;
    return {
      ...aluno,
      diagnostico,
      dominio: resumoDominio(estado),
      historico: historicoRecente(estado, 10),
    };
  });

  res.json({
    // Todos os cadastrados, com e sem dados suficientes: nunca esconder quem ficou de fora.
    amostra: transparenciaAmostra(estados.map(({ estado }) => estado.eventos)),
    limiar_dominio: LIMIAR_DOMINIO,
    acertos_para_dominio: ACERTOS_PARA_DOMINIO,
    janela_recente: JANELA_RECENTE,
    divergencia: DIVERGENCIA,
    erros_para_scaffolding: ERROS_PARA_SCAFFOLDING,
    limites_p_l0: LIMITES_P_L0,
    parametros: PARAMETROS,
    versao_parametros: VERSAO_PARAMETROS,
    alunos,
  });
});
