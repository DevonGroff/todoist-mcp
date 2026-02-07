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

export async function createSectionsBatch(
  sections: CreateSectionParams[]
): Promise<ToolResponse<{
  created: TodoistSection[];
  failed: Array<{ index: number; error: { code: string; message: string } }>;
}>> {
  const created: TodoistSection[] = [];
  const failed: Array<{ index: number; error: { code: string; message: string } }> = [];

  const createPromises = sections.map(async (params, index) => {
    try {
      const result = await createSection(params);
      if (result.success && result.data) {
        return { success: true, index, data: result.data };
      } else {
        return {
          success: false,
          index,
          error: result.error || { code: 'UNKNOWN', message: 'Unknown error' },
        };
      }
    } catch (error) {
      return { success: false, index, error: handleApiError(error) };
    }
  });

  const outcomes = await Promise.all(createPromises);

  for (const outcome of outcomes) {
    if (outcome.success && 'data' in outcome) {
      created.push(outcome.data as TodoistSection);
    } else if ('error' in outcome) {
      failed.push({
        index: outcome.index,
        error: outcome.error as { code: string; message: string },
      });
    }
  }

  return createResponse(true, { created, failed });
}
