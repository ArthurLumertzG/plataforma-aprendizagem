import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import Icone from '../components/Icone.jsx';
import Logo from '../components/Logo.jsx';
import MapaHabilidades from '../components/MapaHabilidades.jsx';
import Regua from '../components/Regua.jsx';
import { lerSenhaSalva, lerTurmaSalva, salvarSenha, salvarTurma } from '../lib/sessaoProfessor.js';
import {
  NOME_DA_REGRA,
  corDoAluno,
  enunciadoParaAdulto,
  horario,
  inicial,
  pct,
} from '../lib/textos.js';

const INTERVALO_POLLING_MS = 3000;
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
function Ganho({ ganho, compacto = false }) {
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
      {Math.abs(pontos)}
      {compacto ? <span className="visualmente-oculto"> pontos</span> : ' pts'}
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

function SeloSimulado({ aluno }) {
  if (!aluno.simulado) return null;
  return (
    <span className="selo-simulado" title="Aluno fictício da turma simulada">
      simulado
    </span>
  );
}

/**
 * Controles da demonstração. Popular cria alunos fictícios em uso há semanas,
 * distribuídos pelas turmas (backend/src/simulacao.js): eles passam pelo teste
 * rápido, pelo motor e pelo BKT de verdade, só as respostas são geradas. Limpar
 * volta tudo ao início e pede confirmação aqui mesmo (sem window.confirm).
 */
function ControlesDemonstracao({ senha, simulados, aoMudar }) {
  const [ocupado, setOcupado] = useState(null);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [erro, setErro] = useState(null);

  const acoes = {
    popular: () => api.popularSimulacao(senha),
    remover: () => api.removerSimulacao(senha),
    limpar: () => api.limparDados(senha),
  };

  async function executar(acao) {
    setOcupado(acao);
    setErro(null);
    try {
      await acoes[acao]();
      setConfirmandoLimpeza(false);
      aoMudar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  }

  if (confirmandoLimpeza) {
    return (
      <div className="simulacao simulacao--perigo" role="alertdialog" aria-labelledby="texto-limpar">
        <p id="texto-limpar" className="simulacao__texto">
          <strong>Apagar todas as informações?</strong> Somem todas as respostas e todos os
          alunos cadastrados depois, inclusive os simulados. Ficam só os 5 alunos de exemplo,
          zerados. Não dá para desfazer.
        </p>
        <div className="simulacao__acoes">
          <button
            type="button"
            className="botao botao--compacto botao--perigo"
            onClick={() => executar('limpar')}
            disabled={ocupado !== null}
          >
            {ocupado === 'limpar' ? 'Apagando…' : 'Sim, apagar tudo'}
          </button>
          <button
            type="button"
            className="botao botao--compacto botao--leve"
            onClick={() => setConfirmandoLimpeza(false)}
            disabled={ocupado !== null}
          >
            Cancelar
          </button>
        </div>
        {erro && (
          <p className="mensagem-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="simulacao">
      <p className="simulacao__texto">
        {simulados === 0 ? (
          <>
            <strong>Demonstração:</strong> veja o painel como numa escola em uso, com 24 alunos
            fictícios em 3 turmas. Cada resposta passa pelo teste rápido, pelo motor e pelo BKT
            de verdade.
          </>
        ) : (
          <>
            <strong>{plural(simulados, 'aluno simulado', 'alunos simulados')}</strong>, marcados
            como <span className="selo-simulado">simulado</span>. São fictícios: mostram o
            painel, não são evidência de que a plataforma funciona.
          </>
        )}
      </p>
      <div className="simulacao__acoes">
        <button
          type="button"
          className={`botao botao--compacto ${simulados === 0 ? 'botao--principal' : 'botao--leve'}`}
          onClick={() => executar('popular')}
          disabled={ocupado !== null}
        >
          {ocupado === 'popular'
            ? 'Gerando os alunos…'
            : simulados === 0
              ? 'Popular turmas simuladas'
              : 'Gerar de novo'}
        </button>
        {simulados > 0 && (
          <button
            type="button"
            className="botao botao--compacto botao--leve"
            onClick={() => executar('remover')}
            disabled={ocupado !== null}
          >
            {ocupado === 'remover' ? 'Removendo…' : 'Remover simulados'}
          </button>
        )}
        <button
          type="button"
          className="botao botao--compacto botao--leve botao--texto-perigo"
          onClick={() => setConfirmandoLimpeza(true)}
          disabled={ocupado !== null}
        >
          Limpar informações
        </button>
      </div>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
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

/** Ainda não respondeu nada: os P(L) seriam só o valor padrão do modelo, sem evidência. */
const naoComecou = (aluno) => aluno.diagnostico.respondidos === 0 && aluno.historico.length === 0;

function TextoDoAlerta({ tipo, aluno, habilidade }) {
  if (tipo === 'travou') {
    return (
      <p className="atencao__texto">
        <strong>{aluno.nome}</strong> travou em <strong>{habilidade.nome}</strong>:{' '}
        {habilidade.erros_seguidos} erros seguidos. O sistema passou a dar questões fáceis com
        dica e material de apoio.
      </p>
    );
  }
  const { acertos, respostas, acerto_esperado } = habilidade.recente;
  return (
    <p className="atencao__texto">
      <strong>{aluno.nome}</strong> acertou {acertos} de {respostas} em{' '}
      <strong>{habilidade.nome}</strong>, mas o modelo previa cerca de {pct(acerto_esperado)}.
      Pode ser chute, distração ou um domínio mal estimado.
    </p>
  );
}

/**
 * Números do topo. A amostra ("X de Y com dados") fica aqui, sempre visível: nenhuma
 * análise esconde quem ficou de fora.
 */
function Indicadores({ alunos, amostra, alertas }) {
  const emTeste = alunos.filter((a) => !a.diagnostico.concluido).length;
  const comAlerta = new Set(alertas.map((a) => a.aluno.id)).size;
  const travaram = alertas.filter((a) => a.tipo === 'travou').length;

  return (
    <dl className="numeros">
      <div className="numero">
        <dt>Alunos</dt>
        <dd className="numero__valor">{alunos.length}</dd>
        <dd className="numero__nota">
          {emTeste === 0
            ? 'todos já fizeram o teste rápido'
            : `${emTeste} ainda no teste rápido`}
        </dd>
      </div>
      <div className={`numero ${comAlerta > 0 ? 'numero--atencao' : ''}`}>
        <dt>Precisam de atenção</dt>
        <dd className="numero__valor">{comAlerta}</dd>
        <dd className="numero__nota">
          {comAlerta === 0
            ? 'ninguém travou agora'
            : `${plural(travaram, 'travamento', 'travamentos')}, ${plural(
                alertas.length - travaram,
                'divergência',
                'divergências',
              )}`}
        </dd>
      </div>
      <div className="numero numero--amostra">
        <dt>Com dados para análise</dt>
        <dd className="numero__valor">
          {amostra.com_dados} <span className="numero__de">de {amostra.total}</span>
        </dd>
        <dd className="numero__nota">
          mínimo de {amostra.minimo} respostas de prática (o teste rápido não conta)
        </dd>
      </div>
    </dl>
  );
}

const ALERTAS_VISIVEIS = 6;

function Atencao({ alertas, aoVer }) {
  const [todos, setTodos] = useState(false);
  if (alertas.length === 0) {
    return (
      <p className="atencao__vazio">
        <Icone nome="certo" tamanho={18} />
        <span>
          Ninguém precisa de atenção agora. Os alertas aparecem aqui quando um aluno erra duas
          vezes seguidas a mesma habilidade ou quando os acertos dele se afastam muito do previsto.
        </span>
      </p>
    );
  }

  const visiveis = todos ? alertas : alertas.slice(0, ALERTAS_VISIVEIS);
  return (
    <section className="atencao" aria-labelledby="titulo-atencao">
      <h2 id="titulo-atencao" className="painel__titulo-secao">
        Precisa de atenção <span className="contagem">{alertas.length}</span>
      </h2>
      <ul className="atencao__lista">
        {visiveis.map((alerta) => (
          <li
            key={`${alerta.aluno.id}-${alerta.habilidade.habilidade_id}`}
            className={`atencao__item atencao__item--${alerta.tipo}`}
          >
            <span className="atencao__tipo">
              <Icone nome={alerta.tipo === 'travou' ? 'alerta' : 'lupa'} tamanho={16} />
              {alerta.tipo === 'travou' ? 'Travou' : 'Vale observar'}
            </span>
            <TextoDoAlerta {...alerta} />
            <button
              type="button"
              className="botao botao--texto atencao__ver"
              onClick={() => aoVer(alerta.aluno.id)}
              aria-haspopup="dialog"
            >
              Ver {alerta.aluno.nome} →
            </button>
          </li>
        ))}
      </ul>
      {alertas.length > ALERTAS_VISIVEIS && (
        <button type="button" className="botao botao--texto" onClick={() => setTodos((t) => !t)}>
          {todos ? 'Mostrar menos' : `Mostrar mais ${alertas.length - ALERTAS_VISIVEIS}`}
        </button>
      )}
    </section>
  );
}

/** Legenda curta sempre à vista; as definições completas ficam recolhidas. */
function Legenda({ limiar, acertosParaDominio }) {
  return (
    <div className="legenda">
      <p className="legenda__linha">
        <span className="legenda-item">
          <Regua pL={0.45} pL0={0.2} limiar={limiar} className="regua--amostra" />
          Domínio estimado
        </span>
        <span className="legenda-item estado estado--dominada">
          <Icone nome="certo" tamanho={14} /> dominada
        </span>
        <span className="legenda-item estado estado--confirmar">
          <Icone nome="pendente" tamanho={14} /> a confirmar
        </span>
        <span className="legenda-item estado estado--travou">
          <Icone nome="alerta" tamanho={14} /> travou
        </span>
        <span className="legenda-item estado estado--investigar">
          <Icone nome="lupa" tamanho={14} /> longe do previsto
        </span>
        <span className="legenda-item">↑↓ ganho, em pontos</span>
      </p>
      <details className="legenda__detalhes">
        <summary>Como ler</summary>
        <ul>
          <li>
            A barra é o domínio estimado, P(L). O traço vertical é o limiar de domínio (
            {pct(limiar)}) e a bolinha é o ponto de partida do teste rápido.
          </li>
          <li>
            <strong>Dominada:</strong> passou do limiar e acertou {acertosParaDominio} vezes
            seguidas. <strong>A confirmar:</strong> passou do limiar, mas ainda faltam acertos
            seguidos.
          </li>
          <li>
            <strong>Travou:</strong> 2 erros seguidos na mesma habilidade.{' '}
            <strong>Longe do previsto:</strong> os acertos recentes se afastam muito do que o
            modelo esperava.
          </li>
          <li>
            <strong>Ganho:</strong> quanto o P(L) subiu ou desceu desde o teste rápido, em pontos.
            Só aparece depois de alguma prática.
          </li>
          <li>Clique em um aluno para ver a próxima questão, o mapa e o histórico dele.</li>
        </ul>
      </details>
    </div>
  );
}

function Matriz({ alunos, nomeDaTurma, turma, limiar, acertosParaDominio, selecionado, aoSelecionar }) {
  const habilidades = alunos[0]?.dominio ?? [];

  return (
    <section className="matriz" aria-labelledby="titulo-matriz">
      <div className="matriz__cabeca">
        <h2 id="titulo-matriz" className="painel__titulo-secao">
          Domínio por habilidade
        </h2>
        <Legenda limiar={limiar} acertosParaDominio={acertosParaDominio} />
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
                    aria-haspopup="dialog"
                  >
                    <Avatar aluno={a} />
                    <span className="matriz__identidade">
                      <span className="matriz__nome">
                        {a.nome} <SeloSimulado aluno={a} />
                      </span>
                      {(nomeDaTurma || !a.diagnostico.concluido) && (
                        <span className="matriz__situacao">
                          {[
                            nomeDaTurma?.[a.turma_id],
                            !a.diagnostico.concluido &&
                              `teste rápido ${a.diagnostico.respondidos}/${a.diagnostico.total}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                </th>
                {naoComecou(a) ? (
                  <td colSpan={habilidades.length} className="matriz__sem-dados">
                    Ainda não começou o teste rápido. Sem respostas, não há domínio estimado.
                  </td>
                ) : (
                  a.dominio.map((h) => {
                    const estado = estadoDa(h);
                    return (
                      <td key={h.habilidade_id} className={h.travou ? 'matriz__celula--travou' : ''}>
                        <span className="matriz__topo">
                          <span className="matriz__valor">
                            {pct(h.p_l)}
                            {estado && (
                              <span className={`estado estado--${estado.classe}`}>
                                <Icone nome={estado.icone} tamanho={14} />
                                <span className="visualmente-oculto">{estado.texto}</span>
                              </span>
                            )}
                          </span>
                          {/* Sem prática o ganho é sempre 0: só poluiria a matriz. */}
                          {h.ganho !== null && h.recente.respostas > 0 && (
                            <Ganho ganho={h.ganho} compacto />
                          )}
                        </span>
                        <Regua pL={h.p_l} pL0={h.p_l0} limiar={limiar} dominada={h.dominada} />
                      </td>
                    );
                  })
                )}
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
function LadoALado({ aluno, janela, limiar, acertosParaDominio }) {
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
          const extras = [
            `nível ${h.nivel} de ${h.nivel_maximo}`,
            h.ate_dominio !== null && `dominou em ${plural(h.ate_dominio, 'resposta', 'respostas')}`,
            h.retencao.retornos > 0 &&
              `ao voltar, acertou ${h.retencao.acertos} de ${h.retencao.retornos}`,
          ].filter(Boolean);
          return (
            <tr key={h.habilidade_id} className={h.travou ? 'lado-a-lado__linha--travou' : ''}>
              <th scope="row">
                <span className="lado-a-lado__nome">{h.nome}</span>
                {h.travou && (
                  <span className="estado estado--travou">
                    <Icone nome="alerta" tamanho={14} /> travou
                  </span>
                )}
                {!h.travou && h.dominada && (
                  <span className="estado estado--dominada">
                    <Icone nome="certo" tamanho={14} /> dominada
                  </span>
                )}
                {!h.travou && !h.dominada && h.acima_do_limiar && (
                  <span className="estado estado--confirmar">
                    <Icone nome="pendente" tamanho={14} /> a confirmar ({h.acertos_seguidos} de{' '}
                    {acertosParaDominio} acertos seguidos)
                  </span>
                )}
                <span className="lado-a-lado__extra">
                  {extras.join(' · ')}
                  {h.consolidada && <RevisaoEm revisao={h.revisao} />}
                </span>
              </th>
              <td>
                <span className="lado-a-lado__numero">{pct(h.p_l)}</span>
                <Regua pL={h.p_l} pL0={h.p_l0} limiar={limiar} dominada={h.dominada} />
              </td>
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

function Recomendacao({ aluno, recomendacao }) {
  const explicacao = recomendacao?.explicacao;
  const habilidadeAlvo = aluno.dominio.find((h) => h.habilidade_id === explicacao?.habilidade_id);
  if (!explicacao) return <p className="detalhe__nota">Calculando a recomendação.</p>;
  return (
    <div className="recomendacao">
      <p className="recomendacao__rotulo">Próxima questão recomendada</p>
      <p className="recomendacao__regra">{NOME_DA_REGRA[explicacao.regra] ?? explicacao.regra}</p>
      <p className="recomendacao__item">
        {habilidadeAlvo?.nome ?? explicacao.habilidade_id}, dificuldade {explicacao.dificuldade_alvo}{' '}
        de 3
        {recomendacao.questao?.dica && ', com dica'}
      </p>
      <p className="recomendacao__motivo">{explicacao.motivo}</p>
      {recomendacao.questao && (
        <p className="recomendacao__enunciado">
          “{enunciadoParaAdulto(recomendacao.questao.enunciado)}”
        </p>
      )}
    </div>
  );
}

/** Contagem rápida do aluno, no topo da gaveta. */
function ResumoAluno({ aluno }) {
  const total = aluno.dominio.length;
  const dominadas = aluno.dominio.filter((h) => h.dominada).length;
  const aConfirmar = aluno.dominio.filter((h) => !h.dominada && h.acima_do_limiar).length;
  const travadas = aluno.dominio.filter((h) => h.travou).length;
  return (
    <ul className="resumo-aluno">
      <li>
        <strong>
          {dominadas} de {total}
        </strong>{' '}
        dominadas
      </li>
      <li>
        <strong>{aConfirmar}</strong> a confirmar
      </li>
      <li className={travadas > 0 ? 'resumo-aluno__atencao' : ''}>
        <strong>{travadas}</strong> {travadas === 1 ? 'travada' : 'travadas'}
      </li>
      {!aluno.diagnostico.concluido && (
        <li>
          teste rápido{' '}
          <strong>
            {aluno.diagnostico.respondidos} de {aluno.diagnostico.total}
          </strong>
        </li>
      )}
    </ul>
  );
}

function Historico({ aluno }) {
  if (aluno.historico.length === 0) {
    return <p className="detalhe__nota">{aluno.nome} ainda não respondeu nenhuma questão.</p>;
  }
  return (
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
              {horario(r.criado_em)} · {r.tipo === 'diagnostico' ? 'teste rápido' : 'prática'} ·{' '}
              {nomeHabilidade}
            </span>
            {r.p_l_depois !== null && (
              <span className="historico__variacao">
                {pct(r.p_l_antes)} → {pct(r.p_l_depois)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const ABAS = [
  { id: 'visao', nome: 'Visão geral' },
  { id: 'habilidades', nome: 'Habilidade por habilidade' },
  { id: 'respostas', nome: 'Últimas respostas' },
];

/**
 * Detalhe do aluno numa gaveta lateral (<dialog> modal: foco preso, Esc fecha e o
 * foco volta para quem abriu). A matriz fica com a largura toda, e o detalhe se
 * divide em abas em vez de uma coluna comprida. Continua ao vivo com o polling.
 */
function GavetaAluno({
  aluno,
  nomeDaTurma,
  recomendacao,
  janela,
  limiar,
  acertosParaDominio,
  aoFechar,
}) {
  const ref = useRef(null);
  const [aba, setAba] = useState('visao');

  useEffect(() => {
    const dialogo = ref.current;
    if (aluno && !dialogo.open) dialogo.showModal();
    if (!aluno && dialogo.open) dialogo.close();
  }, [aluno]);

  function mudarAbaPeloTeclado(e) {
    const i = ABAS.findIndex((a) => a.id === aba);
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!passo) return;
    const proxima = ABAS[(i + passo + ABAS.length) % ABAS.length];
    setAba(proxima.id);
    document.getElementById(`aba-${proxima.id}`)?.focus();
  }

  return (
    <dialog
      ref={ref}
      className="gaveta"
      aria-labelledby="titulo-detalhe"
      onClose={aoFechar}
      // Clique no fundo escurecido (fora da gaveta) fecha.
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      {aluno && (
        <div className="gaveta__conteudo">
          <header className="gaveta__topo">
            <Avatar aluno={aluno} />
            <div className="gaveta__identidade">
              <h2 id="titulo-detalhe">
                {aluno.nome} <SeloSimulado aluno={aluno} />
              </h2>
              {nomeDaTurma[aluno.turma_id] && (
                <p className="gaveta__turma">{nomeDaTurma[aluno.turma_id]}</p>
              )}
            </div>
            <button
              type="button"
              className="botao-icone gaveta__fechar"
              onClick={() => ref.current.close()}
              aria-label="Fechar detalhe do aluno"
            >
              <Icone nome="fechar" />
            </button>
          </header>

          <ResumoAluno aluno={aluno} />

          <div className="abas" role="tablist" aria-label="Detalhe do aluno" onKeyDown={mudarAbaPeloTeclado}>
            {ABAS.map((a) => (
              <button
                key={a.id}
                id={`aba-${a.id}`}
                type="button"
                role="tab"
                className="abas__aba"
                aria-selected={aba === a.id}
                aria-controls={`painel-${a.id}`}
                tabIndex={aba === a.id ? 0 : -1}
                onClick={() => setAba(a.id)}
              >
                {a.nome}
                {a.id === 'respostas' && <span className="contagem">{aluno.historico.length}</span>}
              </button>
            ))}
          </div>

          <div
            className="gaveta__corpo"
            role="tabpanel"
            id={`painel-${aba}`}
            aria-labelledby={`aba-${aba}`}
          >
            {aba === 'visao' && (
              <>
                <Recomendacao aluno={aluno} recomendacao={recomendacao} />
                <section className="detalhe__bloco">
                  <h3>Mapa de habilidades</h3>
                  <p className="detalhe__nota">
                    Cada habilidade só é praticada quando as de cima estão consolidadas: passaram
                    do limiar e chegaram ao nível mais difícil.
                  </p>
                  <div className="detalhe__mapa">
                    <MapaHabilidades
                      habilidades={aluno.dominio}
                      recomendada={recomendacao?.explicacao?.habilidade_id}
                    />
                  </div>
                </section>
              </>
            )}
            {aba === 'habilidades' && (
              <section className="detalhe__bloco">
                <p className="detalhe__nota">
                  O ganho é o que o próprio modelo estima desde o teste rápido. O acerto previsto é
                  o que o modelo esperava para essas mesmas respostas.
                </p>
                <div className="detalhe__rolagem">
                  <LadoALado
                    aluno={aluno}
                    janela={janela}
                    limiar={limiar}
                    acertosParaDominio={acertosParaDominio}
                  />
                </div>
              </section>
            )}
            {aba === 'respostas' && <Historico aluno={aluno} />}
          </div>
        </div>
      )}
    </dialog>
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
  // Sobe depois de popular, remover ou limpar: recarrega sem esperar o polling.
  const [versaoDados, setVersaoDados] = useState(0);
  const [turmaId, setTurmaId] = useState(lerTurmaSalva);

  const autenticado = Boolean(painel);

  // Polling simples: o painel reflete as respostas do aluno em poucos segundos.
  useEffect(() => {
    if (!senha) return undefined;
    let ativo = true;
    const carregar = () =>
      api
        .painelProfessor(senha, turmaId)
        .then((dados) => {
          if (!ativo) return;
          setPainel(dados);
          setAtualizadoEm(new Date());
          setErro(null);
        })
        .catch((e) => {
          if (!ativo) return;
          setErro(e.message);
          // A turma salva sumiu do seed: volta para todas.
          if (e.message === 'Turma não encontrada') escolherTurma(null);
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
  }, [senha, versaoDados, turmaId]);

  // O aluno aberto saiu da lista (troca de turma, limpeza): fecha a gaveta.
  useEffect(() => {
    if (painel && selecionado && !painel.alunos.some((a) => a.id === selecionado)) {
      setSelecionado(null);
    }
  }, [painel, selecionado]);

  // A recomendação do aluno aberto acompanha o polling (GET sem efeito colateral).
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

  function escolherTurma(id) {
    salvarTurma(id);
    setTurmaId(id);
  }

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

  const aluno = painel.alunos.find((a) => a.id === selecionado) ?? null;
  const alertas = painel.alunos.flatMap(alertasDa);
  const nomeDaTurma = Object.fromEntries(painel.turmas.map((t) => [t.id, t.nome]));
  const turmaDoRelatorio = painel.turma_selecionada?.id ?? painel.turmas[0]?.id;

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
        <button type="button" className="botao botao--leve botao--compacto" onClick={sair}>
          <Icone nome="sair" tamanho={18} />
          Sair
        </button>
      </header>

      <main className="painel__corpo">
        <div className="painel__cabecalho">
          <div>
            <p className="painel__sobretitulo">Turma</p>
            <h1>{painel.turma_selecionada?.nome ?? 'Todas as turmas'}</h1>
          </div>
          <div className="painel__ferramentas">
            <label className="painel__seletor">
              <span className="visualmente-oculto">Turma</span>
              <select
                className="campo"
                value={turmaId ?? ''}
                onChange={(e) => escolherTurma(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">
                  Todas as turmas ({painel.turmas.reduce((soma, t) => soma + t.alunos, 0)} alunos)
                </option>
                {painel.turmas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({plural(t.alunos, 'aluno', 'alunos')})
                  </option>
                ))}
              </select>
            </label>
            <Link
              className="botao botao--leve botao--compacto"
              to={`/professor/relatorio?turma=${turmaDoRelatorio}`}
            >
              <Icone nome="relatorio" tamanho={18} />
              Relatório {painel.turma_selecionada ? 'da turma' : 'por turma'}
            </Link>
          </div>
        </div>

        <Indicadores alunos={painel.alunos} amostra={painel.amostra} alertas={alertas} />

        <ControlesDemonstracao
          senha={senha}
          simulados={painel.simulados ?? 0}
          aoMudar={() => setVersaoDados((v) => v + 1)}
        />

        <Atencao alertas={alertas} aoVer={setSelecionado} />

        <Matriz
          alunos={painel.alunos}
          nomeDaTurma={painel.turma_selecionada ? null : nomeDaTurma}
          turma={painel.turma}
          limiar={painel.limiar_dominio}
          acertosParaDominio={painel.acertos_para_dominio}
          selecionado={selecionado}
          aoSelecionar={setSelecionado}
        />
      </main>

      <GavetaAluno
        aluno={aluno}
        nomeDaTurma={nomeDaTurma}
        recomendacao={recomendacao?.alunoId === aluno?.id ? recomendacao : null}
        janela={painel.janela_recente}
        limiar={painel.limiar_dominio}
        acertosParaDominio={painel.acertos_para_dominio}
        aoFechar={() => setSelecionado(null)}
      />
    </div>
  );
}
