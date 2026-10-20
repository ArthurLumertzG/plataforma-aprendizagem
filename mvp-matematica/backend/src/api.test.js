// A API de ponta a ponta, por HTTP, contra os dois bancos: o que roda localmente
// (SQLite) e o que roda na Vercel (Postgres, aqui via PGlite).
import test from 'node:test';
import assert from 'node:assert/strict';

import app from './app.js';
import { BANCOS } from './bancos.test-helpers.js';
import { listarHabilidades } from './conteudo.js';
import { definirRepositorio } from './repositorio.js';
import { QUESTOES } from './seed-data.js';

const certa = Object.fromEntries(QUESTOES.map((q) => [q.id, q.resposta_correta]));

async function comServidor(repo, fazer) {
  definirRepositorio(repo);
  const servidor = app.listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  const base = `http://localhost:${servidor.address().port}/api`;
  const chamar = async (caminho, { metodo = 'GET', corpo, cabecalhos = {} } = {}) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...cabecalhos },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, corpo: await r.json() };
  };
  try {
    await fazer(chamar);
  } finally {
    servidor.close();
  }
}

for (const { nome, criar } of BANCOS) {
  test(`${nome}: teste rápido, prática e painel de ponta a ponta`, async () => {
    await comServidor(await criar(), async (chamar) => {
      assert.equal((await chamar('/saude')).corpo.banco, nome);

      const { status, corpo: aluno } = await chamar('/alunos', {
        metodo: 'POST',
        corpo: { nome: 'Bia' },
      });
      assert.equal(status, 201);

      // Teste rápido: sabe só as três raízes; o resto é pulado pelo grafo.
      const raizes = listarHabilidades().filter((h) => h.pre_requisitos.length === 0);
      let proxima = (await chamar(`/alunos/${aluno.id}/proxima-questao`)).corpo;
      let itens = 0;
      while (proxima.explicacao.regra === 'diagnostico') {
        const { questao } = proxima;
        assert.equal(questao.resposta_correta, undefined, 'a criança nunca recebe a resposta');
        const sabe = raizes.some((h) => h.id === questao.habilidade);
        await chamar(`/alunos/${aluno.id}/respostas`, {
          metodo: 'POST',
          corpo: { questao_id: questao.id, resposta_dada: sabe ? certa[questao.id] : '__x__' },
        });
        proxima = (await chamar(`/alunos/${aluno.id}/proxima-questao`)).corpo;
        itens++;
      }
      assert.equal(itens, raizes.length + 1); // as raízes e "número e quantidade", que ela erra

      // Prática: o evento grava a regra e o P(L) sobe com o acerto.
      const resposta = await chamar(`/alunos/${aluno.id}/respostas`, {
        metodo: 'POST',
        corpo: { questao_id: proxima.questao.id, resposta_dada: certa[proxima.questao.id] },
      });
      assert.equal(resposta.status, 201);
      assert.equal(resposta.corpo.tipo, 'pratica');
      assert.ok(resposta.corpo.p_l_depois > resposta.corpo.p_l_antes);

      const historico = (await chamar(`/alunos/${aluno.id}/historico?limite=1`)).corpo;
      assert.equal(historico[0].regra, proxima.explicacao.regra);

      const painel = await chamar('/professor/painel', {
        cabecalhos: { 'x-senha-professor': 'professor123' },
      });
      assert.equal(painel.status, 200);
      const bia = painel.corpo.alunos.find((a) => a.id === aluno.id);
      assert.equal(bia.diagnostico.concluido, true);
      assert.equal(painel.corpo.amostra.total, painel.corpo.alunos.length);
    });
  });

  test(`${nome}: turma simulada aparece no painel, mas não na tela da criança`, async () => {
    await comServidor(await criar(), async (chamar) => {
      const professor = { 'x-senha-professor': 'professor123' };
      assert.equal((await chamar('/professor/simulacao', { metodo: 'POST' })).status, 401);

      const criada = await chamar('/professor/simulacao', { metodo: 'POST', cabecalhos: professor });
      assert.equal(criada.status, 201);
      assert.ok(criada.corpo.alunos > 10 && criada.corpo.respostas > 500);

      const painel = (await chamar('/professor/painel', { cabecalhos: professor })).corpo;
      assert.equal(painel.simulados, criada.corpo.alunos);
      assert.equal(painel.alunos.filter((a) => a.simulado).length, criada.corpo.alunos);
      assert.ok(painel.alunos.some((a) => a.dominio.some((h) => h.travou)));
      const alunos = (await chamar('/alunos')).corpo;
      assert.ok(alunos.length > 0 && alunos.length < painel.alunos.length);

      // Por turma: o filtro do painel e o relatório.
      const doSegundo = (await chamar('/professor/painel?turma=2', { cabecalhos: professor })).corpo;
      assert.ok(doSegundo.alunos.length > 0 && doSegundo.alunos.every((a) => a.turma_id === 2));
      assert.equal(doSegundo.turma_selecionada.id, 2);
      assert.equal(doSegundo.turmas.reduce((s, t) => s + t.alunos, 0), painel.alunos.length);
      assert.equal((await chamar('/professor/painel?turma=99', { cabecalhos: professor })).status, 404);
      const { corpo: rel } = await chamar('/professor/relatorio?turma=3', { cabecalhos: professor });
      assert.equal(rel.relatorio.turma.id, 3);
      assert.equal(rel.comparativo.length, 3);
      assert.equal(rel.relatorio.alunos.length, rel.turmas.find((t) => t.id === 3).alunos);
      assert.equal((await chamar('/professor/relatorio')).status, 401);

      await chamar('/professor/simulacao', { metodo: 'DELETE', cabecalhos: professor });
      const depois = (await chamar('/professor/painel', { cabecalhos: professor })).corpo;
      assert.equal(depois.simulados, 0);
      assert.equal(depois.alunos.length, alunos.length);
    });
  });

  test(`${nome}: limpar informações volta ao início`, async () => {
    await comServidor(await criar(), async (chamar) => {
      const professor = { 'x-senha-professor': 'professor123' };
      await chamar('/alunos', { metodo: 'POST', corpo: { nome: 'Bia', turma_id: 2 } });
      await chamar('/professor/simulacao', { metodo: 'POST', cabecalhos: professor });
      assert.equal((await chamar('/professor/dados', { metodo: 'DELETE' })).status, 401);
      assert.equal(
        (await chamar('/professor/dados', { metodo: 'DELETE', cabecalhos: professor })).status,
        200,
      );
      const painel = (await chamar('/professor/painel', { cabecalhos: professor })).corpo;
      assert.equal(painel.simulados, 0);
      assert.ok(painel.alunos.every((a) => a.historico.length === 0));
      assert.equal(painel.alunos.length, 5, 'só os alunos de exemplo');
      assert.equal((await chamar('/turmas')).corpo.length, 3);
    });
  });

  test(`${nome}: erros previsíveis voltam como JSON`, async () => {
    await comServidor(await criar(), async (chamar) => {
      assert.equal((await chamar('/alunos/abc/proxima-questao')).status, 404);
      assert.equal((await chamar('/alunos/999/dominio')).status, 404);
      assert.equal((await chamar('/alunos', { metodo: 'POST', corpo: { nome: '' } })).status, 400);
      assert.equal(
        (await chamar('/alunos', { metodo: 'POST', corpo: { nome: 'X', turma_id: 99 } })).status,
        400,
      );
      const painel = await chamar('/professor/painel', {
        cabecalhos: { 'x-senha-professor': 'errada' },
      });
      assert.equal(painel.status, 401);
      // Fora de ordem durante o teste rápido: recusado.
      const fora = await chamar('/alunos/1/respostas', {
        metodo: 'POST',
        corpo: { questao_id: QUESTOES.at(-1).id, resposta_dada: '1' },
      });
      assert.equal(fora.status, 409);
    });
  });
}
