// Interpreta o enunciado (texto livre do seed) para desenhar a questão como
// material concreto. É só apresentação: o backend continua dono do conteúdo,
// e um enunciado que não casa com nenhum padrão cai em { tipo: 'texto' }.
//
// Dois níveis, para não contaminar a evidência do BKT:
//  - `tipo` define como a questão é MOSTRADA (sempre). Não revela a resposta.
//  - `apoio` define o material extra (quadros de dez, trilha numérica). A tela
//    só o exibe quando o motor acionou o scaffolding (a questão veio com dica).

const EMOJI = /\p{Extended_Pictographic}/gu;
const MAX_QUADROS = 2; // até 20 fichas: cobre todo o banco atual

/** Soma/subtração em linguagem natural: "tinha 6 ... ganhou mais 4". */
const PALAVRAS_SOMA = /\b(ganhou|ganha|chegaram|mais)\b/i;
const PALAVRAS_SUBTRACAO = /\b(caíram|caiu|perdeu|saíram|comeu|deu)\b/i;

function numeros(texto) {
  return (texto.match(/\d+/g) ?? []).map(Number);
}

function apoioDaConta(a, op, b) {
  const total = op === '+' ? a + b : a;
  if (total > MAX_QUADROS * 10) return null;
  return { tipo: 'quadros', a, op, b };
}

/**
 * @param {string} enunciado
 * @returns {{tipo: string, texto?: string, apoio?: object|null, [k: string]: any}}
 */
export function interpretarEnunciado(enunciado) {
  const texto = enunciado.trim();

  // "Quantas bolinhas você vê?  🔵 🔵 🔵" → objetos para contar.
  const emojis = texto.match(EMOJI) ?? [];
  if (emojis.length > 0 && emojis.every((e) => e === emojis[0])) {
    return {
      tipo: 'objetos',
      texto: texto.replace(EMOJI, '').replace(/\s+/g, ' ').trim(),
      objeto: emojis[0],
      quantidade: emojis.length,
      apoio: null, // os próprios objetos já são o material concreto
    };
  }

  // "Complete a sequência: 3, 4, 5, ___, 7"
  const seq = texto.match(/^(.*?):\s*((?:\d+|_+)(?:\s*,\s*(?:\d+|_+))+)\s*$/);
  if (seq) {
    const itens = seq[2].split(',').map((s) => (/_/.test(s) ? null : Number(s.trim())));
    return { tipo: 'sequencia', texto: seq[1].trim(), itens, apoio: null };
  }

  // "7 + 5 = ?" / "8 − 3 = ?"
  const conta = texto.match(/^(\d+)\s*([+−-])\s*(\d+)\s*=\s*\?$/);
  if (conta) {
    const a = Number(conta[1]);
    const op = conta[2] === '+' ? '+' : '−';
    const b = Number(conta[3]);
    return { tipo: 'conta', a, op, b, apoio: apoioDaConta(a, op, b) };
  }

  // "Qual número vem depois do 6?"
  const depois = texto.match(/depois do (\d+)/i);
  if (depois) {
    const n = Number(depois[1]);
    return { tipo: 'texto', texto, apoio: { tipo: 'trilha', ate: n } };
  }

  // Problema com duas quantidades: o texto fica, e o apoio vira quadros de dez.
  const ns = numeros(texto);
  if (ns.length === 2) {
    const [a, b] = ns;
    if (PALAVRAS_SUBTRACAO.test(texto) && a >= b) {
      return { tipo: 'texto', texto, apoio: apoioDaConta(a, '−', b) };
    }
    if (PALAVRAS_SOMA.test(texto)) {
      return { tipo: 'texto', texto, apoio: apoioDaConta(a, '+', b) };
    }
  }

  return { tipo: 'texto', texto, apoio: null };
}

/**
 * Distribui as fichas da conta nos quadros de dez, casa por casa.
 * Na soma, a segunda parcela continua de onde a primeira parou — é exatamente a
 * estratégia "complete o 10" das dicas de reagrupamento.
 * @returns {Array<Array<'a'|'b'|'riscada'|null>>} um array de 10 casas por quadro
 */
export function fichasNosQuadros({ a, op, b }) {
  const fichas =
    op === '+'
      ? [...Array(a).fill('a'), ...Array(b).fill('b')]
      : [...Array(a - b).fill('a'), ...Array(b).fill('riscada')];
  const quadros = Math.max(1, Math.ceil(fichas.length / 10));
  return Array.from({ length: quadros }, (_, q) =>
    Array.from({ length: 10 }, (_, i) => fichas[q * 10 + i] ?? null),
  );
}
