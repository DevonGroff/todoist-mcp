import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { TodoistLabel, ToolResponse } from '../types/index.js';

interface CreateLabelParams {
  name: string;
  color?: string;
  order?: number;
  is_favorite?: boolean;
}

export async function listLabels(): Promise<ToolResponse<TodoistLabel[]>> {
  try {
    const client = getApiClient();
    const labels = await client.get<TodoistLabel[]>('/labels');
    return createResponse(true, labels);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function getLabel(labelId: string): Promise<ToolResponse<TodoistLabel>> {
  try {
    const client = getApiClient();
    const label = await client.get<TodoistLabel>(`/labels/${labelId}`);
    return createResponse(true, label);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function createLabel(params: CreateLabelParams): Promise<ToolResponse<TodoistLabel>> {
  try {
    const client = getApiClient();
    const label = await client.post<TodoistLabel>('/labels', params as unknown as Record<string, unknown>);
    return createResponse(true, label);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function updateLabel(
  labelId: string,
  params: Partial<CreateLabelParams>
): Promise<ToolResponse<TodoistLabel>> {
  try {
    const client = getApiClient();
    const label = await client.post<TodoistLabel>(`/labels/${labelId}`, params as unknown as Record<string, unknown>);
    return createResponse(true, label);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function deleteLabel(labelId: string): Promise<ToolResponse<{ deleted: boolean }>> {
  try {
    const client = getApiClient();
    await client.delete(`/labels/${labelId}`);
    return createResponse(true, { deleted: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}
