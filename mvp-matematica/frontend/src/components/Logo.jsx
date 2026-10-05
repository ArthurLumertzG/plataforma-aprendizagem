import { Link } from 'react-router-dom';

import { MARCA } from '../lib/textos.js';

/** Marca: um quadro de dez com 7 fichas (5 azuis e 2 âmbar). */
export function SimboloMarca({ tamanho = 28 }) {
  const casas = Array.from({ length: 10 }, (_, i) => i);
  return (
    <svg
      width={tamanho * 2}
      height={tamanho}
      viewBox="0 0 112 56"
      aria-hidden="true"
      className="simbolo-marca"
    >
      <rect x="1.5" y="1.5" width="109" height="53" rx="8" fill="var(--superficie)" stroke="var(--tinta)" strokeWidth="3" />
      <line x1="2" y1="28" x2="110" y2="28" stroke="var(--tinta)" strokeWidth="2" />
      {[1, 2, 3, 4].map((i) => (
        <line key={i} x1={2 + i * 21.6} y1="2" x2={2 + i * 21.6} y2="54" stroke="var(--tinta)" strokeWidth="2" />
      ))}
      {casas.slice(0, 7).map((i) => (
        <circle
          key={i}
          cx={12.8 + (i % 5) * 21.6}
          cy={i < 5 ? 15 : 41}
          r="7"
          fill={i < 5 ? 'var(--ficha-azul)' : 'var(--ficha-ambar)'}
        />
      ))}
    </svg>
  );
}

export default function Logo({ para = '/' }) {
  return (
    <Link to={para} className="logo">
      <SimboloMarca />
      <span className="logo__nome">{MARCA}</span>
    </Link>
  );
}
