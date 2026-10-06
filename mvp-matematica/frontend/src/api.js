// A base fica vazia: o front chama /api/... no mesmo endereço. Em desenvolvimento o
// proxy do Vite repassa para o Express local; na Vercel, o vercel.json manda /api
// para o serviço da API. VITE_API_URL só serve para apontar para uma API em outro
// endereço (por exemplo, um túnel); no deploy com os dois serviços, deixe vazia.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const url = (caminho) => `${BASE}${caminho}`;

async function json(resposta) {
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${resposta.status}`);
  }
  // Se /api/... não chegar à API (deploy só da interface), volta o index.html da SPA.
  if (!resposta.headers.get('content-type')?.includes('application/json')) {
    throw new Error(
      'A API não respondeu JSON. Confira se o deploy inclui o serviço da API (vercel.json)',
    );
  }
  return resposta.json();
}

export const api = {
  listarAlunos: () => fetch(url('/api/alunos')).then(json),

  criarAluno: (nome) =>
    fetch(url('/api/alunos'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    }).then(json),

  proximaQuestao: (alunoId) => fetch(url(`/api/alunos/${alunoId}/proxima-questao`)).then(json),

  responder: (alunoId, questao_id, resposta_dada) =>
    fetch(url(`/api/alunos/${alunoId}/respostas`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questao_id, resposta_dada }),
    }).then(json),

  dominio: (alunoId) => fetch(url(`/api/alunos/${alunoId}/dominio`)).then(json),

  painelProfessor: (senha) =>
    fetch(url('/api/professor/painel'), { headers: { 'x-senha-professor': senha } }).then(json),
};
