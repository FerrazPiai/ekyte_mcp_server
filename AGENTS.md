# Ekyte MCP Server — Guia para Agentes de IA

Este e o servidor MCP (Model Context Protocol) do Ekyte, uma plataforma de gestao de tarefas, projetos e apontamento de horas.

## Tools Disponiveis

### Leitura
| Tool | Descricao | Parametro-chave |
|------|-----------|-----------------|
| `ekyte_list_workspaces` | Lista workspaces (clientes/projetos) | `search` para filtrar por nome |
| `ekyte_list_users` | Lista usuarios/membros | `search` para filtrar por nome ou email |
| `ekyte_list_task_types` | Lista tipos de tarefa (templates) | Retorna `workflow_id` necessario para phases |
| `ekyte_list_phases` | Lista fases de um workflow (template) | `workflow_id` obrigatorio |
| `ekyte_list_tasks` | Lista tarefas com filtros | Filtre por `workspace_id` para performance |
| `ekyte_get_task` | Detalhes de uma tarefa | `task_id` obrigatorio |
| `ekyte_list_task_flow_phases` | Fases reais de uma tarefa com executores | `task_id` obrigatorio |
| `ekyte_list_time_entries` | Apontamentos de horas | `workspace_id` + `date_from`/`date_to` |

### Escrita
| Tool | Descricao | Confirmar com usuario? |
|------|-----------|----------------------|
| `ekyte_create_task` | Cria tarefa (fase unica ou multi-fase) | Sim |
| `ekyte_update_task` | Atualiza campos da tarefa (fase atual) | Nao |
| `ekyte_update_phase` | Atualiza fase especifica de uma tarefa | Nao |
| `ekyte_complete_task` | Marca tarefa como concluida | Sim (irreversivel) |
| `ekyte_add_task_comment` | Adiciona comentario na tarefa | Nao |
| `ekyte_create_time_entry_with_task` | Aponta horas vinculadas a tarefa | Sim |
| `ekyte_create_time_entry_without_task` | Aponta horas sem tarefa | Sim |
| `ekyte_delete_time_entry` | Deleta apontamento de horas | Sim (irreversivel) |

## Fluxo Obrigatorio: Criar Tarefa

Sempre siga esta ordem:

1. `ekyte_list_workspaces(search="...")` → obter workspace_id
2. `ekyte_list_task_types(search="...")` → obter task_type_id e workflow_id
3. `ekyte_list_phases(workflow_id=...)` → obter phase_id (fase inicial)
4. `ekyte_list_users(search="...")` → obter executor_id (UUID)
5. **Confirmar todos os dados com o usuario**
6. `ekyte_create_task(title, workspace_id, task_type_id, executor_id, phase_id, phase_start_date, phase_due_date)`

## Fluxo: Apontar Horas

1. `ekyte_list_workspaces(search="...")` → workspace_id
2. `ekyte_list_tasks(workspace_id=..., search="...")` → task_id
3. `ekyte_create_time_entry_with_task(workspace_id, task_id, date, start_time, end_time)`

## Regras Criticas

### Tipos de ID
| Entidade | Formato | Exemplo |
|----------|---------|---------|
| Workspace, Task, Phase, Task Type, Workflow | **number** | 46501 |
| User / Executor | **UUID** | `feff4a61-b0a3-483d-a384-172c4b301ee0` |

### Formatos
- **Datas**: `AAAA-MM-DD` (ex: 2026-04-24)
- **Horarios**: `HH:MM` (ex: 09:30) — end_time DEVE ser maior que start_time
- **Descricao/Comentario**: texto puro (sistema converte para HTML)

### Status de Tarefa
| Codigo | Status |
|--------|--------|
| 10 | Ativa |
| 20 | Pausada |
| 30 | Concluida |
| 40 | Cancelada |

### Prioridades (priority_group)
| Valor | Nivel |
|-------|-------|
| 35 | Baixa |
| 50 | Media |
| 60 | Alta |
| 90 | Urgente |

### Campos Obrigatorios para Criar Tarefa
- `title` (1-500 chars)
- `workspace_id`
- `task_type_id`
- `phase_start_date`, `phase_due_date`
- Modo fase unica: `executor_id` + `phase_id`
- Modo multi-fase: `phases[]` com [{phase_id, executor_id, effort_minutes}]

## Dicas de Performance

- **Sempre use `search`** nas tools de listagem — evita paginar centenas de registros
- **Filtre por `workspace_id`** em list_tasks — API retorna max ~1200 items
- **list_time_entries pode ser lento** (10-30s) — avise o usuario
- **Paginacao**: 50 itens por pagina, client-side
- **Respostas truncadas em 25KB** — use filtros especificos

## Diferenca entre update_task e update_phase

- `ekyte_update_task`: altera campos da **fase atual** (executor, datas, titulo, prioridade)
- `ekyte_update_phase`: altera **qualquer fase** da tarefa (use list_task_flow_phases antes)

## Multi-Fase

Ao criar tarefa com `phases[]`, a tarefa inicia na **primeira fase do array**. Cada fase pode ter executor, esforco e datas diferentes.
