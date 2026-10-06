import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import AjustesLeitura from '../components/AjustesLeitura.jsx';
import BotaoOuvir from '../components/BotaoOuvir.jsx';
import Icone from '../components/Icone.jsx';
import Logo from '../components/Logo.jsx';
import Mascote from '../components/Mascote.jsx';
import { Apoio, Enunciado } from '../components/Questao.jsx';
import { falar } from '../lib/fala.js';
import { atributosDasPreferencias, usePreferencias } from '../lib/preferencias.js';
import { interpretarEnunciado } from '../lib/representacao.js';
import { NOME_DA_REGRA, corDoAluno, inicial, pct } from '../lib/textos.js';

function Avatar({ aluno, tamanho = 'normal' }) {
  return (
    <span className={`avatar avatar--${corDoAluno(aluno.id)} avatar--${tamanho}`} aria-hidden="true">
      {inicial(aluno.nome)}
    </span>
  );
}

// ---------- escolha do perfil ----------

function EscolhaDePerfil({ alunos, aoEscolher, aoCadastrar }) {
  const [novoNome, setNovoNome] = useState('');

  async function enviar(evento) {
    evento.preventDefault();
    await aoCadastrar(novoNome.trim());
    setNovoNome('');
  }

  return (
    <main className="perfis">
      <Mascote tamanho={96} expressao="feliz" className="perfis__mascote" />
      <h1 className="perfis__titulo">Quem vai praticar hoje?</h1>

      <ul className="perfis__lista">
        {alunos.map((a) => (
          <li key={a.id}>
            <button type="button" className="perfil" onClick={() => aoEscolher(a)}>
              <Avatar aluno={a} tamanho="grande" />
              <span className="perfil__nome">{a.nome}</span>
            </button>
          </li>
        ))}
      </ul>

      <form className="novo-perfil" onSubmit={enviar}>
        <label htmlFor="novo-apelido" className="novo-perfil__rotulo">
          É a primeira vez? Escreva um apelido.
        </label>
        <div className="novo-perfil__linha">
          <input
            id="novo-apelido"
            className="campo"
            autoComplete="off"
            maxLength={30}
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
          <button className="botao botao--principal" type="submit" disabled={!novoNome.trim()}>
            Começar
          </button>
        </div>
        <p className="novo-perfil__aviso">
          Esta é uma demonstração: use só apelidos inventados, nunca o nome real de uma criança.
        </p>
      </form>

      <Link to="/professor" className="perfis__adulto">
        Sou professor ou professora
      </Link>
    </main>
  );
}

// ---------- progresso do teste rápido ----------

function ProgressoDiagnostico({ respondidos, total }) {
  return (
    <div className="progresso-teste">
      <span className="progresso-teste__rotulo">
        Teste rápido: questão {Math.min(respondidos + 1, total)} de {total}
      </span>
      <ol className="progresso-teste__fichas" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={`progresso-teste__ficha ${
              i < respondidos ? 'progresso-teste__ficha--feita' : ''
            } ${i === respondidos ? 'progresso-teste__ficha--atual' : ''}`}
          />
        ))}
      </ol>
    </div>
  );
}

// ---------- bastidores (para a apresentação, não para a criança) ----------

function Bastidores({ explicacao, dominio }) {
  const habilidade = dominio.find((h) => h.habilidade_id === explicacao.habilidade_id);
  return (
    <details className="bastidores">
      <summary>Bastidores: por que esta questão?</summary>
      <div className="bastidores__corpo">
        <dl className="bastidores__fatos">
          <div>
            <dt>Regra</dt>
            <dd>{NOME_DA_REGRA[explicacao.regra] ?? explicacao.regra}</dd>
          </div>
          <div>
            <dt>Habilidade</dt>
            <dd>{habilidade?.nome ?? explicacao.habilidade_id}</dd>
          </div>
          {explicacao.p_l !== null && (
            <div>
              <dt>Domínio estimado</dt>
              <dd>{pct(explicacao.p_l)}</dd>
            </div>
          )}
          <div>
            <dt>Dificuldade</dt>
            <dd>{explicacao.dificuldade_alvo} de 3</dd>
          </div>
        </dl>
        <p className="bastidores__motivo">{explicacao.motivo}</p>
        <ul className="bastidores__dominio">
          {dominio.map((h) => (
            <li key={h.habilidade_id}>
              <span>{h.nome}</span>
              <span className="bastidores__barra" aria-hidden="true">
                <span style={{ width: pct(h.p_l) }} />
              </span>
              <span className="bastidores__valor">
                {pct(h.p_l)}
                {h.dominada && <Icone nome="certo" tamanho={16} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

// ---------- feedback depois de responder ----------

function Retorno({ feedback, terminouDiagnostico, aoContinuar, refBotao }) {
  let expressao = 'neutra';
  let mensagem;
  if (feedback.tipo === 'diagnostico') {
    mensagem = terminouDiagnostico
      ? 'Terminamos o teste rápido! Agora as questões vão ser escolhidas para você.'
      : 'Anotado! Vamos para a próxima.';
    expressao = terminouDiagnostico ? 'feliz' : 'neutra';
  } else if (feedback.correto) {
    expressao = 'feliz';
    mensagem = 'Isso! Você acertou.';
  } else {
    expressao = 'pensando';
    mensagem = (
      <>
        Quase! A resposta era <strong className="retorno__numero">{feedback.resposta_correta}</strong>.
      </>
    );
  }

  const tom =
    feedback.tipo === 'diagnostico' ? 'neutro' : feedback.correto ? 'acerto' : 'quase';

  return (
    <div className={`retorno retorno--${tom}`}>
      <Mascote tamanho={64} expressao={expressao} className="retorno__mascote" />
      <p className="retorno__mensagem">{mensagem}</p>
      <button ref={refBotao} type="button" className="botao botao--principal botao--grande" onClick={aoContinuar}>
        Próxima questão
      </button>
    </div>
  );
}

// ---------- página ----------

export default function AlunoPage() {
  const [alunos, setAlunos] = useState([]);
  const [aluno, setAluno] = useState(null);
  const [questao, setQuestao] = useState(null);
  const [explicacao, setExplicacao] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null); // { respondidos, total }
  const [feedback, setFeedback] = useState(null); // resultado da última resposta
  const [dominio, setDominio] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);
  const [preferencias, alterarPreferencias] = usePreferencias(aluno?.id);
  const refProxima = useRef(null);

  const representacao = useMemo(
    () => (questao ? interpretarEnunciado(questao.enunciado) : null),
    [questao],
  );
  // A dica (e o material de apoio) só vem quando o motor acionou o scaffolding.
  const emApoio = Boolean(questao?.dica);

  useEffect(() => {
    api.listarAlunos().then(setAlunos).catch((e) => setErro(e.message));
  }, []);

  // Leitura automática de cada questão nova, se a criança escolheu isso.
  useEffect(() => {
    if (questao && preferencias.lerSozinho) {
      falar(questao.dica ? `${questao.enunciado}. Dica: ${questao.dica}` : questao.enunciado);
    }
    // Só reage à troca de questão, não à mudança do ajuste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questao?.id]);

  useEffect(() => {
    if (feedback) refProxima.current?.focus();
  }, [feedback]);

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
    setQuestao(null);
    setFeedback(null);
    await atualizarTela(a.id);
  }

  async function cadastrar(nome) {
    try {
      const criado = await api.criarAluno(nome);
      setAlunos((lista) => [...lista, criado]);
      await escolherAluno(criado);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function responder(alternativa) {
    if (feedback || enviando) return; // já respondeu, está esperando "Próxima"
    setEnviando(true);
    try {
      const resultado = await api.responder(aluno.id, questao.id, alternativa);
      setFeedback({ ...resultado, escolhida: alternativa });
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function proxima() {
    setFeedback(null);
    await atualizarTela(aluno.id);
  }

  function trocarAluno() {
    setAluno(null);
    setQuestao(null);
    setFeedback(null);
  }

  const atributos = atributosDasPreferencias(preferencias);

  if (erro) {
    return (
      <div className="area-crianca" {...atributos}>
        <main className="falha">
          <Mascote tamanho={80} expressao="pensando" />
          <h1>Não deu para falar com o servidor</h1>
          <p>
            {erro}. Confira se a API está rodando
            {import.meta.env.VITE_API_URL ? ` em ${import.meta.env.VITE_API_URL}` : ' (npm run dev na raiz)'}{' '}
            e tente de novo.
          </p>
          <button
            type="button"
            className="botao botao--principal"
            onClick={() => {
              setErro(null);
              if (aluno) atualizarTela(aluno.id);
              else api.listarAlunos().then(setAlunos).catch((e) => setErro(e.message));
            }}
          >
            Tentar de novo
          </button>
        </main>
      </div>
    );
  }

  if (!aluno) {
    return (
      <div className="area-crianca" {...atributos}>
        <header className="topo-crianca topo-crianca--perfis">
          <Logo />
        </header>
        <EscolhaDePerfil alunos={alunos} aoEscolher={escolherAluno} aoCadastrar={cadastrar} />
      </div>
    );
  }

  const emDiagnostico = explicacao?.regra === 'diagnostico';
  const terminouDiagnostico = feedback?.tipo === 'diagnostico' && feedback.diagnostico.concluido;

  return (
    <div className="area-crianca" {...atributos}>
      <header className="topo-crianca">
        <span className="topo-crianca__ola">
          <Avatar aluno={aluno} />
          <span>
            Olá, <strong>{aluno.nome}</strong>
          </span>
        </span>
        <span className="topo-crianca__acoes">
          <button type="button" className="botao botao--leve" onClick={() => setAjustesAbertos(true)}>
            <Icone nome="ajustes" />
            <span>Ajustes</span>
          </button>
          <button type="button" className="botao botao--leve" onClick={trocarAluno}>
            <Icone nome="trocar" />
            <span>Trocar</span>
          </button>
        </span>
      </header>

      <main className="pratica">
        {emDiagnostico && diagnostico && (
          <ProgressoDiagnostico respondidos={diagnostico.respondidos} total={diagnostico.total} />
        )}

        {!questao && carregando && (
          <div className="folha folha--carregando" aria-busy="true">
            <Mascote tamanho={64} expressao="pensando" />
            <p>Preparando a questão</p>
          </div>
        )}

        {questao && representacao && (
          <section
            className={`folha ${carregando ? 'folha--atualizando' : ''}`}
            aria-labelledby="questao-atual"
            key={questao.id}
          >
            <h2 id="questao-atual" className="visualmente-oculto">
              Questão
            </h2>
            <div className="folha__ouvir">
              <BotaoOuvir texto={questao.enunciado} />
            </div>

            <Enunciado representacao={representacao} idQuestao={questao.id} />

            {/* Continua visível depois da resposta: é quando o material explica o erro. */}
            {emApoio && (
              <aside className="dica" aria-label="Dica">
                <Icone nome="lampada" className="dica__icone" />
                <div className="dica__corpo">
                  <p className="dica__texto">{questao.dica}</p>
                  <Apoio apoio={representacao.apoio} />
                </div>
                <BotaoOuvir texto={questao.dica} rotulo="Ouvir a dica" className="dica__ouvir" />
              </aside>
            )}

            <div
              className="alternativas"
              role="group"
              aria-label="Escolha a resposta"
              style={{ '--colunas': Math.min(4, questao.alternativas.length) }}
            >
              {questao.alternativas.map((alt) => {
                let estado = '';
                if (feedback?.tipo === 'diagnostico') {
                  // No teste rápido não mostramos certo/errado: só o que foi marcado.
                  estado = alt === feedback.escolhida ? 'marcada' : 'apagada';
                } else if (feedback) {
                  if (alt === feedback.resposta_correta) estado = 'certa';
                  else if (alt === feedback.escolhida) estado = 'quase';
                  else estado = 'apagada';
                }
                return (
                  <button
                    key={alt}
                    type="button"
                    className={`alternativa ${/^\d+$/.test(alt) ? '' : 'alternativa--texto'} ${
                      estado ? `alternativa--${estado}` : ''
                    }`}
                    onClick={() => responder(alt)}
                    disabled={Boolean(feedback) || enviando || carregando}
                  >
                    {alt}
                    {estado === 'certa' && <Icone nome="certo" tamanho={28} className="alternativa__marca" />}
                  </button>
                );
              })}
            </div>

            <div aria-live="polite">
              {feedback && (
                <Retorno
                  feedback={feedback}
                  terminouDiagnostico={terminouDiagnostico}
                  aoContinuar={proxima}
                  refBotao={refProxima}
                />
              )}
            </div>
          </section>
        )}

        {explicacao && <Bastidores explicacao={explicacao} dominio={dominio} />}
      </main>

      <AjustesLeitura
        aberto={ajustesAbertos}
        aoFechar={() => setAjustesAbertos(false)}
        preferencias={preferencias}
        alterar={alterarPreferencias}
        nomeAluno={aluno.nome}
      />
    </div>
  );
}
