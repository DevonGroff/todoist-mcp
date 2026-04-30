import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TodoistComment } from '../src/types/index.js';

const { getApiClientMock, mockClient } = vi.hoisted(() => {
  const mockClient = {
    get: vi.fn(),
    getAllPaginated: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    postMultipart: vi.fn(),
  };

  return {
    mockClient,
    getApiClientMock: vi.fn(() => mockClient),
  };
});

vi.mock('../src/utils/api-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/api-client.js')>();
  return {
    ...actual,
    getApiClient: getApiClientMock,
  };
});

import {
  createComment,
  createCommentsBatch,
  formatCommentWithPrefix,
  parseCommentPrefix,
} from '../src/tools/comments.js';

function makeComment(overrides: Partial<TodoistComment> = {}): TodoistComment {
  return {
    id: 'comment-1',
    posted_uid: 'user-1',
    posted_at: '2026-04-30T12:00:00Z',
    content: 'Comment body',
    file_attachment: null,
    is_deleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getApiClientMock.mockReturnValue(mockClient);
});

describe('comment prefixes', () => {
  it('formats supported prefixes without changing unprefixed comments', () => {
    expect(formatCommentWithPrefix('Capture this finding', '[Research]')).toBe(
      '[Research] Capture this finding'
    );
    expect(formatCommentWithPrefix('No prefix')).toBe('No prefix');
  });

  it('parses supported prefixes from stored comment content', () => {
    expect(parseCommentPrefix('[Context] Discussed in planning')).toEqual({
      prefix: '[Context]',
      content: 'Discussed in planning',
    });
    expect(parseCommentPrefix('Plain comment')).toEqual({
      prefix: null,
      content: 'Plain comment',
    });
  });
});

describe('createComment', () => {
  it('rejects comments without a task or project before calling Todoist', async () => {
    const result = await createComment({ content: 'orphaned comment' });

    expect(result).toEqual({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: 'Either task_id or project_id is required',
      },
    });
    expect(getApiClientMock).not.toHaveBeenCalled();
  });

  it('posts prefixed content and attachments to Todoist', async () => {
    const savedComment = makeComment({ content: '[Research] API note' });
    mockClient.post.mockResolvedValue(savedComment);

    const attachment = {
      file_url: 'https://example.com/note.txt',
      file_type: 'text/plain',
      file_name: 'note.txt',
    };

    const result = await createComment({
      task_id: 'task-1',
      content: 'API note',
      prefix: '[Research]',
      attachment,
    });

    expect(mockClient.post).toHaveBeenCalledWith('/comments', {
      content: '[Research] API note',
      task_id: 'task-1',
      attachment,
    });
    expect(result).toEqual({ success: true, data: savedComment });
  });
});

describe('createCommentsBatch', () => {
  it('returns created comments and per-item failures', async () => {
    mockClient.post.mockImplementation(async (_endpoint: string, data: { content: string }) => {
      if (data.content === 'fails remotely') {
        throw new Error('Todoist unavailable');
      }
      return makeComment({ id: `comment-${data.content}`, content: data.content });
    });

    const result = await createCommentsBatch([
      { task_id: 'task-1', content: 'first' },
      { content: 'missing target' },
      { project_id: 'project-1', content: 'fails remotely' },
    ]);

    expect(result.success).toBe(true);
    expect(result.data?.created).toEqual([
      makeComment({ id: 'comment-first', content: 'first' }),
    ]);
    expect(result.data?.failed).toEqual([
      {
        index: 1,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Either task_id or project_id is required',
        },
      },
      {
        index: 2,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Todoist unavailable',
        },
      },
    ]);
  });
});
