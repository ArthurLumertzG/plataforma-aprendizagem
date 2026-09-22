# MVP — Matemática adaptativa (1º ao 3º ano)

Demonstração enxuta de personalização por habilidade: o sistema estima o quanto
cada criança domina cada habilidade e escolhe a próxima questão a partir disso.
Roda inteiro na máquina local, sem Docker e sem nuvem.

## Como rodar

Abra **dois terminais**.

```bash
# terminal 1 — API (http://localhost:3001)
cd backend
npm install
npm run dev        # cria e popula backend/data/mvp.db na primeira execução

# terminal 2 — interface (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Depois abra <http://localhost:5173>:

- **`/aluno`** — escolha um dos 5 perfis e responda as questões. Sem login.
- **`/professor`** — senha padrão **`professor123`** (ou o valor de `SENHA_PROFESSOR`
  no ambiente do backend). O painel se atualiza sozinho a cada 3 segundos.

Testes do núcleo estatístico:

```bash
cd backend
npm test
```

## Publicar a interface na Vercel (opcional)

O backend usa SQLite em arquivo, então **ele não roda na Vercel** (o filesystem das
Functions é efêmero). O arranjo possível é: interface na Vercel, API na sua máquina.

Na Vercel, ao importar o repositório, defina:

- **Root Directory:** `mvp-matematica/frontend` (sem isso o deploy dá 404, porque a
  raiz do repositório não é um app)
- **Environment Variable:** `VITE_API_URL` com a URL pública da sua API

Para a API da sua máquina ganhar uma URL pública HTTPS, use um túnel — com o
backend já rodando em `npm run dev`:

```bash
npx cloudflared tunnel --url http://localhost:3001
```

Copie a URL `https://....trycloudflare.com` que ele imprime para `VITE_API_URL` e
refaça o deploy. A demo fica no ar enquanto o seu computador e o túnel estiverem
ligados. Apontar `VITE_API_URL` para `http://localhost:3001` também funciona, mas
só no próprio computador que roda o backend.

Antes de expor a API, troque a senha do painel: `SENHA_PROFESSOR=algumacoisa`. Os
dados são de alunos fictícios — não use dados reais de crianças nesta demo.

## Como funciona a personalização

Para cada par (aluno, habilidade) guardamos um único número, **P(L)**: a
probabilidade estimada de que a criança domine aquela habilidade. Todo aluno novo
começa com P(L) = 0,3 em todas as 4 habilidades. A cada resposta, P(L) daquela
habilidade é recalculado pela fórmula do **Bayesian Knowledge Tracing**, que pondera
o acerto ou erro pela chance de chute (P(G) = 0,2) e de distração (P(S) = 0,1), e
depois soma a chance de ter aprendido entre uma questão e outra (P(T) = 0,15).

A escolha da próxima questão é **determinística e explicável**, em quatro regras:
(1) praticar a primeira habilidade ainda não dominada — P(L) < 0,6 — cujos
pré-requisitos já estão dominados; (2) se tudo já foi dominado, reforçar a
habilidade mais frágil; (3) dentro da habilidade, pegar a questão cuja dificuldade
(1 a 3) mais se aproxima do P(L) atual, sem repetir a última respondida; (4) após
3 erros seguidos na mesma habilidade, voltar para a dificuldade 1 independentemente
do P(L). A API devolve a regra aplicada junto com a questão — a tela do aluno mostra
isso no bloco "Por que esta questão?", útil para a demonstração.

## Conteúdo

4 habilidades encadeadas por pré-requisito e 20 questões (5 por habilidade,
dificuldade 1 a 3), definidas em `backend/src/seed-data.js`:

```
contagem_ate_10 ─┬─→ adicao_ate_10 ────┬─→ adicao_com_reagrupamento
                 └─→ subtracao_ate_10 ─┘
```

## API

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/alunos` | Lista os alunos de exemplo |
| GET | `/api/habilidades` | Grafo de habilidades + pré-requisitos |
| GET | `/api/alunos/:id/proxima-questao` | Questão recomendada + regra que a escolheu |
| POST | `/api/alunos/:id/respostas` | Body `{ questao_id, resposta_dada }`; corrige e atualiza P(L) |
| GET | `/api/alunos/:id/dominio` | P(L) por habilidade |
| GET | `/api/alunos/:id/historico` | Últimas respostas (`?limite=10`) |
| GET | `/api/professor/painel` | Tudo que o painel precisa; exige header `x-senha-professor` |

## Estrutura

```
mvp-matematica/
├── backend/
│   ├── src/
│   │   ├── seed-data.js   # 4 habilidades, 5 alunos, 20 questões
│   │   ├── db.js          # SQLite + criação do esquema + seed
│   │   ├── bkt.js         # P(L) e seleção da próxima questão (funções puras)
│   │   ├── bkt.test.js    # testes do BKT e das regras de seleção
│   │   ├── routes.js
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/AlunoPage.jsx
│   │   ├── pages/ProfessorPage.jsx
│   │   └── App.jsx
│   └── package.json
└── README.md
```

Para recomeçar do zero, apague `backend/data/mvp.db` e suba a API de novo.

## Fora de escopo nesta versão

Autenticação real, diagnóstico inicial (a bateria que substituiria o P(L) = 0,3
fixo), calibração dos parâmetros do BKT por habilidade ou por aluno, consentimento
parental/LGPD, modo offline e deploy em nuvem. São iterações futuras, não omissões.
