# Ekyte MCP — Referencia Completa

## Tools Disponiveis

### Leitura (8 tools)

#### ekyte_list_workspaces
Lista workspaces (clientes/projetos).
- `search` (string, opcional): filtro por nome (case-insensitive)
- `active_only` (boolean, default: false)
- `page` (number, default: 1): 50 por pagina
- `response_format` ("markdown"|"json")
- Retorna: id (number), name, active

#### ekyte_list_users
Lista usuarios/membros.
- `search` (string, opcional): filtro por nome OU email
- `page`, `response_format`
- Retorna: id (**UUID**), name, email

#### ekyte_list_task_types
Lista tipos de tarefa (templates).
- `search`, `active_only`, `page`, `response_format`
- Retorna: id, name, active, **workflow_id**, group

#### ekyte_list_phases
Lista fases de um workflow (template — o que PODE existir).
- `workflow_id` (number, **obrigatorio**)
- `response_format`
- Retorna: id, name, sequential, active

#### ekyte_list_tasks
Lista tarefas com filtros.
- `workspace_id` (number, opcional mas recomendado)
- `status` (10=Ativa, 20=Pausada, 30=Concluida, 40=Cancelada; default: 10)
- `task_type_id`, `phase_id`, `executor_id` (UUID)
- `created_from`, `created_to`, `due_from`, `due_to` (AAAA-MM-DD)
- `search` (filtro no titulo, client-side)
- `page`, `response_format`
- Retorna: id, title, status, workspace, task_type, phase_id, executor, times, dates

#### ekyte_get_task
Detalhes completos de uma tarefa.
- `task_id` (number, **obrigatorio**)
- `response_format`
- Retorna: todos os campos incluindo description, priority, created_by

#### ekyte_list_task_flow_phases
Lista fases REAIS de uma tarefa (o que EXISTE, com executores).
- `task_id` (number, **obrigatorio**)
- `response_format`
- Retorna: flow_id, phase_id, phase_name, executor_id, executor_name, effort_minutes, dates

#### ekyte_list_time_entries
Lista apontamentos de horas.
- `workspace_id` (number, **obrigatorio**)
- `date_from`, `date_to` (AAAA-MM-DD, **obrigatorios**)
- `user_id` (UUID, opcional), `task_id` (number, opcional)
- `page`, `response_format`
- Retorna: id, date, start/end_time, effort_minutes, comment, task info, user info

---

### Escrita (8 tools)

#### ekyte_create_task
Cria tarefa. Dois modos:

**Modo 1 — Fase unica:**
- `title` (string, 1-500, **obrigatorio**)
- `workspace_id` (number, **obrigatorio**)
- `task_type_id` (number, **obrigatorio**)
- `executor_id` (UUID, **obrigatorio**)
- `phase_id` (number, **obrigatorio**)
- `phase_start_date`, `phase_due_date` (AAAA-MM-DD, **obrigatorios**)
- `description` (string, 0-5000, opcional)
- `estimated_time_minutes` (number, 1-9999, default: 60)
- `priority` (number, 0-1000, opcional)

**Modo 2 — Multi-fase:**
- Mesmos campos base, mas substitua executor_id+phase_id por:
- `phases` (array): [{phase_id, executor_id, effort_minutes, phase_start_date?, phase_due_date?}]
- Tarefa inicia na PRIMEIRA fase do array

#### ekyte_update_task
Atualiza campos da tarefa (fase atual).
- `task_id` (number, **obrigatorio**)
- Pelo menos 1 campo: `title`, `description`, `executor_id`, `phase_id`, `phase_start_date`, `phase_due_date`, `priority_group` (35/50/60/90), `priority`

#### ekyte_update_phase
Atualiza fase especifica (qualquer fase, nao so a atual).
- `task_id` (number, **obrigatorio**)
- `phase_id` (number, **obrigatorio**)
- Pelo menos 1 campo: `executor_id`, `effort_minutes`, `phase_start_date`, `phase_due_date`

#### ekyte_complete_task
Marca tarefa como concluida (situation=30).
- `task_id` (number, **obrigatorio**)
- **Irreversivel** — confirme com o usuario

#### ekyte_add_task_comment
Adiciona comentario na timeline da tarefa.
- `task_id` (number, **obrigatorio**)
- `comment` (string, 1-5000, **obrigatorio**)

#### ekyte_create_time_entry_with_task
Aponta horas vinculadas a uma tarefa.
- `workspace_id` (number, **obrigatorio**)
- `task_id` (number, **obrigatorio**)
- `date` (AAAA-MM-DD, **obrigatorio**)
- `start_time`, `end_time` (HH:MM, **obrigatorios**) — end > start
- `comment` (string, 0-1000, opcional)
- `manual_time` (HH:MM, opcional)

#### ekyte_create_time_entry_without_task
Aponta horas sem tarefa (generico).
- `workspace_id`, `task_type_id`, `phase_id` (**obrigatorios**)
- `date`, `start_time`, `end_time` (**obrigatorios**)
- `comment`, `non_productive` (boolean, default: false)

#### ekyte_delete_time_entry
Deleta apontamento (soft delete).
- `workspace_id` (number, **obrigatorio**)
- `time_entry_id` (number, **obrigatorio**)
- **Irreversivel** — confirme com o usuario

---

## Modelo de Dados

```
Company
├── Workspaces (id: number)
│   ├── Tasks (id: number)
│   │   ├── Task Type (id: number) → Workflow (id: number)
│   │   │   └── Phases template (id: number)
│   │   ├── Phase Flow (fases reais com executores)
│   │   ├── Time Entries (id: number)
│   │   └── Comments
│   └── Users/Executors (id: UUID)
└── Task Types → Workflows → Phases
```

## Tipos de ID

| Entidade | Formato | Exemplo |
|----------|---------|---------|
| Workspace | number | 46501 |
| Task | number | 9119422 |
| Task Type | number | 44873 |
| Phase | number | 39569 |
| Workflow | number | 14250 |
| User/Executor | **UUID** | feff4a61-b0a3-... |
| Time Entry | number | 12345 |

## Erros Comuns

| Erro | Causa | Solucao |
|------|-------|---------|
| 400 | Parametros invalidos | Verificar formato de datas/IDs/campos obrigatorios |
| 401 | Token invalido | Verificar EKYTE_BEARER_TOKEN |
| 404 | Recurso nao encontrado | Verificar IDs (workspace, task, etc.) |
| 500 | Erro interno | Tentar novamente em alguns minutos |
| Timeout | Endpoint lento | /time-trackings/report pode levar 10-30s |

## Validacoes Importantes

- **end_time > start_time** obrigatorio em time entries
- **phase_start_date e phase_due_date** obrigatorios ao criar tarefa
- **executor_id** sempre UUID, nunca numero
- **description** e **comment** sao texto puro — o sistema converte para HTML
- **Paginacao**: 50 itens por pagina, client-side
- **API max ~1200 tasks** — sempre filtre por workspace_id
- **Respostas truncadas em 25KB** — use filtros e paginacao
