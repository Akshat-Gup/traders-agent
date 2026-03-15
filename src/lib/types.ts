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
  output_format: string;
  instruments: string[];
  template_id?: string | null;
  created_at: string;
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
  project_id?: string | null;
  template_id?: string | null;
  cadence?: string | null;
  question_log?: { role: string; content: string; timestamp: string }[];
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
