import { useEffect, useState } from 'react';

import { api } from '../api.js';

export default function AlunoPage() {
  const [alunos, setAlunos] = useState([]);
  const [aluno, setAluno] = useState(null);
  const [questao, setQuestao] = useState(null);
  const [explicacao, setExplicacao] = useState(null);
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
      </main>
    );
  }

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

      {carregando && <p>Carregando…</p>}

      {questao && (
        <section className="cartao-questao">
          <p className="enunciado">{questao.enunciado}</p>

          <div className="alternativas">
            {questao.alternativas.map((alt) => {
              let classe = 'alternativa';
              if (feedback) {
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
            <div className={`feedback ${feedback.correto ? 'ok' : 'nao'}`}>
              <p className="feedback-texto">
                {feedback.correto ? '🎉 Isso aí! Você acertou.' : '🤔 Quase! A resposta era '}
                {!feedback.correto && <strong>{feedback.resposta_correta}</strong>}
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
            {explicacao.habilidade_id} · <strong>P(L):</strong> {explicacao.p_l.toFixed(2)} ·{' '}
            <strong>Dificuldade alvo:</strong> {explicacao.dificuldade_alvo}
          </p>
          <p>{explicacao.motivo}</p>
          <ul className="mini-dominio">
            {dominio.map((h) => (
              <li key={h.id}>
                {h.nome}: {(h.p_l * 100).toFixed(0)}%{h.dominada ? ' ✅' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
