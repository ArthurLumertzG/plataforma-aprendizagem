// Dados fixos do MVP: habilidades (DAG de pré-requisitos), alunos de exemplo
// e o banco de 20 questões (5 por habilidade, dificuldade 1 a 3).

export const HABILIDADES = [
  {
    id: 'contagem_ate_10',
    nome: 'Contagem até 10',
    pre_requisitos: [],
  },
  {
    id: 'adicao_ate_10',
    nome: 'Adição até 10',
    pre_requisitos: ['contagem_ate_10'],
  },
  {
    id: 'subtracao_ate_10',
    nome: 'Subtração até 10',
    pre_requisitos: ['contagem_ate_10'],
  },
  {
    id: 'adicao_com_reagrupamento',
    nome: 'Adição com reagrupamento',
    pre_requisitos: ['adicao_ate_10', 'subtracao_ate_10'],
  },
];

export const ALUNOS = [
  { id: 1, nome: 'Ana' },
  { id: 2, nome: 'Bruno' },
  { id: 3, nome: 'Clara' },
  { id: 4, nome: 'Davi' },
  { id: 5, nome: 'Elisa' },
];

export const QUESTOES = [
  // ---------- contagem_ate_10 ----------
  {
    id: 'cont_1',
    habilidade: 'contagem_ate_10',
    dificuldade: 1,
    enunciado: 'Quantas bolinhas você vê?  🔵 🔵 🔵',
    alternativas: ['2', '3', '4', '5'],
    resposta_correta: '3',
  },
  {
    id: 'cont_2',
    habilidade: 'contagem_ate_10',
    dificuldade: 1,
    enunciado: 'Conte os patinhos:  🦆 🦆 🦆 🦆 🦆',
    alternativas: ['4', '5', '6', '7'],
    resposta_correta: '5',
  },
  {
    id: 'cont_3',
    habilidade: 'contagem_ate_10',
    dificuldade: 2,
    enunciado: 'Qual número vem depois do 6?',
    alternativas: ['5', '6', '7', '8'],
    resposta_correta: '7',
  },
  {
    id: 'cont_4',
    habilidade: 'contagem_ate_10',
    dificuldade: 2,
    enunciado: 'Complete a sequência: 3, 4, 5, ___, 7',
    alternativas: ['2', '6', '8', '9'],
    resposta_correta: '6',
  },
  {
    id: 'cont_5',
    habilidade: 'contagem_ate_10',
    dificuldade: 3,
    enunciado: 'Contando de trás para frente: 10, 9, 8, ___',
    alternativas: ['6', '7', '9', '11'],
    resposta_correta: '7',
  },

  // ---------- adicao_ate_10 ----------
  {
    id: 'soma_1',
    habilidade: 'adicao_ate_10',
    dificuldade: 1,
    enunciado: '2 + 1 = ?',
    alternativas: ['2', '3', '4', '5'],
    resposta_correta: '3',
  },
  {
    id: 'soma_2',
    habilidade: 'adicao_ate_10',
    dificuldade: 1,
    enunciado: '3 + 2 = ?',
    alternativas: ['4', '5', '6', '7'],
    resposta_correta: '5',
  },
  {
    id: 'soma_3',
    habilidade: 'adicao_ate_10',
    dificuldade: 2,
    enunciado: '4 + 3 = ?',
    alternativas: ['6', '7', '8', '9'],
    resposta_correta: '7',
  },
  {
    id: 'soma_4',
    habilidade: 'adicao_ate_10',
    dificuldade: 2,
    enunciado: '5 + 4 = ?',
    alternativas: ['8', '9', '10', '11'],
    resposta_correta: '9',
  },
  {
    id: 'soma_5',
    habilidade: 'adicao_ate_10',
    dificuldade: 3,
    enunciado: 'Ana tinha 6 figurinhas e ganhou mais 4. Com quantas figurinhas ela ficou?',
    alternativas: ['8', '9', '10', '12'],
    resposta_correta: '10',
  },

  // ---------- subtracao_ate_10 ----------
  {
    id: 'sub_1',
    habilidade: 'subtracao_ate_10',
    dificuldade: 1,
    enunciado: '3 − 1 = ?',
    alternativas: ['1', '2', '3', '4'],
    resposta_correta: '2',
  },
  {
    id: 'sub_2',
    habilidade: 'subtracao_ate_10',
    dificuldade: 1,
    enunciado: '5 − 2 = ?',
    alternativas: ['2', '3', '4', '5'],
    resposta_correta: '3',
  },
  {
    id: 'sub_3',
    habilidade: 'subtracao_ate_10',
    dificuldade: 2,
    enunciado: '8 − 3 = ?',
    alternativas: ['3', '4', '5', '6'],
    resposta_correta: '5',
  },
  {
    id: 'sub_4',
    habilidade: 'subtracao_ate_10',
    dificuldade: 2,
    enunciado: '9 − 4 = ?',
    alternativas: ['4', '5', '6', '7'],
    resposta_correta: '5',
  },
  {
    id: 'sub_5',
    habilidade: 'subtracao_ate_10',
    dificuldade: 3,
    enunciado: 'Tinha 10 bolinhas na caixa e 6 caíram no chão. Quantas ficaram na caixa?',
    alternativas: ['3', '4', '5', '6'],
    resposta_correta: '4',
  },

  // ---------- adicao_com_reagrupamento ----------
  {
    id: 'reagr_1',
    habilidade: 'adicao_com_reagrupamento',
    dificuldade: 1,
    enunciado: '7 + 5 = ?',
    alternativas: ['11', '12', '13', '14'],
    resposta_correta: '12',
  },
  {
    id: 'reagr_2',
    habilidade: 'adicao_com_reagrupamento',
    dificuldade: 1,
    enunciado: '8 + 4 = ?',
    alternativas: ['10', '11', '12', '13'],
    resposta_correta: '12',
  },
  {
    id: 'reagr_3',
    habilidade: 'adicao_com_reagrupamento',
    dificuldade: 2,
    enunciado: '9 + 6 = ?',
    alternativas: ['14', '15', '16', '17'],
    resposta_correta: '15',
  },
  {
    id: 'reagr_4',
    habilidade: 'adicao_com_reagrupamento',
    dificuldade: 2,
    enunciado: '8 + 7 = ?',
    alternativas: ['13', '14', '15', '16'],
    resposta_correta: '15',
  },
  {
    id: 'reagr_5',
    habilidade: 'adicao_com_reagrupamento',
    dificuldade: 3,
    enunciado: 'Lucas tinha 9 bolinhas de gude e ganhou mais 8. Quantas bolinhas ele tem agora?',
    alternativas: ['15', '16', '17', '18'],
    resposta_correta: '17',
  },
];
