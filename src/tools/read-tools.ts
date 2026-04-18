/**
 * Read-only tools for Ekyte MCP Server
 *
 * These tools only fetch data and never modify anything in Ekyte.
 * All endpoints live under the internal API: /api/companies/{companyId}/...
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, companyUrl, companyV2Url, handleApiError } from "../services/ekyte-client.js";
import { TASK_STATUS_LABELS, CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormat } from "../schemas/common.js";
import {
  ListWorkspacesSchema,
  ListUsersSchema,
  ListTaskTypesSchema,
  ListTasksSchema,
  GetTaskSchema,
  ListPhasesSchema,
  type ListWorkspacesInput,
  type ListUsersInput,
  type ListTaskTypesInput,
  type ListTasksInput,
  type GetTaskInput,
  type ListPhasesInput,
} from "../schemas/task.js";
import type { EkyteWorkspace, EkyteUser, EkyteTaskType, EkyteTask } from "../types.js";

// ============ Helpers ============

const PAGE_SIZE = 50;

function formatResponse(data: unknown, markdown: string, format: ResponseFormat) {
  const textContent = format === ResponseFormat.MARKDOWN
    ? markdown
    : JSON.stringify(data, null, 2);
  if (textContent.length > CHARACTER_LIMIT) {
    return textContent.substring(0, CHARACTER_LIMIT) +
      "\n\n⚠️ Resposta truncada. Use o parâmetro `search` para filtrar por nome, ou avance a `page`.";
  }
  return textContent;
}

function paginate<T>(items: T[], page: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  return {
    slice,
    total,
    page: safePage,
    totalPages,
    hasMore: safePage < totalPages,
    nextPage: safePage < totalPages ? safePage + 1 : null,
  };
}

function matchSearch(haystack: string | undefined | null, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ============ Register Read Tools ============

export function registerReadTools(server: McpServer): void {

  // -------- List Workspaces --------
  server.registerTool(
    "ekyte_list_workspaces",
    {
      title: "Listar Workspaces do Ekyte",
      description: `Lista todos os workspaces (clientes/projetos) da empresa no Ekyte.

Use PRIMEIRO para descobrir o workspace_id antes de criar tasks ou apontar horas.
Retorna: id, nome, status (ativo/inativo), idioma padrão.

Paginação: 100 registros por página.`,
      inputSchema: ListWorkspacesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListWorkspacesInput) => {
      try {
        const data = await apiGet<EkyteWorkspace[]>(companyUrl("workspaces"));
        const all = Array.isArray(data) ? data : [];

        let filtered = all;
        if (params.active_only) filtered = filtered.filter((w) => w.active === 1);
        if (params.search) filtered = filtered.filter((w) => matchSearch(w.name, params.search!));

        if (filtered.length === 0) {
          const hint = params.search
            ? `Nenhum workspace encontrado para "${params.search}". Total na conta: ${all.length}.`
            : "Nenhum workspace encontrado.";
          return { content: [{ type: "text" as const, text: hint }] };
        }

        const { slice, total, page, totalPages, hasMore, nextPage } = paginate(filtered, params.page);

        const output = {
          total_in_account: all.length,
          filtered_total: total,
          page,
          total_pages: totalPages,
          search: params.search ?? null,
          active_only: params.active_only,
          items: slice.map((w) => ({
            id: w.id,
            name: w.name,
            active: w.active === 1,
          })),
          has_more: hasMore,
          next_page: nextPage,
        };

        const markdown = [
          "# Workspaces do Ekyte",
          "",
          params.search ? `Filtro: "${params.search}"` : `Total na conta: ${all.length}`,
          `Página ${page}/${totalPages} — ${slice.length} de ${total} resultado(s)`,
          "",
          "| ID | Nome | Ativo |",
          "|----|------|-------|",
          ...slice.map((w) => `| ${w.id} | ${w.name} | ${w.active === 1 ? "Sim" : "Não"} |`),
          "",
          hasMore ? `➡️ Mais resultados na página ${nextPage}` : "✅ Fim dos resultados.",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: formatResponse(output, markdown, params.response_format) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- List Users --------
  server.registerTool(
    "ekyte_list_users",
    {
      title: "Listar Usuários do Ekyte",
      description: `Lista todos os usuários/membros da empresa no Ekyte.

Use para descobrir o UUID do usuário antes de criar tasks ou apontar horas.
Retorna: id (UUID), nome, email, workspace padrão.

IMPORTANTE: O ID do usuário é um UUID (ex: "feff4a61-b0a3-483d-a384-172c4b301ee0"), não um número.`,
      inputSchema: ListUsersSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListUsersInput) => {
      try {
        const data = await apiGet<EkyteUser[]>(companyUrl("users"));
        const all = Array.isArray(data) ? data : [];

        let filtered = all;
        if (params.search) {
          filtered = filtered.filter((u) =>
            matchSearch(u.userName, params.search!) || matchSearch(u.email, params.search!)
          );
        }

        if (filtered.length === 0) {
          const hint = params.search
            ? `Nenhum usuário encontrado para "${params.search}". Total: ${all.length}.`
            : "Nenhum usuário encontrado.";
          return { content: [{ type: "text" as const, text: hint }] };
        }

        const { slice, total, page, totalPages, hasMore, nextPage } = paginate(filtered, params.page);

        const output = {
          total_in_account: all.length,
          filtered_total: total,
          page,
          total_pages: totalPages,
          search: params.search ?? null,
          items: slice.map((u) => ({
            id: u.id,
            name: u.userName,
            email: u.email,
          })),
          has_more: hasMore,
          next_page: nextPage,
        };

        const markdown = [
          "# Usuários do Ekyte",
          "",
          params.search ? `Filtro: "${params.search}"` : `Total na conta: ${all.length}`,
          `Página ${page}/${totalPages} — ${slice.length} de ${total} resultado(s)`,
          "",
          "| ID (UUID) | Nome | Email |",
          "|-----------|------|-------|",
          ...slice.map((u) => `| ${u.id} | ${u.userName} | ${u.email} |`),
          "",
          hasMore ? `➡️ Mais resultados na página ${nextPage}` : "✅ Fim dos resultados.",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: formatResponse(output, markdown, params.response_format) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- List Task Types --------
  server.registerTool(
    "ekyte_list_task_types",
    {
      title: "Listar Tipos de Tarefa do Ekyte",
      description: `Lista todos os tipos de tarefa (templates) da empresa.

Use para descobrir o task_type_id antes de criar tarefas.
Retorna: id, nome, workflow_id (importante: cada task-type pertence a um workflow, e as phases vivem no workflow).

DICA: Depois de achar o task_type, use ekyte_list_phases com o workflow_id correspondente para descobrir as phases disponíveis.`,
      inputSchema: ListTaskTypesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListTaskTypesInput) => {
      try {
        const data = await apiGet<EkyteTaskType[]>(companyUrl("task-types"));
        const all = Array.isArray(data) ? data : [];

        let filtered = all;
        if (params.active_only) filtered = filtered.filter((t) => t.active === 1);
        if (params.search) filtered = filtered.filter((t) => matchSearch(t.name, params.search!));

        if (filtered.length === 0) {
          const hint = params.search
            ? `Nenhum tipo de tarefa encontrado para "${params.search}". Total: ${all.length}.`
            : "Nenhum tipo de tarefa encontrado.";
          return { content: [{ type: "text" as const, text: hint }] };
        }

        const { slice, total, page, totalPages, hasMore, nextPage } = paginate(filtered, params.page);

        const output = {
          total_in_account: all.length,
          filtered_total: total,
          page,
          total_pages: totalPages,
          search: params.search ?? null,
          active_only: params.active_only,
          items: slice.map((t) => ({
            id: t.id,
            name: t.name,
            active: t.active === 1,
            workflow_id: t.workflowId,
            group: t.ctcTaskTypeGroup?.name,
          })),
          has_more: hasMore,
          next_page: nextPage,
        };

        const markdown = [
          "# Tipos de Tarefa do Ekyte",
          "",
          params.search ? `Filtro: "${params.search}"` : `Total na conta: ${all.length}`,
          `Página ${page}/${totalPages} — ${slice.length} de ${total} resultado(s)`,
          "",
          "| ID | Nome | Ativo | Workflow ID | Grupo |",
          "|----|------|-------|-------------|-------|",
          ...slice.map((t) =>
            `| ${t.id} | ${t.name} | ${t.active === 1 ? "Sim" : "Não"} | ${t.workflowId} | ${t.ctcTaskTypeGroup?.name ?? "-"} |`
          ),
          "",
          hasMore ? `➡️ Mais resultados na página ${nextPage}` : "✅ Fim dos resultados.",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: formatResponse(output, markdown, params.response_format) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- List Workflow Phases --------
  server.registerTool(
    "ekyte_list_phases",
    {
      title: "Listar Fases (Phases) de um Workflow",
      description: `Lista as fases (phases) de um workflow do Ekyte.

Cada tipo de tarefa pertence a um workflow, e o workflow contém as fases possíveis para tarefas daquele tipo.

Use esta ferramenta ANTES de criar uma tarefa: descubra o workflow_id via ekyte_list_task_types, depois use este tool para achar o phase_id correto (normalmente a fase inicial).

Retorna: id, nome, sequencial, ativo.`,
      inputSchema: ListPhasesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListPhasesInput) => {
      try {
        const data = await apiGet<Record<string, unknown>>(
          companyUrl(`workflows/${params.workflow_id}`)
        );

        const phases = Array.isArray(data.phases) ? data.phases as Record<string, unknown>[] : [];
        if (phases.length === 0) {
          return { content: [{ type: "text" as const, text: `Nenhuma fase encontrada para workflow ${params.workflow_id}.` }] };
        }

        const output = {
          workflow_id: params.workflow_id,
          workflow_name: data.name ?? "-",
          count: phases.length,
          items: phases.map((p) => ({
            id: p.id,
            name: p.name,
            sequential: p.sequential,
            active: p.active === 1,
            hidden: p.hidden === 1,
          })),
        };

        const markdown = [
          `# Fases do Workflow #${params.workflow_id} — ${data.name ?? "-"}`,
          "",
          `${phases.length} fase(s) encontrada(s)`,
          "",
          "| ID | Seq | Nome | Ativa |",
          "|----|-----|------|-------|",
          ...phases.map((p) =>
            `| ${p.id} | ${p.sequential} | ${p.name} | ${p.active === 1 ? "Sim" : "Não"} |`
          ),
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: formatResponse(output, markdown, params.response_format) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- List Tasks --------
  server.registerTool(
    "ekyte_list_tasks",
    {
      title: "Listar Tarefas do Ekyte",
      description: `Lista tarefas da empresa no Ekyte com filtros opcionais.

Filtros suportados: workspace_id, situation (status), task_type_id, phase_id, datas.

Retorna: id, título, status, responsável, datas, tempo estimado/real, workspace, tipo de tarefa.`,
      inputSchema: ListTasksSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListTasksInput) => {
      try {
        const queryParams: Record<string, unknown> = {
          page: params.page,
        };

        if (params.workspace_id !== undefined) queryParams.workspaceId = params.workspace_id;
        if (params.project_id !== undefined) queryParams.projectId = params.project_id;
        if (params.status !== undefined) queryParams.situation = params.status;
        if (params.task_type_id !== undefined) queryParams.ctcTaskTypeId = params.task_type_id;
        if (params.phase_id !== undefined) queryParams.phaseId = params.phase_id;
        if (params.created_from) queryParams.createdFrom = params.created_from;
        if (params.created_to) queryParams.createdTo = params.created_to;
        if (params.due_from) queryParams.dueFrom = params.due_from;
        if (params.due_to) queryParams.dueTo = params.due_to;

        const data = await apiGet<EkyteTask[]>(companyV2Url("ctc-tasks"), queryParams);

        const tasks = Array.isArray(data) ? data : [];
        if (tasks.length === 0) {
          return { content: [{ type: "text" as const, text: "Nenhuma tarefa encontrada com os filtros informados." }] };
        }

        const formatMinutes = (mins: number): string => {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        };

        const output = {
          count: tasks.length,
          page: params.page,
          items: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: TASK_STATUS_LABELS[t.situation] ?? `Desconhecido (${t.situation})`,
            status_code: t.situation,
            workspace: t.workspace?.name ?? "-",
            workspace_id: t.workspaceId,
            task_type: t.ctcTaskType?.name ?? "-",
            task_type_id: t.ctcTaskTypeId,
            phase_id: t.phaseId,
            executor: t.executor?.userName ?? "-",
            executor_id: t.executorId,
            estimated_time: formatMinutes(t.estimatedTime ?? 0),
            actual_time: formatMinutes(t.actualTime ?? 0),
            phase_start_date: t.phaseStartDate?.split("T")[0] ?? "-",
            phase_due_date: t.phaseDueDate?.split("T")[0] ?? "-",
            current_due_date: t.currentDueDate?.split("T")[0] ?? "-",
            created_at: t.creationDate?.split("T")[0] ?? "-",
          })),
          has_more: tasks.length >= 100,
          next_page: tasks.length >= 100 ? params.page + 1 : null,
        };

        const markdown = [
          "# Tarefas do Ekyte",
          "",
          `Página ${params.page} — ${tasks.length} resultado(s)`,
          "",
          ...tasks.map((t) => [
            `## #${t.id} — ${t.title}`,
            `- **Status**: ${TASK_STATUS_LABELS[t.situation] ?? t.situation}`,
            `- **Workspace**: ${t.workspace?.name ?? "-"} (ID: ${t.workspaceId})`,
            `- **Tipo**: ${t.ctcTaskType?.name ?? "-"}`,
            `- **Responsável**: ${t.executor?.userName ?? "-"}`,
            `- **Tempo**: Estimado ${formatMinutes(t.estimatedTime ?? 0)} | Real ${formatMinutes(t.actualTime ?? 0)}`,
            `- **Entrega**: ${t.currentDueDate?.split("T")[0] ?? "-"}`,
            "",
          ]).flat(),
          output.has_more ? `➡️ Mais resultados na página ${output.next_page}` : "✅ Fim dos resultados.",
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: formatResponse(output, markdown, params.response_format) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );

  // -------- Get Single Task --------
  server.registerTool(
    "ekyte_get_task",
    {
      title: "Ver Detalhes de uma Tarefa",
      description: `Busca os detalhes completos de uma tarefa específica pelo ID.

Use ekyte_list_tasks primeiro para encontrar o ID.

Retorna: título, descrição, status, responsável, workspace, tipo, datas, tempos.`,
      inputSchema: GetTaskSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetTaskInput) => {
      try {
        const task = await apiGet<EkyteTask>(
          companyV2Url(`ctc-tasks/${params.task_id}`)
        );

        if (!task || !task.id) {
          return {
            content: [{
              type: "text" as const,
              text: `Tarefa com ID ${params.task_id} não encontrada.`,
            }],
          };
        }

        const formatMinutes = (mins: number): string => {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        };

        const output = {
          id: task.id,
          title: task.title,
          description: task.description,
          status: TASK_STATUS_LABELS[task.situation] ?? `Desconhecido (${task.situation})`,
          status_code: task.situation,
          workspace: task.workspace?.name,
          workspace_id: task.workspaceId,
          task_type: task.ctcTaskType?.name,
          task_type_id: task.ctcTaskTypeId,
          phase_id: task.phaseId,
          executor: task.executor?.userName,
          executor_id: task.executorId,
          estimated_time: formatMinutes(task.estimatedTime ?? 0),
          actual_time: formatMinutes(task.actualTime ?? 0),
          phase_start_date: task.phaseStartDate?.split("T")[0],
          phase_due_date: task.phaseDueDate?.split("T")[0],
          current_due_date: task.currentDueDate?.split("T")[0],
          created_at: task.creationDate?.split("T")[0],
          resolved_at: task.resolvedDate?.split("T")[0] ?? null,
          created_by: task.createBy?.userName,
          priority: task.priority,
        };

        const markdown = [
          `# Tarefa #${task.id} — ${task.title}`,
          "",
          task.description ? `> ${task.description.replace(/<[^>]+>/g, "")}` : "",
          "",
          `- **Status**: ${output.status}`,
          `- **Workspace**: ${output.workspace} (ID: ${output.workspace_id})`,
          `- **Tipo**: ${output.task_type} (ID: ${output.task_type_id})`,
          `- **Phase ID**: ${output.phase_id}`,
          `- **Responsável**: ${output.executor}`,
          `- **Criado por**: ${output.created_by ?? "-"}`,
          "",
          "### Datas",
          `- Início etapa: ${output.phase_start_date}`,
          `- Entrega etapa: ${output.phase_due_date}`,
          `- Entrega atual: ${output.current_due_date}`,
          `- Criação: ${output.created_at}`,
          output.resolved_at ? `- Conclusão: ${output.resolved_at}` : "",
          "",
          "### Tempo",
          `- Estimado: ${output.estimated_time}`,
          `- Real: ${output.actual_time}`,
        ].filter(Boolean).join("\n");

        return {
          content: [{ type: "text" as const, text: formatResponse(output, markdown, params.response_format) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleApiError(error) }] };
      }
    }
  );
}
