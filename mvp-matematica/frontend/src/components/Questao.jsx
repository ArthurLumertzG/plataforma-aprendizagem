import { useEffect, useState } from 'react';

import { fichasNosQuadros } from '../lib/representacao.js';

// Como a questão aparece para a criança. Recebe o resultado de
// interpretarEnunciado(); nada aqui sabe a resposta correta.

/** Objetos para contar. Tocar marca o objeto com o número da contagem, como apontar com o dedo. */
function Objetos({ objeto, quantidade, idQuestao }) {
  const [contados, setContados] = useState([]);
  useEffect(() => setContados([]), [idQuestao]);

  function tocar(i) {
    setContados((lista) => (lista.includes(i) ? lista.filter((x) => x !== i) : [...lista, i]));
  }

  return (
    <div className="objetos" role="group" aria-label={`${quantidade} figuras para contar`}>
      {Array.from({ length: quantidade }, (_, i) => {
        const ordem = contados.indexOf(i);
        return (
          <button
            key={i}
            type="button"
            className={`objeto ${ordem >= 0 ? 'objeto--contado' : ''}`}
            style={{ '--atraso': `${i * 60}ms` }}
            onClick={() => tocar(i)}
            aria-pressed={ordem >= 0}
            aria-label={ordem >= 0 ? `Figura contada como ${ordem + 1}` : 'Figura ainda não contada'}
          >
            <span className="objeto__figura" aria-hidden="true">
              {objeto}
            </span>
            {ordem >= 0 && (
              <span className="objeto__numero" aria-hidden="true">
                {ordem + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Sequencia({ itens }) {
  return (
    <ol className="sequencia" aria-label="Sequência de números">
      {itens.map((n, i) =>
        n === null ? (
          <li key={i} className="sequencia__casa sequencia__casa--vazia" aria-label="número que falta">
            ?
          </li>
        ) : (
          <li key={i} className="sequencia__casa">
            {n}
          </li>
        ),
      )}
    </ol>
  );
}

function Conta({ a, op, b }) {
  return (
    <p className="conta" aria-label={`${a} ${op === '+' ? 'mais' : 'menos'} ${b} é igual a quanto?`}>
      <span>{a}</span>
      <span className="conta__sinal">{op}</span>
      <span>{b}</span>
      <span className="conta__sinal">=</span>
      <span className="conta__resposta" aria-hidden="true">
        ?
      </span>
    </p>
  );
}

export function Enunciado({ representacao, idQuestao }) {
  const r = representacao;
  return (
    <div className="enunciado">
      {r.texto && <p className="enunciado__texto">{r.texto}</p>}
      {r.tipo === 'objetos' && (
        <Objetos objeto={r.objeto} quantidade={r.quantidade} idQuestao={idQuestao} />
      )}
      {r.tipo === 'sequencia' && <Sequencia itens={r.itens} />}
      {r.tipo === 'conta' && <Conta a={r.a} op={r.op} b={r.b} />}
    </div>
  );
}

// ---------- material de apoio (só no scaffolding) ----------

export function QuadroDeDez({ casas, rotulo }) {
  return (
    <div className="quadro-dez" role="img" aria-label={rotulo}>
      {casas.map((c, i) => (
        <span key={i} className="quadro-dez__casa">
          {c && <span className={`ficha ficha--${c}`} style={{ '--atraso': `${i * 70}ms` }} />}
        </span>
      ))}
    </div>
  );
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function Quadros({ a, op, b }) {
  const quadros = fichasNosQuadros({ a, op, b });
  const legenda =
    op === '+'
      ? `${plural(a, 'ficha azul', 'fichas azuis')} e mais ${plural(b, 'amarela', 'amarelas')}. ` +
        (a + b > 10 ? 'Encha o primeiro quadro antes de passar para o próximo.' : 'Quantas são ao todo?')
      : `${plural(a, 'ficha', 'fichas')}, e ${b === 1 ? '1 foi tirada' : `${b} foram tiradas`}. ` +
        'Conte as que ficaram.';
  return (
    <figure className="apoio-quadros">
      <div className="apoio-quadros__quadros">
        {quadros.map((casas, q) => (
          <QuadroDeDez key={q} casas={casas} rotulo={`Quadro de dez ${q + 1}`} />
        ))}
      </div>
      <figcaption>{legenda}</figcaption>
    </figure>
  );
}

function Trilha({ ate }) {
  const fim = Math.max(10, ate + 1);
  return (
    <figure className="trilha">
      <ol className="trilha__casas">
        {Array.from({ length: fim }, (_, i) => i + 1).map((n) => (
          <li
            key={n}
            className={`trilha__casa ${n <= ate ? 'trilha__casa--andada' : ''} ${
              n === ate + 1 ? 'trilha__casa--proxima' : ''
            }`}
          >
            {n === ate + 1 ? '?' : n}
          </li>
        ))}
      </ol>
      <figcaption>Ande pela trilha contando. Qual casa vem depois do {ate}?</figcaption>
    </figure>
  );
}

export function Apoio({ apoio }) {
  if (!apoio) return null;
  if (apoio.tipo === 'quadros') return <Quadros {...apoio} />;
  if (apoio.tipo === 'trilha') return <Trilha ate={apoio.ate} />;
  return null;
}
