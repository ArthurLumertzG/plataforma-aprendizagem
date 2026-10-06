import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

import { BANCOS, executorPGlite } from './bancos.test-helpers.js';
import { VERSAO_CONTEUDO } from './conteudo.js';
import { criarRepositorioPostgres } from './db-postgres.js';
import { ALUNOS, QUESTOES } from './seed-data.js';

const evento = (aluno_id, questao, extra = {}) => ({
  aluno_id,
  questao_id: questao.id,
  habilidade_id: questao.habilidade,
  tipo: 'pratica',
  resposta_dada: questao.resposta_correta,
  correto: true,
  versao_parametros: 'v1',
  dificuldade_servida: questao.dificuldade,
  regra: 'zona_proximal',
  ...extra,
});

for (const { nome, criar } of BANCOS) {
  test(`${nome}: semeia os alunos de exemplo e continua a numeração depois deles`, async () => {
    const repo = await criar();
    assert.deepEqual(await repo.listarAlunos(), ALUNOS);
    const novo = await repo.criarAluno('Bia');
    assert.deepEqual(novo, { id: ALUNOS.length + 1, nome: 'Bia' });
    assert.deepEqual(await repo.buscarAluno(novo.id), novo);
    assert.equal(await repo.buscarAluno(999), undefined);
  });

  test(`${nome}: eventos voltam em ordem, com o formato que o resto do código espera`, async () => {
    const repo = await criar();
    const [q1, q2] = QUESTOES;
    const id1 = await repo.registrarEvento(evento(1, q1));
    const id2 = await repo.registrarEvento(evento(1, q2, { correto: false, regra: null }));
    await repo.registrarEvento(evento(2, q1, { tipo: 'diagnostico' }));

    const eventos = await repo.eventosDoAluno(1);
    assert.deepEqual(
      eventos.map((e) => e.id),
      [id1, id2],
    );
    const [primeiro, segundo] = eventos;
    assert.equal(primeiro.correto, true);
    assert.equal(segundo.correto, false); // booleano nos dois bancos, não 0/1
    assert.equal(segundo.regra, null);
    assert.equal(primeiro.enunciado, q1.enunciado);
    assert.equal(primeiro.dificuldade_servida, q1.dificuldade);
    assert.match(primeiro.criado_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test(`${nome}: eventosPorAluno agrupa a turma numa consulta só`, async () => {
    const repo = await criar();
    const [q] = QUESTOES;
    await repo.registrarEvento(evento(1, q));
    await repo.registrarEvento(evento(3, q));
    await repo.registrarEvento(evento(1, q, { correto: false }));
    const porAluno = await repo.eventosPorAluno();
    assert.equal(porAluno.get(1).length, 2);
    assert.equal(porAluno.get(3).length, 1);
    assert.equal(porAluno.has(2), false);
  });

  test(`${nome}: o banco recusa evento de questão que não existe`, async () => {
    const repo = await criar();
    await assert.rejects(repo.registrarEvento(evento(1, { ...QUESTOES[0], id: 'nao_existe' })));
  });
}

test('postgres: preparar de novo não duplica nada e só ressincroniza quando o conteúdo muda', async () => {
  const db = new PGlite();
  const executor = executorPGlite(db);
  const repo = await criarRepositorioPostgres(executor);
  await repo.criarAluno('Bia');

  await criarRepositorioPostgres(executor); // outra instância subindo no mesmo banco
  assert.equal((await repo.listarAlunos()).length, ALUNOS.length + 1);
  const [{ valor }] = await executor.consultar(
    "SELECT valor FROM meta WHERE chave = 'versao_conteudo'",
  );
  assert.equal(valor, VERSAO_CONTEUDO);

  // Conteúdo "antigo" no banco: a próxima instância ressincroniza.
  await executor.consultar("UPDATE questoes SET enunciado = 'velho' WHERE id = $1", [
    QUESTOES[0].id,
  ]);
  await executor.consultar("UPDATE meta SET valor = 'antiga' WHERE chave = 'versao_conteudo'");
  await criarRepositorioPostgres(executor);
  const [q] = await executor.consultar('SELECT enunciado FROM questoes WHERE id = $1', [
    QUESTOES[0].id,
  ]);
  assert.equal(q.enunciado, QUESTOES[0].enunciado);
});
