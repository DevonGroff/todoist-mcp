export interface TodoistDue {
  string: string;
  date: string;
  is_recurring: boolean;
  datetime?: string;
  timezone?: string;
}

export interface TodoistDuration {
  amount: number;
  unit: 'minute' | 'day';
}

export interface TodoistTask {
  id: string;
  project_id: string;
  section_id: string | null;
  content: string;
  description: string;
  is_completed: boolean;
  labels: string[];
  parent_id: string | null;
  order: number;
  priority: number;
  due: TodoistDue | null;
  url?: string;
  created_at: string;
  creator_id: string;
  assignee_id: string | null;
  assigner_id: string | null;
  duration: TodoistDuration | null;
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  order: number;
  is_shared: boolean;
  is_favorite: boolean;
  is_inbox_project: boolean;
  is_team_inbox: boolean;
  view_style: 'list' | 'board';
  url: string;
}

export interface TodoistSection {
  id: string;
  project_id: string;
  order: number;
  name: string;
}

export interface TodoistComment {
  id: string;
  task_id: string | null;
  project_id: string | null;
  posted_at: string;
  content: string;
  attachment: Record<string, unknown> | null;
}

export interface TodoistLabel {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
}

export interface TodoistCollaborator {
  id: string;
  name: string;
  email: string;
}

export interface CompletedTask {
  id: string;
  task_id: string;
  content: string;
  project_id: string;
  section_id: string | null;
  completed_at: string;
  meta_data: Record<string, unknown> | null;
}



export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CreateTaskParams {
  content: string;
  description?: string;
  project_id?: string;
  section_id?: string;
  parent_id?: string;
  order?: number;
  labels?: string[];
  priority?: number;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  due_lang?: string;
  assignee_id?: string;
  duration?: number;
  duration_unit?: 'minute' | 'day';
}

export interface UpdateTaskParams {
  content?: string;
  description?: string;
  labels?: string[];
  priority?: number;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  due_lang?: string;
  assignee_id?: string | null;
  duration?: number | null;
  duration_unit?: 'minute' | 'day' | null;
}

export interface ListTasksParams {
  project_id?: string;
  section_id?: string;
  label?: string;
  filter?: string;
  lang?: string;
  ids?: string[];
}

export interface CreateProjectParams {
  name: string;
  parent_id?: string;
  color?: string;
  is_favorite?: boolean;
  view_style?: 'list' | 'board';
}

export interface CreateSectionParams {
  name: string;
  project_id: string;
  order?: number;
}

export interface CreateCommentParams {
  content: string;
  task_id?: string;
  project_id?: string;
  attachment?: {
    file_url: string;
    file_type: string;
    file_name: string;
  };
}

export interface UpdateCommentParams {
  content: string;
}

export interface MoveTaskParams {
  task_id: string;
  project_id?: string;
  section_id?: string;
  parent_id?: string;
}
