/**
 * Write tools for Ekyte MCP Server
 *
 * These tools CREATE, UPDATE or DELETE data in Ekyte.
 * They use the internal API (Bearer token auth).
 *
 * All destructive tools are marked with destructiveHint: true
 * so the AI client will ask for user confirmation before executing.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  apiPost,
  apiPatch,
  apiGet,
  handleApiError,
  getCompanyId,
} from "../services/ekyte-client.js";
import { ResponseFormat } from "../schemas/common.js";
import {
  CreateTimeEntryWithTaskSchema,
  CreateTimeEntryWithoutTaskSchema,
  ListTimeEntriesSchema,
  DeleteTimeEntrySchema,
  type CreateTimeEntryWithTaskInput,
  type CreateTimeEntryWithoutTaskInput,
  type ListTimeEntriesInput,
  type DeleteTimeEntryInput,
} from "../schemas/time-entry.js";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  CompleteTaskSchema,
  AddTaskCommentSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
  type CompleteTaskInput,
  type AddTaskCommentInput,
} from "../schemas/task.js";
import { CHARACTER_LIMIT } from "../constants.js";

// ============ Helper: Calculate effort in minutes ============

function calculateEffortMinutes(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;
  const diff = endTotal - startTotal;
  if (diff <= 0) {
    throw new Error(
      `Hora de fim (${endTime}) deve ser depois da hora de início (${startTime}). ` +
      `Diferença calculada: ${diff} minutos.`
    );
  }
  return diff;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatResponse(data: unknown, markdown: string, format: ResponseFormat) {
  const textContent = format === ResponseFormat.MARKDOWN
    ? markdown
    : JSON.stringify(data, null, 2);
  if (textContent.length > CHARACTER_LIMIT) {
    return textContent.substring(0, CHARACTER_LIMIT) +
      "\n\n⚠️ Resposta truncada. Use filtros ou paginação para reduzir o volume de dados.";
  }
  return textContent;
}

// ============ Register Write Tools ============

export function registerWriteTools(server: McpServer): void {

  // ================================================================
  //  TIME TRACKING TOOLS
  // ================================================================

  // -------- Create Time Entry WITH Task --------
  server.registerTool(
    "ekyte_create_time_entry_with_task",
    {
      title: "Apontar Horas em Tarefa Específica",
      description: `Cria um apontamento de horas vinculado a uma tarefa específica no Ekyte.

Equivalente a abrir uma tarefa no Ekyte e clicar em "Adicionar apontamento" → "Manual".

Parâmetros obrigatórios:
- workspace_id: ID do workspace (use ekyte_list_workspaces)
- task_id: ID da tarefa (use ekyte_list_tasks)
- date: Data do apontamento (AAAA-MM-DD)
- start_time: Hora de início (HH:MM)
- end_time: Hora de fim (HH:MM)

IMPORTANTE: Sempre confirme os dados com o usuário antes de executar.
A hora de fim DEVE ser posterior à hora de início.
O esforço (duração) é calculado automaticamente.`,
      inputSchema: CreateTimeEntryWithTaskSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateTimeEntryWithTaskInput) => {
      try {
        const companyId = getCompanyId();
        const effort = calculateEffortMinutes(params.start_time, params.end_time);
        const duration = formatDuration(effort);

        const payload = {
          typeTimeTracking: 2,
          startDate: `${params.date}T${params.start_time}:00`,
          startDateTime: `${params.start_time}:00`,
          endDate: `${params.date}T${params.end_time}:00`,
          endDateTime: params.end_time,
          effort,
          comment: params.comment,
          workspaceId: params.workspace_id,
          workspace: { id: params.workspace_id },
          type: 1,
          ctcTaskId: params.task_id,
          ctcTask: { id: params.task_id },
          manualTime: params.manual_time ?? params.start_time,
        };

        await apiPost(
          `/api/companies/${companyId}/workspaces/${params.workspace_id}/time-trackings`,
          payload
        );

        return {
          content: [{ type: "text" as const, text: [
            "# ✅ Apontamento Criado com Sucesso!",
            "",
            `- **Tarefa**: #${params.task_id}`,
            `- **Data**: ${params.date}`,
            `- **Horário**: ${params.start_time} → ${params.end_time}`,
            `- **Duração**: ${duration} (${effort} minutos)`,
            `- **Workspace**: ID ${params.workspace_id}`,
            params.comment ? `- **Comentário**: ${params.comment}` : "",
          ].filter(Boolean).join("\n") }],
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes("Hora de fim")) {
          return { content: [{ type: "text" as const, text: `Erro de validação: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- Create Time Entry WITHOUT Task --------
  server.registerTool(
    "ekyte_create_time_entry_without_task",
    {
      title: "Apontar Horas Sem Tarefa (Avulso)",
      description: `Cria um apontamento de horas avulso (sem vincular a uma tarefa específica).

Equivalente a usar o botão "Adicionar apontamento" na tela principal do Ekyte, selecionando Workspace, Tipo de Tarefa e Etapa manualmente.

Parâmetros obrigatórios:
- workspace_id: ID do workspace (use ekyte_list_workspaces)
- task_type_id: ID do tipo de tarefa (use ekyte_list_task_types)
- phase_id: ID da etapa
- date, start_time, end_time

IMPORTANTE: Sempre confirme os dados com o usuário antes de executar.`,
      inputSchema: CreateTimeEntryWithoutTaskSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateTimeEntryWithoutTaskInput) => {
      try {
        const companyId = getCompanyId();
        const effort = calculateEffortMinutes(params.start_time, params.end_time);
        const duration = formatDuration(effort);

        const payload = {
          typeTimeTracking: 2,
          startDate: `${params.date}T${params.start_time}:00`,
          startDateTime: `${params.start_time}:00`,
          endDate: `${params.date}T${params.end_time}:00`,
          endDateTime: params.end_time,
          effort,
          comment: params.comment,
          workspaceId: params.workspace_id,
          workspace: { id: params.workspace_id },
          type: 2,
          ctcTaskTypeId: params.task_type_id,
          ctcTaskType: { id: params.task_type_id },
          phaseId: params.phase_id,
          phase: { id: params.phase_id },
        };

        await apiPost(
          `/api/companies/${companyId}/workspaces/${params.workspace_id}/time-trackings`,
          payload
        );

        return {
          content: [{ type: "text" as const, text: [
            "# ✅ Apontamento Avulso Criado com Sucesso!",
            "",
            `- **Data**: ${params.date}`,
            `- **Horário**: ${params.start_time} → ${params.end_time}`,
            `- **Duração**: ${duration} (${effort} minutos)`,
            `- **Workspace**: ID ${params.workspace_id}`,
            `- **Tipo de Tarefa**: ID ${params.task_type_id}`,
            `- **Etapa**: ID ${params.phase_id}`,
            params.comment ? `- **Comentário**: ${params.comment}` : "",
            params.non_productive ? "- **Não produtivo**: Sim" : "",
          ].filter(Boolean).join("\n") }],
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes("Hora de fim")) {
          return { content: [{ type: "text" as const, text: `Erro de validação: ${error.message}` }] };
        }
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- List Time Entries --------
  server.registerTool(
    "ekyte_list_time_entries",
    {
      title: "Listar Apontamentos de Horas",
      description: `Lista apontamentos de horas no Ekyte com filtros por data, usuário e workspace.

Parâmetros obrigatórios:
- workspace_id: ID do workspace

Filtros opcionais:
- date_from / date_to: Período de datas (AAAA-MM-DD)
- user_id: UUID do usuário para filtrar

Retorna: detalhes dos apontamentos incluindo data, horário, duração, tarefa vinculada, etc.

Use esta ferramenta para consultar apontamentos existentes antes de criar ou deletar.`,
      inputSchema: ListTimeEntriesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListTimeEntriesInput) => {
      try {
        const companyId = getCompanyId();

        const queryParams: Record<string, unknown> = {
          workspaceId: params.workspace_id,
          tabId: 10,
          phaseTimeTracking: 10,
          preset: 50,
        };

        if (params.date_from) queryParams.startDate = params.date_from;
        if (params.date_to) queryParams.endDate = params.date_to;
        if (params.user_id) queryParams.executorId = params.user_id;

        const data = await apiGet<unknown>(
          `/api/companies/${companyId}/time-trackings/data/details`,
          queryParams
        );

        const entries = Array.isArray(data) ? data : [];

        if (entries.length === 0) {
          return {
            content: [{ type: "text" as const, text: "Nenhum apontamento encontrado com os filtros informados. Tente ajustar as datas ou o workspace_id." }],
          };
        }

        const output = {
          count: entries.length,
          workspace_id: params.workspace_id,
          filters: {
            date_from: params.date_from ?? null,
            date_to: params.date_to ?? null,
            user_id: params.user_id ?? null,
          },
          items: entries.map((e: Record<string, unknown>) => ({
            id: e.id ?? e.timeTrackingId,
            date: e.startDate ?? e.date,
            start_time: e.startDateTime,
            end_time: e.endDateTime,
            effort_minutes: e.effort,
            comment: e.comment ?? "",
            task_id: e.ctcTaskId,
            task_title: (e.ctcTask as Record<string, unknown>)?.title ?? e.taskTitle ?? "-",
            user_name: (e.executor as Record<string, unknown>)?.userName ?? e.userName ?? "-",
            workspace_id: e.workspaceId,
          })),
        };

        const markdown = [
          "# Apontamentos de Horas",
          "",
          `Workspace: ${params.workspace_id} | ${entries.length} resultado(s)`,
          params.date_from ? `De: ${params.date_from}` : "",
          params.date_to ? `Até: ${params.date_to}` : "",
          "",
          ...entries.map((e: Record<string, unknown>) => {
            const taskTitle = (e.ctcTask as Record<string, unknown>)?.title ?? e.taskTitle ?? "Sem tarefa";
            const userName = (e.executor as Record<string, unknown>)?.userName ?? e.userName ?? "-";
            return [
              `### ID ${e.id ?? e.timeTrackingId} — ${taskTitle}`,
              `- **Usuário**: ${userName}`,
              `- **Data**: ${e.startDate ?? e.date}`,
              `- **Horário**: ${e.startDateTime ?? "-"} → ${e.endDateTime ?? "-"}`,
              `- **Duração**: ${e.effort ? formatDuration(e.effort as number) : "-"} (${e.effort ?? 0} min)`,
              e.comment ? `- **Comentário**: ${e.comment}` : "",
              "",
            ].filter(Boolean).join("\n");
          }),
        ].filter(Boolean).join("\n");

        return {
          content: [{ type: "text" as const, text: formatResponse(output, markdown, params.response_format) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- Delete Time Entry --------
  server.registerTool(
    "ekyte_delete_time_entry",
    {
      title: "Deletar Apontamento de Horas",
      description: `Remove um apontamento de horas no Ekyte (soft delete via mudança de status).

Parâmetros obrigatórios:
- workspace_id: ID do workspace
- time_entry_id: ID do apontamento (use ekyte_list_time_entries para descobrir)

IMPORTANTE: Esta ação NÃO pode ser desfeita. Sempre confirme com o usuário antes de executar.
Use ekyte_list_time_entries para verificar o apontamento correto antes de deletar.`,
      inputSchema: DeleteTimeEntrySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: DeleteTimeEntryInput) => {
      try {
        const companyId = getCompanyId();

        // Ekyte uses JSON Patch to soft-delete (status=30)
        const patchPayload = [
          { op: "replace", path: "/status", value: 30 },
        ];

        await apiPatch(
          `/api/companies/${companyId}/workspaces/${params.workspace_id}/time-trackings/${params.time_entry_id}`,
          patchPayload
        );

        return {
          content: [{ type: "text" as const, text: [
            "# ✅ Apontamento Deletado com Sucesso!",
            "",
            `- **ID do Apontamento**: ${params.time_entry_id}`,
            `- **Workspace**: ID ${params.workspace_id}`,
          ].join("\n") }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // ================================================================
  //  TASK MANAGEMENT TOOLS
  // ================================================================

  // -------- Create Task --------
  server.registerTool(
    "ekyte_create_task",
    {
      title: "Criar Tarefa no Ekyte",
      description: `Cria uma nova tarefa no Ekyte.

ANTES de usar esta ferramenta, você DEVE:
1. Usar ekyte_list_workspaces para obter o workspace_id correto
2. Usar ekyte_list_task_types para obter o task_type_id correto
3. Usar ekyte_list_users para obter o executor_id (UUID) correto

Parâmetros obrigatórios:
- title: Título da tarefa
- workspace_id, task_type_id, executor_id, phase_id
- phase_start_date, phase_due_date (AAAA-MM-DD)

IMPORTANTE: Sempre confirme TODOS os dados com o usuário antes de criar.
Erros aqui impactam diretamente o controle de performance da empresa.`,
      inputSchema: CreateTaskSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateTaskInput) => {
      try {
        const companyId = getCompanyId();
        const estimatedHours = Math.floor(params.estimated_time_minutes / 60);
        const estimatedMins = params.estimated_time_minutes % 60;
        const timeFormatted = `${estimatedHours.toString().padStart(2, "0")}:${estimatedMins.toString().padStart(2, "0")}`;

        const payload = {
          title: params.title,
          quantity: 0,
          workspaceId: params.workspace_id,
          workspace: { id: params.workspace_id },
          ctcTaskTypeId: params.task_type_id,
          ctcTaskType: { id: params.task_type_id },
          allocationType: 20,
          estimatedTime: params.estimated_time_minutes,
          estimatedTimeFormated: timeFormatted,
          estimatedTimeFormatedHour: estimatedHours.toString().padStart(2, "0"),
          estimatedTimeFormatedMinute: estimatedMins.toString().padStart(2, "0"),
          phaseStartDate: params.phase_start_date,
          phaseDueDate: params.phase_due_date,
          currentDueDate: params.phase_due_date,
          description: params.description,
          executorId: params.executor_id,
          executor: { id: params.executor_id },
          phaseId: params.phase_id,
          phase: { id: params.phase_id },
          artifacts: [],
          workspaces: [],
          executors: [],
          tags: [],
          channels: [],
          titleChanged: true,
          estimatedTimeChanged: false,
          datesChanged: false,
          flow: [{
            effort: params.estimated_time_minutes,
            taskTypeId: params.task_type_id,
            executorId: params.executor_id,
            executor: { id: params.executor_id },
            phaseId: params.phase_id,
            phase: { id: params.phase_id },
            active: 1,
            phaseStartDate: params.phase_start_date,
            phaseDueDate: params.phase_due_date,
            effortHour: estimatedHours.toString().padStart(2, "0"),
            effortMinute: estimatedMins.toString().padStart(2, "0"),
            effortFormated: timeFormatted,
          }],
          ctcTaskProject: {},
          ctcTaskProjectPhase: {},
          ctcTaskPredecessor: {},
          coPhase: {},
          typeDuplicateForms: null,
        };

        const result = await apiPost<Record<string, unknown>>(
          `/api/companies/${companyId}/ctc-tasks`,
          payload
        );

        const taskId = result?.id ?? "desconhecido";

        return {
          content: [{ type: "text" as const, text: [
            "# ✅ Tarefa Criada com Sucesso!",
            "",
            `- **ID**: #${taskId}`,
            `- **Título**: ${params.title}`,
            `- **Workspace**: ID ${params.workspace_id}`,
            `- **Tipo de Tarefa**: ID ${params.task_type_id}`,
            `- **Responsável**: ${params.executor_id}`,
            `- **Etapa**: ID ${params.phase_id}`,
            `- **Tempo Estimado**: ${timeFormatted}`,
            `- **Início**: ${params.phase_start_date}`,
            `- **Entrega**: ${params.phase_due_date}`,
            params.description ? `- **Descrição**: ${params.description}` : "",
          ].filter(Boolean).join("\n") }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- Update Task --------
  server.registerTool(
    "ekyte_update_task",
    {
      title: "Editar Tarefa no Ekyte",
      description: `Atualiza campos de uma tarefa existente no Ekyte usando JSON Patch.

Campos que podem ser atualizados (todos opcionais, pelo menos 1 obrigatório):
- title: Novo título
- description: Nova descrição (texto simples, será convertido para HTML)
- executor_id: UUID do novo responsável
- phase_id: ID da nova etapa/fase
- phase_start_date: Nova data de início (AAAA-MM-DD)
- phase_due_date: Nova data de entrega (AAAA-MM-DD)
- priority: Nova prioridade (0-100)

ANTES de usar, confirme o task_id correto com ekyte_list_tasks ou ekyte_get_task.
IMPORTANTE: Sempre confirme as alterações com o usuário antes de executar.`,
      inputSchema: UpdateTaskSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: UpdateTaskInput) => {
      try {
        const companyId = getCompanyId();

        // Build JSON Patch operations array
        const patchOps: Array<{ op: string; path: string; value: unknown }> = [];

        if (params.title !== undefined) {
          patchOps.push({ op: "replace", path: "/title", value: params.title });
        }
        if (params.description !== undefined) {
          patchOps.push({ op: "replace", path: "/description", value: `<div>${params.description}</div>` });
        }
        if (params.executor_id !== undefined) {
          patchOps.push({ op: "replace", path: "/executorId", value: params.executor_id });
        }
        if (params.phase_id !== undefined) {
          patchOps.push({ op: "replace", path: "/phaseId", value: params.phase_id });
        }
        if (params.phase_start_date !== undefined) {
          patchOps.push({ op: "replace", path: "/phaseStartDate", value: params.phase_start_date });
        }
        if (params.phase_due_date !== undefined) {
          patchOps.push({ op: "replace", path: "/phaseDueDate", value: params.phase_due_date });
          patchOps.push({ op: "replace", path: "/currentDueDate", value: params.phase_due_date });
        }
        if (params.priority !== undefined) {
          patchOps.push({ op: "replace", path: "/priority", value: params.priority });
        }

        await apiPatch(
          `/api/v2/companies/${companyId}/ctc-tasks/${params.task_id}`,
          patchOps,
          { type: "list", updateAllTickets: "undefined" }
        );

        const changes = patchOps.map((op) => `- **${op.path.replace("/", "")}**: ${op.value}`).join("\n");

        return {
          content: [{ type: "text" as const, text: [
            "# ✅ Tarefa Atualizada com Sucesso!",
            "",
            `**Tarefa**: #${params.task_id}`,
            "",
            "### Alterações aplicadas:",
            changes,
          ].join("\n") }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- Complete Task --------
  server.registerTool(
    "ekyte_complete_task",
    {
      title: "Concluir Tarefa no Ekyte",
      description: `Marca uma tarefa como concluída (situation=30) no Ekyte.

Parâmetro obrigatório:
- task_id: ID da tarefa a ser concluída (use ekyte_list_tasks para encontrar)

IMPORTANTE: Esta ação marca a tarefa como CONCLUÍDA. Confirme com o usuário antes de executar.
Para verificar o status atual da tarefa, use ekyte_get_task primeiro.`,
      inputSchema: CompleteTaskSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: CompleteTaskInput) => {
      try {
        const companyId = getCompanyId();

        const patchPayload = [
          { op: "replace", path: "/situation", value: 30 },
        ];

        await apiPatch(
          `/api/v2/companies/${companyId}/ctc-tasks/${params.task_id}`,
          patchPayload,
          { type: "list", updateAllTickets: "undefined" }
        );

        return {
          content: [{ type: "text" as const, text: [
            "# ✅ Tarefa Concluída com Sucesso!",
            "",
            `- **Tarefa**: #${params.task_id}`,
            `- **Novo Status**: Concluída`,
          ].join("\n") }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- Add Comment to Task --------
  server.registerTool(
    "ekyte_add_task_comment",
    {
      title: "Adicionar Comentário em Tarefa",
      description: `Adiciona um comentário em uma tarefa existente no Ekyte.

Parâmetros obrigatórios:
- task_id: ID da tarefa (use ekyte_list_tasks para encontrar)
- comment: Texto do comentário

O comentário será adicionado como uma nova mensagem na timeline da tarefa, visível para todos que têm acesso.`,
      inputSchema: AddTaskCommentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: AddTaskCommentInput) => {
      try {
        const companyId = getCompanyId();

        const payload = {
          description: `<div>${params.comment}</div>`,
          artifacts: [],
          showInApproval: 0,
        };

        await apiPost(
          `/api/v2/companies/${companyId}/ctc-tasks/${params.task_id}/comments`,
          payload
        );

        return {
          content: [{ type: "text" as const, text: [
            "# ✅ Comentário Adicionado com Sucesso!",
            "",
            `- **Tarefa**: #${params.task_id}`,
            `- **Comentário**: ${params.comment}`,
          ].join("\n") }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );
}
