// A mascote é uma ficha de contagem, o material concreto das aulas de
// matemática, com rosto. Expressões contidas: celebra sem estardalhaço e
// nunca fica triste com um erro.

const BOCAS = {
  neutra: 'M38 60 Q50 66 62 60',
  feliz: 'M34 57 Q50 74 66 57',
  pensando: 'M43 61 Q50 65 57 61',
};

export default function Mascote({ expressao = 'neutra', tamanho = 72, className = '' }) {
  const feliz = expressao === 'feliz';
  const pensando = expressao === 'pensando';
  return (
    <svg
      className={`mascote mascote--${expressao} ${className}`}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle cx="50" cy="52" r="44" fill="var(--ficha-azul-escura)" />
      <circle cx="50" cy="48" r="44" fill="var(--ficha-azul)" />
      <circle cx="50" cy="48" r="34" fill="none" stroke="var(--ficha-azul-clara)" strokeWidth="3" />
      {feliz ? (
        <>
          <path d="M33 44 Q38 37 43 44" className="mascote__olho-arco" />
          <path d="M57 44 Q62 37 67 44" className="mascote__olho-arco" />
        </>
      ) : (
        <g className="mascote__olhos">
          <ellipse cx="38" cy="42" rx="6" ry="7" fill="#fff" />
          <ellipse cx="62" cy="42" rx="6" ry="7" fill="#fff" />
          <circle cx={pensando ? 40 : 38} cy={pensando ? 39 : 43} r="3.4" fill="var(--tinta)" />
          <circle cx={pensando ? 64 : 62} cy={pensando ? 39 : 43} r="3.4" fill="var(--tinta)" />
        </g>
      )}
      <path d={BOCAS[expressao] ?? BOCAS.neutra} className="mascote__boca" />
    </svg>
  );
}
