import { pct } from '../lib/textos.js';
import Icone from './Icone.jsx';

// Grafo de pré-requisitos de um aluno, de cima (base) para baixo. Cada nó mostra
// o P(L) da habilidade, e a recomendada agora ganha contorno: é o "porquê" do
// motor desenhado no próprio mapa.

const LARGURA = 168;
const ALTURA = 78;
const VAO_X = 16;
const VAO_Y = 36;

/** Camada = maior distância até uma habilidade sem pré-requisitos. */
function camadas(habilidades) {
  const porId = Object.fromEntries(habilidades.map((h) => [h.habilidade_id, h]));
  const memo = {};
  const profundidade = (id) => {
    if (memo[id] !== undefined) return memo[id];
    const pre = porId[id]?.pre_requisitos ?? [];
    memo[id] = pre.length === 0 ? 0 : 1 + Math.max(...pre.map(profundidade));
    return memo[id];
  };
  const linhas = [];
  habilidades.forEach((h) => {
    const p = profundidade(h.habilidade_id);
    (linhas[p] ??= []).push(h);
  });
  return linhas;
}

export default function MapaHabilidades({ habilidades, recomendada }) {
  const linhas = camadas(habilidades);
  const maxPorLinha = Math.max(...linhas.map((l) => l.length));
  const largura = maxPorLinha * LARGURA + (maxPorLinha - 1) * VAO_X;
  const altura = linhas.length * ALTURA + (linhas.length - 1) * VAO_Y;

  const posicao = {};
  linhas.forEach((linha, y) => {
    const larguraLinha = linha.length * LARGURA + (linha.length - 1) * VAO_X;
    const inicio = (largura - larguraLinha) / 2;
    linha.forEach((h, x) => {
      posicao[h.habilidade_id] = { x: inicio + x * (LARGURA + VAO_X), y: y * (ALTURA + VAO_Y) };
    });
  });

  const arestas = habilidades.flatMap((h) =>
    h.pre_requisitos
      .filter((pre) => posicao[pre])
      .map((pre) => {
        const de = posicao[pre];
        const para = posicao[h.habilidade_id];
        const x1 = de.x + LARGURA / 2;
        const y1 = de.y + ALTURA;
        const x2 = para.x + LARGURA / 2;
        const y2 = para.y;
        const meio = (y1 + y2) / 2;
        return { id: `${pre}-${h.habilidade_id}`, d: `M${x1} ${y1} C${x1} ${meio}, ${x2} ${meio}, ${x2} ${y2}` };
      }),
  );

  return (
    <div className="mapa" style={{ width: largura, height: altura }}>
      <svg className="mapa__arestas" width={largura} height={altura} aria-hidden="true">
        {arestas.map((a) => (
          <path key={a.id} d={a.d} />
        ))}
      </svg>
      <ol className="mapa__nos">
        {habilidades.map((h) => {
          const { x, y } = posicao[h.habilidade_id];
          const ehAlvo = h.habilidade_id === recomendada;
          return (
            <li
              key={h.habilidade_id}
              className={`mapa__no ${ehAlvo ? 'mapa__no--alvo' : ''} ${h.travou ? 'mapa__no--travou' : ''}`}
              style={{ left: x, top: y, width: LARGURA, height: ALTURA }}
            >
              <span className="mapa__nome">{h.nome}</span>
              <span className="mapa__linha">
                <span className="mapa__valor">{pct(h.p_l)}</span>
                {h.travou ? (
                  <span className="estado estado--travou">
                    <Icone nome="alerta" tamanho={14} /> travou
                  </span>
                ) : h.dominada ? (
                  <span className="estado estado--dominada">
                    <Icone nome="certo" tamanho={14} /> dominada
                  </span>
                ) : ehAlvo ? (
                  <span className="estado estado--alvo">
                    <Icone nome="alvo" tamanho={14} /> praticando
                  </span>
                ) : null}
              </span>
              <span className="mapa__barra" aria-hidden="true">
                <span style={{ width: pct(h.p_l) }} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
