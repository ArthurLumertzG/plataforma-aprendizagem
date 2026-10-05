// Leitura em voz alta com a voz do próprio navegador (Web Speech API).
// Nada sai do dispositivo para um serviço nosso: coerente com a coleta mínima.

export const falaDisponivel = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Converte símbolos para como uma professora leria a questão. */
export function textoParaFala(texto) {
  return texto
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s*=\s*\?/g, ' é igual a quanto?')
    .replace(/(\d)\s*\+\s*(\d)/g, '$1 mais $2')
    .replace(/(\d)\s*[−-]\s*(\d)/g, '$1 menos $2')
    .replace(/_+/g, 'qual número?')
    .replace(/\s+/g, ' ')
    .trim();
}

function vozPortugues() {
  const vozes = window.speechSynthesis.getVoices();
  return (
    vozes.find((v) => v.lang === 'pt-BR') ??
    vozes.find((v) => v.lang?.startsWith('pt')) ??
    null
  );
}

/**
 * Lê o texto e chama `aoTerminar` quando a fala acaba ou é interrompida.
 * Uma fala nova sempre cancela a anterior.
 */
export function falar(texto, { aoTerminar } = {}) {
  if (!falaDisponivel) return;
  window.speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(textoParaFala(texto));
  fala.lang = 'pt-BR';
  fala.rate = 0.9; // um pouco mais devagar que o padrão
  const voz = vozPortugues();
  if (voz) fala.voice = voz;
  if (aoTerminar) {
    fala.onend = aoTerminar;
    fala.onerror = aoTerminar;
  }
  window.speechSynthesis.speak(fala);
}

export function pararFala() {
  if (falaDisponivel) window.speechSynthesis.cancel();
}
