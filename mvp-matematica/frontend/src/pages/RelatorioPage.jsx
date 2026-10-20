import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { api } from '../api.js';
import Icone from '../components/Icone.jsx';
import Logo from '../components/Logo.jsx';
import Regua from '../components/Regua.jsx';
import { lerSenhaSalva, salvarTurma } from '../lib/sessaoProfessor.js';
import { pct } from '../lib/textos.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const numero = (v, casas = 1) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
const pctOuTraco = (v) => (v === null ? '—' : pct(v));
const pontos = (v) => {
  if (v === null) return '—';
  const p = Math.round(v * 100);
  return `${p > 0 ? '+' : ''}${p} pts`;
};

/** "2026-10-05 14:03:12" (UTC) → "05/10". */
function dia(criadoEm) {
  const data = new Date(`${criadoEm.replace(' ', 'T')}Z`);
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const SITUACAO = {
  travou: { texto: 'Travou', classe: 'travou', icone: 'alerta' },
  investigar: { texto: 'Acertos longe do previsto', classe: 'investigar', icone: 'lupa' },
  em_dia: { texto: 'Em dia', classe: 'dominada', icone: 'certo' },
  teste_rapido: { texto: 'No teste rápido', classe: 'confirmar', icone: 'pendente' },
  sem_respostas: { texto: 'Ainda não começou', classe: 'vazio', icone: null },
};

function Situacao({ situacao }) {
  const s = SITUACAO[situacao];
  return (
    <span className={`estado estado--${s.classe}`}>
      {s.icone && <Icone nome={s.icone} tamanho={14} />} {s.texto}
    </span>
  );
}

function Indicador({ titulo, valor, detalhe }) {
  return (
    <div className="indicador">
      <span className="indicador__titulo">{titulo}</span>
      <span className="indicador__valor">{valor}</span>
      <span className="indicador__detalhe">{detalhe}</span>
    </div>
  );
}

function Indicadores({ ind, totalHabilidades, minimo }) {
  return (
    <div className="indicadores">
      <Indicador
        titulo="Alunos"
        valor={ind.alunos}
        detalhe={`${ind.com_dados} com dados suficientes (${minimo}+ respostas), ${ind.em_teste_rapido} no teste rápido, ${ind.sem_respostas} sem respostas`}
      />
      <Indicador
        titulo="Habilidades dominadas"
        valor={ind.dominadas_media === null ? '—' : `${numero(ind.dominadas_media)} de ${totalHabilidades}`}
        detalhe={`média por aluno, entre os ${ind.com_diagnostico} que terminaram o teste rápido`}
      />
      <Indicador
        titulo="Acerto na prática"
        valor={pctOuTraco(ind.taxa_acerto)}
        detalhe={`em ${plural(ind.respostas_pratica, 'resposta', 'respostas')}, sem o teste rápido`}
      />
      <Indicador
        titulo="Ganho estimado"
        valor={pontos(ind.ganho_medio)}
        detalhe={`média de ${plural(ind.com_ganho, 'aluno', 'alunos')}, desde o teste rápido`}
      />
      <Indicador
        titulo="Precisam de atenção"
        valor={ind.precisam_atencao}
        detalhe="travaram ou acertam longe do previsto"
      />
    </div>
  );
}

function Comparativo({ linhas, turmaAtual, totalHabilidades, aoEscolher }) {
  return (
    <div className="relatorio__rolagem">
      <table className="relatorio__tabela">
        <thead>
          <tr>
            <th scope="col">Turma</th>
            <th scope="col">Alunos</th>
            <th scope="col">Com dados</th>
            <th scope="col">Dominadas por aluno</th>
            <th scope="col">Acerto na prática</th>
            <th scope="col">Ganho estimado</th>
            <th scope="col">Precisam de atenção</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.turma.id} className={l.turma.id === turmaAtual ? 'relatorio__linha--atual' : ''}>
              <th scope="row">
                <button type="button" className="botao--texto" onClick={() => aoEscolher(l.turma.id)}>
                  {l.turma.nome}
                </button>
              </th>
              <td>{l.alunos}</td>
              <td>
                {l.com_dados} de {l.alunos}
              </td>
              <td>
                {l.dominadas_media === null
                  ? '—'
                  : `${numero(l.dominadas_media)} de ${totalHabilidades}`}
              </td>
              <td>{pctOuTraco(l.taxa_acerto)}</td>
              <td>{pontos(l.ganho_medio)}</td>
              <td>{l.precisam_atencao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PorHabilidade({ habilidades, limiar }) {
  return (
    <div className="relatorio__rolagem">
      <table className="relatorio__tabela">
        <thead>
          <tr>
            <th scope="col">Habilidade</th>
            <th scope="col">Dominaram</th>
            <th scope="col">Domínio médio</th>
            <th scope="col">Ganho estimado</th>
            <th scope="col">Até dominar</th>
            <th scope="col">Travados agora</th>
          </tr>
        </thead>
        <tbody>
          {habilidades.map((h) => (
            <tr key={h.habilidade_id}>
              <th scope="row">{h.nome}</th>
              <td>
                <span className="relatorio__numero">
                  {h.dominaram} de {h.alunos}
                </span>
                <span className="barra" aria-hidden="true">
                  <span
                    className="barra__preenchida"
                    style={{ width: pct(h.alunos ? h.dominaram / h.alunos : 0) }}
                  />
                </span>
              </td>
              <td>
                {h.p_l_medio === null ? (
                  '—'
                ) : (
                  <>
                    <span className="relatorio__numero">{pct(h.p_l_medio)}</span>
                    <Regua pL={h.p_l_medio} limiar={limiar} />
                    <span className="relatorio__base">{plural(h.com_ponto_de_partida, 'aluno', 'alunos')}</span>
                  </>
                )}
              </td>
              <td>
                {pontos(h.ganho_medio)}
                {h.com_ganho > 0 && (
                  <span className="relatorio__base">{plural(h.com_ganho, 'aluno', 'alunos')}</span>
                )}
              </td>
              <td>
                {h.ate_dominio.praticaram === 0 ? (
                  <span className="relatorio__vazio">sem prática</span>
                ) : (
                  <>
                    {h.ate_dominio.chegaram === 0
                      ? 'ninguém ainda'
                      : plural(numero(h.ate_dominio.mediana), 'resposta', 'respostas')}
                    <span className="relatorio__base">
                      {h.ate_dominio.chegaram} de {h.ate_dominio.praticaram} que praticaram
                    </span>
                  </>
                )}
              </td>
              <td>
                {h.travados.length === 0 ? (
                  <span className="relatorio__vazio">ninguém</span>
                ) : (
                  <span className="estado estado--travou">
                    <Icone nome="alerta" tamanho={14} /> {h.travados.map((a) => a.nome).join(', ')}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Grupo({ titulo, alunos, nota }) {
  if (alunos.length === 0) return null;
  return (
    <li className="grupo">
      <h3 className="grupo__titulo">
        {titulo} <span className="grupo__contagem">{alunos.length}</span>
      </h3>
      {nota && <p className="grupo__nota">{nota}</p>}
      <p className="grupo__alunos">
        {alunos.map((a, i) => (
          <span key={a.id} className={a.situacao === 'travou' ? 'grupo__aluno--travou' : ''}>
            {a.nome}
            {a.situacao === 'travou' && ' ⚠'}
            {i < alunos.length - 1 && ', '}
          </span>
        ))}
      </p>
    </li>
  );
}

function Grupos({ grupos }) {
  return (
    <ul className="grupos">
      {grupos.por_habilidade.map((g) => (
        <Grupo key={g.habilidade_id} titulo={g.nome} alunos={g.alunos} />
      ))}
      <Grupo titulo="Trilha completa" alunos={grupos.trilha_completa} nota="Só revisões e reforço." />
      <Grupo titulo="No teste rápido" alunos={grupos.teste_rapido} nota="Ainda sem ponto de partida." />
      <Grupo titulo="Ainda não começou" alunos={grupos.sem_respostas} />
    </ul>
  );
}

function Alunos({ alunos }) {
  return (
    <div className="relatorio__rolagem">
      <table className="relatorio__tabela">
        <thead>
          <tr>
            <th scope="col">Aluno</th>
            <th scope="col">Situação</th>
            <th scope="col">Trabalhando em</th>
            <th scope="col">Dominadas</th>
            <th scope="col">Acerto na prática</th>
            <th scope="col">Ganho estimado</th>
            <th scope="col">Última resposta</th>
          </tr>
        </thead>
        <tbody>
          {alunos.map((a) => (
            <tr key={a.id}>
              <th scope="row">
                {a.nome}{' '}
                {a.simulado && <span className="selo-simulado">simulado</span>}
              </th>
              <td>
                <Situacao situacao={a.situacao} />
                {a.travou_em.length > 0 && (
                  <span className="relatorio__base">em {a.travou_em.map((h) => h.nome).join(', ')}</span>
                )}
                {a.investigar_em.length > 0 && (
                  <span className="relatorio__base">em {a.investigar_em.map((h) => h.nome).join(', ')}</span>
                )}
              </td>
              <td>{a.trabalhando_em?.nome ?? '—'}</td>
              <td>
                {a.diagnostico.concluido ? `${a.dominadas} de ${a.total_habilidades}` : '—'}
              </td>
              <td>
                {pctOuTraco(a.taxa_acerto)}
                {a.respostas_pratica > 0 && (
                  <span className="relatorio__base">{plural(a.respostas_pratica, 'resposta', 'respostas')}</span>
                )}
              </td>
              <td>{pontos(a.ganho_medio)}</td>
              <td>{a.ultima_resposta ? dia(a.ultima_resposta) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RelatorioPage() {
  const [params, setParams] = useSearchParams();
  const turmaId = Number(params.get('turma')) || null;
  const [senha] = useState(lerSenhaSalva);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!senha) return undefined;
    let ativo = true;
    setErro(null);
    api
      .relatorio(senha, turmaId ?? '')
      .then((r) => ativo && setDados(r))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [senha, turmaId]);

  function escolher(id) {
    salvarTurma(id);
    setParams({ turma: String(id) });
  }

  if (!senha || erro === 'Senha incorreta') {
    return (
      <div className="area-adulto entrada">
        <main className="entrada__cartao">
          <Logo />
          <h1>Relatório da turma</h1>
          <p className="entrada__texto">Entre no painel do professor para ver o relatório.</p>
          <Link className="botao botao--principal botao--largo" to="/professor">
            Ir para o painel
          </Link>
        </main>
      </div>
    );
  }

  const r = dados?.relatorio;
  const totalHabilidades = r?.habilidades.length ?? 0;
  const periodo = r?.indicadores.periodo;

  return (
    <div className="area-adulto painel relatorio">
      <header className="painel__topo">
        <Logo />
        <span className="painel__secao">Relatório de desempenho</span>
        <span className="painel__status">
          {dados && `Gerado às ${new Date(dados.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
        <button type="button" className="botao botao--leve so-tela" onClick={() => window.print()}>
          <Icone nome="imprimir" />
          Imprimir
        </button>
        <Link className="botao botao--leve so-tela" to="/professor">
          <Icone nome="voltar" />
          Painel
        </Link>
      </header>

      <main className="relatorio__corpo">
        {erro && (
          <p className="mensagem-erro" role="alert">
            {erro}
          </p>
        )}
        {!r ? (
          !erro && <p className="relatorio__vazio">Montando o relatório…</p>
        ) : (
          <>
            <nav className="relatorio__turmas so-tela" aria-label="Turmas">
              {dados.turmas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`aba ${t.id === r.turma.id ? 'aba--ativa' : ''}`}
                  aria-pressed={t.id === r.turma.id}
                  onClick={() => escolher(t.id)}
                >
                  {t.nome} <span className="aba__contagem">{t.alunos}</span>
                </button>
              ))}
            </nav>

            <section className="relatorio__bloco">
              <h1>{r.turma.nome}</h1>
              <p className="relatorio__sub">
                {periodo
                  ? `Respostas de ${dia(periodo.de)} a ${dia(periodo.ate)}.`
                  : 'Nenhuma resposta ainda.'}{' '}
                Todos os {r.indicadores.alunos} alunos cadastrados entram na contagem, inclusive
                quem ainda não tem dados.
              </p>
              <Indicadores ind={r.indicadores} totalHabilidades={totalHabilidades} minimo={r.minimo_respostas} />
            </section>

            <section className="relatorio__bloco">
              <h2>Comparativo entre turmas</h2>
              <Comparativo
                linhas={dados.comparativo}
                turmaAtual={r.turma.id}
                totalHabilidades={totalHabilidades}
                aoEscolher={escolher}
              />
              <p className="relatorio__nota">
                Turmas de anos diferentes começam em pontos diferentes da trilha: compare o
                ganho e quem precisa de atenção, mais do que o total de habilidades dominadas.
              </p>
            </section>

            <section className="relatorio__bloco">
              <h2>Habilidade por habilidade</h2>
              <PorHabilidade habilidades={r.habilidades} limiar={dados.limiar_dominio} />
              <p className="relatorio__nota">
                Dominada: P(L) no limiar de {pct(dados.limiar_dominio)} e{' '}
                {dados.acertos_para_dominio} acertos seguidos. O domínio médio só conta quem fez o
                teste rápido; o tempo até dominar é a mediana de quem chegou lá, sempre com quantos
                praticaram.
              </p>
            </section>

            <section className="relatorio__bloco">
              <h2>Grupos de trabalho</h2>
              <p className="relatorio__sub">
                Alunos agrupados pela habilidade em que estão agora: quem pode ser atendido junto.
              </p>
              <Grupos grupos={r.grupos} />
            </section>

            <section className="relatorio__bloco">
              <h2>Aluno por aluno</h2>
              <Alunos alunos={r.alunos} />
            </section>

            <footer className="relatorio__limites">
              <h2>Como ler este relatório</h2>
              <ul>
                <li>
                  Domínio e ganho são estimativas do próprio modelo (BKT, parâmetros{' '}
                  {dados.versao_parametros}), não uma prova. O ganho de verdade se mede com pré e
                  pós-teste no piloto.
                </li>
                <li>
                  O motor escolhe as questões, então a taxa de acerto já vem moldada por ele: uma
                  turma com mais questões fáceis de apoio acerta mais.
                </li>
                {dados.simulados > 0 && (
                  <li>
                    {plural(dados.simulados, 'aluno é simulado', 'alunos são simulados')} (fictícios,
                    para demonstração). Os números deles não valem como evidência.
                  </li>
                )}
              </ul>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
