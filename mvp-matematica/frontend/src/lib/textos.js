// Nome provisório do produto: o grupo ainda não escolheu um. Trocar só aqui.
export const MARCA = 'Quadriculado';

export const pct = (v) => `${Math.round(v * 100)}%`;

/** Nome legível de cada regra do motor (backend/src/motor.js). */
export const NOME_DA_REGRA = {
  diagnostico: 'Teste rápido',
  zona_proximal: 'Zona de desenvolvimento proximal',
  progressao: 'Progressão: subir a dificuldade antes de avançar',
  revisao: 'Revisão espaçada',
  reforco: 'Reforço da habilidade mais frágil',
  scaffolding: 'Apoio depois de erros seguidos',
  fallback: 'Início da trilha',
};

/** Cor fixa por aluno (pelo id), para o avatar ser reconhecível entre telas. */
const CORES_AVATAR = ['azul', 'ambar', 'verde', 'lilas'];
export const corDoAluno = (id) => CORES_AVATAR[(Number(id) - 1) % CORES_AVATAR.length];

export const inicial = (nome) => nome.trim().charAt(0).toUpperCase();

/**
 * Enunciado para as telas de adulto: os dados (⚀–⚅) viram o valor por extenso,
 * porque a fonte do painel não desenha esses símbolos.
 */
export function enunciadoParaAdulto(enunciado) {
  const faces = [...enunciado.matchAll(/[⚀-⚅]/gu)].map((m) => m[0].codePointAt(0) - 0x2680 + 1);
  if (faces.length === 0) return enunciado;
  const sem = enunciado.replace(/[⚀-⚅]/gu, '').replace(/\s+/g, ' ').trim();
  return `${sem} (${faces.length > 1 ? 'dados' : 'dado'}: ${faces.join(' e ')})`;
}

/** "2026-10-05 14:03:12" (UTC do SQLite) → "14:03". */
export function horario(criadoEm) {
  const data = new Date(`${criadoEm.replace(' ', 'T')}Z`);
  if (Number.isNaN(data.getTime())) return criadoEm;
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
