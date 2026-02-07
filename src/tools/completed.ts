import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { CompletedTask, ToolResponse } from '../types/index.js';

interface ListCompletedTasksParams {
  project_id?: string;
  section_id?: string;
  limit?: number;
  since?: string;
  until?: string;
  cursor?: string;
}

interface CompletedTasksApiResponse {
  items: Array<{
    id: string;
    user_id: string;
    project_id: string;
    section_id?: string;
    parent_id?: string;
    content: string;
    description?: string;
    completed_at: string;
    added_at?: string;
    priority?: number;
    labels?: string[];
  }>;
  next_cursor?: string;
}

interface CompletedTasksResult {
  items: CompletedTask[];
  next_cursor?: string;
}

export async function listCompletedTasks(
  params: ListCompletedTasksParams = {}
): Promise<ToolResponse<CompletedTasksResult>> {
  try {
    const client = getApiClient();
    
    // API v1 requires since and until params (max 3 months range)
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const queryParams: Record<string, unknown> = {
      since: params.since || threeMonthsAgo.toISOString(),
      until: params.until || now.toISOString(),
      limit: params.limit || 50,
    };
    
    if (params.project_id) queryParams.project_id = params.project_id;
    if (params.section_id) queryParams.section_id = params.section_id;
    if (params.cursor) queryParams.cursor = params.cursor;
    
    const response = await client.get<CompletedTasksApiResponse>(
      '/tasks/completed/by_completion_date',
      queryParams
    );
    
    const completedTasks: CompletedTask[] = response.items.map(item => ({
      id: item.id,
      task_id: item.id,
      content: item.content,
      project_id: item.project_id,
      section_id: item.section_id || null,
      completed_at: item.completed_at,
      meta_data: null,
    }));
    
    return createResponse(true, {
      items: completedTasks,
      next_cursor: response.next_cursor,
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
