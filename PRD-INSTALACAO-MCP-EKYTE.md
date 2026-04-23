# PRD: Instalacao do MCP Server do Ekyte

> Jogue este arquivo no chat do Claude Code e diga: "Executa este PRD de instalacao"
> Ele vai instalar e conectar o MCP do Ekyte, permitindo gerenciar tarefas e horas direto do chat.

---

## O Que Esse MCP Faz

Com o MCP instalado, o Claude Code consegue operar o Ekyte diretamente:
- **Criar e atualizar tarefas** com fases e responsaveis
- **Apontar horas** automaticamente
- **Listar workspaces, usuarios, fases** sem sair do chat
- **Completar tarefas e adicionar comentarios** com um comando

Sao **16 tools** — 8 de leitura, 8 de escrita.

## Pre-requisitos

- **Claude Code** instalado
- **Conta no Ekyte** com acesso a `app.ekyte.com`
- **Node.js >= 18** (apenas para instalacao local)

---

## PRIMEIRA PERGUNTA: Qual modo de instalacao?

> 🔴 **ANTES DE EXECUTAR QUALQUER PASSO, pergunte ao usuario:**
>
> **"Voce quer instalar o MCP do Ekyte de qual forma?"**
>
> | Opcao | Quando usar | O que precisa |
> |-------|-------------|---------------|
> | **A) Local** | Voce tem o repositorio clonado e quer rodar o servidor na sua maquina | Node.js >= 18, Bearer Token, Company ID |
> | **B) Remoto** | Ja existe um servidor MCP hospedado (EasyPanel, cloud, etc.) | Apenas a URL do servidor |
>
> - Se o usuario escolher **A (Local)**: execute os Passos 1 → 2 → 3 → 4 → 5
> - Se o usuario escolher **B (Remoto)**: execute os Passos 1 → 2 → 3

---

## Caminho A: Instalacao Local

### 0. Verificar Repositorio

> 🔴 **ANTES DE TUDO, verifique se o usuario ja esta dentro do repositorio do MCP server.**
>
> Ha grande chance de a pessoa ja estar no repo `ekyte_mcp_server` — afinal, este PRD esta dentro dele.
>
> **Checklist automatica (execute silenciosamente):**
> 1. Verifique se existe `package.json` no diretorio atual com o nome do projeto MCP
> 2. Verifique se existe `.env` com `EKYTE_BEARER_TOKEN` e `EKYTE_COMPANY_ID` preenchidos
> 3. Verifique se `dist/index.js` ja existe (build ja feito)
>
> **Resultados:**
> - Se `.env` ja tem as credenciais preenchidas → **pule o Passo 1** e avise o usuario
> - Se `dist/index.js` ja existe → **pule o Passo 2** e avise o usuario
> - Se tudo ja esta pronto → va direto para o **Passo 3** (registrar no Claude Code)
>
> Informe ao usuario o que foi detectado e quais passos serao pulados.

---

### 1. Obter Credenciais do Ekyte

> 🔴 **Sem essas credenciais o servidor nao inicia.** Pegue os dois valores antes de continuar.
> **Pule este passo se o Passo 0 detectou `.env` com credenciais preenchidas.**

**Bearer Token (JWT):**

1. Abra `https://app.ekyte.com` no navegador e faca login
2. Abra DevTools (`F12` ou `Cmd+Option+I`)
3. Va na aba **Network**
4. Clique em qualquer pagina do Ekyte para gerar requests
5. Clique em qualquer request para `api.ekyte.com`
6. Copie o header `Authorization: Bearer eyJ...` — o token e tudo depois de "Bearer "

> **Validade:** O JWT dura ~6 meses. Quando expirar, o MCP retorna erros 401 — repita este passo e atualize o token.

**Company ID:**

1. Ainda no DevTools → Network, olhe a URL de qualquer request
2. O padrao e `/api/companies/XXXX/...` — o `XXXX` e seu Company ID
3. Exemplo: `/api/companies/9312/workspaces` → Company ID = `9312`

---

### 2. Instalar e Buildar

> **Pule este passo se o Passo 0 detectou `dist/index.js` existente.**

```bash
npm install
npm run build
```

Verificar que o build funcionou:

```bash
ls dist/index.js
# Se nao existir → o build falhou. Verifique erros do npm run build
```

---

### 3. Registrar o MCP no Claude Code

```bash
claude mcp add ekyte -s user -e EKYTE_BEARER_TOKEN=SEU_JWT_AQUI -e EKYTE_COMPANY_ID=SEU_COMPANY_ID -e TRANSPORT=stdio -- node /CAMINHO/COMPLETO/PARA/ekyte_mcp_server/dist/index.js
```

> **Dica:** Use `pwd` dentro da pasta do projeto para descobrir o caminho absoluto. O flag `-s user` registra o MCP globalmente — disponivel em qualquer projeto.
> **Se o `.env` ja tem as credenciais**, use os valores de la automaticamente — nao peca ao usuario para colar de novo.

---

### 4. Validar Registro

```bash
claude mcp list
# Deve mostrar: ekyte
```

---

### 5. Smoke Test

Abra o Claude Code e teste:

```
"Liste os workspaces do Ekyte"
```
Esperado: tabela com workspaces (ID, nome, status).

```
"Quem sao os usuarios da empresa?"
```
Esperado: tabela com usuarios (UUID, nome, email).

```
"Crie uma tarefa de teste no workspace X para o usuario Y"
```
Esperado: o Claude segue o fluxo (buscar IDs → confirmar dados → criar tarefa).

Se retornar erro 401 → token expirado, volte ao Passo 1.
Se retornar erro 500 → problema temporario no Ekyte, tente em alguns minutos.

### Checklist Local

- [ ] Repositorio verificado (Passo 0)
- [ ] Bearer Token (JWT) obtido do DevTools ou `.env`
- [ ] Company ID identificado ou lido do `.env`
- [ ] Build realizado (`dist/index.js` existe)
- [ ] `claude mcp add` (stdio) executado com sucesso
- [ ] `claude mcp list` mostra `ekyte`
- [ ] Smoke test passou — `list_workspaces` retorna dados reais

---

## Caminho B: Instalacao Remota

### 1. Registrar o MCP no Claude Code

```bash
claude mcp add --transport http ekyte https://SEU-SERVIDOR.com/mcp --scope user
```

> **Vantagem:** Nao precisa de Node.js local, nao precisa buildar, nao precisa de credenciais na sua maquina. O servidor remoto ja tem tudo configurado.

---

### 2. Validar Registro

```bash
claude mcp list
# Deve mostrar: ekyte
```

---

### 3. Smoke Test

Abra o Claude Code e teste:

```
"Liste os workspaces do Ekyte"
```
Esperado: tabela com workspaces (ID, nome, status).

```
"Quem sao os usuarios da empresa?"
```
Esperado: tabela com usuarios (UUID, nome, email).

```
"Crie uma tarefa de teste no workspace X para o usuario Y"
```
Esperado: o Claude segue o fluxo (buscar IDs → confirmar dados → criar tarefa).

Se retornar erro 401 → token expirado, avise o admin do servidor.
Se retornar erro 500 → problema temporario no Ekyte, tente em alguns minutos.

### Checklist Remoto

- [ ] URL do servidor MCP obtida
- [ ] `claude mcp add` (http) executado com sucesso
- [ ] `claude mcp list` mostra `ekyte`
- [ ] Smoke test passou — `list_workspaces` retorna dados reais

---

## Troubleshooting

### "ERRO: Variaveis de ambiente obrigatorias nao definidas" (local)

O servidor precisa de `EKYTE_BEARER_TOKEN` e `EKYTE_COMPANY_ID`. Verifique se passou os `-e` corretos no `claude mcp add`.

Para corrigir, remova e adicione novamente:

```bash
claude mcp remove ekyte -s user
claude mcp add ekyte -s user -e EKYTE_BEARER_TOKEN=TOKEN_CORRETO -e EKYTE_COMPANY_ID=ID_CORRETO -e TRANSPORT=stdio -- node /caminho/dist/index.js
```

### Erro 401 (Unauthorized)

Token JWT expirou. Repita o Passo 1 e atualize com `claude mcp remove` + `claude mcp add`. Se usando remoto, avise o admin do servidor.

### Erro 500 (Internal Server Error)

Problema temporario no servidor do Ekyte. Aguarde 2-3 minutos e tente novamente.

### "ekyte nao aparece no claude mcp list"

1. **Local:** Verifique se o path do `dist/index.js` esta absoluto e correto
2. **Remoto:** Verifique se a URL termina em `/mcp` e o servidor esta acessivel
3. Tente remover e adicionar novamente

### Build falha (local)

```bash
npm run clean && npm install && npm run build
```

Verifique a versao do Node (`node -v`) — precisa ser >= 18.

---

*MCP instalado. O Claude Code agora opera o Ekyte direto do chat.*
