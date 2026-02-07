import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { TodoistComment, ToolResponse, CreateCommentParams, UpdateCommentParams } from '../types/index.js';

export type CommentPrefix = '[Research]' | '[Prompt]' | '[Context]' | '[Note]' | '[Summary]' | '';

export function formatCommentWithPrefix(content: string, prefix?: CommentPrefix): string {
  if (!prefix) return content;
  return `${prefix} ${content}`;
}

export function parseCommentPrefix(content: string): { prefix: CommentPrefix | null; content: string } {
  const prefixPattern = /^\[(Research|Prompt|Context|Note|Summary)\]\s*/;
  const match = content.match(prefixPattern);
  
  if (match) {
    return {
      prefix: match[0].trim() as CommentPrefix,
      content: content.slice(match[0].length),
    };
  }
  
  return { prefix: null, content };
}

export async function listComments(params: { task_id?: string; project_id?: string }): Promise<ToolResponse<TodoistComment[]>> {
  try {
    if (!params.task_id && !params.project_id) {
      return createResponse(false, undefined, {
        code: 'INVALID_PARAMS',
        message: 'Either task_id or project_id is required',
      });
    }
    
    const client = getApiClient();
    const comments = await client.get<TodoistComment[]>('/comments', params);
    return createResponse(true, comments);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function getComment(commentId: string): Promise<ToolResponse<TodoistComment>> {
  try {
    const client = getApiClient();
    const comment = await client.get<TodoistComment>(`/comments/${commentId}`);
    return createResponse(true, comment);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function createComment(params: CreateCommentParams & { prefix?: CommentPrefix }): Promise<ToolResponse<TodoistComment>> {
  try {
    if (!params.task_id && !params.project_id) {
      return createResponse(false, undefined, {
        code: 'INVALID_PARAMS',
        message: 'Either task_id or project_id is required',
      });
    }
    
    const client = getApiClient();
    const content = formatCommentWithPrefix(params.content, params.prefix);
    const requestParams: Record<string, unknown> = { content };
    
    if (params.task_id) requestParams.task_id = params.task_id;
    if (params.project_id) requestParams.project_id = params.project_id;
    if (params.attachment) requestParams.attachment = params.attachment;
    
    const comment = await client.post<TodoistComment>('/comments', requestParams);
    return createResponse(true, comment);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function updateComment(
  commentId: string,
  params: UpdateCommentParams & { prefix?: CommentPrefix }
): Promise<ToolResponse<TodoistComment>> {
  try {
    const client = getApiClient();
    const content = formatCommentWithPrefix(params.content, params.prefix);
    const comment = await client.post<TodoistComment>(`/comments/${commentId}`, { content });
    return createResponse(true, comment);
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function deleteComment(commentId: string): Promise<ToolResponse<{ deleted: boolean }>> {
  try {
    const client = getApiClient();
    await client.delete(`/comments/${commentId}`);
    return createResponse(true, { deleted: true });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function addResearchComment(
  taskId: string,
  research: string
): Promise<ToolResponse<TodoistComment>> {
  return createComment({
    task_id: taskId,
    content: research,
    prefix: '[Research]',
  });
}

export async function addPromptComment(
  taskId: string,
  prompt: string
): Promise<ToolResponse<TodoistComment>> {
  return createComment({
    task_id: taskId,
    content: prompt,
    prefix: '[Prompt]',
  });
}

export async function addContextComment(
  taskId: string,
  context: string
): Promise<ToolResponse<TodoistComment>> {
  return createComment({
    task_id: taskId,
    content: context,
    prefix: '[Context]',
  });
}
