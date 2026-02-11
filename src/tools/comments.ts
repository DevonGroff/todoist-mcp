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
    const results = await client.getAllPaginated<TodoistComment>('/comments', params as Record<string, unknown>);
    return createResponse(true, results);
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

export async function createCommentsBatch(
  comments: Array<CreateCommentParams & { prefix?: CommentPrefix }>
): Promise<ToolResponse<{
  created: TodoistComment[];
  failed: Array<{ index: number; error: { code: string; message: string } }>;
}>> {
  const created: TodoistComment[] = [];
  const failed: Array<{ index: number; error: { code: string; message: string } }> = [];

  const createPromises = comments.map(async (params, index) => {
    try {
      const result = await createComment(params);
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
      created.push(outcome.data as TodoistComment);
    } else if ('error' in outcome) {
      failed.push({
        index: outcome.index,
        error: outcome.error as { code: string; message: string },
      });
    }
  }

  return createResponse(true, { created, failed });
}
