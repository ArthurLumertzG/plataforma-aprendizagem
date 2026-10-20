// O que o painel e o relatório compartilham na aba: a senha da turma e a turma em
// vista. sessionStorage, para valer só até fechar a aba.

const CHAVE_SENHA = 'senha-professor';
const CHAVE_TURMA = 'turma-professor';

function ler(chave) {
  try {
    return window.sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    if (valor) window.sessionStorage.setItem(chave, valor);
    else window.sessionStorage.removeItem(chave);
  } catch {
    // Sem armazenamento: vale só até recarregar a página.
  }
}

export const lerSenhaSalva = () => ler(CHAVE_SENHA) ?? '';
export const salvarSenha = (senha) => gravar(CHAVE_SENHA, senha);

/** null: todas as turmas. */
export function lerTurmaSalva() {
  const id = Number(ler(CHAVE_TURMA));
  return Number.isInteger(id) && id > 0 ? id : null;
}
export const salvarTurma = (id) => gravar(CHAVE_TURMA, id ? String(id) : null);
