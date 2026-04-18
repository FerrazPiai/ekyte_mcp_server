/**
 * Zod schemas for task management (gestão de tarefas)
 */

import { z } from "zod";
import {
  DateSchema,
  WorkspaceIdSchema,
  TaskIdSchema,
  UserIdSchema,
  ResponseFormat,
  PaginationSchema,
} from "./common.js";

// ============ List Tasks ============

export const ListTasksSchema = z.object({
  workspace_id: z.number().int().positive().optional()
    .describe("ID do workspace para filtrar. Use ekyte_list_workspaces para descobrir."),
  project_id: z.number().int().positive().optional()
    .describe("ID do projeto para filtrar."),
  status: z.number()
    .int()
    .optional()
    .describe("Filtro por situação: 10=Ativas, 20=Pausadas, 30=Concluídas, 40=Canceladas. Padrão: 10 (Ativas)"),
  task_type_id: z.number().int().positive().optional()
    .describe("ID do tipo de tarefa para filtrar. Use ekyte_list_task_types para descobrir."),
  phase_id: z.number().int().positive().optional()
    .describe("ID da etapa atual para filtrar."),
  squad_id: z.number().int().positive().optional()
    .describe("ID da squad para filtrar (quando informado, workspace é ignorado)."),
  created_from: DateSchema.optional()
    .describe("Filtrar tasks criadas a partir desta data (AAAA-MM-DD)"),
  created_to: DateSchema.optional()
    .describe("Filtrar tasks criadas até esta data (AAAA-MM-DD)"),
  due_from: DateSchema.optional()
    .describe("Filtrar por data de entrega a partir de (AAAA-MM-DD)"),
  due_to: DateSchema.optional()
    .describe("Filtrar por data de entrega até (AAAA-MM-DD)"),
  phase_date_from: DateSchema.optional()
    .describe("Filtrar por data de etapa a partir de (AAAA-MM-DD)"),
  phase_date_to: DateSchema.optional()
    .describe("Filtrar por data de etapa até (AAAA-MM-DD)"),
  resolved_date_from: DateSchema.optional()
    .describe("Filtrar por data de conclusão a partir de (AAAA-MM-DD)"),
  resolved_date_to: DateSchema.optional()
    .describe("Filtrar por data de conclusão até (AAAA-MM-DD)"),
  include_checklist: z.boolean().default(false)
    .describe("Se true, retorna os checklists da tarefa"),
  include_phases: z.boolean().default(false)
    .describe("Se true, retorna as etapas da tarefa"),
  include_comments: z.boolean().default(false)
    .describe("Se true, retorna os comentários da tarefa"),
  page: z.number().int().min(1).default(1)
    .describe("Número da página (inicia em 1)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Formato de saída"),
}).strict();

export type ListTasksInput = z.infer<typeof ListTasksSchema>;

// ============ Get Task ============

export const GetTaskSchema = z.object({
  task_id: TaskIdSchema,
  include_checklist: z.boolean().default(true)
    .describe("Se true, retorna os checklists da tarefa"),
  include_phases: z.boolean().default(true)
    .describe("Se true, retorna as etapas da tarefa"),
  include_comments: z.boolean().default(true)
    .describe("Se true, retorna os comentários da tarefa"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Formato de saída"),
}).strict();

export type GetTaskInput = z.infer<typeof GetTaskSchema>;

// ============ Create Task ============

export const CreateTaskSchema = z.object({
  title: z.string()
    .min(1, "Título é obrigatório")
    .max(500, "Título deve ter no máximo 500 caracteres")
    .describe("Título da nova tarefa"),
  workspace_id: WorkspaceIdSchema,
  task_type_id: z.number()
    .int()
    .positive()
    .describe("ID do tipo de tarefa. Use ekyte_list_task_types para descobrir o ID."),
  executor_id: UserIdSchema
    .describe("UUID do responsável pela tarefa. Use ekyte_list_users para descobrir."),
  phase_id: z.number()
    .int()
    .positive()
    .describe("ID da etapa/fase inicial da tarefa."),
  estimated_time_minutes: z.number()
    .int()
    .min(1, "Tempo estimado deve ser pelo menos 1 minuto")
    .max(9999, "Tempo estimado máximo é 9999 minutos")
    .default(60)
    .describe("Tempo estimado em minutos (ex: 60 para 1 hora, 120 para 2 horas)"),
  phase_start_date: DateSchema
    .describe("Data de início da etapa no formato AAAA-MM-DD"),
  phase_due_date: DateSchema
    .describe("Data de entrega da etapa no formato AAAA-MM-DD"),
  description: z.string()
    .max(5000, "Descrição deve ter no máximo 5000 caracteres")
    .default("")
    .describe("Descrição detalhada da tarefa (opcional)"),
}).strict();

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

// ============ List Workspaces ============

export const ListWorkspacesSchema = z.object({
  search: z.string().trim().min(1).optional()
    .describe("Filtro de texto (case-insensitive) no nome do workspace. Ex: 'ferraz' acha 'V4 Ferraz Piai'."),
  active_only: z.boolean().default(false)
    .describe("Se true, retorna só workspaces ativos (active=1)."),
  page: z.number().int().min(1).default(1)
    .describe("Página do resultado filtrado (paginação client-side, 50 por página)."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Formato de saída"),
}).strict();

export type ListWorkspacesInput = z.infer<typeof ListWorkspacesSchema>;

// ============ List Users ============

export const ListUsersSchema = z.object({
  search: z.string().trim().min(1).optional()
    .describe("Filtro de texto (case-insensitive) por nome ou email."),
  page: z.number().int().min(1).default(1)
    .describe("Página do resultado filtrado (paginação client-side, 50 por página)."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Formato de saída"),
}).strict();

export type ListUsersInput = z.infer<typeof ListUsersSchema>;

// ============ Update Task (PATCH) ============

export const UpdateTaskSchema = z.object({
  task_id: TaskIdSchema,
  title: z.string()
    .min(1).max(500)
    .optional()
    .describe("Novo título da tarefa (opcional)"),
  description: z.string()
    .max(5000)
    .optional()
    .describe("Nova descrição da tarefa em texto simples (será convertido para HTML). Opcional."),
  executor_id: UserIdSchema
    .optional()
    .describe("UUID do novo responsável (opcional). Use ekyte_list_users para descobrir."),
  phase_id: z.number().int().positive()
    .optional()
    .describe("ID da nova etapa/fase (opcional)."),
  phase_start_date: DateSchema
    .optional()
    .describe("Nova data de início da etapa (AAAA-MM-DD). Opcional."),
  phase_due_date: DateSchema
    .optional()
    .describe("Nova data de entrega da etapa (AAAA-MM-DD). Opcional."),
  priority: z.number().int().min(0).max(100)
    .optional()
    .describe("Nova prioridade da tarefa (0-100). Opcional."),
}).strict().refine(
  (data) => {
    // At least one field must be provided
    return data.title !== undefined || data.description !== undefined ||
      data.executor_id !== undefined || data.phase_id !== undefined ||
      data.phase_start_date !== undefined || data.phase_due_date !== undefined ||
      data.priority !== undefined;
  },
  { message: "Pelo menos um campo deve ser informado para atualização." }
);

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// ============ Complete Task ============

export const CompleteTaskSchema = z.object({
  task_id: TaskIdSchema,
}).strict();

export type CompleteTaskInput = z.infer<typeof CompleteTaskSchema>;

// ============ Add Comment to Task ============

export const AddTaskCommentSchema = z.object({
  task_id: TaskIdSchema,
  comment: z.string()
    .min(1, "Comentário não pode ser vazio")
    .max(5000, "Comentário deve ter no máximo 5000 caracteres")
    .describe("Texto do comentário a ser adicionado na tarefa"),
}).strict();

export type AddTaskCommentInput = z.infer<typeof AddTaskCommentSchema>;

// ============ List Task Types ============

export const ListTaskTypesSchema = z.object({
  search: z.string().trim().min(1).optional()
    .describe("Filtro de texto (case-insensitive) no nome do tipo de tarefa. Ex: 'onboarding'."),
  active_only: z.boolean().default(false)
    .describe("Se true, retorna só tipos ativos (active=1)."),
  page: z.number().int().min(1).default(1)
    .describe("Página do resultado filtrado (paginação client-side, 50 por página)."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Formato de saída"),
}).strict();

export type ListTaskTypesInput = z.infer<typeof ListTaskTypesSchema>;

// ============ List Workflow Phases ============

export const ListPhasesSchema = z.object({
  workflow_id: z.number()
    .int("workflow_id deve ser número inteiro")
    .positive("workflow_id deve ser positivo")
    .describe("ID do workflow. Obtenha via ekyte_list_task_types (campo workflow_id)."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Formato de saída"),
}).strict();

export type ListPhasesInput = z.infer<typeof ListPhasesSchema>;
