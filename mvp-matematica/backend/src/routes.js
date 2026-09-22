import { Router } from 'express';

import {
  PARAMETROS,
  LIMIAR_DOMINIO,
  atualizarPL,
  escolherHabilidade,
  selecionarProximaQuestao,
} from './bkt.js';
import {
  buscarAluno,
  buscarQuestao,
  dominioDoAluno,
  errosSeguidos,
  historico,
  listarAlunos,
  listarHabilidades,
  listarQuestoes,
  registrarResposta,
  salvarDominio,
  ultimaResposta,
} from './db.js';

export const SENHA_PROFESSOR = process.env.SENHA_PROFESSOR || 'professor123';

export const router = Router();

/** A criança nunca recebe a resposta correta junto com a questão. */
function questaoParaAluno(q) {
  const { resposta_correta, ...publica } = q;
  return publica;
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

router.get('/habilidades', (_req, res) => {
  res.json(listarHabilidades());
});

router.get('/alunos/:id/dominio', exigeAluno, (req, res) => {
  const dominio = dominioDoAluno(req.aluno.id, PARAMETROS.P_L0);
  res.json({
    aluno: req.aluno,
    limiar_dominio: LIMIAR_DOMINIO,
    habilidades: listarHabilidades().map((h) => ({
      ...h,
      p_l: dominio[h.id],
      dominada: dominio[h.id] >= LIMIAR_DOMINIO,
    })),
  });
});

router.get('/alunos/:id/historico', exigeAluno, (req, res) => {
  const limite = Number(req.query.limite) || 10;
  res.json(historico(req.aluno.id, limite));
});

router.get('/alunos/:id/proxima-questao', exigeAluno, (req, res) => {
  const dominio = dominioDoAluno(req.aluno.id, PARAMETROS.P_L0);
  const habilidades = listarHabilidades();

  // Precisamos saber a habilidade antes de contar os erros seguidos dela (regra 4).
  const { habilidade_id } = escolherHabilidade(dominio, habilidades);

  const { questao, explicacao } = selecionarProximaQuestao({
    dominio,
    habilidades,
    questoes: listarQuestoes(),
    ultimaQuestaoId: ultimaResposta(req.aluno.id)?.questao_id ?? null,
    errosSeguidos: errosSeguidos(req.aluno.id, habilidade_id),
  });

  res.json({ questao: questaoParaAluno(questao), explicacao });
});

router.post('/alunos/:id/respostas', exigeAluno, (req, res) => {
  const { questao_id, resposta_dada } = req.body ?? {};
  if (!questao_id || resposta_dada === undefined) {
    return res.status(400).json({ erro: 'Informe questao_id e resposta_dada' });
  }

  const questao = buscarQuestao(questao_id);
  if (!questao) return res.status(404).json({ erro: 'Questão não encontrada' });

  const correto = String(resposta_dada).trim() === String(questao.resposta_correta).trim();

  const dominio = dominioDoAluno(req.aluno.id, PARAMETROS.P_L0);
  const pLAntes = dominio[questao.habilidade];
  const pLDepois = atualizarPL(pLAntes, correto);

  salvarDominio(req.aluno.id, questao.habilidade, pLDepois);
  registrarResposta({
    aluno_id: req.aluno.id,
    questao_id: questao.id,
    habilidade_id: questao.habilidade,
    resposta_dada: String(resposta_dada),
    correto: correto ? 1 : 0,
    p_l_antes: pLAntes,
    p_l_depois: pLDepois,
  });

  res.json({
    correto,
    resposta_correta: questao.resposta_correta,
    habilidade_id: questao.habilidade,
    p_l_antes: pLAntes,
    p_l_depois: pLDepois,
  });
});

/**
 * Painel do professor: senha única no header (MVP — não é autenticação real).
 * Devolve tudo que a tela precisa em uma chamada só, para o polling ser barato.
 */
router.get('/professor/painel', (req, res) => {
  const senha = req.get('x-senha-professor');
  if (senha !== SENHA_PROFESSOR) return res.status(401).json({ erro: 'Senha incorreta' });

  const habilidades = listarHabilidades();
  const alunos = listarAlunos().map((aluno) => {
    const dominio = dominioDoAluno(aluno.id, PARAMETROS.P_L0);
    return {
      ...aluno,
      dominio: habilidades.map((h) => ({
        habilidade_id: h.id,
        nome: h.nome,
        p_l: dominio[h.id],
        dominada: dominio[h.id] >= LIMIAR_DOMINIO,
      })),
      historico: historico(aluno.id, 10),
    };
  });

  res.json({ limiar_dominio: LIMIAR_DOMINIO, parametros: PARAMETROS, alunos });
});
