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
  questões. Sem login. Todo aluno começa pelo **teste rápido** (até 11 questões).
- **`/professor`**: senha padrão **`professor123`** (ou o valor de `SENHA_PROFESSOR`
  no ambiente do backend). O painel se atualiza sozinho a cada 3 segundos.

Testes do núcleo estatístico:

```bash
npm test           # da raiz (ou dentro de backend/)
```

Acurácia do modelo sobre o banco local (ver "Acurácia do modelo" abaixo):

```bash
npm run avaliar-modelo            # da raiz (ou dentro de backend/)
npm run avaliar-modelo -- --json  # o mesmo relatório em JSON
```

## Publicar online na Vercel (interface + API + banco)

Tudo roda na Vercel, sem nada ligado no seu computador. O `vercel.json` desta pasta
declara dois **serviços** que saem juntos no mesmo deploy e no mesmo endereço: a
**interface** (Vite, em `frontend/`) e a **API** (Express, em `backend/`, entrada
`src/app.js`, que vira uma Vercel Function). Tudo que começa com `/api` vai para a
API; o resto, para a interface.

Os dados ficam num **Postgres da Neon**. A API escolhe o banco sozinha: com a
variável `DATABASE_URL`, usa o Postgres; sem ela, o SQLite local de sempre. Por
isso `npm run dev` continua funcionando offline e sem configurar nada. Num deploy da
Vercel sem `DATABASE_URL`, a API responde com um erro explicando que falta conectar
o banco (SQLite lá perderia os dados, porque o disco das Functions é temporário).

Passo a passo, uma vez só:

1. **Root Directory:** no projeto da Vercel, em *Settings → Build and Deployment*,
   troque o Root Directory de `mvp-matematica/frontend` para **`mvp-matematica`**
   (onde está o `vercel.json`). Deixe o Framework Preset como a Vercel detectar.
2. **Banco:** em *Storage* (ou *Marketplace*), crie um banco **Neon** e conecte ao
   projeto, marcando os ambientes Production e Preview. A integração cria a
   `DATABASE_URL` sozinha.
3. **Variáveis de ambiente** (*Settings → Environment Variables*):
   - **apague `VITE_API_URL`**, que apontava para o túnel. Agora a interface chama
     `/api` no próprio endereço;
   - crie **`SENHA_PROFESSOR`** com uma senha sua (sem ela, vale `professor123`).
4. **Deploy:** faça um push (ou *Redeploy*). Confira em
   `https://<seu-projeto>.vercel.app/api/saude`: a resposta deve ser
   `{"ok":true,"banco":"postgres"}`.

Na primeira requisição, a API cria as tabelas e copia o conteúdo do seed para o
banco. Isso se repete só quando `seed-data.js` muda, guiado por um hash do
conteúdo. O banco começa vazio de respostas: o que está no SQLite do seu computador
não é levado. Para rodar a acurácia do modelo contra o banco online, copie a
`DATABASE_URL` da Vercel e rode `DATABASE_URL=... npm run avaliar-modelo`.

O endereço é público: qualquer pessoa com o link vê a lista de apelidos e pode
cadastrar um novo. Para a demonstração, com alunos fictícios, isso é aceitável. Antes
de usar com crianças reais vêm a autenticação e o consentimento (LGPD).

**Desenvolvimento local** continua igual (`npm run dev`, SQLite). O `vercel dev` não
inicia a interface no Windows, porque o comando dele usa `$PORT` e o `cmd` não
expande essa variável. Use o `npm run dev`, ou o `vercel dev` no WSL, macOS ou Linux.

## Como funciona a personalização

Para cada par (aluno, habilidade) o sistema estima um único número, **P(L)**: a
probabilidade de que a criança domine aquela habilidade.

**1. Teste rápido (diagnóstico inicial).** O aluno novo responde **1 item-âncora por
habilidade**, de dificuldade média, na ordem do grafo. Quem erra uma habilidade **não é
perguntado sobre o que depende dela**: se não soma, não faz sentido perguntar sobre soma
passando do 10. Assim o teste tem no máximo 11 itens (dentro dos 10 a 15 do produto) e
fica curto para quem tem mais dificuldade: quem erra as três raízes responde só 3. A
habilidade pulada fica com o P(L0) padrão, sem evidência, e o grafo garante que ela só
será praticada depois dos pré-requisitos. Nessa fase a tela não mostra certo/errado,
porque é medição, não aula. As respostas definem o ponto de partida **P(L0)**:
partindo de 0,3, aplicamos só a parte de evidência do BKT (pondera chute e distração),
sem a chance de aprender, já que o teste não ensina. O resultado fica preso entre
**0,10 e 0,85**. Um acerto leva a 0,66 (acima do limiar) e um erro, a 0,10.

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

**4. Escolha da próxima questão** (`motor.js`): determinística e explicável. Para o
motor, uma habilidade está **consolidada** quando P(L) passou do limiar (0,6) **e** a
criança chegou ao nível mais difícil dela. As regras são consultadas nesta ordem, e a
primeira que se aplica decide:

1. **Scaffolding:** após **2 erros seguidos** na habilidade que estava praticando, a
   criança **não sai dela**: recebe uma questão de dificuldade 1 com a **dica** e o
   material de apoio, e desce um nível na escada. O painel marca a habilidade com ⚠️.
2. **Revisão espaçada:** uma habilidade consolidada que ficou **8 respostas** sem
   aparecer volta para uma revisão, no nível em que está. Cada revisão acertada dobra
   o intervalo (8 → 16 → 32); um erro volta ao primeiro, e a queda de P(L) pode
   devolver a habilidade à trilha. Enquanto há algo novo para aprender, as revisões
   vêm **uma por vez, com 2 respostas de trilha entre elas**: sem isso, as habilidades
   que o teste rápido consolidou juntas venceriam juntas e viriam em bloco. O intervalo
   é medido em respostas, e não em dias, porque na demo tudo acontece em minutos.
3. **Zona proximal e progressão:** a primeira habilidade ainda não consolidada cujos
   pré-requisitos estão consolidados. Dentro dela, a dificuldade segue uma **escada**:
   começa no nível indicado pelo P(L0) (abaixo de 0,4 → 1; até 0,6 → 2; acima → 3) e
   **sobe um nível a cada 2 acertos seguidos** no nível atual. Acertos em questões mais
   fáceis, como as do scaffolding, não contam. Quando P(L) já passou do limiar, mas a
   escada ainda não chegou ao topo, a regra aparece como **progressão**: passar do
   limiar com duas questões fáceis não basta para avançar no grafo.
4. **Reforço:** com tudo consolidado e nenhuma revisão vencida, a habilidade mais
   frágil.

Dentro do nível escolhido, a questão é a que a criança viu há mais tempo (ou nunca
viu), sem repetir a última.

**Divergência em relação ao documento do produto:** lá a zona proximal vem antes da
revisão. Aqui a revisão vencida vem antes porque, do contrário, ela nunca aconteceria
enquanto houvesse algo novo para aprender, e o objetivo dela é justamente intercalar.
O scaffolding vem antes de tudo porque a regra dele é "não avançar": a criança travada
não é tirada da habilidade nem por uma revisão. Quem o teste rápido pôs acima do limiar
começa no topo da escada e não refaz o que mostrou saber. A revisão espaçada confere
isso depois.

A API devolve a regra aplicada junto com a questão, com o nível na escada. A tela do
aluno mostra isso no bloco "Por que esta questão?", útil para a demonstração.

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
- **Tempo até o domínio.** Quantas respostas de prática da habilidade até o primeiro
  domínio confirmado. Perder o domínio depois não muda esse número. No rodapé da
  matriz aparece a **mediana da turma**, sempre acompanhada de "N de M que
  praticaram": o tempo só existe para quem chegou lá, e a mediana sozinha esconderia
  quem não chegou (o mesmo viés de sobrevivência). Usamos mediana e não média porque
  a turma é pequena e um aluno lento puxaria a média.
- **Retenção.** A criança ainda acerta uma habilidade que deixou dominada quando
  volta a ela depois de praticar outras? Conta só a **primeira resposta de cada
  volta**, porque as seguintes já são prática de novo. Só entra quem saiu dominando
  (se a criança errou antes de sair, a volta não mede retenção). Não depende da regra
  que trouxe a criança de volta: hoje é o reforço, depois será a repetição espaçada.
  **Limitação:** na demo as voltas acontecem minutos depois, então isto mede
  resistência à interferência de outras habilidades, ainda não esquecimento ao longo
  de dias. A comparação "taxa no momento do domínio" do documento de pesquisa seria
  sempre 100% (o domínio exige 2 acertos seguidos), então a métrica é só a taxa nas
  voltas.

Os limiares (2 acertos, 10 respostas, 0,3 e 5) são **provisórios**, sem validação
pedagógica. São constantes no topo de `metricas.js`.

### Acurácia do modelo

A fórmula do BKT estar certa não garante que P(L) descreva as crianças. Antes de
apresentar qualquer resultado do piloto, é preciso mostrar que P(L) alto vem antes de
acerto e P(L) baixo vem antes de erro. `npm run avaliar-modelo` faz isso com
`backend/src/avaliacao.js` (funções puras) sobre **todos** os alunos do banco:

- **Previsão:** para cada resposta de prática, P(acerto) = P(L)(1−S) + (1−P(L))G com
  o P(L) de **antes** da resposta. O teste rápido fica de fora, porque é ele que
  define o P(L0).
- **AUC** com intervalo de 95% (Hanley e McNeil): 0,5 é chute, 1 é perfeito. Com
  menos de 5 acertos ou 5 erros o relatório diz "poucos dados" em vez de dar um
  intervalo, que sairia degenerado ("1,00 a 1,00").
- **Brier** contra a referência de prever sempre a taxa geral. Um modelo útil fica
  abaixo dela.
- **Calibração** em 5 faixas: o previsto e o real precisam ser parecidos.
- **Por habilidade e por regra do motor**, usando a regra gravada em cada evento. É
  onde aparece o modelo moldando os próprios dados.
- **Versões dos parâmetros** gravadas nos eventos, com aviso se houver mais de uma.

Os testes com alunos sintéticos (`avaliacao.test.js`) mostram que a métrica distingue
os casos: crianças que se comportam como o BKT supõe dão AUC perto de 0,75, Brier
abaixo da referência e boa calibração. Crianças que respondem ao acaso dão AUC perto
de 0,5 e Brier acima da referência. O intervalo supõe respostas independentes, o que
não vale (cada criança responde várias vezes), então o intervalo real é mais largo.
Abrir o banco aplica a migração de esquema, como subir a API.

O roteiro para escrever os resultados do piloto, com o checklist contra o viés de
sobrevivência, está em [`docs/relatorio-piloto.md`](../docs/relatorio-piloto.md).

### Fora do painel

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
  numerar, os símbolos ⚀–⚅ viram dados desenhados no padrão de sempre (subitização),
  sequências viram casas com uma vazia e contas viram `a + b = ?` ou `a + ? = c`.
  Alternativas que não são números (grupos de figuras, nomes) ganham letra menor. Um
  enunciado que não casa com nenhum padrão aparece como texto puro. No painel do
  professor, os dados aparecem por extenso ("dados: 4 e 3").
- **O material de apoio só aparece no scaffolding**: quadros de dez para soma e
  subtração, casas tracejadas para "quanto falta", o número em quadros cheios (um por
  dezena) no valor posicional e trilha numérica para "depois do N". Se ele aparecesse sempre, a criança
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
teste rápido, estado e ganho) com um rodapé da turma (tempo até dominar e retenção)
e, para o aluno selecionado, a próxima recomendação com a
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

11 habilidades de senso numérico encadeadas por pré-requisito e 88 questões (8 por
habilidade: 3 de dificuldade 1, 3 de 2 e 2 de 3, todas com dica), definidas em
`backend/src/seed-data.js`. O grafo segue o rascunho do `CLAUDE.md` e **ainda precisa
da validação dos conteudistas**:

```
subitizacao ─────┐
contagem_ate_10 ─┼─→ numero_quantidade ─┬─→ comparacao
numerais_ate_20 ─┘                      └─→ composicao_ate_10 ─→ adicao_ate_10 ─→ subtracao_ate_10

adicao_ate_10 + subtracao_ate_10 ─→ valor_posicional ─┬─→ adicao_com_reagrupamento (até 20)
                                                      └─→ subtracao_com_reagrupamento (até 20)
```

Ficou de fora a correspondência um a um do rascunho: em múltipla escolha, sem
arrastar objetos, ela se confunde com contagem. Na subitização, sem tempo de exibição
na tela, não dá para impedir que a criança conte; os padrões de dado favorecem o
reconhecimento. Ao escrever questões, evite "mais" em frases com dois números que não
são soma: o parser da interface lê isso como adição e mostraria o apoio errado.

## API

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/saude` | `{ ok, banco }`: confirma que a API subiu e qual banco está em uso (`postgres` ou `sqlite`) |
| GET | `/api/alunos` | Lista os alunos |
| POST | `/api/alunos` | Body `{ nome }` (apelido, até 30 caracteres); cria um aluno novo |
| GET | `/api/habilidades` | Grafo de habilidades + pré-requisitos |
| GET | `/api/alunos/:id/proxima-questao` | Item do teste rápido ou questão recomendada, com a regra que a escolheu |
| POST | `/api/alunos/:id/respostas` | Body `{ questao_id, resposta_dada }`; registra o evento e devolve o P(L) antes/depois. Durante o teste rápido, responde 409 se a questão não for a atual |
| GET | `/api/alunos/:id/dominio` | Por habilidade: P(L), P(L0), ganho, domínio confirmado, últimas respostas com o acerto previsto, tempo até o domínio, retenção e alertas. Mais o progresso do teste rápido |
| GET | `/api/alunos/:id/historico` | Últimas respostas (`?limite=10`), com a regra e a dificuldade de cada uma |
| GET | `/api/professor/painel` | Tudo que o painel precisa, incluindo `amostra` (`total`, `com_dados`, `minimo`), `turma` (tempo até o domínio e retenção por habilidade) e `versao_parametros`; exige header `x-senha-professor` |

## Estrutura

```
mvp-matematica/
├── backend/
│   ├── src/
│   │   ├── seed-data.js   # 11 habilidades, 5 alunos, 88 questões
│   │   ├── bkt.js         # modelo do aluno: BKT, P(L0) e recálculo a partir dos eventos
│   │   ├── motor.js       # motor: teste rápido, scaffolding, revisão, zona proximal/progressão, reforço
│   │   ├── metricas.js    # métricas do painel: domínio confirmado, ganho, divergência, tempo até o domínio, retenção, amostra
│   │   ├── avaliacao.js   # acurácia do modelo: AUC, Brier, calibração, por habilidade e por regra
│   │   ├── *.test.js      # testes do BKT, de cada regra, das métricas, da avaliação e com alunos sintéticos
│   │   ├── routes.js      # rotas da API (assíncronas)
│   │   ├── app.js         # o app Express; a entrada que a Vercel roda
│   │   ├── server.js      # só para rodar localmente (app.listen)
│   │   ├── repositorio.js # escolhe o banco: Postgres com DATABASE_URL, SQLite sem
│   │   ├── db-sqlite.js   # SQLite local
│   │   ├── db-postgres.js # Postgres (Neon); testado com PGlite
│   │   └── conteudo.js    # habilidades e questões servidas do seed
│   ├── scripts/
│   │   └── avaliar-modelo.js  # relatório de acurácia sobre o banco da API
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/         # InicioPage, AlunoPage, ProfessorPage
│   │   ├── components/    # questão e material de apoio, ajustes, mapa de habilidades…
│   │   ├── lib/           # representacao.js, fala.js, preferencias.js, textos.js
│   │   ├── styles/        # base (tokens), inicio, crianca, professor
│   │   └── App.jsx
│   └── package.json
├── vercel.json            # deploy: serviços interface + api no mesmo endereço
└── README.md
```

Para recomeçar do zero, apague `backend/data/mvp.db` e suba a API de novo. Um banco
de versão anterior (com a tabela `dominio`, ou com eventos sem as colunas de
auditoria) é recriado automaticamente na primeira execução. Como os dados são
fictícios, nada é migrado: as respostas já dadas se perdem.

## Fora de escopo nesta versão

Autenticação real, consentimento parental/LGPD, calibração dos parâmetros do BKT com
dados reais, uso do tempo de resposta e das dicas como força da evidência (decisão
ainda em aberto), revisão espaçada medida em dias (hoje é em respostas) e modo
offline. Das métricas da pesquisa aplicada, ainda falta o engajamento (conclusão de
sessão e abandono), que depende da entidade Sessão. São iterações futuras, não
omissões.
