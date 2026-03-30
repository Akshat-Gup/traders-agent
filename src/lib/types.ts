export type JobKind = "research" | "update" | "finder";

export interface TemplateRecord {
  id: string;
  name: string;
  family: string;
  output_formats: string[];
  source_path: string;
  library_path: string;
  notes: string;
  created_at: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
}

export interface UpdateDefinitionRecord {
  id: string;
  name: string;
  cadence: string;
  family: string;
  asset_class_id?: string | null;
  asset_class_label?: string | null;
  time_of_day?: string | null;
  weekday?: string | null;
  schedule_label?: string | null;
  output_format: string;
  prompt?: string;
  provider?: string;
  last_scheduled_for?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface JobRecord {
  id: string;
  title: string;
  kind: JobKind;
  family: string;
  status: string;
  output_format: string;
  workspace_path: string;
  result_path: string;
  created_at: string;
  updated_at: string;
  prompt_preview: string;
  thread_id?: string | null;
  active_turn_id?: string | null;
  codex_status?: string | null;
  last_event_at?: string | null;
  approval_pending?: boolean;
  last_agent_text?: string;
  last_command_output?: string;
  project_id?: string | null;
  template_id?: string | null;
  cadence?: string | null;
  question_log?: { role: string; content: string; timestamp: string }[];
  source_paths?: string[];
  update_definition_id?: string | null;
  asset_class_id?: string | null;
  asset_class_label?: string | null;
  schedule_label?: string | null;
  scheduled_for?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}

export interface IntakeOption {
  id: string;
  label: string;
}

export interface IntakeQuestion {
  id: string;
  text: string;
  multi: boolean;
  options: IntakeOption[];
}

export interface AppState {
  data_root: string;
  finder_notes_path: string;
  executor_name: string;
  executor_available: boolean;
  templates: TemplateRecord[];
  projects: ProjectRecord[];
  jobs: JobRecord[];
  update_definitions: UpdateDefinitionRecord[];
}
