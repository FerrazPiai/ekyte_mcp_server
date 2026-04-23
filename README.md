# Ekyte MCP Server

Servidor MCP (Model Context Protocol) que permite ao Claude (e outras IAs) interagir com a plataforma **Ekyte** para gestão de tarefas e apontamento de horas. Criado para uso interno da **V4 Company**, qualquer pessoa do time pode subir sua própria instância.

Toda a API usada é a **interna** (`https://api.ekyte.com/api/...`), autenticada por **JWT Bearer** (mesmo token que o front `app.ekyte.com` envia). Não usa a API pública `/v1.x`.

**Repositório:** https://github.com/FerrazPiai/ekyte_mcp_server

---

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Tools Disponíveis](#tools-disponíveis)
  - [Leitura (read-only)](#leitura-read-only)
  - [Escrita (destrutivo — pede confirmação)](#escrita-destrutivo--pede-confirmação)
- [Fluxo recomendado para criar uma tarefa](#fluxo-recomendado-para-criar-uma-tarefa)
- [Fluxo recomendado para editar uma tarefa](#fluxo-recomendado-para-editar-uma-tarefa)
- [Configuração](#configuração)
  - [Como extrair o `EKYTE_BEARER_TOKEN`](#como-extrair-o-ekyte_bearer_token-passo-a-passo)
  - [Como descobrir o `EKYTE_COMPANY_ID`](#como-descobrir-o-ekyte_company_id)
- [Deploy — escolha sua plataforma](#deploy)
- [Conexão com o Claude](#conexão-com-o-claude)
  - [Claude Code (CLI)](#claude-code-cli--transporte-http-remoto)
  - [Claude Desktop — stdio local](#claude-desktop--transporte-stdio-local)
  - [Claude Desktop — HTTP remoto](#claude-desktop--transporte-http-remoto-com-mcp-remoto-instalado-no-easypanel)
- [Desenvolvimento local](#desenvolvimento-local)
- [Arquitetura](#arquitetura)
- [Endpoints que a MCP usa](#endpoints-que-a-mcp-usa-referência)

---

## Pré-requisitos

Antes de começar, tenha em mãos:

- Conta ativa no **Ekyte** com acesso a `app.ekyte.com` (para extrair o JWT e o `company_id`).
- Um dos cenários de deploy:
  - **Easypanel** rodando num VPS (Hostinger, DigitalOcean, Hetzner, etc.) — caminho recomendado.
  - Ou **qualquer servidor com Docker** (Ubuntu/Debian + Docker + Docker Compose).
  - Ou apenas **máquina local** com Node 18+ (se quiser usar só no Claude Desktop em stdio, sem deploy).
- Conta Claude (**Claude Code CLI** ou **Claude Desktop**) onde a MCP será conectada.
- Conta no **GitHub** (para fazer fork do repositório — opcional mas recomendado, facilita atualizações futuras).

---

## Tools Disponíveis

### Leitura (read-only)

| Tool | Descrição |
|------|-----------|
| `ekyte_list_workspaces` | Lista workspaces (clientes) da empresa |
| `ekyte_list_users` | Lista usuários/membros (com UUID) |
| `ekyte_list_task_types` | Lista tipos de tarefa (template + workflow_id) |
| `ekyte_list_phases` | Lista fases de um workflow (para descobrir `phase_id`) |
| `ekyte_list_tasks` | Lista tarefas com filtros (workspace, status, datas, etc.) |
| `ekyte_list_task_flow_phases` | Lista as fases de uma tarefa específica, com executor/datas/esforço POR FASE |
| `ekyte_get_task` | Detalhes de uma tarefa específica |
| `ekyte_list_time_entries` | Lista apontamentos de horas |

### Escrita (destrutivo — pede confirmação)

| Tool | Descrição |
|------|-----------|
| `ekyte_create_task` | Cria nova tarefa (fase única ou **multi-fase**, com executor diferente por fase) |
| `ekyte_update_task` | Edita campos top-level da tarefa (título, descrição, executor/fase atuais, prioridade) |
| `ekyte_update_phase` | Edita uma FASE específica da tarefa (executor, esforço, datas) — sem alterar as outras fases |
| `ekyte_complete_task` | Marca tarefa como concluída |
| `ekyte_add_task_comment` | Adiciona comentário na timeline |
| `ekyte_create_time_entry_with_task` | Aponta horas em tarefa específica |
| `ekyte_create_time_entry_without_task` | Aponta horas avulso |
| `ekyte_delete_time_entry` | Remove apontamento |

## Fluxo recomendado para criar uma tarefa

### Fase única (simples)

1. `ekyte_list_workspaces` → `workspace_id`
2. `ekyte_list_task_types` → `task_type_id` (+ `workflow_id` associado)
3. `ekyte_list_phases(workflow_id)` → `phase_id` inicial
4. `ekyte_list_users` → `executor_id` (UUID)
5. `ekyte_create_task` com os 4 IDs + datas + tempo estimado

### Multi-fase (executor diferente por fase)

1–3 iguais ao fluxo acima (listar workspaces, task types, phases)
4. `ekyte_list_users` → descobrir UUIDs dos responsáveis
5. `ekyte_create_task` passando o array `phases`:
   ```json
   {
     "title": "Campanha X",
     "workspace_id": 124458,
     "task_type_id": 44873,
     "phase_start_date": "2026-04-22",
     "phase_due_date": "2026-04-30",
     "phases": [
       {"phase_id": 30759, "executor_id": "uuid-pietro", "effort_minutes": 60, "phase_due_date": "2026-04-24"},
       {"phase_id": 37391, "executor_id": "uuid-edison", "effort_minutes": 90, "phase_due_date": "2026-04-27"},
       {"phase_id": 30749, "executor_id": "uuid-paulo", "effort_minutes": 30, "phase_due_date": "2026-04-30"}
     ]
   }
   ```
   A tarefa começa na **primeira fase** da lista. Top-level (`executor_id`, `phase_id`) são ignorados.

## Fluxo recomendado para editar uma tarefa

### Editar campos gerais (fase atual, título, prioridade, etc.)
- Use `ekyte_update_task`
- Campos: `title`, `description`, `executor_id` (fase atual), `phase_id` (muda a fase ativa), `phase_start_date`, `phase_due_date`, `priority_group` (35=Baixa, 50=Média, 60=Alta, 90=Urgente)

### Editar uma fase específica (não-atual) — trocar quem faz o quê
1. `ekyte_list_task_flow_phases(task_id)` → ver todas as fases e seus `phase_id`
2. `ekyte_update_phase(task_id, phase_id, executor_id=..., effort_minutes=..., phase_start_date=..., phase_due_date=...)`
- Ex: "mudar o responsável pela fase Execução da tarefa #123" sem mexer nas outras

## Configuração

### Variáveis de ambiente

```env
EKYTE_BEARER_TOKEN=seu_jwt_aqui        # obrigatório
EKYTE_COMPANY_ID=9312                  # obrigatório (numérico)
TRANSPORT=http                         # "http" p/ servidor remoto, "stdio" p/ Claude Desktop local
PORT=3000                              # porta HTTP (default 3000)
```

### Como extrair o `EKYTE_BEARER_TOKEN` (passo-a-passo)

1. Entre em `https://app.ekyte.com` com sua conta e faça login.
2. Abra o **DevTools** do navegador (`F12` no Chrome/Edge, ou `Ctrl+Shift+I`).
3. Vá na aba **Network** (Rede).
4. Clique em qualquer tela do Ekyte (lista de tarefas, workspaces etc.) para gerar tráfego.
5. Filtre as requisições por `api.ekyte.com` — clique em qualquer uma delas.
6. Na aba **Headers** → **Request Headers**, localize a linha:
   ```
   Authorization: Bearer eyJhbGciOi...<string longa>
   ```
7. Copie **só o que vem depois de `Bearer `** — esse é o valor de `EKYTE_BEARER_TOKEN`.

> ⚠️ **Validade:** o JWT do Ekyte expira em ~6 meses. Quando o MCP começar a retornar erro `401 Unauthorized`, repita o processo e atualize a variável no Easypanel (ou no `.env` local).

### Como descobrir o `EKYTE_COMPANY_ID`

Na mesma aba **Network** do DevTools, observe a URL das requisições para `api.ekyte.com`. Elas têm o formato:

```
https://api.ekyte.com/api/companies/9312/workspaces
                                   ^^^^
                                   esse é o company_id
```

O número que aparece depois de `/companies/` é o seu `EKYTE_COMPANY_ID`. Cada unidade/empresa tem o seu — **use o da sua unidade**, não copie o de outro time.

## Deploy

Esta MCP é um container Docker (Node 20-alpine) que expõe HTTP na porta `3000`. Qualquer plataforma que aceite `Dockerfile` + domínio HTTPS funciona. Clique na plataforma que você usa para ir direto ao passo-a-passo:

| [Easypanel](#easypanel-recomendado-para-v4-company) | [Coolify](#coolify) | [Railway](#railway) | [Render](#render) | [Fly.io](#flyio) | [VPS genérico](#vps-genérico-ubuntu--docker-compose--nginx) |
|---|---|---|---|---|---|
| Self-hosted, painel visual, SSL automático — **usado pela V4 Company** | Self-hosted open-source, alternativa direta ao Easypanel | Cloud gerenciado, deploy em 2min via GitHub, ~$5/mês | Cloud gerenciado, plano Free (com sleep) ou Starter $7/mês | Edge global, deploy por CLI, ótimo para latência distribuída | Ubuntu + Docker Compose + Nginx + Certbot (qualquer VPS) |

### Easypanel (recomendado para V4 Company)

O Easypanel faz o build do Dockerfile, configura SSL automático (Let's Encrypt) e injeta as env vars. Fluxo completo:

#### 1. Fork do repositório (recomendado)

Acesse https://github.com/FerrazPiai/ekyte_mcp_server e clique em **Fork** para copiar o repo para sua conta. Isso permite puxar atualizações futuras com um clique, sem perder seu histórico.

> Alternativa: use o repositório original direto, mas você não terá controle sobre atualizações.

#### 2. Criar o serviço no Easypanel

1. Entre no painel do seu Easypanel → selecione o **projeto** onde quer rodar o MCP (ou crie um novo).
2. Clique em **+ Service** → **App**.
3. Dê um nome ao serviço, por exemplo `ekyte-mcp`.
4. Na aba **Source**:
   - **Type:** `GitHub` (ou `Git` genérico)
   - **Repository:** `https://github.com/SEU-USUARIO/ekyte_mcp_server` (ou o original se não fez fork)
   - **Branch:** `main`
   - **Build Path:** `/` (raiz)
5. Na aba **Build**:
   - **Type:** `Dockerfile`
   - **Dockerfile Path:** `Dockerfile` (já existe na raiz)

#### 3. Configurar as variáveis de ambiente

Na aba **Environment** do serviço, adicione:

```env
EKYTE_BEARER_TOKEN=eyJhbGciOi...          # seu JWT extraído do DevTools
EKYTE_COMPANY_ID=9312                     # o ID da sua unidade
TRANSPORT=http
PORT=3000
NODE_ENV=production
```

Salve e clique em **Deploy**.

#### 4. Expor a porta e configurar o domínio

1. Na aba **Domains** do serviço, clique em **+ Add Domain**.
2. **Host:** `ekyte-mcp.seu-dominio.com` (use um subdomínio que aponte para o IP do Easypanel).
3. **Path:** `/`
4. **Port:** `3000`
5. Marque **HTTPS** (o Easypanel cuida do Let's Encrypt).
6. Salve — em ~30s o SSL é emitido.

#### 5. Configurar healthcheck (opcional, mas recomendado)

Na aba **Deploy** → **Health Check**:
- **Path:** `/health`
- **Port:** `3000`
- **Interval:** 30s

> ⚠️ Não adicione `HEALTHCHECK` no Dockerfile — deixe o Easypanel cuidar disso via HTTP probe. O Dockerfile já está configurado assim de propósito.

#### 6. Verificar se subiu

```bash
curl https://ekyte-mcp.seu-dominio.com/health
# resposta esperada:
# {"status":"ok","server":"ekyte-mcp-server","version":"1.0.0"}
```

Endpoint MCP final: `https://ekyte-mcp.seu-dominio.com/mcp`

#### 7. Atualizar depois de mudanças no código

- **Se fez fork:** faça `git pull` do upstream no seu fork → Easypanel detecta e rebuilda automaticamente (se tiver auto-deploy ligado) ou clique em **Deploy** manual.
- **Trocar o JWT expirado:** só editar `EKYTE_BEARER_TOKEN` em **Environment** → **Deploy** → pronto.

### Coolify

[Coolify](https://coolify.io/) é uma PaaS open-source e self-hosted, alternativa direta ao Heroku, Vercel ou Netlify — ótima opção se você quer rodar o MCP server na sua própria infra com SSL automático, deploy via Git e zero vendor lock-in.

#### Pré-requisitos

- Instância do Coolify v4 rodando (veja [coolify.io/docs](https://coolify.io/docs/installation))
- Servidor com Docker instalado e gerenciado pelo Coolify (pode ser o próprio host do Coolify ou um remoto via SSH)
- Domínio ou subdomínio apontando para o IP do servidor (ex: `mcp.seudominio.com.br` com registro A)

#### Passo-a-passo

1. **Criar o projeto e a aplicação**
   - No dashboard do Coolify, entre em um Project existente (ou crie um novo) e clique em **+ New Resource**
   - Escolha **Public Repository** (ou **Private Repository (with GitHub App)** se preferir receber webhooks de push)
   - Cole a URL: `https://github.com/FerrazPiai/ekyte_mcp_server`

2. **Configurar branch e build pack**
   - **Branch:** `main`
   - **Build Pack:** `Dockerfile` (o Coolify detecta automaticamente o `Dockerfile` na raiz — não precisa informar caminho customizado)
   - **Base Directory:** `/` (padrão)

3. **Configurar porta e rede**
   - Em **General > Network**, defina **Ports Exposes** como `3000`
   - Deixe **Ports Mappings** vazio (o Coolify gerencia via proxy Traefik interno)

   > ⚠️ O Coolify só roteia tráfego para portas declaradas em `EXPOSE` no Dockerfile. O Dockerfile deste projeto já faz `EXPOSE 3000`.

4. **Adicionar variáveis de ambiente**
   - Vá em **Environment Variables** e adicione as 5 variáveis obrigatórias:

   ```env
   EKYTE_BEARER_TOKEN=seu_jwt_longo_aqui
   EKYTE_COMPANY_ID=123
   TRANSPORT=http
   PORT=3000
   NODE_ENV=production
   ```

   - Marque `EKYTE_BEARER_TOKEN` como **Is Secret?** para mascarar o valor nos logs e na UI

5. **Configurar domínio e SSL**
   - Em **General > Domains**, informe a URL completa com `https://`, por exemplo: `https://mcp.seudominio.com.br`
   - O Coolify emite e renova o certificado Let's Encrypt automaticamente via Traefik — não precisa configurar nada além do domínio
   - Deixe **Force HTTPS Redirect** ativado

6. **Configurar healthcheck**
   - Em **Healthchecks**, ative **Enabled**
   - **Path:** `/health` — **Port:** `3000` — **Method:** `GET`
   - **Interval:** `30` — **Timeout:** `10` — **Retries:** `3`

7. **Deploy**
   - Clique em **Deploy** no topo da tela
   - Acompanhe os logs em **Deployments > Logs**; o primeiro build leva 1-2 min

#### Verificação

```bash
curl https://mcp.seudominio.com.br/health
# {"status":"ok","server":"ekyte-mcp-server","version":"1.0.0"}
```

Endpoint MCP final: `https://mcp.seudominio.com.br/mcp`

#### Atualizações futuras

- **Automático (recomendado):** em **Webhooks**, copie a URL gerada pelo Coolify e cole em **Settings > Webhooks** do repositório no GitHub (evento: `push`). Todo `git push` na branch `main` dispara redeploy.
- **Manual:** clique em **Redeploy** no topo da página da aplicação a qualquer momento.

> ⚠️ Se você trocar o `EKYTE_BEARER_TOKEN`, o Coolify **não** reinicia o container sozinho — clique em **Restart** ou **Redeploy** para aplicar a nova env var.

### Railway

A [Railway](https://railway.com) é uma plataforma cloud PaaS que faz deploy direto do GitHub em ~2 minutos, com HTTPS automático em domínios `*.up.railway.app`. O plano Trial oferece $5 de crédito único para testar, e o plano Hobby custa $5/mês com recursos suficientes para rodar este MCP server 24/7.

> ⚠️ O plano Trial expira quando os $5 acabam. Para produção contínua, migre para o Hobby ($5/mês) — senão o Claude perde acesso quando o serviço for suspenso.

#### Pré-requisitos

- Conta na Railway ([railway.com](https://railway.com)) — pode logar com GitHub
- Repositório `ekyte_mcp_server` no GitHub (recomendado fazer **fork** de `FerrazPiai/ekyte_mcp_server` para controlar quando redeployar)
- Token Ekyte (`EKYTE_BEARER_TOKEN`) e ID da empresa (`EKYTE_COMPANY_ID`) em mãos

#### Passo-a-passo (via UI web)

1. Logue em [railway.com](https://railway.com) e clique em **New Project** no canto superior direito do dashboard.
2. Selecione **Deploy from GitHub repo**. Se for a primeira vez, autorize a Railway a acessar sua conta GitHub (pode limitar a apenas o repositório `ekyte_mcp_server` em **Only select repositories**).
3. Escolha o repositório `ekyte_mcp_server` (seu fork ou o original). A Railway detecta automaticamente o `Dockerfile` na raiz e inicia o build — não precisa configurar buildpack.
4. Enquanto o primeiro build roda, clique no serviço recém-criado e abra a aba **Variables**. Clique em **Raw Editor** no canto superior direito e cole o bloco abaixo, substituindo os valores:

   ```env
   EKYTE_BEARER_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.seu-jwt-completo-aqui
   EKYTE_COMPANY_ID=12345
   TRANSPORT=http
   PORT=3000
   NODE_ENV=production
   ```

   Clique em **Update Variables**. A Railway faz um novo deploy automaticamente com as variáveis aplicadas.

   > ⚠️ Nunca commite o `EKYTE_BEARER_TOKEN` no repositório. Use sempre as Variables da Railway.

5. Vá em **Settings → Networking** e clique em **Generate Domain**. A Railway cria um domínio público do tipo `ekyte-mcp-production-xxxx.up.railway.app` com HTTPS via Let's Encrypt já configurado. Confirme a porta `3000` quando solicitado.
6. *(Opcional)* **Custom Domain:** ainda em **Settings → Networking**, clique em **Custom Domain**, informe seu domínio (ex: `mcp.seudominio.com`) e crie um registro **CNAME** no seu DNS apontando para o target fornecido pela Railway. O certificado TLS é emitido em ~1 minuto após a propagação.
7. *(Opcional)* **Healthcheck:** em **Settings → Deploy**, no campo **Healthcheck Path**, coloque `/health`. Isso faz a Railway aguardar o endpoint responder `200` antes de marcar o deploy como saudável — evita downtime em redeploys.

#### Verificação

```bash
curl https://ekyte-mcp-production-xxxx.up.railway.app/health
# {"status":"ok","server":"ekyte-mcp-server","version":"1.0.0"}
```

Endpoint MCP final: `https://ekyte-mcp-production-xxxx.up.railway.app/mcp`

#### Atualizações automáticas

Todo `git push` no branch `main` do repositório conectado dispara um novo build e deploy automaticamente — sem configuração adicional. Acompanhe em tempo real na aba **Deployments** do serviço. Para pausar, desative **Auto Deploy** em **Settings → Source**.

#### Alternativa: deploy via CLI

Se preferir linha de comando ao invés da UI web:

```bash
npm i -g @railway/cli
railway login                          # abre o browser para autenticar
railway init                           # cria projeto vinculado à pasta atual
railway up                             # envia o código e builda usando o Dockerfile
railway variables --set "EKYTE_BEARER_TOKEN=eyJ..." --set "EKYTE_COMPANY_ID=12345" \
                  --set "TRANSPORT=http" --set "PORT=3000" --set "NODE_ENV=production"
railway domain                         # gera o domínio público *.up.railway.app
```

### Render

[Render](https://render.com) é uma PaaS gerenciada que faz deploy direto do GitHub, com plano Free (dorme após 15min de inatividade) e domínio `*.onrender.com` grátis já com HTTPS/TLS automático — ideal para expor o MCP server ao Claude sem configurar proxy reverso.

#### Pré-requisitos

- Conta no [Render](https://dashboard.render.com) (signup com GitHub recomendado)
- Fork ou acesso ao repositório [`ekyte_mcp_server`](https://github.com/FerrazPiai/ekyte_mcp_server) no GitHub

#### Passo-a-passo (via dashboard)

1. No dashboard do Render, clique em **+ New** (canto superior direito) → **Web Service**.
2. Em **Source Code**, selecione **GitHub** e autorize o Render a acessar o repositório `ekyte_mcp_server`. Clique em **Connect** ao lado do repo.
3. Na tela de configuração, preencha:
   - **Name:** `ekyte-mcp` (será usado no subdomínio: `ekyte-mcp.onrender.com`)
   - **Project:** deixe em branco ou crie um novo (ex: `MCP Servers`)
   - **Language:** `Docker` (o Render detecta automaticamente o `Dockerfile` na raiz)
   - **Branch:** `main`
   - **Region:** `Oregon (US West)` ou `Frankfurt (EU)` — escolha a mais próxima dos usuários. No momento não há região brasileira; Oregon costuma ter latência aceitável a partir do Brasil.
   - **Dockerfile Path:** `./Dockerfile` (padrão)
   - **Instance Type:** `Free` para testes ou `Starter` ($7/mês) para uso contínuo sem sleep
4. Role até a seção **Environment Variables** e clique em **Add Environment Variable** para cada uma das variáveis abaixo:

   ```env
   EKYTE_BEARER_TOKEN=seu_jwt_longo_aqui
   EKYTE_COMPANY_ID=12345
   TRANSPORT=http
   PORT=3000
   NODE_ENV=production
   ```

   > ⚠️ Nunca commite esses valores no repositório. O Render criptografa env vars em repouso e só as expõe ao container em runtime.

5. Expanda **Advanced** e configure:
   - **Health Check Path:** `/health` (o Render vai fazer polling neste endpoint e reiniciar o serviço se falhar)
   - **Auto-Deploy:** `Yes` (padrão — cada `git push` na branch `main` dispara um novo deploy)
6. Clique em **Deploy Web Service** no final da página. O primeiro build leva cerca de 3-5 minutos.

#### Verificação

```bash
curl https://ekyte-mcp.onrender.com/health
# {"status":"ok","server":"ekyte-mcp-server","version":"1.0.0"}
```

Endpoint MCP final: `https://ekyte-mcp.onrender.com/mcp`

#### Atualizações

Com auto-deploy ativo, basta `git push origin main` — o Render detecta o commit, rebuilda a imagem Docker e faz rollout com zero-downtime. Acompanhe os logs em tempo real na aba **Logs** e faça rollback pela aba **Events**.

> ⚠️ **Atenção ao plano Free:** o serviço entra em sleep após 15 minutos sem requests. A primeira chamada após o sleep leva ~30 segundos para acordar o container, o que frequentemente excede o timeout do Claude ao conectar ao MCP. Para uso contínuo/produção, escolha:
>
> - Fazer upgrade para **Starter ($7/mês)** — sem sleep, 512MB RAM, sempre ativo
> - Configurar keep-alive externo (ex: cron-job.org ou UptimeRobot) fazendo `GET /health` a cada 10 minutos — funciona mas pode ser bloqueado pelo Render
> - Usar outro provider (Railway, Fly.io) se o Starter for proibitivo

### Fly.io

Fly.io é uma plataforma edge global que roda containers próximos aos usuários em dezenas de regiões. O deploy é feito inteiramente via CLI (`flyctl`), o que torna o fluxo simples e reproduzível — ideal para MCP servers que atendem clientes distribuídos. Todo app recebe automaticamente um domínio `*.fly.dev` com HTTPS gerenciado (Let's Encrypt).

#### Pré-requisitos

- Conta no [Fly.io](https://fly.io) (cadastro com GitHub ou email)
- Cartão de crédito cadastrado (obrigatório mesmo no tier gratuito — há limite de 3 VMs shared-cpu-1x pequenas grátis)
- CLI `flyctl` instalada localmente
- Git instalado

#### Passo 1 — Instalar o `flyctl`

**Windows (PowerShell):**

```powershell
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**macOS / Linux:**

```bash
curl -L https://fly.io/install.sh | sh
```

Valide a instalação:

```bash
fly version
```

#### Passo 2 — Fazer login

```bash
fly auth login
```

Um navegador será aberto para autenticação. Após o login, o token fica salvo localmente.

#### Passo 3 — Clonar o repositório

```bash
git clone https://github.com/FerrazPiai/ekyte_mcp_server.git
cd ekyte_mcp_server
```

#### Passo 4 — Inicializar o app com `fly launch`

O comando abaixo detecta o `Dockerfile` existente e gera um `fly.toml` inicial, **sem fazer deploy ainda** (vamos ajustar configs antes):

```bash
fly launch --no-deploy
```

Responda às perguntas interativas:

- **App name:** escolha algo único, ex: `ekyte-mcp-seunome`
- **Region:** escolha a mais próxima (ex: `gru` para São Paulo, `gig` para Rio)
- **Postgres / Redis / Sentry:** responda `No` para todos
- **Deploy now:** responda `No`

#### Passo 5 — Ajustar o `fly.toml`

Abra o `fly.toml` gerado e garanta que ele tenha as seções abaixo. Exemplo mínimo pronto para copiar:

```toml
# fly.toml — configuração do MCP server Ekyte
app = "ekyte-mcp-seunome"
primary_region = "gru"

[build]
  # usa o Dockerfile multi-stage da raiz
  dockerfile = "Dockerfile"

[env]
  # variáveis NÃO sensíveis — ficam visíveis no dashboard
  TRANSPORT = "http"
  PORT = "3000"
  NODE_ENV = "production"

[http_service]
  internal_port = 3000        # porta exposta pelo container
  force_https = true          # redireciona HTTP -> HTTPS automaticamente
  auto_stop_machines = "stop" # economia: para a VM quando ociosa
  auto_start_machines = true  # religa na próxima request
  min_machines_running = 0

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

> ⚠️ **Atenção ao `internal_port`:** ele deve bater com a porta em que o app escuta dentro do container (3000). Se divergir, o Fly não consegue rotear requests e o healthcheck falha.

#### Passo 6 — Configurar os secrets (vars sensíveis)

No Fly, há **duas formas** de passar variáveis de ambiente para o container:

- **`[env]` no `fly.toml`** — valores em texto plano, visíveis no dashboard e no repo. Use para configs públicas (TRANSPORT, PORT, NODE_ENV).
- **Secrets (`fly secrets set`)** — valores criptografados em repouso, injetados como env vars em runtime mas **nunca expostos**. Use para tokens, chaves de API, credenciais.

O `EKYTE_BEARER_TOKEN` é um JWT longo com acesso à API Ekyte — **sempre** como secret:

```bash
fly secrets set \
  EKYTE_BEARER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  EKYTE_COMPANY_ID=9312
```

> ⚠️ **Nunca** commite o `EKYTE_BEARER_TOKEN` no `fly.toml` nem em arquivos `.env` versionados. Secrets do Fly são o canal correto.

Confira os secrets cadastrados (o Fly mostra apenas o hash, nunca o valor):

```bash
fly secrets list
```

#### Passo 7 — Fazer o deploy

```bash
fly deploy
```

O Fly vai: subir o contexto do build → construir a imagem Docker remotamente → provisionar uma VM na região escolhida → rodar o healthcheck em `/health` → liberar tráfego quando o check passar.

Ao final, a URL aparece no log (algo como `https://ekyte-mcp-seunome.fly.dev`).

#### Passo 8 — Verificar

```bash
curl https://ekyte-mcp-seunome.fly.dev/health
# {"status":"ok","server":"ekyte-mcp-server","version":"1.0.0"}
```

Endpoint MCP final: `https://ekyte-mcp-seunome.fly.dev/mcp`

#### Atualizando o app

Sempre que houver mudanças no código:

```bash
git pull
fly deploy
```

O Fly faz rebuild + rolling deploy sem downtime perceptível.

#### Comandos úteis no dia a dia

```bash
fly logs              # tail dos logs em tempo real
fly status            # estado das VMs, região, última release
fly secrets list      # lista (apenas os nomes) dos secrets
fly apps open         # abre o app no navegador
fly ssh console       # abre shell dentro da VM (debug)
fly scale count 2     # escalar para 2 instâncias
fly releases          # histórico de deploys (útil para rollback)
```

> ⚠️ **Custo:** o tier gratuito cobre 3 VMs `shared-cpu-1x` com 256MB. Com `auto_stop_machines = "stop"` o app dorme quando ocioso — a primeira request depois disso demora ~1-2s para acordar a VM. Para workloads sempre quentes, setar `min_machines_running = 1` e acompanhar a cobrança em `fly.io/dashboard/billing`.

### VPS genérico (Ubuntu + Docker Compose + Nginx)

Caminho "hardcore" mas 100% portátil — funciona em qualquer VPS Ubuntu/Debian (Hostinger VPS, DigitalOcean Droplet, Hetzner Cloud, Contabo, Vultr, AWS Lightsail, etc.). Dá muito mais controle sobre a infra, mas exige configurar Nginx e SSL na mão. Se você quer algo plug-and-play, prefira um painel (Easypanel, Coolify); se quer entender tudo que está rodando, segue o fluxo abaixo.

#### Pré-requisitos

- VPS com Ubuntu 22.04+ (ou Debian 11+) e acesso SSH como `root` ou usuário com `sudo`
- Domínio próprio com um A-record apontando para o IP público do VPS (ex: `ekyte-mcp.seu-dominio.com` → `203.0.113.42`)
- Portas `22`, `80` e `443` liberadas no firewall do provedor (security group / cloud firewall)

> ⚠️ Em provedores como AWS Lightsail, DigitalOcean e Hetzner, o firewall do painel é **independente** do UFW do sistema. Libere as portas nos dois lugares, senão o Certbot não consegue validar o domínio.

#### Passo 1 — Instalar Docker e Docker Compose

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

> ⚠️ Depois de rodar o `usermod`, saia do SSH (`exit`) e reconecte — o grupo `docker` só é aplicado em novas sessões. Sem isso, você vai precisar usar `sudo` em todo comando `docker`.

Confira se ficou OK:

```bash
docker --version
docker compose version
```

#### Passo 2 — Clonar o repositório

```bash
git clone https://github.com/FerrazPiai/ekyte_mcp_server.git
cd ekyte_mcp_server
```

#### Passo 3 — Criar o arquivo `.env`

Na raiz do projeto, crie um `.env` baseado no `.env.example`:

```bash
cp .env.example .env
nano .env
```

Conteúdo completo:

```env
EKYTE_BEARER_TOKEN=seu_jwt_longo_aqui
EKYTE_COMPANY_ID=12345
TRANSPORT=http
PORT=3000
```

> ⚠️ Nunca commite o `.env` — ele já está no `.gitignore`. O token JWT da Ekyte dá acesso total à sua conta, trate como senha.

#### Passo 4 — Subir o container

```bash
docker compose up -d --build
docker compose logs -f
```

Em outra sessão SSH (ou `Ctrl+C` nos logs), valide que o health check responde localmente:

```bash
curl http://localhost:3000/health
```

Deve retornar `{"status":"ok",...}`. Se não responder, cheque os logs — normalmente é token inválido ou `EKYTE_COMPANY_ID` errado.

#### Passo 5 — Configurar Nginx como reverse proxy

Instale o Nginx:

```bash
sudo apt update
sudo apt install nginx -y
```

Crie o server block:

```bash
sudo nano /etc/nginx/sites-available/ekyte-mcp
```

Cole o conteúdo abaixo (troque `ekyte-mcp.seu-dominio.com` pelo seu domínio real):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ekyte-mcp.seu-dominio.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_connect_timeout 120s;
        proxy_send_timeout    120s;
        proxy_read_timeout    120s;
    }
}
```

Ative o site, teste a configuração e recarregue o Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/ekyte-mcp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

> ⚠️ Os timeouts de 120s são importantes: algumas tools do MCP (como listagens grandes da Ekyte) podem levar mais de 30s. Sem isso, o Nginx corta a conexão antes do Claude receber a resposta.

#### Passo 6 — SSL com Certbot (Let's Encrypt grátis)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d ekyte-mcp.seu-dominio.com
```

O Certbot vai pedir seu e-mail, aceitar os termos e perguntar se quer redirecionar HTTP para HTTPS — responda **sim**. Ele reescreve o server block automaticamente, adiciona os blocos `listen 443 ssl` e instala um cron de renovação automática (`/etc/cron.d/certbot`).

> ⚠️ Se o A-record do domínio ainda não propagou, o Certbot falha com erro de validação. Confira com `dig +short ekyte-mcp.seu-dominio.com` antes de rodar — propagação DNS pode levar de 5 minutos a algumas horas.

#### Passo 7 — Verificar o deploy

```bash
curl https://ekyte-mcp.seu-dominio.com/health
# {"status":"ok","server":"ekyte-mcp-server","version":"1.0.0"}
```

Endpoint MCP final: `https://ekyte-mcp.seu-dominio.com/mcp`

#### Passo 8 — Atualizar depois de mudanças no repo

```bash
cd ~/ekyte_mcp_server
git pull
docker compose up -d --build
```

O Nginx e o Certbot continuam funcionando normalmente — só o container Node é recriado.

#### Dica final — Firewall com UFW

Feche tudo que não é essencial:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

> ⚠️ Rode o `ufw allow 22` **antes** de habilitar o UFW, senão você se tranca fora do SSH e vai precisar usar o console web do provedor para recuperar o acesso.

## Conexão com o Claude

### Claude Code (CLI) — transporte HTTP remoto

No diretório do projeto onde você vai usar a MCP, crie `.mcp.json`:

```json
{
  "mcpServers": {
    "ekyte": {
      "type": "http",
      "url": "https://ekyte-mcp.seu-dominio.com/mcp"
    }
  }
}
```

Ou no escopo de usuário, via CLI:

```bash
claude mcp add --transport http ekyte https://ekyte-mcp.seu-dominio.com/mcp --scope user
```

Teste: `claude mcp list` deve mostrar `ekyte ✓ connected`.

### Claude Desktop — transporte stdio local

Rode o servidor em modo `stdio` (sem HTTP). No `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ekyte": {
      "command": "node",
      "args": ["C:/caminho/para/ekyte-mcp-server/dist/index.js"],
      "env": {
        "EKYTE_BEARER_TOKEN": "seu_jwt",
        "EKYTE_COMPANY_ID": "9312",
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

### Claude Desktop — transporte HTTP remoto (com MCP remoto instalado no EasyPanel)

```json
{
  "mcpServers": {
    "ekyte": {
      "url": "https://ekyte-mcp.seu-dominio.com/mcp"
    }
  }
}
```

## Desenvolvimento local

```bash
npm install
npm run build

# Modo stdio (default) — para Claude Desktop
EKYTE_BEARER_TOKEN=xxx EKYTE_COMPANY_ID=9312 npm start

# Modo HTTP — simula o deploy EasyPanel
EKYTE_BEARER_TOKEN=xxx EKYTE_COMPANY_ID=9312 TRANSPORT=http npm start

# Hot reload
npm run dev
```

Smoke test rápido (HTTP):

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Arquitetura

```
src/
├── index.ts               # Entry point (stdio + HTTP streamable)
├── constants.ts           # Base URL, timeouts, limites
├── types.ts               # Tipos do Ekyte
├── services/
│   └── ekyte-client.ts    # Cliente axios + helpers companyUrl / companyV2Url
├── schemas/
│   ├── common.ts          # Schemas Zod compartilhados
│   ├── task.ts            # Schemas de tarefas e fases
│   └── time-entry.ts      # Schemas de apontamentos
└── tools/
    ├── read-tools.ts      # Tools de leitura
    └── write-tools.ts     # Tools de escrita
```

## Endpoints que a MCP usa (referência)

Todos com `Authorization: Bearer <jwt>` e base `https://api.ekyte.com`:

| Método | Path | Tool |
|--------|------|------|
| GET | `/api/companies/{id}/workspaces` | list_workspaces |
| GET | `/api/companies/{id}/users` | list_users |
| GET | `/api/companies/{id}/task-types` | list_task_types |
| GET | `/api/companies/{id}/workflows/{wf}` | list_phases (retorna `phases[]`) |
| GET | `/api/v2/companies/{id}/ctc-tasks` | list_tasks |
| GET | `/api/v2/companies/{id}/ctc-tasks/{task}` | get_task |
| GET | `/api/v2/companies/{id}/ctc-tasks/{task}/flow-phases` | list_task_flow_phases |
| POST | `/api/companies/{id}/ctc-tasks` | create_task (suporta `flow[]` multi-fase) |
| PATCH | `/api/v2/companies/{id}/ctc-tasks/{task}` | update_task / complete_task |
| PATCH | `/api/v2/companies/{id}/ctc-tasks/{task}/flow-phase/{phase}` | update_phase |
| POST | `/api/v2/companies/{id}/ctc-tasks/{task}/comments` | add_task_comment |
| GET | `/api/companies/{id}/time-trackings/data/details` | list_time_entries |
| POST | `/api/companies/{id}/workspaces/{ws}/time-trackings` | create_time_entry_* |
| PATCH | `/api/companies/{id}/workspaces/{ws}/time-trackings/{id}` | delete_time_entry |
