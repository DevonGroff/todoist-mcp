import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { TodoistUpload, TodoistComment, ToolResponse } from '../types/index.js';
import { createComment } from './comments.js';

export interface UploadFileParams {
  file_path: string;
  file_name?: string;
  project_id?: string;
}

export async function uploadFile(params: UploadFileParams): Promise<ToolResponse<TodoistUpload>> {
  try {
    await stat(params.file_path);
    const fileName = params.file_name || basename(params.file_path);
    const buf = await readFile(params.file_path);
    const blob = new Blob([new Uint8Array(buf)]);

    const form = new FormData();
    form.append('file', blob, fileName);
    if (params.project_id) form.append('project_id', params.project_id);

    const client = getApiClient();
    const result = await client.postMultipart<TodoistUpload>('/uploads', form);
    return createResponse(true, result);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function deleteUpload(file_url: string): Promise<ToolResponse<{ deleted: boolean }>> {
  try {
    const client = getApiClient();
    await client.delete('/uploads', { file_url });
    return createResponse(true, { deleted: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export interface AttachFileToTaskParams {
  task_id: string;
  file_path: string;
  file_name?: string;
  comment?: string;
}

export async function attachFileToTask(
  params: AttachFileToTaskParams
): Promise<ToolResponse<{ upload: TodoistUpload; comment: TodoistComment }>> {
  try {
    const uploadResult = await uploadFile({
      file_path: params.file_path,
      file_name: params.file_name,
    });
    if (!uploadResult.success || !uploadResult.data) {
      return createResponse(false, undefined, uploadResult.error);
    }
    const upload = uploadResult.data;

    const commentResult = await createComment({
      task_id: params.task_id,
      content: params.comment || `Attached ${upload.file_name}`,
      attachment: {
        file_url: upload.file_url,
        file_type: upload.file_type,
        file_name: upload.file_name,
      },
    });

    if (!commentResult.success || !commentResult.data) {
      return createResponse(false, undefined, commentResult.error);
    }

    return createResponse(true, { upload, comment: commentResult.data });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}
