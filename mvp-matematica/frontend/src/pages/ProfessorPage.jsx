import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import Icone from '../components/Icone.jsx';
import Logo from '../components/Logo.jsx';
import MapaHabilidades from '../components/MapaHabilidades.jsx';
import Regua from '../components/Regua.jsx';
import { NOME_DA_REGRA, corDoAluno, horario, inicial, pct } from '../lib/textos.js';

const INTERVALO_POLLING_MS = 3000;
const CHAVE_SENHA = 'senha-professor';

function lerSenhaSalva() {
  try {
    return window.sessionStorage.getItem(CHAVE_SENHA) ?? '';
  } catch {
    return '';
  }
}

function salvarSenha(senha) {
  try {
    if (senha) window.sessionStorage.setItem(CHAVE_SENHA, senha);
    else window.sessionStorage.removeItem(CHAVE_SENHA);
  } catch {
    // Sem armazenamento: o login vale só até recarregar a página.
  }
}

function Avatar({ aluno }) {
  return (
    <span className={`avatar avatar--${corDoAluno(aluno.id)}`} aria-hidden="true">
      {inicial(aluno.nome)}
    </span>
  );
}

// ---------- login ----------

function Entrada({ aoEntrar, erro }) {
  const [senha, setSenha] = useState('');
  return (
    <div className="area-adulto entrada">
      <main className="entrada__cartao">
        <Logo />
        <h1>Painel do professor</h1>
        <p className="entrada__texto">
          Veja onde cada aluno está em cada habilidade e por que o sistema escolheu a próxima
          questão.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            aoEntrar(senha);
          }}
        >
          <label htmlFor="senha" className="rotulo">
            Senha da turma
          </label>
          <input
            id="senha"
            className="campo"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-describedby={erro ? 'erro-senha' : 'nota-senha'}
          />
          {erro && (
            <p id="erro-senha" className="mensagem-erro" role="alert">
              {erro === 'Senha incorreta' ? 'Senha incorreta. Confira e tente de novo.' : erro}
            </p>
          )}
          <button className="botao botao--principal botao--largo" type="submit" disabled={!senha}>
            Entrar no painel
          </button>
        </form>
        <p id="nota-senha" className="entrada__nota">
          <Icone nome="cadeado" tamanho={16} />
          <span>
            Demonstração: senha única definida em <code>SENHA_PROFESSOR</code> (padrão{' '}
            <code>professor123</code>). Ainda não é uma autenticação real.
          </span>
        </p>
      </main>
      <Link to="/" className="entrada__voltar">
        Voltar para o início
      </Link>
    </div>
  );
}

// ---------- blocos do painel ----------

function Atencao({ alunos, aoVer }) {
  const alertas = alunos.flatMap((a) =>
    a.dominio.filter((h) => h.travou).map((h) => ({ aluno: a, habilidade: h })),
  );

  return (
    <section className="atencao" aria-labelledby="titulo-atencao">
      <h2 id="titulo-atencao">Precisa de atenção</h2>
      {alertas.length === 0 ? (
        <p className="atencao__vazio">
          <Icone nome="certo" tamanho={18} /> Ninguém travado agora. Os alertas aparecem aqui
          quando um aluno erra duas vezes seguidas a mesma habilidade.
        </p>
      ) : (
        <ul className="atencao__lista">
          {alertas.map(({ aluno, habilidade }) => (
            <li key={`${aluno.id}-${habilidade.habilidade_id}`} className="atencao__item">
              <Icone nome="alerta" className="atencao__icone" />
              <span>
                <strong>{aluno.nome}</strong> travou em <strong>{habilidade.nome}</strong>:{' '}
                {habilidade.erros_seguidos} erros seguidos. O sistema passou a dar questões
                fáceis com dica e material de apoio.
              </span>
              <button type="button" className="botao botao--leve" onClick={() => aoVer(aluno.id)}>
                Ver {aluno.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Matriz({ alunos, limiar, selecionado, aoSelecionar }) {
  const habilidades = alunos[0]?.dominio ?? [];

  return (
    <section className="matriz" aria-labelledby="titulo-matriz">
      <div className="matriz__cabeca">
        <h2 id="titulo-matriz">Domínio por habilidade</h2>
        <p className="matriz__legenda">
          <span className="legenda-item">
            <Regua pL={0.45} limiar={limiar} className="regua--amostra" />
            Domínio estimado, P(L)
          </span>
          <span className="legenda-item">
            <span className="legenda-limiar" aria-hidden="true" />
            Limiar de domínio ({pct(limiar)})
          </span>
          <span className="legenda-item">
            <span className="legenda-partida" aria-hidden="true" />
            Ponto de partida do teste rápido
          </span>
        </p>
      </div>

      <div className="matriz__rolagem">
        <table className="matriz__tabela">
          <thead>
            <tr>
              <th scope="col">Aluno</th>
              {habilidades.map((h) => (
                <th scope="col" key={h.habilidade_id}>
                  {h.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alunos.map((a) => (
              <tr
                key={a.id}
                className={a.id === selecionado ? 'matriz__linha--selecionada' : ''}
                onClick={() => aoSelecionar(a.id)}
              >
                <th scope="row">
                  <button
                    type="button"
                    className="matriz__aluno"
                    onClick={(e) => {
                      e.stopPropagation();
                      aoSelecionar(a.id);
                    }}
                    aria-pressed={a.id === selecionado}
                  >
                    <Avatar aluno={a} />
                    <span>
                      <span className="matriz__nome">{a.nome}</span>
                      {!a.diagnostico.concluido && (
                        <span className="matriz__situacao">
                          Teste rápido {a.diagnostico.respondidos} de {a.diagnostico.total}
                        </span>
                      )}
                    </span>
                  </button>
                </th>
                {a.dominio.map((h) => (
                  <td key={h.habilidade_id} className={h.travou ? 'matriz__celula--travou' : ''}>
                    <span className="matriz__valor">
                      {pct(h.p_l)}
                      {h.travou && (
                        <span className="estado estado--travou">
                          <Icone nome="alerta" tamanho={14} />
                          <span className="visualmente-oculto">travou</span>
                        </span>
                      )}
                      {!h.travou && h.dominada && (
                        <span className="estado estado--dominada">
                          <Icone nome="certo" tamanho={14} />
                          <span className="visualmente-oculto">dominada</span>
                        </span>
                      )}
                    </span>
                    <Regua pL={h.p_l} pL0={h.p_l0} limiar={limiar} dominada={h.dominada} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetalheAluno({ aluno, recomendacao }) {
  const explicacao = recomendacao?.explicacao;
  const habilidadeAlvo = aluno.dominio.find((h) => h.habilidade_id === explicacao?.habilidade_id);

  return (
    <aside className="detalhe" aria-labelledby="titulo-detalhe">
      <header className="detalhe__topo">
        <Avatar aluno={aluno} />
        <h2 id="titulo-detalhe">{aluno.nome}</h2>
      </header>

      <section className="detalhe__bloco">
        <h3>Próxima questão recomendada</h3>
        {explicacao ? (
          <div className="recomendacao">
            <p className="recomendacao__regra">{NOME_DA_REGRA[explicacao.regra] ?? explicacao.regra}</p>
            <p className="recomendacao__item">
              {habilidadeAlvo?.nome ?? explicacao.habilidade_id}, dificuldade{' '}
              {explicacao.dificuldade_alvo} de 3
              {recomendacao.questao?.dica && ', com dica'}
            </p>
            <p className="recomendacao__motivo">{explicacao.motivo}</p>
            {recomendacao.questao && (
              <p className="recomendacao__enunciado">“{recomendacao.questao.enunciado}”</p>
            )}
          </div>
        ) : (
          <p className="detalhe__nota">Calculando a recomendação.</p>
        )}
      </section>

      <section className="detalhe__bloco">
        <h3>Mapa de habilidades</h3>
        <p className="detalhe__nota">
          Cada habilidade só é praticada quando as de cima já estão dominadas.
        </p>
        <div className="detalhe__mapa">
          <MapaHabilidades habilidades={aluno.dominio} recomendada={explicacao?.habilidade_id} />
        </div>
      </section>

      <section className="detalhe__bloco">
        <h3>Últimas respostas</h3>
        {aluno.historico.length === 0 ? (
          <p className="detalhe__nota">{aluno.nome} ainda não respondeu nenhuma questão.</p>
        ) : (
          <ol className="historico">
            {aluno.historico.map((r) => {
              const nomeHabilidade =
                aluno.dominio.find((h) => h.habilidade_id === r.habilidade_id)?.nome ?? r.habilidade_id;
              return (
                <li key={r.id} className={`historico__item historico__item--${r.correto ? 'acerto' : 'erro'}`}>
                  <span className="historico__resultado">
                    <Icone nome={r.correto ? 'certo' : 'fechar'} tamanho={16} />
                    {r.correto ? 'Acertou' : 'Errou'}
                  </span>
                  <span className="historico__enunciado">{r.enunciado}</span>
                  <span className="historico__meta">
                    {horario(r.criado_em)}, {r.tipo === 'diagnostico' ? 'teste rápido' : 'prática'},{' '}
                    {nomeHabilidade}
                  </span>
                  {r.p_l_depois !== null && (
                    <span className="historico__variacao">
                      {pct(r.p_l_antes)} para {pct(r.p_l_depois)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </aside>
  );
}

// ---------- página ----------

export default function ProfessorPage() {
  const [senha, setSenha] = useState(lerSenhaSalva);
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [selecionado, setSelecionado] = useState(null);
  const [recomendacao, setRecomendacao] = useState(null);

  const autenticado = Boolean(painel);

  // Polling simples: o painel reflete as respostas do aluno em poucos segundos.
  useEffect(() => {
    if (!senha) return undefined;
    let ativo = true;
    const carregar = () =>
      api
        .painelProfessor(senha)
        .then((dados) => {
          if (!ativo) return;
          setPainel(dados);
          setAtualizadoEm(new Date());
          setErro(null);
        })
        .catch((e) => {
          if (!ativo) return;
          setErro(e.message);
          if (e.message === 'Senha incorreta') {
            setSenha('');
            setPainel(null);
            salvarSenha('');
          }
        });
    carregar();
    const timer = setInterval(carregar, INTERVALO_POLLING_MS);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [senha]);

  // Seleciona o primeiro aluno quando o painel chega.
  useEffect(() => {
    if (painel && !painel.alunos.some((a) => a.id === selecionado)) {
      setSelecionado(painel.alunos[0]?.id ?? null);
    }
  }, [painel, selecionado]);

  // A recomendação do aluno selecionado acompanha o polling (GET sem efeito colateral).
  useEffect(() => {
    if (!selecionado || !atualizadoEm) return;
    let ativo = true;
    api
      .proximaQuestao(selecionado)
      .then((r) => ativo && setRecomendacao({ alunoId: selecionado, ...r }))
      .catch(() => ativo && setRecomendacao(null));
    return () => {
      ativo = false;
    };
  }, [selecionado, atualizadoEm]);

  function entrar(novaSenha) {
    setErro(null);
    salvarSenha(novaSenha);
    setSenha(novaSenha);
  }

  function sair() {
    salvarSenha('');
    setSenha('');
    setPainel(null);
    setSelecionado(null);
    setRecomendacao(null);
  }

  if (!autenticado) return <Entrada aoEntrar={entrar} erro={erro} />;

  const aluno = painel.alunos.find((a) => a.id === selecionado);
  const travados = new Set(
    painel.alunos.filter((a) => a.dominio.some((h) => h.travou)).map((a) => a.id),
  ).size;
  const emTeste = painel.alunos.filter((a) => !a.diagnostico.concluido).length;

  return (
    <div className="area-adulto painel">
      <header className="painel__topo">
        <Logo />
        <span className="painel__secao">Painel do professor</span>
        <span className="painel__status" aria-live="polite">
          <span className={`painel__pulso ${erro ? 'painel__pulso--falha' : ''}`} aria-hidden="true" />
          {erro
            ? `Sem conexão com a API. Tentando de novo a cada ${INTERVALO_POLLING_MS / 1000} s.`
            : `Ao vivo, atualizado às ${atualizadoEm?.toLocaleTimeString('pt-BR')}`}
        </span>
        <button type="button" className="botao botao--leve" onClick={sair}>
          <Icone nome="sair" />
          Sair
        </button>
      </header>

      <main className="painel__corpo">
        <div className="painel__principal">
          <div className="painel__resumo">
            <h1>Turma de demonstração</h1>
            <p>
              {painel.alunos.length} alunos.{' '}
              {travados === 0 && 'Nenhum precisa de atenção agora'}
              {travados === 1 && '1 precisa de atenção agora'}
              {travados > 1 && `${travados} precisam de atenção agora`}
              {emTeste > 0 && `, e ${emTeste} ainda ${emTeste === 1 ? 'faz' : 'fazem'} o teste rápido`}.
            </p>
          </div>
          <Atencao alunos={painel.alunos} aoVer={setSelecionado} />
          <Matriz
            alunos={painel.alunos}
            limiar={painel.limiar_dominio}
            selecionado={selecionado}
            aoSelecionar={setSelecionado}
          />
        </div>

        {aluno && (
          <DetalheAluno
            aluno={aluno}
            recomendacao={recomendacao?.alunoId === aluno.id ? recomendacao : null}
          />
        )}
      </main>
    </div>
  );
}
