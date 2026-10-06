// Relatório de acurácia do modelo do aluno sobre o banco da API:
// o P(L) prevê o acerto seguinte? Obrigatório antes de apresentar resultados do piloto.
//
//   npm run avaliar-modelo            relatório legível
//   npm run avaliar-modelo -- --json  o mesmo relatório em JSON, para guardar
//
// Lê o mesmo banco da API: o SQLite local ou, com DATABASE_URL definido, o Postgres
// (por exemplo, o da Neon em produção). Abrir o banco aplica a migração de esquema,
// exatamente como subir a API.

import { avaliarModelo } from '../src/avaliacao.js';
import { VERSAO_PARAMETROS } from '../src/bkt.js';
import { listarHabilidades } from '../src/conteudo.js';
import { obterRepositorio } from '../src/repositorio.js';

/** Abaixo disso o AUC oscila demais para tirar conclusão. Referência, não regra. */
const AMOSTRA_PEQUENA = 200;

const habilidades = listarHabilidades();
const repo = await obterRepositorio();
const eventosPorAluno = await repo.eventosPorAluno();
const relatorio = avaliarModelo(
  (await repo.listarAlunos()).map((a) => eventosPorAluno.get(a.id) ?? []),
  habilidades,
);

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({ versao_parametros_atual: VERSAO_PARAMETROS, ...relatorio }, null, 2),
  );
  process.exit(0);
}

const num = (v, casas = 2) =>
  v === null
    ? '—'
    : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const nomeDa = Object.fromEntries(habilidades.map((h) => [h.id, h.nome]));

function tabela(cabecalho, linhas) {
  const larguras = cabecalho.map((c, i) =>
    Math.max(c.length, ...linhas.map((l) => String(l[i]).length)),
  );
  const formatar = (l) => '  ' + l.map((c, i) => String(c).padEnd(larguras[i])).join('  ');
  return [formatar(cabecalho), ...linhas.map(formatar)].join('\n');
}

const aucComIntervalo = ({ auc, intervalo_auc: ic }) => {
  if (auc === null) return '—';
  return ic ? `${num(auc)} (${num(ic.de)} a ${num(ic.ate)})` : `${num(auc)} (poucos dados)`;
};

const r = relatorio;
const saida = [
  `Acurácia do modelo do aluno (BKT, parâmetros ${VERSAO_PARAMETROS})`,
  '',
  `Alunos: ${r.alunos.cadastrados} cadastrados, ${r.alunos.com_pratica} com prática. Ninguém foi excluído.`,
  `Respostas de prática avaliadas: ${r.respostas} (taxa de acerto ${pct(r.taxa_acerto)})`,
  '',
  `AUC: ${aucComIntervalo(r)}`,
  '  Chance de um acerto ter tido previsão maior que um erro. 0,5 é chute; 1 é perfeito.',
  `Brier: ${num(r.brier.valor, 3)} (referência ${num(r.brier.referencia, 3)}: prever sempre a taxa geral)`,
  r.brier.valor === null
    ? ''
    : r.brier.valor < r.brier.referencia
      ? '  O modelo erra menos que a referência.'
      : '  O modelo NÃO erra menos que a referência: as previsões não estão ajudando.',
  '',
  'Calibração (o modelo previa × a criança acertou)',
  tabela(
    ['faixa prevista', 'respostas', 'previsto', 'real'],
    r.calibracao
      .filter((f) => f.respostas > 0)
      .map((f) => [
        `${pct(f.de)} a ${pct(f.ate)}`,
        f.respostas,
        pct(f.previsto_medio),
        pct(f.taxa_real),
      ]),
  ),
  '',
  'Por habilidade',
  tabela(
    ['habilidade', 'respostas', 'acerto', 'AUC (IC 95%)'],
    r.por_habilidade.map((h) => [
      nomeDa[h.habilidade_id] ?? h.habilidade_id,
      h.respostas,
      pct(h.taxa_acerto),
      aucComIntervalo(h),
    ]),
  ),
  '',
  'Por regra do motor que serviu a questão',
  tabela(
    ['regra', 'respostas', 'acerto', 'AUC (IC 95%)'],
    r.por_regra.map((g) => [g.regra, g.respostas, pct(g.taxa_acerto), aucComIntervalo(g)]),
  ),
  '',
  `Versões dos parâmetros gravadas nos eventos: ${
    Object.entries(r.versoes)
      .map(([v, n]) => `${v} (${n})`)
      .join(', ') || 'nenhuma'
  }`,
];

const avisos = [];
if (r.respostas < AMOSTRA_PEQUENA) {
  avisos.push(`Amostra pequena (menos de ${AMOSTRA_PEQUENA} respostas): o AUC varia muito.`);
}
if (Object.keys(r.versoes).length > 1 || (r.respostas > 0 && !r.versoes[VERSAO_PARAMETROS])) {
  avisos.push(
    `Há eventos gravados com outra versão de parâmetros (ou sem versão). O relatório recalcula tudo com a ${VERSAO_PARAMETROS}.`,
  );
}
avisos.push(
  'O intervalo supõe respostas independentes. Como cada criança responde várias vezes, o intervalo real é mais largo.',
  'O motor escolhe as questões, então os dados já vêm moldados por ele. Compare as regras acima antes de generalizar.',
  'Na demo os alunos são fictícios: estes números não valem como evidência.',
);

console.log([...saida, '', 'Avisos', ...avisos.map((a) => `- ${a}`)].join('\n'));
