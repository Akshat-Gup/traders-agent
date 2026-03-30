const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(ROOT, ".local-workbench");
const STATE_FILE = path.join(DATA_ROOT, "state.json");
const SETTINGS_FILE = path.join(DATA_ROOT, "settings.json");
const LIBRARY_DIR = path.join(DATA_ROOT, "library");
const TEMPLATE_DIR = path.join(LIBRARY_DIR, "templates");
const PROJECT_DIR = path.join(DATA_ROOT, "projects");
const JOB_DIR = path.join(DATA_ROOT, "jobs");
const UPDATE_DIR = path.join(DATA_ROOT, "updates");
const FINDER_NOTES_PATH = path.join(ROOT, "notes", "report-finder-recipes.md");
const FINDER_EXTENSION_PATH = path.join(ROOT, "visionalpha-to-pdf");
const FINDER_PROFILE_DIR = path.join(DATA_ROOT, "finder-browser-profile");
const ALPHA_VANTAGE_PROVIDER = "alpha_vantage";
const DEFAULT_AUTOMATION_TIME = "08:00";
const WEEKDAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const BUILTIN_TEMPLATES = [
  {
    id: "tmpl_builtin_equity_full",
    name: "Equity Research Test Template",
    family: "equity-research",
    output_formats: ["docx", "pdf"],
    source_path: path.join(ROOT, "research_templates", "test_equity_research_template.py"),
    notes:
      "Executable Python research template. Generates DOCX or PDF output and, when valuation is enabled, valuation.xlsx as a companion workbook.",
    version: "v3",
  },
];

function defaultSettings() {
  return {
    approval_policy: "never",
    sandbox: "danger-full-access",
    personality: "friendly",
    web_search: "live",
    market_data_provider: ALPHA_VANTAGE_PROVIDER,
    alpha_vantage_api_key: "",
  };
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function entityId(prefix, name) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `${prefix}_${stamp}_${slugify(name) || "item"}`;
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeJsonFile(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function ensureStorage() {
  [DATA_ROOT, LIBRARY_DIR, TEMPLATE_DIR, PROJECT_DIR, JOB_DIR, UPDATE_DIR].forEach(ensureDir);
  if (!fs.existsSync(STATE_FILE)) {
    writeJsonFile(STATE_FILE, {
      templates: [],
      projects: [],
      jobs: [],
      update_definitions: [],
    });
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    writeJsonFile(SETTINGS_FILE, defaultSettings());
  }
  seedBuiltinTemplates();
}

function readState() {
  ensureStorage();
  return readJsonFile(STATE_FILE, {
    templates: [],
    projects: [],
    jobs: [],
    update_definitions: [],
  });
}

function writeState(payload) {
  ensureStorage();
  writeJsonFile(STATE_FILE, payload);
}

function readSettings() {
  ensureStorage();
  return {
    ...defaultSettings(),
    ...readJsonFile(SETTINGS_FILE, defaultSettings()),
  };
}

function writeSettings(patch) {
  const settings = {
    ...readSettings(),
    ...(patch || {}),
    market_data_provider: ALPHA_VANTAGE_PROVIDER,
  };
  writeJsonFile(SETTINGS_FILE, settings);
  return settings;
}

function getState({ executorAvailable } = {}) {
  const state = readState();
  const sortDesc = (items) =>
    [...items].sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  return {
    data_root: DATA_ROOT,
    finder_notes_path: FINDER_NOTES_PATH,
    executor_name: "Codex App Server",
    executor_available: executorAvailable ?? true,
    templates: sortDesc(state.templates),
    projects: sortDesc(state.projects),
    jobs: sortDesc(state.jobs),
    update_definitions: sortDesc(state.update_definitions),
  };
}

function seedBuiltinTemplates() {
  const state = readJsonFile(STATE_FILE, {
    templates: [],
    projects: [],
    jobs: [],
    update_definitions: [],
  });
  let changed = false;

  for (const definition of BUILTIN_TEMPLATES) {
    if (!fs.existsSync(definition.source_path)) continue;
    const templateRoot = path.join(TEMPLATE_DIR, definition.id);
    ensureDir(templateRoot);
    const libraryPath = path.join(templateRoot, path.basename(definition.source_path));
    fs.copyFileSync(definition.source_path, libraryPath);

    const record = {
      id: definition.id,
      name: definition.name,
      family: definition.family,
      output_formats: definition.output_formats,
      source_path: definition.source_path,
      library_path: libraryPath,
      notes: definition.notes,
      version: definition.version,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const existingIndex = state.templates.findIndex((item) => item.id === definition.id);
    if (existingIndex >= 0) {
      const existing = state.templates[existingIndex];
      if (existing.version !== definition.version || existing.library_path !== libraryPath) {
        state.templates[existingIndex] = {
          ...existing,
          ...record,
          created_at: existing.created_at || record.created_at,
        };
        changed = true;
      }
    } else {
      state.templates.push(record);
      changed = true;
    }
  }

  if (changed) {
    writeJsonFile(STATE_FILE, state);
  }
}

function findRecord(items, recordId) {
  return items.find((item) => item.id === recordId) || null;
}

function parseTimeOfDay(value) {
  const normalized = String(value || DEFAULT_AUTOMATION_TIME).trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hours: 8, minutes: 0 };
  const hours = Math.min(Math.max(Number(match[1]), 0), 23);
  const minutes = Math.min(Math.max(Number(match[2]), 0), 59);
  return { hours, minutes };
}

function applyTime(dateValue, timeOfDay) {
  const date = new Date(dateValue);
  const { hours, minutes } = parseTimeOfDay(timeOfDay);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function addDays(dateValue, days) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date;
}

function normalizeWeekday(value) {
  const normalized = String(value || "monday").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, normalized) ? normalized : "monday";
}

function weekdayLabel(value) {
  const normalized = normalizeWeekday(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatSchedule(definition) {
  const cadence = definition.cadence === "weekly" ? "Weekly" : "Daily";
  const time = definition.time_of_day || DEFAULT_AUTOMATION_TIME;
  if (definition.cadence === "weekly") {
    return `${cadence} · ${weekdayLabel(definition.weekday)} · ${time}`;
  }
  return `${cadence} · ${time}`;
}

function formatPeriod(dateValue) {
  return new Date(dateValue).toISOString().replace(".000Z", "Z");
}

function previousScheduledOccurrence(definition, occurrence) {
  if (definition.cadence === "weekly") {
    return addDays(occurrence, -7);
  }
  return addDays(occurrence, -1);
}

function firstScheduledOccurrence(definition) {
  const createdAt = new Date(definition.created_at);
  if (definition.cadence === "weekly") {
    const targetWeekday = WEEKDAY_INDEX[normalizeWeekday(definition.weekday)];
    const candidate = applyTime(createdAt, definition.time_of_day);
    const delta = (targetWeekday - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + delta);
    if (candidate < createdAt) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }
  const candidate = applyTime(createdAt, definition.time_of_day);
  if (candidate < createdAt) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

function nextScheduledOccurrence(definition, occurrence) {
  if (definition.cadence === "weekly") {
    return addDays(occurrence, 7);
  }
  return addDays(occurrence, 1);
}

function getDueAutomationOccurrences(definition, now = new Date()) {
  if (!["daily", "weekly"].includes(definition.cadence)) {
    return [];
  }

  const due = [];
  let occurrence = firstScheduledOccurrence(definition);
  const lastScheduledFor = definition.last_scheduled_for ? new Date(definition.last_scheduled_for) : null;

  while (occurrence <= now) {
    if (!lastScheduledFor || occurrence > lastScheduledFor) {
      due.push(new Date(occurrence));
    }
    occurrence = nextScheduledOccurrence(definition, occurrence);
  }

  return due;
}

function ensureWorkspaceDirs(workspaceRoot) {
  const dirs = {
    source_uploads: path.join(workspaceRoot, "source", "uploads"),
    source_urls: path.join(workspaceRoot, "source", "urls"),
    context: path.join(workspaceRoot, "context"),
    templates: path.join(workspaceRoot, "templates", "selected"),
    generated_charts: path.join(workspaceRoot, "generated", "charts"),
    generated_diagrams: path.join(workspaceRoot, "generated", "diagrams"),
    generated_excel: path.join(workspaceRoot, "generated", "excel"),
    result: path.join(workspaceRoot, "result"),
    logs: path.join(workspaceRoot, "logs"),
  };
  Object.values(dirs).forEach(ensureDir);
  return dirs;
}

function copyAny(sourcePath, destinationPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    return;
  }
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

function buildPrompt(job) {
  const settings = readSettings();
  const templateNote = job.template_id
    ? `Selected template card: ${job.template_id}. Follow its style and output expectations.`
    : "No template card selected. Choose the clearest structure for the requested deliverable.";
  const sourceNote = job.source_paths.length
    ? "User sources are staged under source/uploads/. Review them before writing the deliverable."
    : "No local source files were attached.";
  const urlNote = job.urls.length
    ? "URLs to review are listed in source/urls/urls.txt."
    : "No seed URLs were provided.";
  const providerNote = settings.alpha_vantage_api_key
    ? "Alpha Vantage is the only market-data API configured for this app. The API key is available in the environment as `ALPHAVANTAGE_API_KEY` and `ALPHA_VANTAGE_API_KEY`."
    : "Alpha Vantage is the only market-data API supported here. If the environment key is unavailable, continue with web research and note any resulting data gaps.";

  const questionBlock = job.question_prompts?.length
    ? `Questions to answer in the output:\n${job.question_prompts.map((question) => `- ${question}`).join("\n")}`
    : "No explicit question checklist was provided.";

  const automationWindow = job.period_start && job.period_end
    ? `Coverage window: use web search specifically for information published between ${formatPeriod(job.period_start)} and ${formatPeriod(job.period_end)}. Use absolute dates throughout.`
    : null;

  const automationNote = job.kind === "update"
    ? [
        job.asset_class_label ? `Asset class: ${job.asset_class_label}` : null,
        job.schedule_label ? `Automation schedule: ${job.schedule_label}` : null,
        automationWindow,
        "Spawn subagents to gather sources, charts, and synthesis in parallel when that will improve speed or coverage.",
        "Focus the deliverable on a polished research report or investor-ready powerpoint, depending on the selected output format."
      ].filter(Boolean).join("\n")
    : null;

  const finderNote = job.kind === "finder"
    ? [
        "This is a VisionAlpha finder run.",
        `Use Playwright/browser automation from this workspace and load the unpacked extension at: ${FINDER_EXTENSION_PATH}`,
        `Reuse the persistent browser profile at: ${FINDER_PROFILE_DIR}`,
        "The extension listens for the `visionalpha-pdf-capture` browser event so the capture can run without opening the popup.",
        "Open VisionAlpha, search for the requested reports, capture them with the extension, and move the final PDF files into `result/`.",
        "If VisionAlpha requires manual authentication, pause and keep the session reusable in the persistent profile instead of discarding it."
      ].join("\n")
    : null;

  return [
    `You are preparing a final ${job.family} deliverable in ${job.output_format.toUpperCase()} format.`,
    `Job kind: ${job.kind}`,
    `Objective: ${job.objective}`,
    `Workspace root: ${job.workspace_path}`,
    `Write completed deliverables only into: ${job.result_path}`,
    "Workspace layout:",
    "  - source/uploads/ contains attached files or folders copied into the workspace",
    "  - source/urls/urls.txt contains any seed URLs",
    "  - context/objective.md contains the raw objective",
    "  - context/answers.md contains follow-up user context appended later",
    "  - context/prompt.md contains the full run brief",
    "  - result/ is the only place for finished deliverables",
    templateNote,
    sourceNote,
    urlNote,
    providerNote,
    automationNote,
    finderNote,
    questionBlock,
    job.custom_instructions
      ? `Additional instructions:\n${job.custom_instructions}`
      : "No additional instructions were provided.",
    job.valuation_required
      ? "A valuation workbook is required. If you create one, place it under generated/excel/ and reference it from the final deliverable."
      : "A valuation workbook is optional unless the work clearly benefits from one.",
    "If you need clarification, ask in the conversation instead of waiting for an external backend workflow.",
  ].join("\n\n");
}

function createWorkspace(job) {
  const dirs = ensureWorkspaceDirs(job.workspace_path);

  const state = readState();
  const template = job.template_id ? findRecord(state.templates, job.template_id) : null;

  if (job.kind === "research") {
    const pythonBin = [
      path.join(ROOT, ".venv", "bin", "python"),
      process.env.PYTHON || "",
      "python3",
      "python",
    ].find((candidate) => candidate && (candidate.includes(path.sep) ? fs.existsSync(candidate) : true));
    if (!pythonBin) {
      throw new Error("Python is required to prepare the research workspace.");
    }
    const prep = spawnSync(
      pythonBin,
      [path.join(ROOT, "backend", "research_prep.py")],
      {
        cwd: ROOT,
        encoding: "utf8",
        input: JSON.stringify({ job, template }),
      }
    );
    if (prep.status !== 0) {
      const detail = (prep.stderr || prep.stdout || "Research workspace prep failed.").trim();
      throw new Error(detail);
    }
    const result = JSON.parse(prep.stdout || "{}");
    job.prompt_preview = result.prompt_preview || "";
    return job;
  }

  for (const rawPath of job.source_paths) {
    try {
      const sourcePath = path.resolve(rawPath);
      if (!fs.existsSync(sourcePath)) continue;
      copyAny(sourcePath, path.join(dirs.source_uploads, path.basename(sourcePath)));
    } catch {
      // Ignore invalid staged paths and let the run continue.
    }
  }

  if (job.urls.length) {
    fs.writeFileSync(path.join(dirs.source_urls, "urls.txt"), `${job.urls.join("\n")}\n`, "utf8");
  }

  const prompt = buildPrompt(job);
  job.prompt_preview = prompt;
  fs.writeFileSync(path.join(dirs.context, "objective.md"), job.objective, "utf8");
  fs.writeFileSync(
    path.join(dirs.context, "questions.md"),
    job.question_prompts?.length ? `${job.question_prompts.map((question) => `- ${question}`).join("\n")}\n` : "",
    "utf8"
  );
  fs.writeFileSync(path.join(dirs.context, "answers.md"), "", "utf8");
  fs.writeFileSync(path.join(dirs.context, "prompt.md"), prompt, "utf8");
  writeJsonFile(path.join(dirs.logs, "status.json"), {
    status: job.status,
    updated_at: job.updated_at,
  });
  const settings = readSettings();
  writeJsonFile(path.join(dirs.context, "run-config.json"), {
    workspace_path: job.workspace_path,
    result_path: job.result_path,
    family: job.family,
    output_format: job.output_format,
    approval_policy: settings.approval_policy,
    sandbox: settings.sandbox,
  });
  writeJsonFile(path.join(dirs.context, "provider-config.json"), {
    provider: ALPHA_VANTAGE_PROVIDER,
    api_key_available: Boolean(settings.alpha_vantage_api_key),
    environment_variables: ["ALPHAVANTAGE_API_KEY", "ALPHA_VANTAGE_API_KEY"],
  });
  if (job.kind === "update") {
    writeJsonFile(path.join(dirs.context, "automation-config.json"), {
      asset_class_id: job.asset_class_id || null,
      asset_class_label: job.asset_class_label || null,
      cadence: job.cadence || null,
      schedule_label: job.schedule_label || null,
      scheduled_for: job.scheduled_for || null,
      period_start: job.period_start || null,
      period_end: job.period_end || null,
      provider: ALPHA_VANTAGE_PROVIDER,
    });
  }
  if (job.kind === "finder") {
    ensureDir(FINDER_PROFILE_DIR);
    writeJsonFile(path.join(dirs.context, "finder-config.json"), {
      site: "VisionAlpha",
      extension_path: FINDER_EXTENSION_PATH,
      browser_profile_dir: FINDER_PROFILE_DIR,
      result_path: job.result_path,
      objective: job.objective,
    });
    if (fs.existsSync(FINDER_NOTES_PATH)) {
      fs.copyFileSync(FINDER_NOTES_PATH, path.join(dirs.context, "finder-recipes.md"));
    }
  }
  return job;
}

function createProject(payload) {
  const state = readState();
  const projectId = entityId("proj", payload.name);
  const projectRoot = path.join(PROJECT_DIR, projectId);
  ensureDir(projectRoot);
  fs.writeFileSync(path.join(projectRoot, "README.md"), `# ${payload.name}\n`, "utf8");
  const record = {
    id: projectId,
    name: payload.name,
    root_path: projectRoot,
    created_at: nowIso(),
  };
  state.projects.push(record);
  writeState(state);
  return record;
}

function createJobRecord(state, payload) {
  const template = payload.template_id ? findRecord(state.templates, payload.template_id) : null;
  if (template && template.output_formats.length && !template.output_formats.includes((payload.output_format || "pptx").toLowerCase())) {
    throw new Error(`${template.name} supports ${template.output_formats.join(", ").toUpperCase()} outputs only.`);
  }
  const jobId = entityId("job", payload.title);
  const workspaceRoot = path.join(JOB_DIR, jobId);
  const record = {
    id: jobId,
    title: payload.title,
    kind: payload.kind,
    family: payload.family,
    objective: payload.objective,
    output_format: payload.output_format || "pptx",
    project_id: payload.project_id || null,
    template_id: payload.template_id || null,
    provider_names: payload.provider_names || [],
    source_paths: payload.source_paths || [],
    urls: payload.urls || [],
    custom_instructions: payload.custom_instructions || "",
    question_prompts: payload.question_prompts || [],
    valuation_required: Boolean(payload.valuation_required),
    cadence: payload.cadence || null,
    enabled_connectors: payload.enabled_connectors || [],
    status: "ready",
    codex_status: "idle",
    thread_id: null,
    active_turn_id: null,
    last_event_at: null,
    approval_pending: false,
    last_agent_text: "",
    last_command_output: "",
    prompt_preview: "",
    question_log: [],
    update_definition_id: payload.update_definition_id || null,
    asset_class_id: payload.asset_class_id || null,
    asset_class_label: payload.asset_class_label || null,
    schedule_label: payload.schedule_label || null,
    scheduled_for: payload.scheduled_for || null,
    period_start: payload.period_start || null,
    period_end: payload.period_end || null,
    workspace_path: workspaceRoot,
    result_path: path.join(workspaceRoot, "result"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  createWorkspace(record);
  state.jobs.push(record);
  return record;
}

function createJob(payload) {
  const state = readState();
  const record = createJobRecord(state, payload);
  writeState(state);
  return record;
}

function appendJobQa(jobId, content) {
  const state = readState();
  const job = findRecord(state.jobs, jobId);
  if (!job) throw new Error("Job not found");
  const answersPath = path.join(job.workspace_path, "context", "answers.md");
  const prefix = fs.existsSync(answersPath) && fs.readFileSync(answersPath, "utf8").trim() ? "\n" : "";
  fs.appendFileSync(answersPath, `${prefix}- ${content}\n`, "utf8");
  job.question_log = job.question_log || [];
  job.question_log.push({ role: "user", content, timestamp: nowIso() });
  job.updated_at = nowIso();
  job.prompt_preview = buildPrompt(job);
  fs.writeFileSync(path.join(job.workspace_path, "context", "prompt.md"), job.prompt_preview, "utf8");
  writeState(state);
  return job;
}

function createUpdateDefinition(payload) {
  const state = readState();
  const createdAt = nowIso();
  const normalizedName = payload.name || `${payload.asset_class_label || "Market"} ${payload.cadence === "weekly" ? "Weekly" : "Daily"} Report`;
  const record = {
    id: entityId("upd", normalizedName),
    name: normalizedName,
    cadence: payload.cadence || "daily",
    family: payload.family || "macro-update",
    asset_class_id: payload.asset_class_id || payload.family || "macro",
    asset_class_label: payload.asset_class_label || payload.name || "Macro",
    time_of_day: payload.time_of_day || DEFAULT_AUTOMATION_TIME,
    weekday: normalizeWeekday(payload.weekday || "monday"),
    schedule_label: "",
    output_format: payload.output_format || "pdf",
    prompt: payload.prompt || "",
    provider: ALPHA_VANTAGE_PROVIDER,
    created_at: createdAt,
    updated_at: createdAt,
    last_scheduled_for: null,
  };
  record.schedule_label = formatSchedule(record);
  state.update_definitions.push(record);
  writeState(state);
  return record;
}

function buildAutomationJobPayload(definition, options = {}) {
  const scheduledFor = options.scheduledFor ? new Date(options.scheduledFor) : new Date();
  const periodEnd = new Date(options.periodEnd || scheduledFor);
  const rawPeriodStart = options.periodStart || previousScheduledOccurrence(definition, periodEnd);
  const periodStart = new Date(rawPeriodStart);
  const assetClass = definition.asset_class_label || definition.name;
  const outputLabel = definition.output_format === "pptx" ? "powerpoint" : "research report";
  const runDate = periodEnd.toISOString().slice(0, 10);

  return {
    kind: "update",
    title: `${definition.name} ${runDate}`,
    family: definition.family,
    objective: `Create a ${definition.cadence} ${outputLabel} for ${assetClass}, focused on developments between ${formatPeriod(periodStart)} and ${formatPeriod(periodEnd)}.`,
    output_format: definition.output_format,
    provider_names: [ALPHA_VANTAGE_PROVIDER],
    source_paths: [],
    urls: [],
    custom_instructions: [
      definition.prompt ? `Automation brief:\n${definition.prompt}` : null,
      `Use web search specifically for developments in the period ${formatPeriod(periodStart)} through ${formatPeriod(periodEnd)}.`,
      "Cite concrete dates, note material market moves, and exclude stale news outside the requested window unless it materially changes the interpretation.",
      "Use Alpha Vantage for market data pulls whenever API data is needed, and supplement with web research for narrative context.",
    ].filter(Boolean).join("\n\n"),
    question_prompts: [
      `What changed in ${assetClass} during the requested period?`,
      "Which moves matter most for positioning, catalysts, or risk?",
    ],
    cadence: definition.cadence,
    enabled_connectors: [ALPHA_VANTAGE_PROVIDER],
    update_definition_id: definition.id,
    asset_class_id: definition.asset_class_id || null,
    asset_class_label: definition.asset_class_label || null,
    schedule_label: definition.schedule_label || formatSchedule(definition),
    scheduled_for: scheduledFor.toISOString(),
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  };
}

function runUpdateDefinition(definitionId) {
  const state = readState();
  const definition = findRecord(state.update_definitions, definitionId);
  if (!definition) throw new Error("Update definition not found");
  const job = createJobRecord(state, buildAutomationJobPayload(definition));
  definition.updated_at = nowIso();
  writeState(state);
  return job;
}

function catchUpUpdateDefinitions(now = new Date()) {
  const state = readState();
  const createdJobs = [];

  for (const definition of state.update_definitions) {
    if (!["daily", "weekly"].includes(definition.cadence)) continue;
    definition.schedule_label = formatSchedule(definition);
    const occurrences = getDueAutomationOccurrences(definition, now);

    for (const occurrence of occurrences) {
      const periodEnd = new Date(occurrence);
      const periodStart = previousScheduledOccurrence(definition, occurrence);
      const job = createJobRecord(state, buildAutomationJobPayload(definition, {
        scheduledFor: occurrence,
        periodStart: periodStart < new Date(definition.created_at) ? new Date(definition.created_at) : periodStart,
        periodEnd,
      }));
      createdJobs.push(job);
      definition.last_scheduled_for = occurrence.toISOString();
      definition.updated_at = nowIso();
    }
  }

  if (createdJobs.length) {
    writeState(state);
  } else {
    const hasScheduleUpdates = state.update_definitions.some((definition) => !definition.schedule_label);
    if (hasScheduleUpdates) {
      writeState(state);
    }
  }

  return createdJobs;
}

function updateJob(jobId, patch) {
  const state = readState();
  const job = findRecord(state.jobs, jobId);
  if (!job) throw new Error("Job not found");
  Object.assign(job, patch, { updated_at: nowIso() });
  writeState(state);
  return job;
}

function getJob(jobId) {
  return findRecord(readState().jobs, jobId);
}

module.exports = {
  DATA_ROOT,
  FINDER_NOTES_PATH,
  FINDER_EXTENSION_PATH,
  FINDER_PROFILE_DIR,
  ALPHA_VANTAGE_PROVIDER,
  readSettings,
  writeSettings,
  getState,
  createProject,
  createJob,
  appendJobQa,
  createUpdateDefinition,
  runUpdateDefinition,
  catchUpUpdateDefinitions,
  updateJob,
  getJob,
};
