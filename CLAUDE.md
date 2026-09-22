# CLAUDE.md

Guia para o Claude Code (e para o grupo) trabalhar neste repositório.

## Estado atual

Projeto **em fase de concepção** — ainda não há código. A pasta tem só os dois documentos-fonte:

- `Plataforma_Aprendizagem_Personalizada_Resumo.docx`: pesquisa de mercado, evidências científicas, restrições legais (LGPD/ECA Digital) e modelo de negócio social.
- `Documento_Tecnico_Arquitetura.docx`: ADRs, diagramas C4, modelo de dados, contratos de API, stack, estrutura de pastas e roadmap do MVP.

Os dois documentos são a **fonte da verdade**. Se algo aqui divergir deles, siga os documentos e atualize este arquivo.

Contexto: trabalho de graduação em Engenharia de Software / Ciência da Computação, com foco em empreendedorismo social. Público: o próprio grupo e a banca avaliadora. As decisões precisam ser **defensáveis** (tradeoffs explícitos), não só funcionais.

## O produto em uma frase

Plataforma adaptativa para crianças com dificuldades de aprendizagem. O **MVP é de matemática** (senso numérico/discalculia), com uma trilha só. Ela estima o domínio de cada habilidade da criança e escolhe o próximo exercício como faria um bom professor. O professor vê *onde especificamente* a criança travou.

## Como a personalização funciona (visão do produto)

1. **Diagnóstico inicial:** um "teste rápido" de 10 a 15 itens-âncora variados. Ele inicializa `P(L0)` **por habilidade** (nem zero, nem expert). Resolve o *cold start*.
2. **Régua por habilidade:** cada par (aluno, habilidade) tem uma probabilidade de domínio `P(L)` entre 0 e 1. Ela é atualizada **gradualmente** a cada resposta via Bayesian Knowledge Tracing (BKT).
   - Erro nem sempre é "não sabe": pode ser distração (slip). Acerto nem sempre é "sabe": pode ser chute (guess).
   - Sinais contextuais **da própria atividade** modulam a evidência: tempo de resposta (rápido demais pode ser chute, lento demais indica dificuldade) e uso de dicas.
3. **Escolha do próximo exercício:** regras pedagógicas determinísticas, na ordem de prioridade abaixo.
   1. **Zona de desenvolvimento proximal:** escolhe uma habilidade com `P(L)` abaixo do limiar cujos pré-requisitos diretos já estão acima do limiar (ex.: 0,6).
   2. **Repetição espaçada:** uma habilidade dominada e sem prática há tempo recebe um item de reforço.
   3. **Scaffolding:** depois de **2 erros seguidos** na mesma habilidade, o sistema **não avança**. Ele dá uma dica, quebra o item em subetapas ou volta um passo no grafo.
   4. **Progressão:** com sucesso consistente, sobe a dificuldade **dentro da mesma habilidade** antes de avançar no grafo.
4. **Mapa de habilidades:** um DAG de pré-requisitos desenhado por conteudistas. O sistema nunca pula etapa.
5. **Painel do professor/família:** mostra `P(L)` por aluno × habilidade, alertas de travamento e o **porquê** de cada recomendação.

## Decisões de arquitetura (ADRs) — não reverter sem discussão

| ADR | Decisão | Motivo principal |
|---|---|---|
| 01 | Conteúdo modelado como **DAG de habilidades**. Itens etiquetados com 1+ habilidades | Sem o grafo, BKT e o motor de recomendação não têm base |
| 02 | **BKT**, não Deep Knowledge Tracing | Poucos dados no piloto; precisa ser explicável ao professor e auditável |
| 03 | Motor de recomendação **por regras**, não ML | Testável, defensável na banca, sem caixa-preta |
| 04 | **Monólito modular**: um app Next.js | Evita overengineering. As fronteiras ficam em pastas/módulos, prontas para extrair depois |
| 05 | Perfilamento **contextual/pedagógico, nunca comportamental** | LGPD art. 14 + ECA Digital (Lei 15.211, em vigor desde 17/03/2026) |
| 06 | Cliente **offline-first** com sincronização posterior | Escolas públicas com conectividade instável |

Consequências práticas para o código:

- Não introduzir modelos de ML opacos, filas de mensagens (Redis/SQS) nem microserviços no MVP.
- Não usar sinais externos à atividade pedagógica (uso fora do app, dados de terceiros). Nada de publicidade. Nada de otimizar engajamento ou tempo de tela: o motor otimiza **domínio de habilidade**.

## Modelo do aluno (BKT)

Parâmetros por (aluno, habilidade): `p_l` (domínio atual), `p_t` (aprender), `p_s` (slip), `p_g` (guess). `P(L0)` vem do diagnóstico.

```
correto:   P(L|obs) = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
incorreto: P(L|obs) = P(L)S     / [P(L)S     + (1-P(L))(1-G)]
P(L_next) = P(L|obs) + (1 - P(L|obs)) * T
```

Regras de implementação:

- Implementar a fórmula em **TypeScript**, como **funções puras** (poucas linhas; pyBKT só como referência teórica). Testar com **alunos sintéticos** antes de integrar (Fase 2).
- `P(S)`/`P(G)` **não são globais**. Primeiro calibre por habilidade com dados agregados. Só depois personalize por subgrupo ou criança.
- Tempo de resposta e dicas ajustam a *força da evidência* de cada observação (ex.: `S`/`G` efetivos por evento). A regra exata ainda **não está especificada** nos documentos. Decida, documente como ADR e teste.
- **Eventos são append-only** com timestamp local. `P(L)` nunca é sobrescrito diretamente: é sempre **recalculável a partir da sequência ordenada de eventos**. Isso resolve conflitos de sincronização offline.

## Modelo de dados (MVP — 7 entidades)

- **Aluno**: `id`, `pseudonimo`, `config_acessibilidade`, `responsavel_id`
- **Habilidade**: `id`, `nome`, `pre_requisitos[]`
- **Item** (exercício): `id`, `habilidades[]` (N:M), `dificuldade`, `modalidade`
- **Sessão**: `id`, `aluno_id`, `inicio`/`fim`, `dispositivo`
- **Evento de Interação**: `id`, `sessao_id`, `aluno_id`, `item_id`, `correto`, `tempo_resposta_ms`, `hints_usados`, `finalidade` (sempre `pedagogica`)
- **Domínio** (aluno × habilidade = o "modelo do aluno"): `aluno_id`, `habilidade_id`, `p_l`, `p_t`, `p_s`, `p_g`, `atualizado_em`
- **Consentimento**: `id`, `responsavel_id`, `aluno_id`, `escopo`, `data`

Banco: **PostgreSQL** (JSONB para listas como `pre_requisitos`).

## API REST (MVP)

Todas as rotas exigem autenticação. Rotas que tocam dados do aluno exigem **consentimento válido registrado**.

| Método | Rota | Uso |
|---|---|---|
| POST | `/consentimentos` | Registra consentimento do responsável. Bloqueia qualquer coleta anterior |
| POST | `/sessoes` | Abre sessão de uso |
| POST | `/diagnostico/{aluno_id}` | Resultados do teste inicial → `P(L0)` |
| POST | `/eventos` | Registra resposta e dispara a atualização de `P(L)` |
| GET | `/alunos/{id}/proximo-item` | Próximo exercício recomendado |
| GET | `/alunos/{id}/dominio` | `P(L)` por habilidade (painel) |
| GET | `/habilidades` | Grafo de habilidades + pré-requisitos |

Fluxo: App → API → Modelo do Aluno (atualiza `P(L)`) → Motor de Recomendação (aplica regras) → Conteúdo (seleciona o item por habilidade-alvo e dificuldade) → App.

## Stack

**Decidido: Next.js full-stack em TypeScript** (App Router). Isso substitui a escolha NestJS × FastAPI do documento técnico. Registre como ADR-07 em `docs/adr/`.

- **Front-end e backend no mesmo app Next.js.** A API REST da seção acima é implementada como Route Handlers (`app/api/**/route.ts`), mantendo os mesmos caminhos e contratos.
- **App da criança:** PWA offline-first (service worker + fila local de eventos em IndexedDB).
- **BKT e motor de recomendação:** TypeScript puro, sem dependência de Next. Assim dá para testar isoladamente (Vitest) e extrair depois, se precisar.
- **Validação de contratos:** schemas compartilhados (ex.: Zod) entre cliente e Route Handlers.
- **Banco:** PostgreSQL. **Local:** `docker-compose.yml` só com o Postgres.
- **Hospedagem do piloto:** Vercel (app) + Postgres gerenciado. Ou um servidor único (Railway/Render), como diz o documento.

## Estrutura de pastas planejada (monorepo)

Pela ADR-04, é **um único app Next.js**. As fronteiras dos containers do diagrama C4 viram módulos em `src/modules/`.

```
src/
  app/
    (crianca)/               # telas do app da criança (PWA)
    (painel)/                # painel professor/família
    api/                     # Route Handlers: /sessoes, /eventos, /alunos/[id]/..., etc.
  modules/
    modelo-aluno/            # BKT — funções puras + persistência de Domínio
    motor-recomendacao/      # as 4 regras pedagógicas — funções puras
    conteudo/                # banco de itens + grafo de habilidades
    consentimento/           # auth + consentimento parental (LGPD art. 14)
  lib/                       # db, schemas compartilhados, utilitários
data/seeds/                  # grafo inicial + itens de exemplo
docs/adr/                    # um arquivo por ADR
docs/diagramas/
```

Respeite as fronteiras entre módulos. O motor de recomendação lê `P(L)` e não calcula BKT. O modelo do aluno não escolhe itens. Route Handlers só orquestram: a lógica de domínio fica em `modules/`.

## Grafo de habilidades — trilha de matemática (RASCUNHO)

⚠️ Proposta inicial para os conteudistas revisarem. Os documentos só trazem um exemplo de alfabetização, que aparece aqui adaptado para senso numérico.

```
Subitização (reconhecer até 4–5 sem contar) ─┐
Contagem / sequência numérica ───────────────┼─→ Correspondência número–quantidade ─→ Comparação de quantidades
Correspondência um a um ─────────────────────┘                  │
Reconhecimento de numerais (0–20) ──────────────────────────────┘
Correspondência número–quantidade ─→ Composição/decomposição até 10 ─→ Soma até 10 ─→ Subtração até 10
Soma até 10 + Subtração até 10 ─→ Valor posicional (dezena/unidade) ─→ Soma e subtração até 20
```

## Roadmap do MVP

1. **Fundação:** grafo (trilha de matemática), itens iniciais, esquema do banco.
2. **Núcleo estatístico:** BKT isolado + testes com alunos sintéticos.
3. **Motor de recomendação:** as 4 regras, com casos de teste **por regra**.
4. **API + persistência:** endpoints ligados ao Postgres.
5. **Cliente:** app da criança simplificado + painel básico. Fluxo ponta a ponta demonstrável.
6. **Piloto:** grupo pequeno real, com pré/pós-teste, comparado com a recomendação manual de um professor.

## Privacidade por design (checklist para todo código novo)

- [ ] Coleta mínima: o evento guarda só o que o BKT usa (correto, tempo, dicas).
- [ ] Pseudônimo em vez de identificador direto.
- [ ] Nenhuma coleta sem consentimento registrado.
- [ ] `finalidade: pedagogica` em todo evento.
- [ ] Criptografia em trânsito e em repouso. Análises agregadas só com dados pseudonimizados.
- [ ] Nada de dados reais de crianças antes de revisar a conformidade com o professor ou um jurista.

## Convenções

- Domínio, entidades, rotas e comentários em **português** (como nos documentos): `aluno`, `habilidade`, `dominio`, `proximo-item`.
- Priorize **explicabilidade**: toda recomendação deve poder retornar a regra que a disparou e os valores de `P(L)` envolvidos (o painel precisa disso).
- Testes unitários obrigatórios para as fórmulas do BKT e para cada regra do motor.
- Mudou uma decisão arquitetural? Registre um novo ADR em `docs/adr/` (Contexto → Decisão → Alternativas → Consequências).
- Não prometa eficácia garantida em textos do produto: a evidência científica é modesta e tem viés de publicação.

## Decisões em aberto

- Como tempo de resposta e dicas modulam `S`/`G` (limiares de "rápido demais" e "lento demais", peso da dica). **Ainda sem definição.** Até lá, implemente com parâmetros configuráveis e sem valores fixos no código.
- Valores de limiar: domínio (ex.: 0,6 para pré-requisito; outro, talvez maior, para "dominado") e intervalo da repetição espaçada.
- Validação do grafo de matemática pelos conteudistas.
- Composição do diagnóstico inicial (quais 10–15 itens, quantos por habilidade).
- Estratégia de sincronização offline entre múltiplos dispositivos da mesma criança.
