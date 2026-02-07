import { getApiClient, createResponse, handleApiError } from '../utils/api-client.js';
import type {
  TodoistProject,
  TodoistSection,
  TodoistTask,
  ToolResponse,
  CreateTaskParams,
} from '../types/index.js';
import { listProjects, createProject } from './projects.js';
import { listSections, createSection } from './sections.js';
import { listTasks, createTask, completeTask } from './tasks.js';

interface PaginatedResponse<T> {
  results: T[];
  next_cursor?: string;
}

interface WorkspaceOverview {
  projects: TodoistProject[];
  sections: TodoistSection[];
  tasks: TodoistTask[];
}

export async function getWorkspaceOverview(params?: {
  project_id?: string;
  include_completed?: boolean;
}): Promise<ToolResponse<WorkspaceOverview>> {
  try {
    const [projectsResult, sectionsResult, tasksResult] = await Promise.all([
      listProjects(),
      listSections(params?.project_id),
      listTasks(params?.project_id ? { project_id: params.project_id } : {}),
    ]);

    if (!projectsResult.success || !sectionsResult.success || !tasksResult.success) {
      const errors = [
        !projectsResult.success && projectsResult.error?.message,
        !sectionsResult.success && sectionsResult.error?.message,
        !tasksResult.success && tasksResult.error?.message,
      ].filter(Boolean);
      
      return createResponse(false, undefined, {
        code: 'PARTIAL_FAILURE',
        message: `Failed to fetch some data: ${errors.join(', ')}`,
      });
    }

    return createResponse(true, {
      projects: projectsResult.data || [],
      sections: sectionsResult.data || [],
      tasks: tasksResult.data || [],
    });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function getProjectsByIds(
  projectIds: string[]
): Promise<ToolResponse<{
  projects: TodoistProject[];
  failed: Array<{ id: string; error: { code: string; message: string } }>;
}>> {
  const client = getApiClient();
  const projects: TodoistProject[] = [];
  const failed: Array<{ id: string; error: { code: string; message: string } }> = [];

  const fetchPromises = projectIds.map(async (id) => {
    try {
      const project = await client.get<TodoistProject>(`/projects/${id}`);
      return { success: true, id, data: project };
    } catch (error) {
      return { success: false, id, error: handleApiError(error) };
    }
  });

  const outcomes = await Promise.all(fetchPromises);

  for (const outcome of outcomes) {
    if (outcome.success && 'data' in outcome) {
      projects.push(outcome.data as TodoistProject);
    } else if ('error' in outcome) {
      failed.push({
        id: outcome.id,
        error: outcome.error as { code: string; message: string },
      });
    }
  }

  return createResponse(true, { projects, failed });
}

export async function createTaskWithContext(params: {
  content: string;
  description?: string;
  project_name?: string;
  section_name?: string;
  project_id?: string;
  section_id?: string;
  labels?: string[];
  priority?: number;
  due_string?: string;
  due_date?: string;
}): Promise<ToolResponse<{
  task: TodoistTask;
  created_project?: TodoistProject;
  created_section?: TodoistSection;
}>> {
  try {
    let projectId = params.project_id;
    let sectionId = params.section_id;
    let createdProject: TodoistProject | undefined;
    let createdSection: TodoistSection | undefined;

    // If project_name provided but no project_id, find or create project
    if (params.project_name && !projectId) {
      const projectsResult = await listProjects();
      if (projectsResult.success && projectsResult.data) {
        const existingProject = projectsResult.data.find(
          p => p.name.toLowerCase() === params.project_name!.toLowerCase()
        );
        if (existingProject) {
          projectId = existingProject.id;
        } else {
          const newProjectResult = await createProject({ name: params.project_name });
          if (newProjectResult.success && newProjectResult.data) {
            projectId = newProjectResult.data.id;
            createdProject = newProjectResult.data;
          }
        }
      }
    }

    // If section_name provided but no section_id, find or create section
    if (params.section_name && !sectionId && projectId) {
      const sectionsResult = await listSections(projectId);
      if (sectionsResult.success && sectionsResult.data) {
        const existingSection = sectionsResult.data.find(
          s => s.name.toLowerCase() === params.section_name!.toLowerCase()
        );
        if (existingSection) {
          sectionId = existingSection.id;
        } else {
          const newSectionResult = await createSection({
            name: params.section_name,
            project_id: projectId,
          });
          if (newSectionResult.success && newSectionResult.data) {
            sectionId = newSectionResult.data.id;
            createdSection = newSectionResult.data;
          }
        }
      }
    }

    // Create the task
    const taskParams: CreateTaskParams = {
      content: params.content,
      description: params.description,
      project_id: projectId,
      section_id: sectionId,
      labels: params.labels,
      priority: params.priority,
      due_string: params.due_string,
      due_date: params.due_date,
    };

    const taskResult = await createTask(taskParams);
    if (!taskResult.success || !taskResult.data) {
      return createResponse(false, undefined, taskResult.error);
    }

    return createResponse(true, {
      task: taskResult.data,
      created_project: createdProject,
      created_section: createdSection,
    });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}

export async function completeAndCreateFollowup(params: {
  task_id: string;
  followup_content: string;
  followup_description?: string;
  followup_due_string?: string;
  followup_due_date?: string;
  followup_priority?: number;
  inherit_project?: boolean;
  inherit_section?: boolean;
  inherit_labels?: boolean;
}): Promise<ToolResponse<{
  completed_task_id: string;
  followup_task: TodoistTask;
}>> {
  try {
    const client = getApiClient();
    
    // Get the original task first to inherit properties if needed
    let originalTask: TodoistTask | null = null;
    if (params.inherit_project || params.inherit_section || params.inherit_labels) {
      const taskResponse = await client.get<TodoistTask>(`/tasks/${params.task_id}`);
      originalTask = taskResponse;
    }

    // Complete the original task and create followup in parallel
    const [completeResult, followupResult] = await Promise.all([
      completeTask(params.task_id),
      createTask({
        content: params.followup_content,
        description: params.followup_description,
        due_string: params.followup_due_string,
        due_date: params.followup_due_date,
        priority: params.followup_priority,
        project_id: params.inherit_project && originalTask ? originalTask.project_id : undefined,
        section_id: params.inherit_section && originalTask ? originalTask.section_id || undefined : undefined,
        labels: params.inherit_labels && originalTask ? originalTask.labels : undefined,
      }),
    ]);

    if (!completeResult.success) {
      return createResponse(false, undefined, {
        code: 'COMPLETE_FAILED',
        message: `Failed to complete task: ${completeResult.error?.message}`,
      });
    }

    if (!followupResult.success || !followupResult.data) {
      return createResponse(false, undefined, {
        code: 'FOLLOWUP_FAILED',
        message: `Task completed but followup creation failed: ${followupResult.error?.message}`,
      });
    }

    return createResponse(true, {
      completed_task_id: params.task_id,
      followup_task: followupResult.data,
    });
  } catch (error) {
    return createResponse(false, undefined, handleApiError(error));
  }
}
