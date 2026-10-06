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

  test(`${nome}: erros previsíveis voltam como JSON`, async () => {
    await comServidor(await criar(), async (chamar) => {
      assert.equal((await chamar('/alunos/abc/proxima-questao')).status, 404);
      assert.equal((await chamar('/alunos/999/dominio')).status, 404);
      assert.equal((await chamar('/alunos', { metodo: 'POST', corpo: { nome: '' } })).status, 400);
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
