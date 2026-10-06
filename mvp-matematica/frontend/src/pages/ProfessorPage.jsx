import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import Icone from '../components/Icone.jsx';
import Logo from '../components/Logo.jsx';
import MapaHabilidades from '../components/MapaHabilidades.jsx';
import Regua from '../components/Regua.jsx';
import {
  NOME_DA_REGRA,
  corDoAluno,
  enunciadoParaAdulto,
  horario,
  inicial,
  pct,
} from '../lib/textos.js';

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

/**
 * Ganho estimado desde o teste rápido, em pontos de P(L). Seta e texto juntos,
 * nunca só cor. Cai sem vermelho: descer não é castigo, é informação.
 */
function Ganho({ ganho }) {
  if (ganho === null) return <span className="ganho ganho--vazio">sem ponto de partida</span>;
  const pontos = Math.round(ganho * 100);
  const direcao = pontos > 0 ? 'sobe' : pontos < 0 ? 'desce' : 'igual';
  const seta = { sobe: '↑', desce: '↓', igual: '=' }[direcao];
  return (
    <span className={`ganho ganho--${direcao}`}>
      <span aria-hidden="true">{seta}</span>
      <span className="visualmente-oculto">
        {direcao === 'sobe' ? 'subiu' : direcao === 'desce' ? 'desceu' : 'não mudou'}
      </span>{' '}
      {Math.abs(pontos)} pts
    </span>
  );
}

/** Um estado por célula, do mais urgente ao menos: travou, investigar, dominada, a confirmar. */
function estadoDa(h) {
  if (h.travou) return { classe: 'travou', icone: 'alerta', texto: 'travou' };
  if (h.recente.divergente) return { classe: 'investigar', icone: 'lupa', texto: 'acertos longe do previsto' };
  if (h.dominada) return { classe: 'dominada', icone: 'certo', texto: 'dominada' };
  if (h.acima_do_limiar) return { classe: 'confirmar', icone: 'pendente', texto: 'a confirmar' };
  return null;
}

const numero = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Rodapé da matriz: tempo até dominar e retenção da turma, por habilidade. Sempre
 * com quantos alunos entraram na conta, porque só quem chegou lá tem um tempo.
 */
function ResumoTurma({ habilidades, turma }) {
  const porId = Object.fromEntries(turma.map((t) => [t.habilidade_id, t]));
  return (
    <tfoot>
      <tr>
        <th scope="row">
          Até dominar
          <span className="matriz__situacao">mediana da turma</span>
        </th>
        {habilidades.map((h) => {
          const { praticaram, chegaram, mediana } = porId[h.habilidade_id].ate_dominio;
          return (
            <td key={h.habilidade_id}>
              {praticaram === 0 ? (
                <span className="resumo-turma__vazio">sem prática</span>
              ) : (
                <>
                  <span className="resumo-turma__valor">
                    {chegaram === 0 ? 'ninguém ainda' : plural(numero(mediana), 'resposta', 'respostas')}
                  </span>
                  <span className="resumo-turma__base">
                    {chegaram} de {praticaram} que praticaram
                  </span>
                </>
              )}
            </td>
          );
        })}
      </tr>
      <tr>
        <th scope="row">
          Retenção
          <span className="matriz__situacao">ao voltar depois de dominar</span>
        </th>
        {habilidades.map((h) => {
          const { alunos, retornos, acertos } = porId[h.habilidade_id].retencao;
          return (
            <td key={h.habilidade_id}>
              {retornos === 0 ? (
                <span className="resumo-turma__vazio">sem voltas ainda</span>
              ) : (
                <>
                  <span className="resumo-turma__valor">
                    {acertos} de {retornos}
                  </span>
                  <span className="resumo-turma__base">
                    voltas certas, {plural(alunos, 'aluno', 'alunos')}
                  </span>
                </>
              )}
            </td>
          );
        })}
      </tr>
    </tfoot>
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

/** Travamento primeiro; a divergência só vira alerta onde não há travamento (seria repetido). */
function alertasDa(aluno) {
  return aluno.dominio.flatMap((h) => {
    if (h.travou) return [{ tipo: 'travou', aluno, habilidade: h }];
    if (h.recente.divergente) return [{ tipo: 'divergente', aluno, habilidade: h }];
    return [];
  });
}

function TextoDoAlerta({ tipo, aluno, habilidade }) {
  if (tipo === 'travou') {
    return (
      <span>
        <strong>{aluno.nome}</strong> travou em <strong>{habilidade.nome}</strong>:{' '}
        {habilidade.erros_seguidos} erros seguidos. O sistema passou a dar questões fáceis com
        dica e material de apoio.
      </span>
    );
  }
  const { acertos, respostas, acerto_esperado } = habilidade.recente;
  return (
    <span>
      <strong>{aluno.nome}</strong> acertou {acertos} de {respostas} em{' '}
      <strong>{habilidade.nome}</strong>, mas o modelo previa cerca de {pct(acerto_esperado)}.
      Vale observar: pode ser chute, distração ou um domínio mal estimado.
    </span>
  );
}

function Atencao({ alunos, aoVer }) {
  const alertas = alunos.flatMap(alertasDa);

  return (
    <section className="atencao" aria-labelledby="titulo-atencao">
      <h2 id="titulo-atencao">Precisa de atenção</h2>
      {alertas.length === 0 ? (
        <p className="atencao__vazio">
          <Icone nome="certo" tamanho={18} /> Ninguém precisa de atenção agora. Os alertas
          aparecem aqui quando um aluno erra duas vezes seguidas a mesma habilidade ou quando os
          acertos dele se afastam muito do que o modelo previa.
        </p>
      ) : (
        <ul className="atencao__lista">
          {alertas.map((alerta) => (
            <li
              key={`${alerta.aluno.id}-${alerta.habilidade.habilidade_id}`}
              className={`atencao__item atencao__item--${alerta.tipo}`}
            >
              <Icone
                nome={alerta.tipo === 'travou' ? 'alerta' : 'lupa'}
                className="atencao__icone"
              />
              <TextoDoAlerta {...alerta} />
              <button
                type="button"
                className="botao botao--leve"
                onClick={() => aoVer(alerta.aluno.id)}
              >
                Ver {alerta.aluno.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Matriz({ alunos, turma, limiar, acertosParaDominio, selecionado, aoSelecionar }) {
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
        <p className="matriz__legenda">
          <span className="legenda-item estado estado--dominada">
            <Icone nome="certo" tamanho={14} /> Dominada: no limiar e {acertosParaDominio} acertos
            seguidos
          </span>
          <span className="legenda-item estado estado--confirmar">
            <Icone nome="pendente" tamanho={14} /> A confirmar: passou do limiar, faltam acertos
            seguidos
          </span>
          <span className="legenda-item estado estado--investigar">
            <Icone nome="lupa" tamanho={14} /> Acertos longe do previsto
          </span>
          <span className="legenda-item">↑↓ Ganho desde o teste rápido</span>
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
                {a.dominio.map((h) => {
                  const estado = estadoDa(h);
                  return (
                    <td key={h.habilidade_id} className={h.travou ? 'matriz__celula--travou' : ''}>
                      <span className="matriz__valor">
                        {pct(h.p_l)}
                        {estado && (
                          <span className={`estado estado--${estado.classe}`}>
                            <Icone nome={estado.icone} tamanho={14} />
                            <span className="visualmente-oculto">{estado.texto}</span>
                          </span>
                        )}
                      </span>
                      <Regua pL={h.p_l} pL0={h.p_l0} limiar={limiar} dominada={h.dominada} />
                      {/* Sem prática o ganho é sempre 0: só poluiria a matriz. */}
                      {h.ganho !== null && h.recente.respostas > 0 && (
                        <span className="matriz__ganho">
                          <Ganho ganho={h.ganho} />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <ResumoTurma habilidades={habilidades} turma={turma} />
        </table>
      </div>
    </section>
  );
}

/** Quando a revisão espaçada da habilidade vence, em respostas de outras habilidades. */
function RevisaoEm({ revisao }) {
  if (revisao.desde === null) return null;
  const faltam = revisao.intervalo - revisao.desde;
  const quando =
    faltam <= 0 ? 'revisão agora' : `revisão em ${plural(faltam, 'resposta', 'respostas')}`;
  return <>, {quando}</>;
}

/**
 * Domínio, ganho e acertos recentes lado a lado. Nenhum deles sozinho diz se a
 * criança está aprendendo: acerto alto com questões fáceis demais não é domínio.
 */
function LadoALado({ aluno, janela, acertosParaDominio }) {
  return (
    <table className="lado-a-lado">
      <thead>
        <tr>
          <th scope="col">Habilidade</th>
          <th scope="col">Domínio</th>
          <th scope="col">Ganho estimado</th>
          <th scope="col">Últimas {janela}</th>
        </tr>
      </thead>
      <tbody>
        {aluno.dominio.map((h) => {
          const { respostas, acertos, acerto_esperado, divergente } = h.recente;
          return (
            <tr key={h.habilidade_id}>
              <th scope="row">
                {h.nome}
                {h.dominada && (
                  <span className="estado estado--dominada">
                    <Icone nome="certo" tamanho={14} /> dominada
                  </span>
                )}
                {!h.dominada && h.acima_do_limiar && (
                  <span className="estado estado--confirmar">
                    <Icone nome="pendente" tamanho={14} /> a confirmar ({h.acertos_seguidos} de{' '}
                    {acertosParaDominio} acertos seguidos)
                  </span>
                )}
                {h.ate_dominio !== null && (
                  <span className="lado-a-lado__extra">
                    dominou em {plural(h.ate_dominio, 'resposta', 'respostas')}
                  </span>
                )}
                <span className="lado-a-lado__extra">
                  nível {h.nivel} de {h.nivel_maximo}
                  {h.consolidada && <RevisaoEm revisao={h.revisao} />}
                </span>
                {h.retencao.retornos > 0 && (
                  <span className="lado-a-lado__extra">
                    ao voltar, acertou {h.retencao.acertos} de {h.retencao.retornos}
                  </span>
                )}
              </th>
              <td className="lado-a-lado__numero">{pct(h.p_l)}</td>
              <td>
                <Ganho ganho={h.ganho} />
              </td>
              <td>
                {respostas === 0 ? (
                  <span className="lado-a-lado__vazio">sem prática</span>
                ) : (
                  <>
                    <span className="lado-a-lado__numero">
                      {acertos} de {respostas}
                    </span>
                    <span className="lado-a-lado__previsto">previsto {pct(acerto_esperado)}</span>
                    {divergente && (
                      <span className="estado estado--investigar">
                        <Icone nome="lupa" tamanho={14} /> longe do previsto
                      </span>
                    )}
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DetalheAluno({ aluno, recomendacao, janela, acertosParaDominio }) {
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
              <p className="recomendacao__enunciado">
                “{enunciadoParaAdulto(recomendacao.questao.enunciado)}”
              </p>
            )}
          </div>
        ) : (
          <p className="detalhe__nota">Calculando a recomendação.</p>
        )}
      </section>

      <section className="detalhe__bloco">
        <h3>Habilidade por habilidade</h3>
        <p className="detalhe__nota">
          O ganho é o que o próprio modelo estima desde o teste rápido. O acerto previsto é o que
          o modelo esperava para essas mesmas respostas.
        </p>
        <div className="detalhe__rolagem">
          <LadoALado aluno={aluno} janela={janela} acertosParaDominio={acertosParaDominio} />
        </div>
      </section>

      <section className="detalhe__bloco">
        <h3>Mapa de habilidades</h3>
        <p className="detalhe__nota">
          Cada habilidade só é praticada quando as de cima estão consolidadas: passaram do
          limiar e chegaram ao nível mais difícil.
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
                  <span className="historico__enunciado">{enunciadoParaAdulto(r.enunciado)}</span>
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
  const precisamAtencao = painel.alunos.filter((a) => alertasDa(a).length > 0).length;
  const { amostra } = painel;
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
              {precisamAtencao === 0 && 'Nenhum precisa de atenção agora'}
              {precisamAtencao === 1 && '1 precisa de atenção agora'}
              {precisamAtencao > 1 && `${precisamAtencao} precisam de atenção agora`}
              {emTeste > 0 && `, e ${emTeste} ainda ${emTeste === 1 ? 'faz' : 'fazem'} o teste rápido`}.
            </p>
            {/* Sempre visível: nenhuma análise esconde quem ficou de fora. */}
            <p className="painel__amostra">
              <strong>
                {amostra.com_dados} de {amostra.total}
              </strong>{' '}
              alunos cadastrados têm dados suficientes para análise (mínimo: {amostra.minimo}{' '}
              respostas de prática, sem contar o teste rápido).
            </p>
          </div>
          <Atencao alunos={painel.alunos} aoVer={setSelecionado} />
          <Matriz
            alunos={painel.alunos}
            turma={painel.turma}
            limiar={painel.limiar_dominio}
            acertosParaDominio={painel.acertos_para_dominio}
            selecionado={selecionado}
            aoSelecionar={setSelecionado}
          />
        </div>

        {aluno && (
          <DetalheAluno
            aluno={aluno}
            recomendacao={recomendacao?.alunoId === aluno.id ? recomendacao : null}
            janela={painel.janela_recente}
            acertosParaDominio={painel.acertos_para_dominio}
          />
        )}
      </main>
    </div>
  );
}
