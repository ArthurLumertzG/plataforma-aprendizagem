import test from 'node:test';
import assert from 'node:assert/strict';

import { recalcularDominio } from './bkt.js';
import { listarHabilidades, listarQuestoes } from './conteudo.js';
import { estadoDiagnostico } from './motor.js';
import { simularTurma } from './simulacao.js';

const habilidades = listarHabilidades();
const questoes = listarQuestoes();
const agora = new Date('2026-10-20T15:00:00Z');
const turma = simularTurma({ habilidades, questoes, agora });

test('simulação: mesma semente, mesma turma', () => {
  assert.deepEqual(simularTurma({ habilidades, questoes, agora }), turma);
});

test('simulação: nomes únicos e eventos no formato do banco', () => {
  assert.equal(new Set(turma.map((a) => a.nome)).size, turma.length);
  const questaoPorId = new Map(questoes.map((q) => [q.id, q]));
  for (const { eventos } of turma) {
    for (const e of eventos) {
      const q = questaoPorId.get(e.questao_id);
      assert.equal(e.habilidade_id, q.habilidade);
      assert.equal(e.dificuldade_servida, q.dificuldade);
      assert.equal(e.correto, e.resposta_dada === q.resposta_correta);
      assert.match(e.criado_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
  }
});

test('simulação: segue o fluxo da API (teste rápido primeiro, depois o motor)', () => {
  for (const { eventos } of turma) {
    const fimDiagnostico = eventos.findIndex((e) => e.tipo === 'pratica');
    if (fimDiagnostico === -1) continue; // parou no meio do teste rápido
    assert.ok(eventos.slice(fimDiagnostico).every((e) => e.tipo === 'pratica'));
    assert.ok(estadoDiagnostico(eventos.slice(0, fimDiagnostico), habilidades, questoes).concluido);
    assert.ok(eventos.slice(fimDiagnostico).every((e) => e.regra && e.regra !== 'diagnostico'));
  }
});

test('simulação: datas no passado, em ordem, em dias úteis', () => {
  for (const { eventos } of turma) {
    const datas = eventos.map((e) => new Date(`${e.criado_em.replace(' ', 'T')}Z`));
    datas.forEach((d, i) => {
      assert.ok(d < agora);
      if (i > 0) assert.ok(d > datas[i - 1]);
      const diaLocal = new Date(d.getTime() - 3 * 3600_000).getUTCDay();
      assert.ok(diaLocal !== 0 && diaLocal !== 6);
    });
  }
});

test('simulação: a turma é variada, como uma turma real', () => {
  const finais = turma.map(({ eventos }) => recalcularDominio(eventos, habilidades).dominio);
  const dominadas = finais.map((d) => habilidades.filter((h) => d[h.id] >= 0.6).length);
  assert.ok(Math.min(...dominadas) <= 3, 'alguém ainda está no começo da trilha');
  assert.ok(Math.max(...dominadas) >= 10, 'alguém já chegou perto do fim');
  assert.ok(turma.some((a) => !estadoDiagnostico(a.eventos, habilidades, questoes).concluido));
});
