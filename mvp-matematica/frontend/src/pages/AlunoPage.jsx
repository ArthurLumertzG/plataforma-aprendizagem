import { useEffect, useState } from 'react';

import { api } from '../api.js';

export default function AlunoPage() {
  const [alunos, setAlunos] = useState([]);
  const [aluno, setAluno] = useState(null);
  const [novoNome, setNovoNome] = useState('');
  const [questao, setQuestao] = useState(null);
  const [explicacao, setExplicacao] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null); // { respondidos, total }
  const [feedback, setFeedback] = useState(null); // resultado da última resposta
  const [dominio, setDominio] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.listarAlunos().then(setAlunos).catch((e) => setErro(e.message));
  }, []);

  async function atualizarTela(alunoId) {
    setCarregando(true);
    try {
      const [proxima, dom] = await Promise.all([
        api.proximaQuestao(alunoId),
        api.dominio(alunoId),
      ]);
      setQuestao(proxima.questao);
      setExplicacao(proxima.explicacao);
      setDiagnostico(proxima.diagnostico);
      setDominio(dom.habilidades);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  async function escolherAluno(a) {
    setAluno(a);
    setFeedback(null);
    await atualizarTela(a.id);
  }

  async function cadastrar(evento) {
    evento.preventDefault();
    try {
      const criado = await api.criarAluno(novoNome);
      setAlunos((lista) => [...lista, criado]);
      setNovoNome('');
      await escolherAluno(criado);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function responder(alternativa) {
    if (feedback) return; // já respondeu, está esperando "Próxima"
    try {
      const resultado = await api.responder(aluno.id, questao.id, alternativa);
      setFeedback({ ...resultado, escolhida: alternativa });
    } catch (e) {
      setErro(e.message);
    }
  }

  async function proxima() {
    setFeedback(null);
    await atualizarTela(aluno.id);
  }

  if (erro) {
    return (
      <main className="tela">
        <p className="erro">
          {erro} — o backend está rodando em <code>http://localhost:3001</code>?
        </p>
        <button className="link" onClick={() => setErro(null)}>
          tentar de novo
        </button>
      </main>
    );
  }

  // ---------- seletor de perfil ----------
  if (!aluno) {
    return (
      <main className="tela">
        <h1 className="titulo-grande">Quem vai jogar hoje?</h1>
        <div className="lista-alunos">
          {alunos.map((a) => (
            <button key={a.id} className="cartao-aluno" onClick={() => escolherAluno(a)}>
              {a.nome}
            </button>
          ))}
        </div>

        <form className="form-novo-aluno" onSubmit={cadastrar}>
          <input
            placeholder="Apelido de um aluno novo"
            maxLength={30}
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
          <button className="botao-principal" type="submit" disabled={!novoNome.trim()}>
            Começar
          </button>
        </form>
        <p className="nota centro">
          Use só apelidos fictícios: esta demonstração não deve receber dados reais de crianças.
        </p>
      </main>
    );
  }

  const emDiagnostico = explicacao?.regra === 'diagnostico';
  const terminouDiagnostico = feedback?.tipo === 'diagnostico' && feedback.diagnostico.concluido;

  // ---------- questão ----------
  return (
    <main className="tela">
      <div className="cabecalho-aluno">
        <span>
          Olá, <strong>{aluno.nome}</strong>!
        </span>
        <button className="link" onClick={() => setAluno(null)}>
          trocar
        </button>
      </div>

      {emDiagnostico && diagnostico && (
        <div className="progresso-diagnostico">
          <span>
            Teste rápido · {Math.min(diagnostico.respondidos + 1, diagnostico.total)} de{' '}
            {diagnostico.total}
          </span>
          <div className="barra-trilho">
            <div
              className="barra-preenchida"
              style={{ width: `${(diagnostico.respondidos / diagnostico.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {carregando && <p>Carregando…</p>}

      {questao && (
        <section className="cartao-questao">
          <p className="enunciado">{questao.enunciado}</p>

          {questao.dica && !feedback && <p className="dica">💡 {questao.dica}</p>}

          <div className="alternativas">
            {questao.alternativas.map((alt) => {
              let classe = 'alternativa';
              if (feedback?.tipo === 'diagnostico') {
                // No teste rápido não mostramos certo/errado: só o que foi marcado.
                classe += alt === feedback.escolhida ? ' marcada' : ' apagada';
              } else if (feedback) {
                if (alt === feedback.resposta_correta) classe += ' certa';
                else if (alt === feedback.escolhida) classe += ' errada';
                else classe += ' apagada';
              }
              return (
                <button
                  key={alt}
                  className={classe}
                  onClick={() => responder(alt)}
                  disabled={Boolean(feedback)}
                >
                  {alt}
                </button>
              );
            })}
          </div>

          {feedback && (
            <div
              className={`feedback ${
                feedback.tipo === 'diagnostico' ? 'neutro' : feedback.correto ? 'ok' : 'nao'
              }`}
            >
              <p className="feedback-texto">
                {feedback.tipo === 'diagnostico' &&
                  (terminouDiagnostico
                    ? '🏁 Teste rápido concluído! Agora as questões são escolhidas para você.'
                    : '👍 Anotado! Vamos para a próxima.')}
                {feedback.tipo === 'pratica' &&
                  (feedback.correto ? '🎉 Isso aí! Você acertou.' : '🤔 Quase! A resposta era ')}
                {feedback.tipo === 'pratica' && !feedback.correto && (
                  <strong>{feedback.resposta_correta}</strong>
                )}
              </p>
              <button className="botao-principal" onClick={proxima}>
                Próxima →
              </button>
            </div>
          )}
        </section>
      )}

      {/* Bloco de apoio à demonstração: mostra o porquê da recomendação. */}
      {explicacao && (
        <details className="explicacao">
          <summary>Por que esta questão? (visão de bastidores)</summary>
          <p>
            <strong>Regra:</strong> {explicacao.regra} · <strong>Habilidade:</strong>{' '}
            {explicacao.habilidade_id}
            {explicacao.p_l !== null && (
              <>
                {' '}
                · <strong>P(L):</strong> {explicacao.p_l.toFixed(2)}
              </>
            )}{' '}
            · <strong>Dificuldade alvo:</strong> {explicacao.dificuldade_alvo}
          </p>
          <p>{explicacao.motivo}</p>
          <ul className="mini-dominio">
            {dominio.map((h) => (
              <li key={h.habilidade_id}>
                {h.nome}: {(h.p_l * 100).toFixed(0)}%{h.dominada ? ' ✅' : ''}
                {h.p_l0 !== null && ` (partiu de ${(h.p_l0 * 100).toFixed(0)}%)`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
