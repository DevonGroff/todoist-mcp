import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { CompletedTask, CompletedTasksResponse, ToolResponse } from '../types/index.js';

interface ListCompletedTasksParams {
  project_id?: string;
  section_id?: string;
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
  annotate_notes?: boolean;
}

interface SyncCompletedResponse {
  items: Array<{
    id: string;
    task_id: string;
    content: string;
    project_id: string;
    section_id?: string;
    completed_at: string;
    meta_data?: Record<string, unknown>;
    notes?: Array<{
      id: string;
      content: string;
      posted_at: string;
    }>;
  }>;
  projects: Record<string, {
    id: string;
    name: string;
    color: string;
  }>;
  sections: Record<string, {
    id: string;
    name: string;
    project_id: string;
  }>;
}

export async function listCompletedTasks(
  params: ListCompletedTasksParams = {}
): Promise<ToolResponse<CompletedTasksResponse>> {
  try {
    const client = getApiClient();
    
    const queryParams: Record<string, unknown> = {
      limit: params.limit || 50,
    };
    
    if (params.project_id) queryParams.project_id = params.project_id;
    if (params.section_id) queryParams.section_id = params.section_id;
    if (params.offset) queryParams.offset = params.offset;
    if (params.since) queryParams.since = params.since;
    if (params.until) queryParams.until = params.until;
    if (params.annotate_notes) queryParams.annotate_notes = params.annotate_notes;
    
    const response = await client.syncGet<SyncCompletedResponse>(
      '/completed/get_all',
      queryParams
    );
    
    const completedTasks: CompletedTask[] = response.items.map(item => ({
      id: item.id,
      task_id: item.task_id,
      content: item.content,
      project_id: item.project_id,
      section_id: item.section_id || null,
      completed_at: item.completed_at,
      meta_data: item.meta_data || null,
    }));
    
    return createResponse(true, {
      items: completedTasks,
      projects: response.projects as unknown as CompletedTasksResponse['projects'],
      sections: response.sections as unknown as CompletedTasksResponse['sections'],
    });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function getCompletedTaskStats(projectId?: string): Promise<ToolResponse<{
  total: number;
  byProject: Record<string, number>;
  byDate: Record<string, number>;
}>> {
  try {
    const result = await listCompletedTasks({ 
      project_id: projectId,
      limit: 200,
    });
    
    if (!result.success || !result.data) {
      return result as ToolResponse<never>;
    }
    
    const tasks = result.data.items;
    const byProject: Record<string, number> = {};
    const byDate: Record<string, number> = {};
    
    for (const task of tasks) {
      byProject[task.project_id] = (byProject[task.project_id] || 0) + 1;
      
      const date = task.completed_at.split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    }
    
    return createResponse(true, {
      total: tasks.length,
      byProject,
      byDate,
    });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}
