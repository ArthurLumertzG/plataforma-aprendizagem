// Em desenvolvimento a base fica vazia: o front chama /api/... e o proxy do Vite
// repassa para o Express local. Em produção (Vercel) o backend está em outra
// máquina, então a URL vem de VITE_API_URL — ex.: https://algo.trycloudflare.com
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const url = (caminho) => `${BASE}${caminho}`;

async function json(resposta) {
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${resposta.status}`);
  }
  return resposta.json();
}

export const api = {
  listarAlunos: () => fetch(url('/api/alunos')).then(json),

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
