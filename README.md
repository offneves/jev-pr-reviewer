# jev-pr-reviewer

CLI local para analisar o diff de um Pull Request / Merge Request, obter decisões estruturadas via JEV (TypeSafe) e aplicar uma política de risco determinística no código da aplicação.

Objetivo do experimento: separar o que o modelo decide (impacto + confiança) do que a aplicação decide (média ponderada, nível de risco e ação APPROVE / REVIEW / BLOCK).

<br>

## Por que JEV?

JEV (TypeSafe) responde perguntas estruturadas sobre o diff.

**Eixos pontuáveis** (entram no score):

| Campo | Pergunta (resumo) |
|-------|-------------------|
| `securityImpact` | Quão grave é o impacto de segurança? |
| `databaseChange` | Quão grave é o impacto de banco/schema? |
| `apiImpact` | Quão grave é o impacto de API pública? |
| `authenticationImpact` | Quão grave é o impacto de auth? |

Cada um usa a pergunta TypeSafe `score` com rubrica **0–9** (no máximo 10 níveis na API). A app converte para impacto **0–100**:

```text
impact = round( (clamp(rawScore, 0, 9) / 9) * 100 )
```

Cada resposta traz também uma confiança (0–1).

**Eixos advisory** (não entram no score): `breakingChange` e `needsHumanReview` (yes/no), `riskLevel` (LOW…CRITICAL).

O modelo **não** define pesos, faixas nem se o PR deve ser aprovado. Isso fica no código / no JSON de política.

<br>

## Stack

| Peça | Uso |
|------|-----|
| Node.js 20+ | Runtime |
| TypeScript | Código |
| citty | CLI (`analyze`, `explain`, `mr`) |
| Zod | Schemas de state, resultado e config |
| Vitest | Testes em `tests/` |
| `@typesafe-ai/sdk` | Client JEV |

Mock embutido (`--mock`) permite rodar sem rede e sem API key.

<br>

## Como funciona (scoring)

1. Lê um arquivo `.diff` (local ou baixado de um MR).
2. Monta o **state**: arquivos, additions, deletions, texto do diff (com teto `diff.maxChars`).
3. Envia o state ao **JEV** (real ou mock) e recebe impactos 0–100 + decisões advisory.
4. **Risk calculator** calcula a média ponderada dos 4 impactos com os `weights` do JSON:

```text
score = round( sum(impact_i * weight_i) / sum(weight_i) )
```

   Resultado clampado em 0–100 → nível LOW / MEDIUM / HIGH / CRITICAL via `levels`.
5. **Review policy** transforma nível (+ gate de confiança) em APPROVE / REVIEW / BLOCK e recommendation.
6. Imprime relatório legível ou JSON.

`files.tiers` e `lines.tiers` **não entram no score** (só métricas de state / compatibilidade de config).

<br>

## Requisitos

- Node.js 20 ou superior
- npm
- Para MR do GitLab: `git` no PATH; opcionalmente [glab](https://gitlab.com/gitlab-org/cli)

<br>

## Instalação

```bash
cd jev-pr-reviewer
npm install
npm run build
```

Opcional — comando global no ambiente local:

```bash
npm link
```

Sem `npm link`:

```bash
node bin/jev-pr-reviewer.mjs <comando> ...
```

O binário prefere `dist/` se existir; depois de alterar o código, rode `npm run build` (ou use o fallback `tsx` em `src/`).

### Flags

| Flag | O que faz |
|------|-----------|
| `--json` | Emite `AnalysisResult` em JSON (`analyze` / `mr`). |
| `--explain` | No comando **`mr`**, mostra o breakdown (igual ao subcomando `explain`). Para arquivo local: `explain arquivo.diff`. |
| `--config` | Caminho do JSON de política. Sem ela: `jev-pr-reviewer.config.json` no cwd ou defaults. |
| `--mock` | Usa decisões fake (sem TypeSafe / sem rede). |
| `--profile` | Com `--mock`: `default`, `busy` ou `critical`. |

Exemplos:

```bash
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --json
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --config ./jev-pr-reviewer.config.json
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --profile busy
jev-pr-reviewer mr 123 --mock --explain
```

<br>

## Política de risco (JSON)

### Ativar

```bash
cp config/jev-pr-reviewer.config.example.json jev-pr-reviewer.config.json
```

Ordem de resolução:

1. `--config /caminho/para/arquivo.json` (obrigatório existir)
2. `./jev-pr-reviewer.config.json` no diretório atual
3. Defaults embutidos

JSON inválido → erro com campo e motivo; a análise não parcializa.

Campos `_docs` e `description` são só documentação.

### Campos

#### `diff.maxChars` (default: 80000)

Teto do texto do `.diff` no state / enviado ao JEV. Acima disso: corte + `truncated=true`. Contagem de arquivos e linhas usa o arquivo inteiro. Não altera o score.

#### `weights` (importância relativa)

Não são pontos somados. Defaults:

| Campo | Default |
|-------|---------|
| `security` | 5 |
| `database` | 3 |
| `api` | 2 |
| `authentication` | 1 |

Quanto maior o peso, mais o eixo puxa a média. Pelo menos um peso deve ser > 0.

Configs antigas com 35/25/15/10 ainda carregam, mas a semântica agora é **relativa** (não “+35 no score”).

#### `files.tiers` / `lines.tiers`

Reservados / compatibilidade. **Não afetam o score.**

#### `levels` (score → risco)

| Score | Nível | Ação típica* |
|-------|--------|----------------|
| 0 … `lowMax` (30) | LOW | APPROVE |
| `lowMax`+1 … `mediumMax` (60) | MEDIUM | REVIEW |
| `mediumMax`+1 … `highMax` (80) | HIGH | REVIEW |
| acima de `highMax` | CRITICAL | BLOCK |

\*Sujeito ao gate de confiança. Se `securityImpact >= 1`, o texto de recommendation usa `blockOrSecurity` mesmo quando a ação não é BLOCK.

#### `confidence.threshold` (default: 0.7)

Média das confidences JEV. Se for **estritamente menor** que o threshold → ação **REVIEW** (mesmo que o nível sugerisse APPROVE ou BLOCK).

#### `recommendations`

- `approve` — APPROVE e security impact = 0
- `review` — REVIEW
- `blockOrSecurity` — BLOCK, ou security impact ≥ 1

#### `cli.defaultBaseBranch` (default: `main`)

Base preferida no fallback `git` do `mr` quando `--base` não é passado.

### Exemplo numérico

Impactos 85 / 40 / 10 / 0 com pesos 5 / 3 / 2 / 1:

```text
(85×5 + 40×3 + 10×2 + 0×1) / 11 ≈ 51.36 → score 51 → MEDIUM → REVIEW
```

(com confiança ≥ threshold; recommendation de security porque impact ≥ 1)

No `explain`, cada contribuição aparece como `impact N (weight W)` — a coluna numérica é o impacto 0–100, não o peso somado.

<br>

## Uso

### Mock (sem API)

```bash
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock
node bin/jev-pr-reviewer.mjs explain fixtures/sample.diff --mock
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --json --mock
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --profile busy
npm run demo:busy
npm run demo:critical
npm run demo:explain
```

### Política JSON

```bash
cp config/jev-pr-reviewer.config.example.json jev-pr-reviewer.config.json
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock
node bin/jev-pr-reviewer.mjs analyze fixtures/sample.diff --mock --config ./jev-pr-reviewer.config.json
```

### TypeSafe real

1. `TYPESAFE_API_KEY` no `.env`
2. Sem `--mock`:

```bash
node bin/jev-pr-reviewer.mjs analyze caminho/para/seu.diff
```

### Merge Request GitLab

```bash
jev-pr-reviewer mr 123
jev-pr-reviewer mr https://gitlab.com/grupo/projeto/-/merge_requests/123
jev-pr-reviewer mr 123 --mock
jev-pr-reviewer mr 123 --explain
```

Como o diff é obtido:

1. `glab mr diff`
2. Fallback: `git fetch` do ref do MR + `git diff` contra a base (`--base` ou `cli.defaultBaseBranch`)

<br>

## Layout da saída CLI

Arquivo: `src/cli/format/displayConfig.json`

No `analyze` pretty:

- **Scored decisions** — impactos 0–100 (`securityImpact`, `databaseChange`, `apiImpact`, `authenticationImpact`)
- **Advisory · not in score** — `breakingChange`, `needsHumanReview`, `riskLevel`

No `explain`: contribuições com impacto e weight, na ordem de `explain.signals.order` (sem sort por pontos).

<br>

## Estrutura

```
src/cli/          comandos
src/cli/format/   layout CLI
src/config/       schema Zod, defaults, loadConfig
src/state/        parse do diff → PrState
src/jev/          MockJevClient e TypeSafeJevClient
src/risk/         calculator + policy
src/pipeline/     analyzeDiff
src/git/          fetch de MR GitLab
tests/            Vitest (espelha src/)
fixtures/         diffs de exemplo
config/           example de política JSON
docs/plans/       planos de feature
```
