import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type { TodoistTask, TodoistProject, ToolResponse } from '../types/index.js';

// =============================================================================
// Task Hierarchy
// =============================================================================

interface TaskNode {
  id: string;
  content: string;
  description: string;
  labels: string[];
  priority: number;
  due: TodoistTask['due'];
  checked: boolean;
  depth: number;
  children: TaskNode[];
  subtask_count: number;
  completed_subtask_count: number;
}

interface TaskHierarchy {
  root: TaskNode;
  total_tasks: number;
  completed_tasks: number;
  completion_percentage: number;
}

function buildTaskNode(task: TodoistTask, allTasks: TodoistTask[], depth: number): TaskNode {
  const children = allTasks
    .filter(t => t.parent_id === task.id)
    .map(child => buildTaskNode(child, allTasks, depth + 1));

  const subtaskCount = children.reduce((sum, c) => sum + 1 + c.subtask_count, 0);
  const completedSubtaskCount = children.reduce(
    (sum, c) => sum + (c.checked ? 1 : 0) + c.completed_subtask_count,
    0
  );

  return {
    id: task.id,
    content: task.content,
    description: task.description,
    labels: task.labels,
    priority: task.priority,
    due: task.due,
    checked: task.checked,
    depth,
    children,
    subtask_count: subtaskCount,
    completed_subtask_count: completedSubtaskCount,
  };
}

export async function getTaskHierarchy(taskId: string): Promise<ToolResponse<TaskHierarchy>> {
  try {
    const client = getApiClient();

    // Fetch the target task
    const task = await client.get<TodoistTask>(`/tasks/${taskId}`);

    // Walk up to the root parent
    let root = task;
    const visited = new Set<string>([task.id]);
    while (root.parent_id) {
      if (visited.has(root.parent_id)) break;
      visited.add(root.parent_id);
      root = await client.get<TodoistTask>(`/tasks/${root.parent_id}`);
    }

    // Fetch all tasks in the same project to find descendants
    const projectTasks = await client.getAllPaginated<TodoistTask>('/tasks', {
      project_id: root.project_id,
    });

    // Build tree from root
    const tree = buildTaskNode(root, projectTasks, 0);

    const totalTasks = 1 + tree.subtask_count;
    const completedTasks = (tree.checked ? 1 : 0) + tree.completed_subtask_count;

    return createResponse(true, {
      root: tree,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      completion_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

// =============================================================================
// Duplicate Detection
// =============================================================================

interface DuplicateTask {
  id: string;
  content: string;
  project_id: string;
  project_name?: string;
  due?: string;
  priority: number;
  labels: string[];
}

interface DuplicateGroup {
  similarity: number;
  tasks: DuplicateTask[];
}

interface DuplicateResult {
  groups: DuplicateGroup[];
  total_groups: number;
  total_duplicate_tasks: number;
  threshold: number;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row DP to save memory
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return Math.round(((maxLen - distance) / maxLen) * 1000) / 10;
}

export async function findDuplicates(params: {
  threshold?: number;
  project_id?: string;
}): Promise<ToolResponse<DuplicateResult>> {
  try {
    const client = getApiClient();
    const threshold = params.threshold ?? 80;

    // Fetch tasks (scoped to project if specified)
    const queryParams: Record<string, unknown> = {};
    if (params.project_id) queryParams.project_id = params.project_id;

    const tasks = await client.getAllPaginated<TodoistTask>('/tasks', queryParams);

    if (tasks.length < 2) {
      return createResponse(true, {
        groups: [],
        total_groups: 0,
        total_duplicate_tasks: 0,
        threshold,
      });
    }

    // Build project name lookup
    const projectIds = [...new Set(tasks.map(t => t.project_id))];
    const projectNames = new Map<string, string>();
    try {
      const projectPromises = projectIds.map(id =>
        client.get<TodoistProject>(`/projects/${id}`).then(p => [id, p.name] as const).catch(() => [id, undefined] as const)
      );
      const results = await Promise.all(projectPromises);
      for (const [id, name] of results) {
        if (name) projectNames.set(id, name);
      }
    } catch {
      // Project lookup is best-effort
    }

    // Compare all pairs
    const groups: DuplicateGroup[] = [];
    const claimed = new Set<string>();

    for (let i = 0; i < tasks.length; i++) {
      if (claimed.has(tasks[i].id)) continue;

      const group: DuplicateTask[] = [];
      let maxSim = 0;

      for (let j = i + 1; j < tasks.length; j++) {
        if (claimed.has(tasks[j].id)) continue;

        const sim = similarity(tasks[i].content, tasks[j].content);
        if (sim >= threshold) {
          if (group.length === 0) {
            group.push(taskToDuplicate(tasks[i], projectNames));
          }
          group.push(taskToDuplicate(tasks[j], projectNames));
          claimed.add(tasks[j].id);
          maxSim = Math.max(maxSim, sim);
        }
      }

      if (group.length > 0) {
        claimed.add(tasks[i].id);
        groups.push({ similarity: maxSim, tasks: group });
      }
    }

    groups.sort((a, b) => b.similarity - a.similarity);

    const totalDuplicates = groups.reduce((sum, g) => sum + g.tasks.length, 0);

    return createResponse(true, {
      groups,
      total_groups: groups.length,
      total_duplicate_tasks: totalDuplicates,
      threshold,
    });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

function taskToDuplicate(task: TodoistTask, projectNames: Map<string, string>): DuplicateTask {
  return {
    id: task.id,
    content: task.content,
    project_id: task.project_id,
    project_name: projectNames.get(task.project_id),
    due: task.due?.string ?? task.due?.date ?? undefined,
    priority: task.priority,
    labels: task.labels,
  };
}
