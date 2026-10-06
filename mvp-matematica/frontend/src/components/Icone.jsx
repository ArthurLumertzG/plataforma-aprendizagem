// Ícones de traço simples (24×24), desenhados aqui para não puxar uma biblioteca.
const CAMINHOS = {
  som: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  trocar: (
    <>
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  certo: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alerta: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  lampada: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Passou do limiar, mas o domínio ainda não foi confirmado por acertos seguidos.
  pendente: <circle cx="12" cy="12" r="7" strokeDasharray="3.2 2.6" />,
  // Acertos longe do que o modelo previa: vale investigar.
  lupa: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  sair: <path d="M14 5h4v14h-4M10 8l-4 4 4 4M6 12h9" />,
  cadeado: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
};

export default function Icone({ nome, tamanho = 22, className = '' }) {
  return (
    <svg
      className={`icone ${className}`}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
