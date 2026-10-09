# jev-pr-reviewer

CLI local para analisar o diff de um Pull Request / Merge Request, obter decisões estruturadas via JEV (TypeSafe) e aplicar uma política de risco determinística no código da aplicação.

Objetivo do experimento: separar o que o modelo decide (confiança) do que a aplicação decide (pontuação, nível de risco e ação APPROVE / REVIEW / BLOCK).

<br>

## Por que JEV?

JEV (TypeSafe) responde as perguntas estruturadas sobre o diff, por exemplo:

- há impacto de segurança?
- há mudança de banco?
- há impacto de API?
- há impacto de autenticação?

Cada resposta vem com `yes`/`no` e uma confiança (0–1).

O modelo **não** define pesos, faixas nem se o PR deve ser aprovado. Isso fica no código / no arquivo JSON de política. Assim você pode mudar a regra de negócio sem reescrever o prompt, e o comportamento da política fica testável e previsível.

<br>

## Stack

| Peça | Uso |
|------|-----|
| Node.js 20+ | Runtime |
| TypeScript | Código |
| citty | CLI (`analyze`, `explain`, `mr`) |
| Zod | Schemas de state, resultado e config |
| Vitest | Testes |
| `@typesafe-ai/sdk` | Client JEV |

Mock embutido (`--mock`) permite rodar sem rede e sem API key para visualizar o funcionamento.

<br>

## Como funciona

1. Lê um arquivo `.diff` (local ou baixado de um MR).
2. Monta o **state**: lista de arquivos, additions, deletions, texto do diff (com teto de tamanho).
3. Envia o state ao **JEV** (real ou mock) e recebe as decisões.
4. **Risk calculator** soma pontos (pesos + faixas de arquivos/linhas) → score 0–100 → nível LOW…CRITICAL.
5. **Review policy** transforma nível (+ gate de confiança) em ação e texto de recommendation.
6. Imprime relatório legível ou JSON.

<br>

## Requisitos

- Node.js 20 ou superior
- npm
- Para MR do Gitlab: `git` no PATH; opcionalmente [glab](https://gitlab.com/gitlab-org/cli) (preferido para baixar o diff)

<br>

## Instalação passo a passo

```bash
cd jev-pr-reviewer
npm install
```

Opcional: instalar o comando globalmente no ambiente local:

```bash
npm link
```

Depois disso, `jev-pr-reviewer` fica disponível no terminal. Para o uso sem `npm link`, use:

```bash
node bin/jev-pr-reviewer.mjs <comando> ...
```

### Flags

São opções que alteram o comportamento de `analyze` / `explain` / `mr` — não são comandos isolados.

| Flag | O que faz |
|------|-----------|
| `--json` | Em vez do relatório legível no terminal, imprime o resultado em JSON (`AnalysisResult`). Útil para script/pipeline. Existe em `analyze` e `mr`. |
| `--explain` | Só no comando **`mr`**. Depois de baixar o diff, mostra o breakdown de pontos (como o subcomando `explain`) em vez do relatório normal. Para arquivo local use o subcomando: `explain arquivo.diff`. |
| `--config` | Caminho do JSON de política. Ex.: `--config ./minha-politica.json`. Sem ela, procura `jev-pr-reviewer.config.json` no cwd ou usa defaults. |
| `--profile` | Só faz sentido com **`--mock`**. Escolhe o perfil de decisões fake: `default`, `busy` ou `critical` (mais pesado / arriscado). |

Exemplos:

```bash
# JSON
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --json

# Política customizada
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --config ./jev-pr-reviewer.config.json

# mock com profile busy
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --profile busy

# MR
jev-pr-reviewer mr 123 --mock --explain
```

<br>

## Política de risco (JSON)

### Ativar um arquivo de config

```bash
cp jev-pr-reviewer.config.example.json jev-pr-reviewer.config.json
```

Edite `jev-pr-reviewer.config.json`. Campos que você omitir usam o default embutido.

Ordem de resolução:

1. `--config /caminho/para/arquivo.json` (obrigatório existir)
2. `./jev-pr-reviewer.config.json` no diretório atual
3. Defaults embutidos no código

JSON inválido ou valor fora do schema → erro com campo e motivo; a análise não roda pela metade.

Campos `_docs` e `description` são só documentação; o loader ignora no cálculo.

<br>

### O que cada item configura

#### `diff.maxChars` (default: 80000)

Tamanho máximo do **texto bruto** do `.diff` guardado no state e enviado ao JEV.

- Se o arquivo for maior, o texto é cortado e `truncated=true`.
- Contagem de arquivos e linhas `+`/`-` usa o arquivo inteiro.
- **Não** é “caracteres alterados” e **não** soma pontos no score.
- Serve para limitar contexto/custo/latência do modelo.

#### `weights` (pontos se o JEV disser yes)

Número = pontos somados ao score. Se a decisão for `no`, contribui 0.

| Campo | Default | Significado |
|-------|---------|-------------|
| `security` | 35 | Impacto de segurança = yes → +35 |
| `database` | 25 | Mudança de banco = yes → +25 |
| `api` | 15 | Impacto de API = yes → +15 |
| `authentication` | 10 | Impacto de auth = yes → +10 |

Quanto maior o número, mais aquele sinal empurra o risco.

#### `files.tiers` (pontos pelo número de arquivos)

Métrica do state (`files.length`), não do JEV.

Default:

- até 3 arquivos → 0
- até 10 → 5
- mais de 10 → 10

Em cada tier: `max` = teto inclusivo; `above` = “maior que”; `points` = pontos somados.

#### `lines.tiers` (pontos por linhas alteradas)

Usa `additions + deletions` (linhas que começam com `+` ou `-` no diff).

Default:

- até 50 → 0
- até 200 → 3
- mais de 200 → 5

#### `levels` (score → faixa de risco)

Depois da soma, o score é limitado a no máximo 100.

| Score | Nível | Ação típica* |
|-------|--------|----------------|
| 0 … `lowMax` (30) | LOW | APPROVE |
| `lowMax`+1 … `mediumMax` (60) | MEDIUM | REVIEW |
| `mediumMax`+1 … `highMax` (80) | HIGH | REVIEW |
| acima de `highMax` | CRITICAL | BLOCK |

*Sujeito ao gate de confiança abaixo. Se `securityImpact=yes`, o texto de recommendation usa `blockOrSecurity` mesmo quando a ação não é BLOCK.

#### `confidence.threshold` (default: 0.7)

Média aritmética das confidences das decisões JEV (0–1).

Se a média for **estritamente menor** que o threshold, a ação vira **REVIEW**, mesmo que o nível fosse LOW (APPROVE) ou CRITICAL (BLOCK). Evita automação quando o modelo está inseguro.

#### `recommendations` (textos do relatório)

Não alteram o cálculo:

- `approve` — ação APPROVE (e security ≠ yes)
- `review` — ação REVIEW
- `blockOrSecurity` — ação BLOCK, ou quando security = yes

#### `cli.defaultBaseBranch` (default: `main`)

Branch base preferida no fallback `git` do comando `mr` quando você não passa `--base`.

### Exemplo de score

security=yes (+35) + 5 arquivos (+5) + 80 linhas (+3) = **43** → MEDIUM → REVIEW (se confiança ≥ threshold).

<br>

## Uso passo a passo

### 1. Ver o fluxo sem API (mock)

No diretório do projeto:

```bash
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock
```

Saída legível: risco, decisões, ação, recommendation.

Breakdown dos pontos:

```bash
node bin/jev-pr-reviewer.mjs explain fixtures/sample.diff --mock
```

JSON (schema `AnalysisResult`):

```bash
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --json --mock
```

Perfis de mock mais “pesados”:

```bash
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --profile busy
node bin/jev-pr-reviewer.mjs analyze fixtures/busy.diff --mock --profile critical

# atalhos npm
npm run demo:busy
npm run demo:critical
npm run demo:explain
```

### 2. Usar sua política JSON

```bash
cp jev-pr-reviewer.config.example.json jev-pr-reviewer.config.json
# edite pesos / faixas / etc.

node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock
# ou path explícito:
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --config ./jev-pr-reviewer.config.json
```

### 3. Análise real com TypeSafe

1. Preencha `TYPESAFE_API_KEY` no `.env`.
2. Rode sem `--mock`:

```bash
node bin/jev-pr-reviewer.mjs analyze caminho/para/seu.diff
```

### 4. Analisar um Merge Request do GitLab

1. `TYPESAFE_API_KEY` no `.env` (ou use `--mock`).
2. `npm link` (uma vez), se quiser o binário no PATH.
3. Entre no clone do repositório GitLab e rode:

```bash
jev-pr-reviewer mr 123
jev-pr-reviewer mr https://gitlab.com/grupo/projeto/-/merge_requests/123

# sem API
jev-pr-reviewer mr 123 --mock
```

Como o diff é obtido:

1. Tenta `glab mr diff`
2. Se falhar, fallback: `git fetch` do ref do MR + `git diff` contra a base

Base branch:

- `--base develop` na linha de comando, ou
- `cli.defaultBaseBranch` no JSON de política

<br>

## Estrutura

```
src/cli/          # comandos
src/cli/format/   # layout CLI (JSON + analyze/explain/shared)
src/config/       # schema Zod, defaults, loadConfig (política de risco)
src/state/        # parse do diff → PrState
src/jev/          # MockJevClient e TypeSafeJevClient
src/risk/         # calculator + policy
src/pipeline/     # analyzeDiff (orquestra o fluxo)
src/git/          # fetch de MR GitLab
fixtures/         # diffs de exemplo
jev-pr-reviewer.config.example.json
```