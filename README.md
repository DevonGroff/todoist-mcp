# Todoist MCP Server

A Model Context Protocol (MCP) server that provides integration with the Todoist REST API v2, enabling AI assistants to manage tasks, projects, sections, comments, and labels.

## Features

- **Task Management**: Create, update, complete, delete, move, and search tasks
- **Batch Operations**: Create multiple tasks at once
- **Project Management**: Create, update, and delete projects
- **Section Management**: Organize tasks within project sections
- **Comments**: Add rich text comments with markdown support and optional prefixes ([Research], [Prompt], [Context], etc.)
- **Labels**: Manage personal labels
- **Completed Tasks**: Access completed task history via Sync API
- **Rate Limiting**: Built-in handling for Todoist's 450 requests/15 min limit with exponential backoff

## Installation

```bash
npm install
npm run build
```

## Configuration

1. Get your Todoist API token from [Todoist Settings > Integrations > Developer](https://todoist.com/app/settings/integrations/developer)

2. Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "todoist": {
      "command": "node",
      "args": ["/path/to/todoist-mcp/dist/index.js"],
      "env": {
        "TODOIST_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

**Important**: Never commit your API token to version control. Store it securely in your local MCP configuration.

## Available Tools

### Task Operations
- `todoist_list_tasks` - List active tasks with filters
- `todoist_get_task` - Get a single task
- `todoist_create_task` - Create a new task
- `todoist_update_task` - Update an existing task
- `todoist_complete_task` - Mark task as completed
- `todoist_reopen_task` - Reopen a completed task
- `todoist_delete_task` - Delete a task
- `todoist_move_task` - Move task to different project/section
- `todoist_search_tasks` - Search tasks by content
- `todoist_create_tasks_batch` - Create multiple tasks at once

### Project Operations
- `todoist_list_projects` - List all projects
- `todoist_get_project` - Get a project
- `todoist_create_project` - Create a new project
- `todoist_update_project` - Update a project
- `todoist_delete_project` - Delete a project

### Section Operations
- `todoist_list_sections` - List all sections
- `todoist_get_section` - Get a section
- `todoist_create_section` - Create a new section
- `todoist_update_section` - Update a section
- `todoist_delete_section` - Delete a section

### Comment Operations
- `todoist_list_comments` - List comments for task/project
- `todoist_get_comment` - Get a comment
- `todoist_create_comment` - Create a comment with optional prefix
- `todoist_update_comment` - Update a comment
- `todoist_delete_comment` - Delete a comment
- `todoist_add_research_comment` - Add [Research] prefixed comment
- `todoist_add_context_comment` - Add [Context] prefixed comment

### Label Operations
- `todoist_list_labels` - List all labels
- `todoist_create_label` - Create a new label
- `todoist_update_label` - Update a label
- `todoist_delete_label` - Delete a label

### Completed Tasks
- `todoist_list_completed_tasks` - List completed tasks
- `todoist_get_completed_stats` - Get completion statistics

## Response Format

All tools return a structured response:

```typescript
{
  success: boolean;
  data?: any;        // Present on success
  error?: {          // Present on failure
    code: string;
    message: string;
    details?: any;
  };
}
```

## Development

```bash
npm run dev    # Watch mode for development
npm run build  # Build for production
npm run typecheck  # Type check without emitting
```

## License

ISC
