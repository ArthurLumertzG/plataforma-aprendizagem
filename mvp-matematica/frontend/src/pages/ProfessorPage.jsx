import { useEffect, useState } from 'react';

import { api } from '../api.js';

const INTERVALO_POLLING_MS = 3000;

const pct = (v) => `${(v * 100).toFixed(0)}%`;

export default function ProfessorPage() {
  const [senha, setSenha] = useState('');
  const [autenticado, setAutenticado] = useState(false);
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState(null);

  // Polling simples: o painel reflete as respostas do aluno em poucos segundos.
  useEffect(() => {
    if (!autenticado) return undefined;

    let ativo = true;
    const carregar = () =>
      api
        .painelProfessor(senha)
        .then((dados) => ativo && setPainel(dados))
        .catch((e) => ativo && setErro(e.message));

    carregar();
    const timer = setInterval(carregar, INTERVALO_POLLING_MS);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [autenticado, senha]);

  async function entrar(evento) {
    evento.preventDefault();
    try {
      const dados = await api.painelProfessor(senha);
      setPainel(dados);
      setAutenticado(true);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  }

  if (!autenticado) {
    return (
      <main className="tela">
        <h1>Painel do professor</h1>
        <form className="form-senha" onSubmit={entrar}>
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <button className="botao-principal" type="submit">
            Entrar
          </button>
        </form>
        {erro && <p className="erro">{erro}</p>}
        <p className="nota">
          MVP: senha única definida em <code>SENHA_PROFESSOR</code> (padrão{' '}
          <code>professor123</code>). Não é autenticação real.
        </p>
      </main>
    );
  }

  return (
    <main className="tela larga">
      <h1>Painel do professor</h1>
      <p className="nota">
        Atualiza sozinho a cada {INTERVALO_POLLING_MS / 1000}s. Domínio considerado a partir de
        P(L) ≥ {painel?.limiar_dominio}. A marca ┃ na barra é o ponto de partida definido pelo
        teste rápido. ⚠️ = {painel?.erros_para_scaffolding}+ erros seguidos na habilidade.
      </p>
      {erro && <p className="erro">{erro}</p>}

      {painel?.alunos.map((aluno) => {
        const travadas = aluno.dominio.filter((h) => h.travou);
        return (
          <section key={aluno.id} className="cartao-professor">
            <h2>
              {aluno.nome}
              {!aluno.diagnostico.concluido && (
                <span className="etiqueta">
                  teste rápido: {aluno.diagnostico.respondidos}/{aluno.diagnostico.total}
                </span>
              )}
            </h2>

            {travadas.length > 0 && (
              <p className="alerta">
                ⚠️ Travou em{' '}
                {travadas.map((h) => `${h.nome} (${h.erros_seguidos} erros seguidos)`).join(', ')}.
                O sistema voltou para questões fáceis com dica.
              </p>
            )}

            <div className="barras">
              {aluno.dominio.map((h) => (
                <div key={h.habilidade_id} className="barra-linha">
                  <span className="barra-rotulo">
                    {h.travou && '⚠️ '}
                    {h.nome}
                  </span>
                  <div className="barra-trilho">
                    <div
                      className={`barra-preenchida ${h.dominada ? 'dominada' : ''}`}
                      style={{ width: `${Math.round(h.p_l * 100)}%` }}
                    />
                    {h.p_l0 !== null && (
                      <div
                        className="marca-p-l0"
                        style={{ left: `${Math.round(h.p_l0 * 100)}%` }}
                        title={`Ponto de partida (diagnóstico): ${pct(h.p_l0)}`}
                      />
                    )}
                  </div>
                  <span className="barra-valor">{pct(h.p_l)}</span>
                </div>
              ))}
            </div>

            <h3>Últimas respostas</h3>
            {aluno.historico.length === 0 ? (
              <p className="nota">Ainda não respondeu nada.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Tipo</th>
                    <th>Habilidade</th>
                    <th>Questão</th>
                    <th>Resultado</th>
                    <th>P(L)</th>
                  </tr>
                </thead>
                <tbody>
                  {aluno.historico.map((r) => (
                    <tr key={r.id}>
                      <td>{r.criado_em}</td>
                      <td>{r.tipo === 'diagnostico' ? 'teste rápido' : 'prática'}</td>
                      <td>{r.habilidade_id}</td>
                      <td>{r.enunciado}</td>
                      <td className={r.correto ? 'acerto' : 'erro-celula'}>
                        {r.correto ? '✅ acertou' : '❌ errou'}
                      </td>
                      <td>
                        {r.p_l_depois === null ? '—' : `${pct(r.p_l_antes)} → ${pct(r.p_l_depois)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </main>
  );
}
