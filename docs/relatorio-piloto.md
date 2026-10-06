# Relatório do piloto: modelo para preencher

Roteiro para o grupo escrever os resultados do piloto no trabalho final. Ele aplica os
achados da pesquisa aplicada sobre plataformas parecidas: o viés de sobrevivência dos
estudos da Khan Academy, a Lei de Goodhart e o loop em que o algoritmo molda os dados
que depois o avaliam. Preencha as seções na ordem: cada uma depende da anterior.

## Checklist antes de entregar

- [ ] O ganho de aprendizagem inclui **todos** os alunos que começaram, não só os que
      completaram as sessões. Se alguém foi excluído, a seção 1 diz quantos e por quê.
- [ ] A acurácia do modelo (seção 4) foi medida **antes** de afirmar que o motor
      funciona. A fórmula do BKT estar certa não prova que P(L) descreve as crianças.
- [ ] Ganho de aprendizagem e engajamento aparecem **lado a lado**, nunca um sem o outro.
- [ ] Os parâmetros do BKT não mudaram durante a coleta. Se mudaram, a versão de cada
      período está declarada (`versao_parametros` nos eventos).
- [ ] As limitações (seção 6) citam o viés de sobrevivência e como o grupo tentou
      evitá-lo.
- [ ] Nenhum texto promete eficácia: a evidência sobre plataformas adaptativas é modesta
      e tem viés de publicação.

## 1. Participantes

Preencha o fluxo inteiro, do convite até o fim. É a resposta direta ao caso da Khan
Academy, cujos estudos reportaram só 4,7% dos participantes.

| Etapa | Alunos | Saíram nesta etapa | Motivo |
|---|---|---|---|
| Convidados | | | |
| Com consentimento do responsável | | | |
| Fizeram o pré-teste | | | |
| Começaram a usar o app (teste rápido) | | | |
| Com dados suficientes (10+ respostas de prática) | | | |
| Fizeram o pós-teste | | | |

O painel do professor mostra a linha "com dados suficientes" no cabeçalho ("X de Y
alunos cadastrados..."). Se a análise usar um subconjunto, justifique o critério
**antes** de olhar os resultados.

## 2. Ganho de aprendizagem

Duas medidas, sempre separadas e com nome diferente:

- **Ganho medido:** pré-teste e pós-teste aplicados fora do app, com o mesmo
  instrumento. É a medida principal. Informe o instrumento, quem aplicou e o
  intervalo entre os dois testes.
- **Ganho estimado pelo modelo:** P(L) atual − P(L0), como aparece no painel. É o
  modelo medindo a si mesmo, então serve só de apoio e nunca substitui o ganho medido.

| Habilidade | Alunos | Ganho medido (média) | Ganho estimado (média) | Tempo até dominar (mediana) | Chegaram ao domínio |
|---|---|---|---|---|---|
| | | | | | N de M que praticaram |

Reporte os alunos que não chegaram ao domínio na mesma tabela. A mediana do tempo
até dominar só existe para quem chegou lá.

## 3. Engajamento

> **Ainda não medido na demo.** Taxa de conclusão de sessão e abandono dependem da
> entidade Sessão, que só existe na arquitetura-alvo. Até lá, informe o que for
> possível medir à parte (por exemplo, respostas por aluno e dias de uso) e declare
> a lacuna.

Engajamento **nunca** aparece sozinho como indicador de sucesso. Um sistema que
empurra questões fáceis aumenta o uso e o acerto sem aumentar a aprendizagem.

| Indicador | Valor | Ao lado de (ganho medido) |
|---|---|---|
| | | |

## 4. Acurácia do modelo

Rode no banco do piloto e guarde a saída em JSON junto com o relatório:

```bash
npm run avaliar-modelo                 # relatório legível
npm run avaliar-modelo -- --json > avaliacao-piloto.json
```

| Medida | Valor | Como ler |
|---|---|---|
| AUC (IC 95%) | | 0,5 é chute. O intervalo precisa ficar inteiro acima de 0,5 |
| Brier / referência | | O Brier precisa ficar abaixo da referência (prever sempre a taxa geral) |
| Calibração | | Em cada faixa, o previsto e o real precisam ser parecidos |
| Versões dos parâmetros | | Mais de uma versão mistura regras diferentes |

Discuta também a tabela **por regra do motor**: como o motor escolhe as questões, uma
regra pode concentrar crianças com perfil parecido e distorcer o resultado geral.
Nos testes com alunos sintéticos, crianças que seguem o BKT dão AUC perto de 0,75 e
crianças que respondem ao acaso, perto de 0,5. É a referência para interpretar o
número real.

## 5. Comparação com o professor

O roadmap prevê comparar a recomendação do motor com a de um professor para os mesmos
alunos. Descreva o protocolo (quantos casos, quem decidiu, se o professor via o P(L)) e
a concordância entre os dois.

## 6. Limitações

Texto de partida, para adaptar aos resultados:

- **Viés de sobrevivência.** Estudos de eficácia de plataformas como a Khan Academy
  reportaram só os alunos que seguiram o programa como recomendado. Para evitar isso,
  reportamos todos os participantes (seção 1) e declaramos cada exclusão.
- **O modelo molda os próprios dados.** O motor decide o que cada criança vê, então os
  dados coletados já refletem as escolhas dele. Cada evento registra a regra que
  serviu a questão, o que permite comparar resultados por regra (seção 4).
- **Parâmetros não calibrados.** P(T), P(S) e P(G) são valores padrão da literatura,
  sem calibração com dados reais desta população.
- **Amostra pequena e respostas dependentes.** O intervalo do AUC supõe respostas
  independentes. Como cada criança responde várias vezes, o intervalo real é mais
  largo.
- **Retenção de curto prazo.** Sem repetição espaçada, as voltas a uma habilidade
  acontecem na mesma sessão. Isso mede interferência de outras habilidades, não
  esquecimento ao longo de dias.
- **Evidência externa modesta.** A literatura sobre sistemas adaptativos tem efeitos
  modestos e viés de publicação. Os resultados de um piloto pequeno não permitem
  afirmar eficácia.
