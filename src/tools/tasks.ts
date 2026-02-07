import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type {
  TodoistTask,
  ToolResponse,
  ListTasksParams,
  CreateTaskParams,
  UpdateTaskParams,
  MoveTaskParams,
} from '../types/index.js';

export async function listTasks(params: ListTasksParams = {}): Promise<ToolResponse<TodoistTask[]>> {
  try {
    const client = getApiClient();
    const queryParams: Record<string, unknown> = {};
    
    if (params.project_id) queryParams.project_id = params.project_id;
    if (params.section_id) queryParams.section_id = params.section_id;
    if (params.label) queryParams.label = params.label;
    if (params.filter) queryParams.filter = params.filter;
    if (params.lang) queryParams.lang = params.lang;
    if (params.ids && params.ids.length > 0) queryParams.ids = params.ids.join(',');
    
    const tasks = await client.get<TodoistTask[]>('/tasks', queryParams);
    return createResponse(true, tasks);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function getTask(taskId: string): Promise<ToolResponse<TodoistTask>> {
  try {
    const client = getApiClient();
    const task = await client.get<TodoistTask>(`/tasks/${taskId}`);
    return createResponse(true, task);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function createTask(params: CreateTaskParams): Promise<ToolResponse<TodoistTask>> {
  try {
    const client = getApiClient();
    const task = await client.post<TodoistTask>('/tasks', params as unknown as Record<string, unknown>);
    return createResponse(true, task);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function updateTask(taskId: string, params: UpdateTaskParams): Promise<ToolResponse<TodoistTask>> {
  try {
    const client = getApiClient();
    const task = await client.post<TodoistTask>(`/tasks/${taskId}`, params as unknown as Record<string, unknown>);
    return createResponse(true, task);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function completeTask(taskId: string): Promise<ToolResponse<{ completed: boolean }>> {
  try {
    const client = getApiClient();
    await client.post<void>(`/tasks/${taskId}/close`, {});
    return createResponse(true, { completed: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function reopenTask(taskId: string): Promise<ToolResponse<{ reopened: boolean }>> {
  try {
    const client = getApiClient();
    await client.post<void>(`/tasks/${taskId}/reopen`, {});
    return createResponse(true, { reopened: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function deleteTask(taskId: string): Promise<ToolResponse<{ deleted: boolean }>> {
  try {
    const client = getApiClient();
    await client.delete(`/tasks/${taskId}`);
    return createResponse(true, { deleted: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function moveTask(params: MoveTaskParams): Promise<ToolResponse<TodoistTask>> {
  try {
    const client = getApiClient();
    const moveParams: Record<string, unknown> = {};
    
    if (params.project_id) moveParams.project_id = params.project_id;
    if (params.section_id) moveParams.section_id = params.section_id;
    if (params.parent_id !== undefined) moveParams.parent_id = params.parent_id;
    
    const task = await client.post<TodoistTask>(`/tasks/${params.task_id}/move`, moveParams);
    return createResponse(true, task);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function createTasksBatch(tasks: CreateTaskParams[]): Promise<ToolResponse<{
  created: TodoistTask[];
  failed: Array<{ index: number; error: { code: string; message: string } }>;
}>> {
  const results: TodoistTask[] = [];
  const failed: Array<{ index: number; error: { code: string; message: string } }> = [];
  
  const createPromises = tasks.map(async (taskParams, index) => {
    try {
      const result = await createTask(taskParams);
      if (result.success && result.data) {
        return { success: true, index, data: result.data };
      } else {
        return { 
          success: false, 
          index, 
          error: result.error || { code: 'UNKNOWN', message: 'Unknown error' } 
        };
      }
    } catch (error) {
      return { success: false, index, error: handleApiError(error) };
    }
  });
  
  const outcomes = await Promise.all(createPromises);
  
  for (const outcome of outcomes) {
    if (outcome.success && 'data' in outcome) {
      results.push(outcome.data as TodoistTask);
    } else if ('error' in outcome) {
      failed.push({ 
        index: outcome.index, 
        error: outcome.error as { code: string; message: string }
      });
    }
  }
  
  return createResponse(true, { created: results, failed });
}

export async function searchTasks(query: string, params: Omit<ListTasksParams, 'filter'> = {}): Promise<ToolResponse<TodoistTask[]>> {
  try {
    const client = getApiClient();
    const queryParams: Record<string, unknown> = {
      filter: `search: ${query}`,
    };
    
    if (params.project_id) queryParams.project_id = params.project_id;
    if (params.section_id) queryParams.section_id = params.section_id;
    if (params.label) queryParams.label = params.label;
    if (params.lang) queryParams.lang = params.lang;
    
    const tasks = await client.get<TodoistTask[]>('/tasks', queryParams);
    return createResponse(true, tasks);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}
