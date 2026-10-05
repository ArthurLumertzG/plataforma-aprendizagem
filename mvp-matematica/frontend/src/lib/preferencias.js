import { useCallback, useEffect, useState } from 'react';

// Ajustes de leitura de cada criança. Ficam só neste navegador (localStorage),
// separados por aluno, porque o tablet da escola costuma ser compartilhado.
// Não vão para o servidor: não são dados pedagógicos, são acessibilidade.

export const PREFERENCIAS_PADRAO = {
  tamanho: 'normal', // 'normal' | 'grande' | 'enorme'
  fonte: 'andika', // 'andika' | 'lexend' | 'atkinson'
  espacamento: false, // espaço extra entre letras, palavras e linhas
  calmo: false, // baixo estímulo: sem animações, sem quadriculado, cores mais suaves
  lerSozinho: false, // lê cada questão nova em voz alta sem precisar tocar
};

const chave = (alunoId) => `preferencias-leitura:${alunoId ?? 'geral'}`;

function ler(alunoId) {
  try {
    const salvo = JSON.parse(window.localStorage.getItem(chave(alunoId)) ?? 'null');
    return { ...PREFERENCIAS_PADRAO, ...(salvo ?? {}) };
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}

export function usePreferencias(alunoId) {
  const [preferencias, setPreferencias] = useState(() => ler(alunoId));

  useEffect(() => {
    setPreferencias(ler(alunoId));
  }, [alunoId]);

  const alterar = useCallback(
    (mudancas) => {
      setPreferencias((atual) => {
        const nova = { ...atual, ...mudancas };
        try {
          window.localStorage.setItem(chave(alunoId), JSON.stringify(nova));
        } catch {
          // Sem armazenamento (aba anônima, bloqueio): vale só nesta sessão.
        }
        return nova;
      });
    },
    [alunoId],
  );

  return [preferencias, alterar];
}

/** Atributos `data-*` que o CSS da área da criança usa para aplicar os ajustes. */
export function atributosDasPreferencias(p) {
  return {
    'data-tamanho': p.tamanho,
    'data-fonte': p.fonte,
    'data-espacamento': p.espacamento ? 'sim' : undefined,
    'data-calmo': p.calmo ? 'sim' : undefined,
  };
}
