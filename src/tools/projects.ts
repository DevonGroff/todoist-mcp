import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { TodoistProject, ToolResponse, CreateProjectParams } from '../types/index.js';

interface PaginatedResponse<T> {
  results: T[];
  next_cursor?: string;
}

export async function listProjects(): Promise<ToolResponse<TodoistProject[]>> {
  try {
    const client = getApiClient();
    const response = await client.get<PaginatedResponse<TodoistProject>>('/projects');
    return createResponse(true, response.results);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function getProject(projectId: string): Promise<ToolResponse<TodoistProject>> {
  try {
    const client = getApiClient();
    const project = await client.get<TodoistProject>(`/projects/${projectId}`);
    return createResponse(true, project);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function createProject(params: CreateProjectParams): Promise<ToolResponse<TodoistProject>> {
  try {
    const client = getApiClient();
    const project = await client.post<TodoistProject>('/projects', params as unknown as Record<string, unknown>);
    return createResponse(true, project);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function updateProject(
  projectId: string,
  params: Partial<Omit<CreateProjectParams, 'parent_id'>>
): Promise<ToolResponse<TodoistProject>> {
  try {
    const client = getApiClient();
    const project = await client.post<TodoistProject>(`/projects/${projectId}`, params as unknown as Record<string, unknown>);
    return createResponse(true, project);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function deleteProject(projectId: string): Promise<ToolResponse<{ deleted: boolean }>> {
  try {
    const client = getApiClient();
    await client.delete(`/projects/${projectId}`);
    return createResponse(true, { deleted: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}
