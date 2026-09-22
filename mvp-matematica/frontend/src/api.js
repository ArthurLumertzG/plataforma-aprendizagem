async function json(resposta) {
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${resposta.status}`);
  }
  return resposta.json();
}

export const api = {
  listarAlunos: () => fetch('/api/alunos').then(json),

  proximaQuestao: (alunoId) => fetch(`/api/alunos/${alunoId}/proxima-questao`).then(json),

  responder: (alunoId, questao_id, resposta_dada) =>
    fetch(`/api/alunos/${alunoId}/respostas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questao_id, resposta_dada }),
    }).then(json),

  dominio: (alunoId) => fetch(`/api/alunos/${alunoId}/dominio`).then(json),

  painelProfessor: (senha) =>
    fetch('/api/professor/painel', { headers: { 'x-senha-professor': senha } }).then(json),
};
