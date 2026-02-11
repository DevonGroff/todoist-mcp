// API v1 uses Sync API field naming conventions

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

export interface TodoistDeadline {
  date: string;
  lang?: string;
}

export interface TodoistTask {
  id: string;
  user_id: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  content: string;
  description: string;
  labels: string[];
  priority: number;
  due: TodoistDue | null;
  deadline: TodoistDeadline | null;
  duration: TodoistDuration | null;
  // API v1 specific fields (Sync API naming)
  checked: boolean;
  is_deleted: boolean;
  added_at: string;
  added_by_uid: string | null;
  assigned_by_uid: string | null;
  responsible_uid: string | null;
  completed_at: string | null;
  completed_by_uid: string | null;
  updated_at: string;
  child_order: number;
  day_order: number;
  note_count: number;
  is_collapsed: boolean;
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  child_order: number;
  is_shared: boolean;
  is_favorite: boolean;
  inbox_project: boolean;
  view_style: string;
  // API v1 specific fields
  user_id?: string;
  can_assign_tasks?: boolean;
  creator_uid?: string;
  created_at?: string;
  updated_at?: string;
  is_archived: boolean;
  is_deleted: boolean;
  is_frozen?: boolean;
  is_collapsed?: boolean;
  default_order?: number;
  description?: string;
}

export interface TodoistSection {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  section_order: number;
  // API v1 specific fields
  added_at?: string;
  updated_at?: string;
  archived_at?: string | null;
  is_archived: boolean;
  is_deleted: boolean;
  is_collapsed: boolean;
}

export interface TodoistComment {
  id: string;
  posted_uid: string;
  posted_at: string;
  content: string;
  file_attachment: Record<string, unknown> | null;
  // API v1 specific fields
  uids_to_notify?: string[];
  is_deleted: boolean;
  reactions?: Record<string, string[]>;
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
  user_id: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  content: string;
  description: string;
  completed_at: string;
  added_at: string;
  priority: number;
  labels: string[];
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
  cursor?: string;
  limit?: number;
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
