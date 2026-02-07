import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { TodoistSection, ToolResponse, CreateSectionParams } from '../types/index.js';

interface PaginatedResponse<T> {
  results: T[];
  next_cursor?: string;
}

export async function listSections(projectId?: string): Promise<ToolResponse<TodoistSection[]>> {
  try {
    const client = getApiClient();
    const params: Record<string, unknown> = {};
    if (projectId) {
      params.project_id = projectId;
    }
    const response = await client.get<PaginatedResponse<TodoistSection>>('/sections', params);
    return createResponse(true, response.results);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function getSection(sectionId: string): Promise<ToolResponse<TodoistSection>> {
  try {
    const client = getApiClient();
    const section = await client.get<TodoistSection>(`/sections/${sectionId}`);
    return createResponse(true, section);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function createSection(params: CreateSectionParams): Promise<ToolResponse<TodoistSection>> {
  try {
    const client = getApiClient();
    const section = await client.post<TodoistSection>('/sections', params as unknown as Record<string, unknown>);
    return createResponse(true, section);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function updateSection(
  sectionId: string,
  name: string
): Promise<ToolResponse<TodoistSection>> {
  try {
    const client = getApiClient();
    const section = await client.post<TodoistSection>(`/sections/${sectionId}`, { name });
    return createResponse(true, section);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function deleteSection(sectionId: string): Promise<ToolResponse<{ deleted: boolean }>> {
  try {
    const client = getApiClient();
    await client.delete(`/sections/${sectionId}`);
    return createResponse(true, { deleted: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}
