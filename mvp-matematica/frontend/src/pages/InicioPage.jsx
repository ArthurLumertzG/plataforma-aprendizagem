import { useState } from 'react';
import { Link } from 'react-router-dom';

import Icone from '../components/Icone.jsx';
import Logo from '../components/Logo.jsx';
import Mascote from '../components/Mascote.jsx';
import { QuadroDeDez } from '../components/Questao.jsx';
import Regua from '../components/Regua.jsx';
import { fichasNosQuadros } from '../lib/representacao.js';
import { MARCA, pct } from '../lib/textos.js';

// Parâmetros padrão do BKT na demo (backend/src/bkt.js). A fórmula é repetida
// aqui só para a simulação ilustrativa: a página inicial não fala com a API.
const BKT = { pL0: 0.3, pT: 0.15, pS: 0.1, pG: 0.2 };
const LIMIAR = 0.6;

function atualizarBkt(pL, correto) {
  const { pT, pS, pG } = BKT;
  const posterior = correto
    ? (pL * (1 - pS)) / (pL * (1 - pS) + (1 - pL) * pG)
    : (pL * pS) / (pL * pS + (1 - pL) * (1 - pG));
  return posterior + (1 - posterior) * pT;
}

function explicar(correto, antes, depois) {
  if (correto) {
    return `Acertou: o domínio foi de ${pct(antes)} para ${pct(depois)}. Não vai direto a 100% porque o acerto pode ter sido um chute.`;
  }
  return `Errou: o domínio foi de ${pct(antes)} para ${pct(depois)}. Não zera porque o erro pode ter sido distração.`;
}

function Simulador() {
  const [pL, setPL] = useState(BKT.pL0);
  const [historico, setHistorico] = useState([]);

  function responder(correto) {
    const depois = atualizarBkt(pL, correto);
    setHistorico((h) => [...h, { correto, texto: explicar(correto, pL, depois) }].slice(-3));
    setPL(depois);
  }

  function recomecar() {
    setPL(BKT.pL0);
    setHistorico([]);
  }

  const ultima = historico[historico.length - 1];
  const dominada = pL >= LIMIAR;

  return (
    <figure className="simulador" aria-labelledby="simulador-titulo">
      <div className="simulador__folha">
        <p className="simulador__conta" aria-label="8 mais 4 é igual a quanto?">
          8 + 4 = <span className="conta__resposta">?</span>
        </p>
        <div className="simulador__quadros">
          {fichasNosQuadros({ a: 8, op: '+', b: 4 }).map((casas, i) => (
            <QuadroDeDez key={i} casas={casas} rotulo={`Quadro de dez ${i + 1}`} />
          ))}
        </div>
      </div>

      <div className="simulador__painel">
        <p id="simulador-titulo" className="simulador__titulo">
          Adição com reagrupamento
        </p>
        <div className="simulador__regua">
          <Regua pL={pL} limiar={LIMIAR} dominada={dominada} />
          <span className="simulador__valor">{pct(pL)}</span>
        </div>
        <p className="simulador__estado" aria-live="polite">
          {ultima
            ? ultima.texto
            : 'Começa em 30%. Simule as respostas de uma criança e veja a estimativa de domínio mudar.'}
        </p>
        <div className="simulador__botoes">
          <button type="button" className="botao botao--acerto" onClick={() => responder(true)}>
            Ela acertou
          </button>
          <button type="button" className="botao botao--quase" onClick={() => responder(false)}>
            Ela errou
          </button>
          {historico.length > 0 && (
            <button type="button" className="botao botao--texto" onClick={recomecar}>
              Recomeçar
            </button>
          )}
        </div>
        {dominada && (
          <p className="simulador__dominada">
            <Icone nome="certo" tamanho={18} /> Passou de {pct(LIMIAR)}: o sistema considera a
            habilidade dominada e libera a próxima da trilha.
          </p>
        )}
      </div>
      <figcaption className="simulador__legenda">
        Simulação com os parâmetros padrão da demonstração: começa em 30%, chance de aprender a
        cada questão de 15%, de distração de 10% e de chute de 20%.
      </figcaption>
    </figure>
  );
}

const PASSOS = [
  {
    titulo: 'Teste rápido',
    texto:
      'Oito questões, duas por habilidade, mostram de onde a criança parte. Ninguém começa do zero nem é tratado como quem já sabe tudo.',
  },
  {
    titulo: 'Uma régua por habilidade',
    texto:
      'Cada resposta move a estimativa de domínio aos poucos. Um erro pode ser distração e um acerto pode ser chute, então nada muda de uma vez.',
  },
  {
    titulo: 'O próximo exercício',
    texto:
      'Regras pedagógicas escolhem a questão: a habilidade que já tem base para avançar, um reforço na mais frágil e, depois de dois erros seguidos, uma questão mais fácil com dica e material de apoio.',
  },
  {
    titulo: 'O professor vê o porquê',
    texto:
      'O painel mostra onde cada criança travou e qual regra escolheu cada questão, com os números que levaram a ela.',
  },
];

const CUIDADOS = [
  {
    titulo: 'Quantidades que dá para ver',
    texto:
      'Contas viram fichas em quadros de dez, como o material da sala de aula. Na soma que passa de 10, a segunda cor completa o primeiro quadro antes de ir para o próximo.',
  },
  {
    titulo: 'Leitura em voz alta',
    texto:
      'Um toque lê a pergunta e a dica com a voz do próprio aparelho. Quem ainda lê com dificuldade não fica para trás em matemática por causa disso.',
  },
  {
    titulo: 'Letras do jeito de cada um',
    texto:
      'Tamanho, tipo de letra e espaço entre as letras ajustáveis por criança, e uma tela calma, sem animações nem quadriculado.',
  },
  {
    titulo: 'Sem pressa e sem placar',
    texto:
      'Não há cronômetro, ranking nem vermelho de erro. A resposta certa aparece com calma e a próxima questão espera a criança.',
  },
];

const PRIVACIDADE = [
  'Apelido no lugar do nome. Nada de foto, escola ou data de nascimento.',
  'Cada resposta guarda só o necessário para estimar o domínio: a questão, a resposta dada e se ela acertou.',
  'Todo dado tem finalidade pedagógica. Sem publicidade e sem medir tempo de tela para prender a atenção.',
  'Os ajustes de leitura ficam no aparelho, e as fontes são servidas pelo próprio site.',
];

export default function InicioPage() {
  return (
    <div className="area-adulto inicio">
      <header className="inicio__topo">
        <Logo />
        <nav className="inicio__nav" aria-label="Seções">
          <a href="#como-funciona">Como funciona</a>
          <a href="#para-quem">Para quem</a>
          <a href="#privacidade">Privacidade</a>
        </nav>
        <Link to="/professor" className="botao botao--leve inicio__painel">
          Painel do professor
        </Link>
      </header>

      <main>
        <section className="abertura">
          <div className="abertura__texto">
            <h1>Cada criança no seu próximo passo em matemática</h1>
            <p className="abertura__lide">
              {MARCA} é uma plataforma para crianças com dificuldade em matemática, como a
              discalculia. Ela estima o que cada criança já domina e escolhe o exercício seguinte
              como faria uma professora atenta. Quem ensina vê onde a criança travou e por quê.
            </p>
            <div className="abertura__acoes">
              <Link to="/aluno" className="botao botao--principal botao--grande">
                Experimentar como aluno
              </Link>
              <Link to="/professor" className="botao botao--leve botao--grande">
                Abrir o painel do professor
              </Link>
            </div>
          </div>
          <Simulador />
        </section>

        <section id="como-funciona" className="secao">
          <h2 className="secao__titulo">Como a personalização funciona</h2>
          <ol className="passos">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="passo">
                <span className="passo__numero" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="para-quem" className="secao secao--cuidados">
          <div className="cuidados__intro">
            <h2 className="secao__titulo">Feito para quem trava em matemática</h2>
            <p>
              Crianças com dificuldade de aprendizagem precisam de mais tempo, de mais concreto e de
              menos ruído na tela. A área da criança foi desenhada a partir disso.
            </p>
            <Mascote tamanho={88} expressao="feliz" className="cuidados__mascote" />
          </div>
          <ul className="cuidados">
            {CUIDADOS.map((c) => (
              <li key={c.titulo} className="cuidado">
                <h3>{c.titulo}</h3>
                <p>{c.texto}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="privacidade" className="secao secao--privacidade">
          <h2 className="secao__titulo">Privacidade desde o desenho</h2>
          <p className="secao__lide">
            Dados de crianças têm proteção especial na LGPD (art. 14) e no ECA Digital (Lei 15.211). A plataforma foi pensada para coletar o mínimo.
          </p>
          <ul className="privacidade">
            {PRIVACIDADE.map((item) => (
              <li key={item}>
                <Icone nome="certo" tamanho={20} className="privacidade__icone" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="secao secao--honestidade">
          <h2 className="secao__titulo">O que ainda não sabemos</h2>
          <p>
            A pesquisa sobre plataformas adaptativas para crianças com dificuldade de aprendizagem
            é promissora, mas a evidência ainda é modesta. Este é um protótipo acadêmico: o piloto
            vai comparar, com pré e pós-teste, as escolhas do sistema com as de um professor, e as
            regras e limiares atuais ainda passam por revisão pedagógica.
          </p>
        </section>
      </main>

      <footer className="inicio__rodape">
        <Logo />
        <p>
          Trabalho de graduação em Engenharia de Software e Ciência da Computação, com foco em
          empreendedorismo social. Demonstração com alunos fictícios.
        </p>
      </footer>
    </div>
  );
}
