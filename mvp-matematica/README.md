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

- **`/`**: página institucional (o que é, como a personalização funciona, para quem,
  privacidade e limites da evidência). Tem um simulador da régua de domínio (BKT) que
  não usa a API.
- **`/aluno`**: escolha um dos 5 perfis (ou cadastre um apelido novo) e responda às
  questões. Sem login. Todo aluno começa pelo **teste rápido** de 8 questões.
- **`/professor`**: senha padrão **`professor123`** (ou o valor de `SENHA_PROFESSOR`
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

Se ele ficar repetindo `Failed to dial a quic connection`, a sua rede bloqueia UDP
(comum em redes de faculdade e empresa). Force o túnel por TCP:

```bash
npx cloudflared tunnel --protocol http2 --url http://localhost:3001
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

**5. Auditoria do próprio modelo.** Como o motor decide o que a criança vê, os dados
já nascem enviesados por ele. Por isso cada evento grava também a versão dos
parâmetros do BKT em vigor (`versao_parametros`, hoje `v1`), a dificuldade da questão
servida e a regra do motor que a escolheu (`null` se a criança respondeu uma questão
que não era a recomendada). Mudou `PARAMETROS`, `LIMITES_P_L0` ou um `bkt` do seed?
Troque `VERSAO_PARAMETROS` em `bkt.js`: o teste `bkt.test.js` falha até a versão nova
ser registrada, e assim P(L) de regras diferentes não se misturam sem ninguém
perceber.

## Métricas do painel

Vêm da pesquisa aplicada sobre plataformas parecidas (Khan Academy, Duolingo, ALEKS e
outras). São funções puras em `backend/src/metricas.js`: não atualizam P(L) nem
escolhem questões. A regra geral é **nenhuma métrica sozinha** (Lei de Goodhart):
acertar muito em questões fáceis demais não é aprender.

- **Transparência da amostra.** O painel sempre mostra "X de Y alunos cadastrados têm
  dados suficientes para análise". O mínimo são **10 respostas de prática**, e o teste
  rápido não conta: com ele, quem fez o teste e mais 2 questões já entraria. É a
  resposta ao viés de sobrevivência dos estudos da Khan Academy, que reportaram só
  4,7% dos participantes.
- **Domínio confirmado.** "Dominada ✓" só com P(L) ≥ 0,6 **e** 2 acertos seguidos na
  prática da habilidade. Cruzar o limiar uma vez pode ser sorte (de 0,3, um único
  acerto leva a 0,71), e P(L) pode continuar acima de 0,6 logo depois de um erro.
  Acima do limiar sem os acertos seguidos aparece "a confirmar". Os acertos seguidos
  são derivados dos eventos, como os erros seguidos: nada é gravado.
  **O motor não mudou**: ele continua decidindo pelo P(L). Se usasse o domínio
  confirmado, nenhuma habilidade estaria dominada logo depois do teste rápido, e a
  criança que acertou tudo voltaria para a contagem.
- **Ganho estimado.** P(L) atual − P(L0), com seta ↑/↓. É o modelo medindo a si
  mesmo, por isso o nome "estimado": o ganho de verdade vem do pré/pós-teste do
  piloto.
- **Últimas 10 respostas** da habilidade, ao lado do **acerto previsto** pelo modelo
  para essas mesmas respostas (média de P(L)(1−S) + (1−P(L))G com o P(L) de antes de
  cada uma).
- **Divergência ("longe do previsto").** Alerta quando a taxa recente se afasta mais
  de **0,3** do acerto previsto, com pelo menos **5** respostas. Pode ser chute,
  distração ou um P(L) mal calibrado (por exemplo, um teste rápido que superestimou a
  criança). Não comparamos a taxa com o P(L) atual, como seria o mais óbvio: são
  unidades diferentes (quem não sabe ainda acerta 20% no chute), e o P(L) atual
  depende muito da última resposta. Numa simulação, essa comparação disparava para
  12% a 28% das crianças com desempenho estável. A comparação com o previsto fica
  perto de 0% nesses casos e só dispara quando o modelo errou de forma consistente.
  Se a habilidade já travou, o painel mostra só o travamento, para não repetir o
  alerta.

Os limiares (2 acertos, 10 respostas, 0,3 e 5) são **provisórios**, sem validação
pedagógica. São constantes no topo de `metricas.js`.

Não há XP, sequência de dias nem ranking, e isso é intencional: no Duolingo, XP fixo
por resposta faz repetir o fácil, e a sequência de dias gera ansiedade. Se um dia
houver pontos, eles devem ser proporcionais ao ganho de P(L) da resposta, nunca um
valor fixo.

## Interface

O conceito visual é o **caderno quadriculado** de matemática, e as quantidades aparecem
como as **fichas** do material concreto da sala de aula. O nome **Quadriculado** é
provisório e fica numa constante só (`MARCA`, em `frontend/src/lib/textos.js`).

**Área da criança**

- **A questão vira material concreto** (`lib/representacao.js`). O frontend interpreta
  o texto do enunciado (o seed não muda): figuras viram objetos que dá para tocar e
  numerar, sequências viram casas com uma vazia e contas viram `a + b = ?`. Um enunciado
  que não casa com nenhum padrão aparece como texto puro.
- **O material de apoio só aparece no scaffolding**: quadros de dez para soma e
  subtração e trilha numérica para "depois do N". Se ele aparecesse sempre, a criança
  acertaria contando as fichas, e o BKT leria esse acerto como domínio da conta.
  Na soma que passa de 10, a segunda cor completa o primeiro quadro antes de ir para o
  próximo, que é a estratégia "complete o 10" das dicas. O apoio continua visível
  depois da resposta, porque é ali que ele explica o erro.
- **Tocar nas figuras para contar está sempre liberado**. Equivale a apontar com o
  dedo e não revela a resposta.
- **Leitura em voz alta** com a Web Speech API do navegador (`lib/fala.js`): nada vai
  para um serviço externo. Os símbolos são lidos como uma professora leria ("3 menos
  1 é igual a quanto?").
- **Ajustes de leitura** por criança, salvos só no `localStorage` daquele aparelho
  (`lib/preferencias.js`): tamanho da letra, tipo de letra, espaçamento extra (valores
  do WCAG 1.4.12), tela calma (sem animação nem quadriculado) e leitura automática.
  A evidência a favor de "fontes para dislexia" é fraca. O espaçamento extra tem um
  pouco mais de apoio (Zorzi et al., 2012), ainda que modesto, e por isso é uma opção à
  parte.
- **Sem vermelho de erro, sem cronômetro, sem ranking**. Errar mostra a resposta certa
  em lilás ("Quase!"). No teste rápido não há certo nem errado, só "Anotado!".
- **"Bastidores"** (recolhido) mostra a regra, o P(L) e o motivo de cada questão, para
  a apresentação.

**Painel do professor**: quantos alunos têm dados para análise, alertas de travamento e
de divergência no topo, matriz aluno × habilidade (P(L), limiar, ponto de partida do
teste rápido, estado e ganho) e, para o aluno selecionado, a próxima recomendação com a
regra e o motivo, a tabela "habilidade por habilidade" (domínio, ganho e últimas 10 lado
a lado), o mapa de pré-requisitos com o P(L) em cada nó e as últimas respostas. A
recomendação vem de `GET /proxima-questao`, que não grava nada. A matriz fica na ordem
de cadastro, nunca ordenada por desempenho.

**Fontes auto-hospedadas** (`@fontsource`, sem Google Fonts): nenhum acesso de criança
passa por terceiros, e o app fica mais perto do offline-first. Andika (SIL, feita para
leitores iniciantes) na área da criança e Atkinson Hyperlegible Next nas telas de
adulto. Os numerais são sempre os da Andika, então o professor vê os números com a
mesma forma que a criança.

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
| GET | `/api/alunos/:id/dominio` | Por habilidade: P(L), P(L0), ganho, domínio confirmado, últimas respostas com o acerto previsto e alertas. Mais o progresso do teste rápido |
| GET | `/api/alunos/:id/historico` | Últimas respostas (`?limite=10`), com a regra e a dificuldade de cada uma |
| GET | `/api/professor/painel` | Tudo que o painel precisa, incluindo `amostra` (`total`, `com_dados`, `minimo`) e `versao_parametros`; exige header `x-senha-professor` |

## Estrutura

```
mvp-matematica/
├── backend/
│   ├── src/
│   │   ├── seed-data.js   # 4 habilidades, 5 alunos, 20 questões
│   │   ├── db.js          # SQLite: esquema, migração, seed e eventos
│   │   ├── bkt.js         # modelo do aluno: BKT, P(L0) e recálculo a partir dos eventos
│   │   ├── motor.js       # motor de recomendação: diagnóstico + 4 regras
│   │   ├── metricas.js    # métricas do painel: domínio confirmado, ganho, divergência, amostra
│   │   ├── *.test.js      # testes do BKT, de cada regra, das métricas e com alunos sintéticos
│   │   ├── routes.js
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/         # InicioPage, AlunoPage, ProfessorPage
│   │   ├── components/    # questão e material de apoio, ajustes, mapa de habilidades…
│   │   ├── lib/           # representacao.js, fala.js, preferencias.js, textos.js
│   │   ├── styles/        # base (tokens), inicio, crianca, professor
│   │   └── App.jsx
│   └── package.json
└── README.md
```

Para recomeçar do zero, apague `backend/data/mvp.db` e suba a API de novo. Um banco
de versão anterior (com a tabela `dominio`, ou com eventos sem as colunas de
auditoria) é recriado automaticamente na primeira execução. Como os dados são
fictícios, nada é migrado: as respostas já dadas se perdem.

## Fora de escopo nesta versão

Autenticação real, consentimento parental/LGPD, calibração dos parâmetros do BKT com
dados reais, uso do tempo de resposta e das dicas como força da evidência (decisão
ainda em aberto), repetição espaçada, progressão de dificuldade por sucesso
consistente, modo offline e deploy em nuvem. Das métricas da pesquisa aplicada, ainda
faltam tempo até o domínio, retenção (depende da repetição espaçada), acurácia do
modelo (AUC e calibração, obrigatória antes de apresentar resultados do piloto) e
engajamento (depende da entidade Sessão). São iterações futuras, não omissões.
