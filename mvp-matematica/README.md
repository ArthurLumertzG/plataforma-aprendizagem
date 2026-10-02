# MVP — Matemática adaptativa (1º ao 3º ano)

Demonstração enxuta de personalização por habilidade: o sistema estima o quanto
cada criança domina cada habilidade e escolhe a próxima questão a partir disso.
Roda inteiro na máquina local, sem Docker e sem nuvem.

## Como rodar

Da **raiz do repositório**, um terminal só:

```bash
npm install        # instala a raiz, o backend e o frontend
npm run dev        # sobe a API (http://localhost:3001) e a interface (http://localhost:5173)
```

Na primeira execução a API cria e popula `backend/data/mvp.db`. Os logs saem no mesmo
terminal, prefixados com `[api]` e `[web]`. Ctrl+C derruba os dois, e se um cair o
outro também é encerrado.

Se preferir separado, rode `npm install` e `npm run dev` em `backend/` e em
`frontend/`, cada um no seu terminal.

Depois abra <http://localhost:5173>:

- **`/aluno`** — escolha um dos 5 perfis (ou cadastre um apelido novo) e responda as
  questões. Sem login. Todo aluno começa pelo **teste rápido** de 8 questões.
- **`/professor`** — senha padrão **`professor123`** (ou o valor de `SENHA_PROFESSOR`
  no ambiente do backend). O painel se atualiza sozinho a cada 3 segundos.

Testes do núcleo estatístico:

```bash
npm test           # da raiz (ou dentro de backend/)
```

## Publicar a interface na Vercel (opcional)

O backend usa SQLite em arquivo, então **ele não roda na Vercel** (o filesystem das
Functions é efêmero). O arranjo possível é: interface na Vercel, API na sua máquina.

Na Vercel, ao importar o repositório, defina:

- **Root Directory:** `mvp-matematica/frontend` (sem isso o deploy dá 404, porque a
  raiz do repositório não é um app)
- **Environment Variable:** `VITE_API_URL` com a URL pública da sua API

O resto (framework Vite, `npm run build`, saída em `dist` e o rewrite da SPA) já está em
`frontend/vercel.json`. Salve esse arquivo **sem BOM**: a Vercel recusa um `vercel.json` com BOM
como inválido. Sem `VITE_API_URL`, a interface abre, mas mostra o aviso de que a API não
respondeu JSON.

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

Para cada par (aluno, habilidade) o sistema estima um único número, **P(L)**: a
probabilidade de que a criança domine aquela habilidade.

**1. Teste rápido (diagnóstico inicial).** O aluno novo responde 8 itens-âncora, 2 por
habilidade (um de dificuldade 1 e um de dificuldade 2), sempre na mesma ordem. Nessa
fase a tela não mostra certo/errado, porque é medição, não aula. As respostas definem o
ponto de partida **P(L0)** de cada habilidade: partindo de 0,3, aplicamos só a parte
de evidência do BKT (pondera chute e distração), sem a chance de aprender, já que o
teste não ensina. O resultado fica preso entre **0,10 e 0,85**: com 2 itens não dá
para cravar que a criança domina ou desconhece a habilidade. Sem o teste, toda
criança começaria em 0,3, e quem já sabe somar teria de provar isso de novo.

**2. Atualização a cada resposta.** Na prática, P(L) da habilidade é recalculado pela
fórmula do **Bayesian Knowledge Tracing**, que pondera o acerto ou erro pela chance de
chute (P(G) = 0,2) e de distração (P(S) = 0,1), e depois soma a chance de ter aprendido
entre uma questão e outra (P(T) = 0,15). Cada habilidade pode sobrescrever esses
valores no campo `bkt` de `seed-data.js`. Hoje nenhuma sobrescreve, porque ainda não
há dados para calibrar.

> Efeito esperado do modelo, útil para a banca: com P(L) muito baixo, **um erro pode
> subir P(L) levemente** (ex.: 0,10 → 0,16). A evidência do erro quase não muda uma
> estimativa que já era baixa, e P(T) soma a chance de a criança ter aprendido com a
> tentativa. Não é bug, é o BKT padrão.

**3. P(L) nunca é gravado.** O banco guarda só **eventos append-only** (cada resposta,
marcada como `diagnostico` ou `pratica`, com `finalidade = 'pedagogica'`). O domínio
é sempre recalculado repassando os eventos em ordem (`recalcularDominio` em
`bkt.js`). Assim os eventos são a única fonte da verdade, o histórico do painel mostra
o P(L) antes → depois de cada resposta sem duplicar dados e, quando houver modo
offline, sincronizar vira "juntar listas de eventos e recalcular".

**4. Escolha da próxima questão** (`motor.js`): determinística e explicável.

1. **Zona proximal:** a primeira habilidade ainda não dominada (P(L) < 0,6) cujos
   pré-requisitos já estão dominados.
2. **Reforço:** se tudo já foi dominado, a habilidade mais frágil.
3. **Dificuldade:** dentro da habilidade, a questão cuja dificuldade (1 a 3) mais se
   aproxima do P(L) atual, sem repetir a última respondida.
4. **Scaffolding:** após **2 erros seguidos** na mesma habilidade, volta para a
   dificuldade 1 e **mostra a dica** da questão. O painel do professor marca a
   habilidade com ⚠️.

A API devolve a regra aplicada junto com a questão. A tela do aluno mostra isso no
bloco "Por que esta questão?", útil para a demonstração.

## Conteúdo

4 habilidades encadeadas por pré-requisito e 20 questões (5 por habilidade,
dificuldade 1 a 3, cada uma com uma dica), definidas em `backend/src/seed-data.js`:

```
contagem_ate_10 ─┬─→ adicao_ate_10 ────┬─→ adicao_com_reagrupamento
                 └─→ subtracao_ate_10 ─┘
```

## API

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/alunos` | Lista os alunos |
| POST | `/api/alunos` | Body `{ nome }` (apelido, até 30 caracteres); cria um aluno novo |
| GET | `/api/habilidades` | Grafo de habilidades + pré-requisitos |
| GET | `/api/alunos/:id/proxima-questao` | Item do teste rápido ou questão recomendada, com a regra que a escolheu |
| POST | `/api/alunos/:id/respostas` | Body `{ questao_id, resposta_dada }`; registra o evento e devolve o P(L) antes/depois. Durante o teste rápido, responde 409 se a questão não for a atual |
| GET | `/api/alunos/:id/dominio` | P(L), P(L0) e alerta de travamento por habilidade + progresso do teste rápido |
| GET | `/api/alunos/:id/historico` | Últimas respostas (`?limite=10`) |
| GET | `/api/professor/painel` | Tudo que o painel precisa; exige header `x-senha-professor` |

## Estrutura

```
mvp-matematica/
├── backend/
│   ├── src/
│   │   ├── seed-data.js   # 4 habilidades, 5 alunos, 20 questões
│   │   ├── db.js          # SQLite: esquema, migração, seed e eventos
│   │   ├── bkt.js         # modelo do aluno: BKT, P(L0) e recálculo a partir dos eventos
│   │   ├── motor.js       # motor de recomendação: diagnóstico + 4 regras
│   │   ├── *.test.js      # testes do BKT, de cada regra e com alunos sintéticos
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

Para recomeçar do zero, apague `backend/data/mvp.db` e suba a API de novo. Um banco
da versão anterior (com a tabela `dominio`) é recriado automaticamente na primeira
execução. Como os dados são fictícios, nada é migrado.

## Fora de escopo nesta versão

Autenticação real, consentimento parental/LGPD, calibração dos parâmetros do BKT com
dados reais, uso do tempo de resposta e das dicas como força da evidência (decisão
ainda em aberto), repetição espaçada, progressão de dificuldade por sucesso
consistente, modo offline e deploy em nuvem. São iterações futuras, não omissões.
