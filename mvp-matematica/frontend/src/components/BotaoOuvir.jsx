import { useEffect, useState } from 'react';

import { falaDisponivel, falar, pararFala } from '../lib/fala.js';
import Icone from './Icone.jsx';

export default function BotaoOuvir({ texto, rotulo = 'Ouvir', className = '' }) {
  const [falando, setFalando] = useState(false);

  // Trocou de questão (ou saiu da tela): para de falar.
  useEffect(() => () => pararFala(), [texto]);

  if (!falaDisponivel) return null;

  function alternar() {
    if (falando) {
      pararFala();
      setFalando(false);
      return;
    }
    setFalando(true);
    falar(texto, { aoTerminar: () => setFalando(false) });
  }

  return (
    <button
      type="button"
      className={`botao-ouvir ${falando ? 'botao-ouvir--falando' : ''} ${className}`}
      onClick={alternar}
      aria-pressed={falando}
    >
      <Icone nome="som" />
      <span>{falando ? 'Parar' : rotulo}</span>
    </button>
  );
}
