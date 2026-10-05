import { pct } from '../lib/textos.js';

/**
 * Régua de domínio: barra fina com o P(L), um traço no limiar de domínio e,
 * se houver, uma marca no ponto de partida definido pelo teste rápido.
 */
export default function Regua({ pL, pL0 = null, limiar, dominada = false, className = '' }) {
  return (
    <span className={`regua ${dominada ? 'regua--dominada' : ''} ${className}`} aria-hidden="true">
      <span className="regua__preenchida" style={{ width: pct(pL) }} />
      {limiar !== undefined && <span className="regua__limiar" style={{ left: pct(limiar) }} />}
      {pL0 !== null && <span className="regua__partida" style={{ left: pct(pL0) }} />}
    </span>
  );
}
