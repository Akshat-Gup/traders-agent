import { type ReactNode, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Briefcase,
  ChevronDown,
  FileStack,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  Package,
  Paperclip,
  PieChart,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { api } from "./lib/api";
import type { AppState, IntakeQuestion, JobKind } from "./lib/types";
import logoSrc from "./logo.jpg";

const PROJECT_ICONS: LucideIcon[] = [
  Folder,
  FolderOpen,
  FileStack,
  BarChart3,
  TrendingUp,
  Briefcase,
  Package,
  Layers,
  BookOpen,
  PieChart,
];

function projectIcon(id: string): LucideIcon {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return PROJECT_ICONS[Math.abs(h) % PROJECT_ICONS.length];
}

type TabKey = "updates" | "finder" | "research";
type ResearchScreen = "projects" | "project-detail";

const EMPTY_STATE: AppState = {
  data_root: "",
  finder_notes_path: "",
  executor_name: "Codex CLI",
  executor_available: false,
  templates: [],
  projects: [],
  jobs: [],
  update_definitions: []
};

const FAMILIES = [
  { value: "equity-research", label: "Equity Research" },
  { value: "quarterly-stock-update", label: "Quarterly Update" },
  { value: "commodity-report", label: "Commodity Report" },
  { value: "weekly-commodity-update", label: "Weekly Commodity" },
  { value: "case-comp", label: "Case Comp / AM" },
  { value: "macro-update", label: "Macro Recap" }
];

// Preconfigured template cards (user-curated style packs)
const TEMPLATE_CARDS = [
  {
    id: "traders-ust-equity",
    label: "Equity Research",
    desc: "Full 10-page analyst note with valuation, price target, and risk matrix",
    family: "equity-research",
    icon: "📊",
    outputs: ["PPTX", "DOCX", "PDF"],
  },
  {
    id: "traders-ust-quarterly",
    label: "Post-Earnings Update",
    desc: "Beat/miss analysis, guidance changes, and revised thesis for earnings calls",
    family: "quarterly-stock-update",
    icon: "📅",
    outputs: ["DOCX", "PDF"],
  },
  {
    id: "traders-ust-commodity",
    label: "Commodity Report",
    desc: "Supply/demand balance, positioning data, and price outlook with charts",
    family: "commodity-report",
    icon: "🛢️",
    outputs: ["PPTX", "PDF"],
  },
  {
    id: "traders-ust-casecomp",
    label: "Case Comp Deck",
    desc: "Investment recommendation deck in case comp / AM presentation style",
    family: "case-comp",
    icon: "🏆",
    outputs: ["PPTX"],
  },
  {
    id: "traders-ust-macro",
    label: "Macro Recap",
    desc: "Cross-asset weekly recap with annotated charts and trade ideas",
    family: "macro-update",
    icon: "🌍",
    outputs: ["PPTX", "PDF"],
  },
  {
    id: "traders-ust-weekly-comm",
    label: "Weekly Commodity",
    desc: "Short-form commodity update with positioning and near-term catalysts",
    family: "weekly-commodity-update",
    icon: "📈",
    outputs: ["DOCX", "PDF"],
  },
  {
    id: "tmpl_builtin_equity_full",
    label: "Full Pipeline",
    desc: "PDF → 5 charts → DCF Excel + comps → DOCX report. Two output files: report.docx + valuation.xlsx",
    family: "equity-research",
    icon: "⚡",
    outputs: ["DOCX", "XLSX"],
    badge: "test",
  },
];

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  "traders-ust-equity":    BarChart3,
  "traders-ust-quarterly": TrendingUp,
  "traders-ust-commodity": Package,
  "traders-ust-casecomp":  Briefcase,
  "traders-ust-macro":     PieChart,
  "traders-ust-weekly-comm": Layers,
  "tmpl_builtin_equity_full": Zap,
};

const FORMAT_OPTIONS: { value: string; label: string; icon: ReactNode }[] = [
  { value: "pptx", label: "PPTX", icon: <Layers size={13} /> },
  { value: "docx", label: "DOCX", icon: <FileText size={13} /> },
  { value: "pdf",  label: "PDF",  icon: <BookOpen size={13} /> },
];

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: "research", label: "Research", icon: "◈" },
  { key: "updates", label: "Updates", icon: "⟳" },
  { key: "finder", label: "Finder", icon: "⬡" }
];

function csvToList(value: string) {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function App() {
  const [tab, setTab] = useState<TabKey>("research");
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalText, setTerminalText] = useState("");
  const terminalRef = useRef<HTMLPreElement>(null);

  // Research tab state machine
  const [researchScreen, setResearchScreen] = useState<ResearchScreen>("projects");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);

  // New project form
  const [projectForm, setProjectForm] = useState({ name: "" });

  // Chat / job intake within a project
  const [chatMsg, setChatMsg] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [jobSources, setJobSources] = useState<string[]>([]);
  const [jobOutputFormat, setJobOutputFormat] = useState("pptx");
  const [jobFamily, setJobFamily] = useState("equity-research");
  const [showConnectors, setShowConnectors] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  // Intake question flow
  const [intakeStep, setIntakeStep] = useState<"compose" | "questions" | "done">("compose");
  const [intakeQuestions, setIntakeQuestions] = useState<IntakeQuestion[]>([]);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string[]>>({});

  const [executor, setExecutor] = useState<"codex" | "claude">("codex");
  const [activeJobLog, setActiveJobLog] = useState("");
  const [activeJobQuestions, setActiveJobQuestions] = useState("");
  const chatRef = useRef<HTMLTextAreaElement>(null);
  const connectorsRef = useRef<HTMLDivElement>(null);
  const formatPickerRef = useRef<HTMLDivElement>(null);
  const jobLogRef = useRef<HTMLPreElement>(null);

  // Update definition form
  const [updateForm, setUpdateForm] = useState({
    name: "", cadence: "daily", family: "macro-update", outputFormat: "pdf",
    instruments: "EURUSD, XAUUSD, Brent, SPY", templateId: ""
  });

  // Finder form
  const [finderForm, setFinderForm] = useState({
    title: "", projectId: "", sourceSite: "visionalpha-internal", request: "",
    downloadPaths: [] as string[], outputFormat: "pdf"
  });
  const [finderRecipeId, setFinderRecipeId] = useState<string | null>(null);
  const [finderLog, setFinderLog] = useState("");
  const [finderStatus, setFinderStatus] = useState("");

  // Jobs
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [qaText, setQaText] = useState("");
  const selectedJob = useMemo(
    () => state.jobs.find((j) => j.id === selectedJobId) || null,
    [selectedJobId, state.jobs]
  );

  const activeProject = useMemo(
    () => state.projects.find((p) => p.id === activeProjectId) || null,
    [activeProjectId, state.projects]
  );

  const projectJobs = useMemo(
    () => state.jobs.filter((j) => (j as any).project_id === activeProjectId),
    [state.jobs, activeProjectId]
  );

  async function refreshState() {
    setLoading(true);
    setError(null);
    try {
      const s = await api.state();
      setState(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load app state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshState(); }, []);

  async function withBusy(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : "Something failed"); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    if (!showTerminal) return;

    let active = true;

    async function fetchLog() {
      if (!window.desktop?.getBackendLog) return;
      try {
        const text = await window.desktop.getBackendLog();
        if (active) setTerminalText(text);
      } catch {
        // ignore
      }
    }

    fetchLog();
    const id = setInterval(fetchLog, 1000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [showTerminal]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalText]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (connectorsRef.current && !connectorsRef.current.contains(e.target as Node)) {
        setShowConnectors(false);
      }
      if (formatPickerRef.current && !formatPickerRef.current.contains(e.target as Node)) {
        setShowFormatPicker(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Live log polling for running jobs
  useEffect(() => {
    if (!selectedJob || selectedJob.status !== "agent_running") {
      setActiveJobLog("");
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const { log } = await api.jobLogs(selectedJob.id);
        if (active) setActiveJobLog(log);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, [selectedJob?.id, selectedJob?.status]);

  // Auto-scroll job log
  useEffect(() => {
    if (jobLogRef.current) jobLogRef.current.scrollTop = jobLogRef.current.scrollHeight;
  }, [activeJobLog]);

  // Finder recipe log polling
  useEffect(() => {
    if (!finderRecipeId || finderStatus === "done" || finderStatus === "error") return;
    let active = true;
    const poll = async () => {
      try {
        const { log, status } = await api.finderLog(finderRecipeId);
        if (active) { setFinderLog(log); setFinderStatus(status); }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, [finderRecipeId, finderStatus]);

  // Question polling for running jobs
  useEffect(() => {
    if (!selectedJob || selectedJob.status !== "agent_running") {
      setActiveJobQuestions("");
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const { questions } = await api.jobQuestions(selectedJob.id);
        if (active && questions && questions.trim() !== "No pending questions yet.")
          setActiveJobQuestions(questions);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, [selectedJob?.id, selectedJob?.status]);

  async function choosePaths(mode: "files" | "folders" | "mixed") {
    if (window.desktop?.pickPaths) return window.desktop.pickPaths({ mode, multiple: true });
    return [];
  }

  async function onCreateProject(e: FormEvent) {
    e.preventDefault();
    await withBusy("Creating project", async () => {
      const proj = await api.createProject({ name: projectForm.name });
      setMessage("Project created.");
      setProjectForm({ name: "" });
      setShowNewProject(false);
      await refreshState();
      setActiveProjectId((proj as any).id || null);
      setResearchScreen("project-detail");
    });
  }

  async function openProject(id: string) {
    setActiveProjectId(id);
    setResearchScreen("project-detail");
    setSelectedJobId(null);
    setChatMsg("");
    setJobSources([]);
    setSelectedTemplate(null);
  }

  async function submitResearchJob(e: FormEvent) {
    e.preventDefault();
    if (!chatMsg.trim() && !jobSources.length) return;
    // First step: show intake questions
    if (intakeStep === "compose") {
      const tpl = TEMPLATE_CARDS.find((t) => t.id === selectedTemplate);
      await withBusy("Thinking…", async () => {
        const { questions } = await api.intakeQuestions({
          objective: chatMsg,
          family: tpl?.family || jobFamily,
        });
        setIntakeQuestions(questions);
        setIntakeAnswers({});
        setIntakeStep("questions");
      });
      return;
    }
    // Second step (answers confirmed or skipped): create job with collected answers
    if (intakeStep !== "done") return;
    const tpl = TEMPLATE_CARDS.find((t) => t.id === selectedTemplate);
    await withBusy("Scaffolding workspace", async () => {
      const job = await api.createJob({
        kind: "research" as JobKind,
        title: chatMsg.slice(0, 80) || "Research job",
        family: tpl?.family || jobFamily,
        objective: chatMsg,
        output_format: jobOutputFormat,
        project_id: activeProjectId || null,
        template_id: selectedTemplate || null,
        provider_names: ["stub"],
        source_paths: jobSources,
        urls: [],
        custom_instructions: "",
        intake_answers: intakeAnswers,
        question_prompts: [],
        valuation_required: intakeAnswers["valuation"]?.[0] !== "none",
      });
      setMessage("Workspace ready — launch Codex to generate.");
      setChatMsg("");
      setJobSources([]);
      setIntakeStep("compose");
      setIntakeQuestions([]);
      setIntakeAnswers({});
      setSelectedJobId((job as any).id || null);
      await refreshState();
    });
  }

  async function onUpdateSubmit(e: FormEvent) {
    e.preventDefault();
    await withBusy("Saving definition", async () => {
      await api.createUpdateDefinition({
        name: updateForm.name, cadence: updateForm.cadence, family: updateForm.family,
        output_format: updateForm.outputFormat, instruments: csvToList(updateForm.instruments),
        template_id: updateForm.templateId || null
      });
      setMessage("Update definition saved.");
      setUpdateForm((c) => ({ ...c, name: "" }));
      await refreshState();
    });
  }

  async function runFinderRecipe() {
    const downloadDir = finderForm.downloadPaths[0] ?? "";
    const recipe = {
      site: finderForm.sourceSite,
      start_url: `https://${finderForm.sourceSite.replace(/-internal$/, "")}.com`,
      headless: false,
      search: { query: finderForm.request, field_selector: "input[type=search],input[name=q]", submit_selector: "button[type=submit]" },
      download_links: { link_selector: "a[href$='.pdf']", file_types: [".pdf"], max_files: 10 },
    };
    const { recipe_id } = await api.runFinder({ recipe, download_dir: downloadDir });
    setFinderRecipeId(recipe_id);
    setFinderStatus("running");
    setFinderLog("");
    setMessage("Browser worker started — see log below.");
  }

  async function onFinderSubmit(e: FormEvent) {
    e.preventDefault();
    await withBusy("Staging workspace", async () => {
      await api.createJob({
        kind: "finder" as JobKind,
        title: finderForm.title, family: "report-finder",
        objective: finderForm.request,
        output_format: finderForm.outputFormat, project_id: finderForm.projectId || null,
        source_paths: finderForm.downloadPaths,
        custom_instructions: `Site: ${finderForm.sourceSite}`,
        question_prompts: []
      });
      setMessage("Finder workspace staged.");
      await refreshState();
    });
  }

  async function launchJob(id: string) {
    await withBusy(`Launching ${executor}`, async () => {
      await api.launchJob(id, executor);
      setMessage(`${executor} launched — logs streaming below.`);
      await refreshState();
    });
  }

  async function appendAnswer() {
    if (!selectedJob || !qaText.trim()) return;
    await withBusy("Appending", async () => {
      await api.appendQa(selectedJob.id, { content: qaText.trim() });
      setQaText("");
      await refreshState();
    });
  }

  // ──────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────

  function renderProjectsList() {
    return (
      <div className="projects-view">
        <div className="projects-header">
          <h2>Projects</h2>
          <button className="btn btn-primary" onClick={() => setShowNewProject(true)}>
            <span>+</span> New project
          </button>
        </div>

        {showNewProject && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNewProject(false); }}>
            <form className="new-project-card" onSubmit={onCreateProject}>
              <p className="npc-title">New Project</p>
              <label>
                Project name
                <input
                  autoFocus
                  placeholder="e.g. Broadcom Q2 Research"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm((c) => ({ ...c, name: e.target.value }))}
                  required
                />
              </label>
              <div className="npc-actions">
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => setShowNewProject(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={!!busy}>
                  {busy ? "Creating…" : "Create project"}
                </button>
              </div>
            </form>
          </div>
        )}

        {state.projects.length === 0 && !showNewProject ? (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <p>No projects yet.</p>
            <button className="btn btn-primary" onClick={() => setShowNewProject(true)}>
              Create your first project
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {state.projects.map((p) => {
              const Icon = projectIcon(p.id);
              return (
                <button key={p.id} className="project-card" onClick={() => openProject(p.id)}>
                  <span className="project-card-icon">
                    <Icon size={20} strokeWidth={1.8} />
                  </span>
                  <h3>{p.name}</h3>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderProjectDetail() {
    if (!activeProject) return null;
    const tpl = selectedTemplate ? TEMPLATE_CARDS.find((t) => t.id === selectedTemplate) : null;
    const fmtOption = FORMAT_OPTIONS.find((o) => o.value === jobOutputFormat) ?? FORMAT_OPTIONS[0];

    return (
      <div className="project-detail-view">
        {/* Breadcrumb */}
        <div className="detail-breadcrumb">
          <button
            className="back-icon-btn"
            title="Back to Projects"
            onClick={() => { setResearchScreen("projects"); setActiveProjectId(null); }}
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
          </button>
          <span className="breadcrumb-divider">/</span>
          <h2 className="breadcrumb-current">{activeProject.name}</h2>
          <div style={{ marginLeft: "auto" }}>
            <button className="btn btn-ghost btn-sm"
              onClick={() => window.desktop?.openPath?.((activeProject as any).root_path)}>
              Open folder
            </button>
          </div>
        </div>

        <div className={`detail-body${selectedJob ? " has-rail" : ""}`}>
          <div className="detail-main">

            {/* Chat + upload zone + templates — vertically centered stage */}
            <div className="chat-stage">

              {/* Chat bar */}
              <form className="chat-area" onSubmit={submitResearchJob}>
                <textarea
                  ref={chatRef}
                  className="chat-textarea"
                  rows={3}
                  placeholder={tpl
                    ? `Research with ${tpl.label} template…`
                    : "Describe what you want — company, ticker, thesis, or objective…"}
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
                    }
                  }}
                />
                <div className="chat-actions">
                  <div className="chat-actions-left">

                    {/* Connectors dropdown — rendered outside overflow context */}
                    <div className="connectors-wrap" ref={connectorsRef}>
                      <button type="button" className="chat-pill-btn"
                        onClick={() => { setShowConnectors(v => !v); setShowFormatPicker(false); }}>
                        <Paperclip size={13} strokeWidth={2} />
                        <span>Attach</span>
                        <ChevronDown size={10} />
                      </button>
                      {showConnectors && (
                        <div className="chat-dropdown">
                          <button type="button" onClick={async () => {
                            const p = await choosePaths("mixed");
                            setJobSources((c) => [...new Set([...c, ...p])]);
                            setShowConnectors(false);
                          }}>
                            <FileText size={13} />
                            <span>Upload files</span>
                            <span className="chat-dropdown-hint">PDF, DOCX, XLSX…</span>
                          </button>
                          <button type="button" onClick={async () => {
                            const p = await choosePaths("folders");
                            setJobSources((c) => [...new Set([...c, ...p])]);
                            setShowConnectors(false);
                          }}>
                            <FolderOpen size={13} />
                            <span>Upload folder</span>
                            <span className="chat-dropdown-hint">All files inside</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Format picker */}
                    <div className="format-picker-wrap" ref={formatPickerRef}>
                      <button type="button" className="chat-pill-btn"
                        onClick={() => { setShowFormatPicker(v => !v); setShowConnectors(false); }}>
                        {fmtOption.icon}
                        <span>{fmtOption.label}</span>
                        <ChevronDown size={10} />
                      </button>
                      {showFormatPicker && (
                        <div className="chat-dropdown chat-dropdown-sm">
                          {FORMAT_OPTIONS.map((opt) => (
                            <button key={opt.value} type="button"
                              className={jobOutputFormat === opt.value ? "is-active" : ""}
                              onClick={() => { setJobOutputFormat(opt.value); setShowFormatPicker(false); }}>
                              {opt.icon}
                              <span>{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={!!busy}>
                    {busy ? "Working…" : "Generate ↗"}
                  </button>
                </div>
              </form>

              {/* ── Intake question overlay ── */}
              {intakeStep === "questions" && intakeQuestions.length > 0 && (
                <div className="intake-panel">
                  <div className="intake-header">
                    <span className="intake-title">A few quick questions</span>
                    <button type="button" className="intake-skip"
                      onClick={() => { setIntakeStep("compose"); setIntakeQuestions([]); }}>
                      ✕
                    </button>
                  </div>
                  <div className="intake-questions">
                    {intakeQuestions.map((q) => (
                      <div key={q.id} className="intake-q">
                        <div className="intake-q-text">
                          {q.text}
                          {q.multi && <span className="intake-multi-hint"> — pick all that apply</span>}
                        </div>
                        <div className="intake-options">
                          {q.options.map((opt) => {
                            const selected = (intakeAnswers[q.id] || []).includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                className={`intake-opt${selected ? " is-selected" : ""}`}
                                onClick={() => {
                                  setIntakeAnswers((prev) => {
                                    const cur = prev[q.id] || [];
                                    if (q.multi) {
                                      return { ...prev, [q.id]: selected ? cur.filter(x => x !== opt.id) : [...cur, opt.id] };
                                    }
                                    return { ...prev, [q.id]: [opt.id] };
                                  });
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="intake-footer">
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => { setIntakeStep("compose"); setIntakeQuestions([]); }}>
                      Back
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={(e) => { setIntakeStep("done"); submitResearchJob(e as any); }}
                    >
                      Generate ↗
                    </button>
                  </div>
                </div>
              )}

              {/* Source files zone — between chat and templates */}
              <div
                className={`upload-zone${isDragOver ? " drag-over" : ""}`}
                onClick={async () => {
                  const p = await choosePaths("mixed");
                  if (p.length) setJobSources(c => [...new Set([...c, ...p])]);
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const paths: string[] = [];
                  for (const f of Array.from(e.dataTransfer.files)) {
                    const p = (f as any).path as string | undefined;
                    if (p) paths.push(p);
                  }
                  if (paths.length) setJobSources(c => [...new Set([...c, ...paths])]);
                }}
              >
                {jobSources.length === 0 ? (
                  <div className="upload-zone-empty">
                    <Paperclip size={14} strokeWidth={1.8} className="upload-zone-icon" />
                    <span>Drop source files here, or click to browse</span>
                    <span className="upload-zone-types">PDF · DOCX · XLSX · TXT · folders</span>
                  </div>
                ) : (
                  <div className="upload-zone-chips">
                    {jobSources.map((p) => (
                      <span key={p} className="chip">
                        {p.split("/").pop()}
                        <button type="button" className="chip-remove"
                          onClick={(e) => { e.stopPropagation(); setJobSources(c => c.filter(x => x !== p)); }}>×</button>
                      </span>
                    ))}
                    <button type="button" className="upload-zone-add"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const p = await choosePaths("mixed");
                        if (p.length) setJobSources(c => [...new Set([...c, ...p])]);
                      }}>
                      <Paperclip size={12} />
                      Add more
                    </button>
                  </div>
                )}
              </div>

              {/* Template cards — horizontal scroll */}
              <div>
                <div className="section-label">Choose a template</div>
                <div className="template-scroll">
                  {TEMPLATE_CARDS.map((t) => {
                    const TplIcon = TEMPLATE_ICONS[t.id] ?? FileText;
                    return (
                      <button
                        key={t.id}
                        className={`tpl-prev-card ${selectedTemplate === t.id ? "is-selected" : ""}`}
                        onClick={() => {
                          setSelectedTemplate(selectedTemplate === t.id ? null : t.id);
                          setJobFamily(t.family);
                        }}
                      >
                        <div className="tpl-prev-doc">
                          <div className="tpl-prev-top">
                            <TplIcon size={20} strokeWidth={1.6} className="tpl-prev-icon" />
                          </div>
                          <div className="tpl-prev-lines">
                            <div className="tpl-prev-line l1" />
                            <div className="tpl-prev-line l2" />
                            <div className="tpl-prev-line l3" />
                            <div className="tpl-prev-line l4" />
                          </div>
                          {selectedTemplate === t.id && (
                            <div className="tpl-prev-checkmark">✓</div>
                          )}
                        </div>
                        <div className="tpl-prev-label">
                          {t.label}
                          {(t as any).badge && <span className="tpl-badge">{(t as any).badge}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>{/* end .chat-stage */}

            {/* Job list for this project */}
            {projectJobs.length > 0 && (
              <div className="project-jobs">
                <div className="section-label">Jobs</div>
                {projectJobs.map((j) => (
                  <div key={j.id}
                    className={`pjob-row ${selectedJobId === j.id ? "is-active" : ""}`}
                    onClick={() => setSelectedJobId(j.id)}>
                    <div className="pjob-info">
                      <strong>{j.title}</strong>
                      <span className="pjob-meta">{j.family} · {j.output_format} · {j.status}</span>
                    </div>
                    <div className="pjob-btns">
                      <button className="btn btn-teal btn-sm"
                        onClick={(e) => { e.stopPropagation(); launchJob(j.id); }}>
                        Launch
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        onClick={(e) => { e.stopPropagation(); window.desktop?.openPath?.(j.result_path); }}>
                        Results
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: selected job detail */}
          {selectedJob && (
            <div className="detail-rail">
              <div className="detail-job-card">
                <strong>{selectedJob.title}</strong>
                <p className="dj-meta">
                  {selectedJob.family} · {selectedJob.output_format}
                  <span className={`dj-status-dot${selectedJob.status === "agent_running" ? " running" : ""}`} />
                  {selectedJob.status}
                </p>
                <div className="dj-actions">
                  <button className="btn btn-teal btn-sm"
                    onClick={() => launchJob(selectedJob.id)}>
                    {selectedJob.status === "agent_running" ? "Relaunch" : "Launch"}
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => window.desktop?.openPath?.(selectedJob.result_path)}>Results</button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => window.desktop?.openPath?.(selectedJob.workspace_path)}>Files</button>
                </div>

                {/* Live log panel */}
                {activeJobLog && (
                  <div className="job-log-wrap">
                    <div className="dj-label-row">
                      <span className="dj-label">Live output</span>
                      {selectedJob.status === "agent_running" && <span className="live-dot" />}
                    </div>
                    <pre ref={jobLogRef} className="job-log">{activeJobLog}</pre>
                  </div>
                )}

                {/* Agent questions */}
                {activeJobQuestions && (
                  <div className="agent-questions">
                    <span className="dj-label">Agent questions</span>
                    <pre className="dj-prompt">{activeJobQuestions}</pre>
                  </div>
                )}

                <label className="dj-label">
                  Answer / add context
                  <textarea rows={3} value={qaText} onChange={(e) => setQaText(e.target.value)}
                    placeholder="Answer questions or add instructions for the agent…" />
                </label>
                <button className="btn btn-primary btn-sm" onClick={appendAnswer}
                  disabled={!!busy || !qaText.trim()}>
                  Append &amp; relaunch
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Main render
  // ──────────────────────────────────────────────────────────

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <img src={logoSrc} alt="Traders@UST" className="brand-logo" />
          <div className="brand-text">
            <span className="brand-name">Market Workbench</span>
            <span className="brand-sub">Research · Reports · Updates</span>
          </div>
        </div>

        <nav className="tab-list">
          {tabs.map((t) => (
            <button key={t.key}
              className={`tab-btn ${tab === t.key ? "is-active" : ""}`}
              onClick={() => setTab(t.key)}>
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="executor-switcher">
            <button
              className={`exec-btn${executor === "codex" ? " is-active" : ""}`}
              onClick={() => setExecutor("codex")}
              title="Codex CLI"
            >Codex</button>
            <button
              className={`exec-btn${executor === "claude" ? " is-active" : ""}`}
              onClick={() => setExecutor("claude")}
              title="Claude Code (coming soon)"
            >Claude</button>
          </div>
          <button className="refresh-btn" onClick={() => setShowTerminal(v => !v)} title="Server log">⌥</button>
          <button className="refresh-btn" onClick={refreshState} title="Refresh state">↻</button>
        </div>
      </aside>

      {/* Content */}
      <main className="content">
        {/* Banners */}
        {busy   && <div className="banner info">{busy}…</div>}
        {message && <div className="banner success">{message}</div>}
        {error   && <div className="banner error">{error}</div>}

        {/* Tab content with animation */}
        <div key={tab} className="tab-panel">
          {tab === "research" && (
            researchScreen === "projects" ? renderProjectsList() : renderProjectDetail()
          )}

          {tab === "updates" && (
          <div className="std-view">
            <div className="std-header">
              <h2>Automated Updates</h2>
            </div>
            <div className="two-col">
              <form className="panel" onSubmit={onUpdateSubmit}>
                <div className="panel-heading">New update definition</div>
                <label>
                  Name
                  <input value={updateForm.name}
                    onChange={(e) => setUpdateForm((c) => ({ ...c, name: e.target.value }))} required />
                </label>
                <div className="field-row">
                  <label>
                    Cadence
                    <select value={updateForm.cadence}
                      onChange={(e) => setUpdateForm((c) => ({ ...c, cadence: e.target.value }))}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="adhoc">Ad hoc</option>
                    </select>
                  </label>
                  <label>
                    Output
                    <select value={updateForm.outputFormat}
                      onChange={(e) => setUpdateForm((c) => ({ ...c, outputFormat: e.target.value }))}>
                      <option value="pdf">PDF</option>
                      <option value="pptx">PPTX</option>
                      <option value="docx">DOCX</option>
                    </select>
                  </label>
                </div>
                <label>
                  Report type
                  <select value={updateForm.family}
                    onChange={(e) => setUpdateForm((c) => ({ ...c, family: e.target.value }))}>
                    {FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
                <label>
                  Instruments
                  <textarea rows={2} value={updateForm.instruments}
                    onChange={(e) => setUpdateForm((c) => ({ ...c, instruments: e.target.value }))} />
                </label>
                <button className="btn btn-primary" disabled={!!busy}>Save definition</button>
              </form>

              <div className="panel">
                <div className="panel-heading">Saved definitions</div>
                <div className="stack-list">
                  {state.update_definitions.map((d) => (
                    <div className="list-card" key={d.id}>
                      <div>
                        <strong>{d.name}</strong>
                        <p>{d.cadence} · {d.family} · {d.output_format}</p>
                        <small>{d.instruments.join(", ")}</small>
                      </div>
                      <button className="btn btn-teal btn-sm" onClick={async () => {
                        await withBusy("Running", async () => {
                          await api.runUpdateDefinition(d.id);
                          setMessage("Update run staged.");
                          await refreshState();
                        });
                      }}>Run now</button>
                    </div>
                  ))}
                  {state.update_definitions.length === 0 &&
                    <p className="empty-copy">No definitions yet.</p>}
                </div>
              </div>
            </div>
          </div>
          )}

          {tab === "finder" && (
          <div className="std-view">
            <div className="std-header">
              <h2>Report Finder</h2>
            </div>
            <div className="two-col">
              <form className="panel" onSubmit={onFinderSubmit}>
                <div className="panel-heading">Find &amp; download reports</div>
                <label>
                  Task title
                  <input value={finderForm.title}
                    onChange={(e) => setFinderForm((c) => ({ ...c, title: e.target.value }))} required />
                </label>
                <div className="field-row">
                  <label>
                    Project
                    <select value={finderForm.projectId}
                      onChange={(e) => setFinderForm((c) => ({ ...c, projectId: e.target.value }))}>
                      <option value="">None</option>
                      {state.projects.map((p) =>
                        <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Source site
                    <input value={finderForm.sourceSite}
                      onChange={(e) => setFinderForm((c) => ({ ...c, sourceSite: e.target.value }))} />
                  </label>
                </div>
                <label>
                  What do you want to find?
                  <textarea rows={5} value={finderForm.request}
                    onChange={(e) => setFinderForm((c) => ({ ...c, request: e.target.value }))}
                    placeholder="Find the strongest recent Broadcom AI supplier reports with valuation detail, then download the best three." required />
                </label>
                <div className="picker-row" style={{ marginBottom: 16 }}>
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      const p = await choosePaths("folders");
                      setFinderForm((c) => ({ ...c, downloadPaths: p }));
                    }}>
                    + Download folder
                  </button>
                  {finderForm.downloadPaths.length > 0 &&
                    <span className="picker-label">{finderForm.downloadPaths.length} selected</span>}
                </div>
                <div className="finder-btn-row">
                  <button className="btn btn-primary" disabled={!!busy}>Stage workspace</button>
                  <button type="button" className="btn btn-teal" disabled={!!busy || !finderForm.request.trim()}
                    onClick={async () => { await withBusy("Launching browser", runFinderRecipe); }}>
                    Run browser worker
                  </button>
                </div>
              </form>
              {finderLog && (
                <div className="finder-log-wrap">
                  <div className="dj-label-row">
                    <span className="dj-label">Browser worker</span>
                    {finderStatus === "running" && <span className="live-dot" />}
                    {finderStatus !== "running" && <span className="dj-label" style={{ color: finderStatus === "done" ? "var(--ok)" : "var(--warn)" }}>{finderStatus}</span>}
                  </div>
                  <pre className="job-log">{finderLog}</pre>
                </div>
              )}

              <div className="panel">
                <div className="panel-heading">Site recipes</div>
                <p className="empty-copy">
                  The recipe engine is scaffolded. Add site-specific automation to
                  <code> notes/report-finder-recipes.md</code>.
                </p>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }}
                  onClick={() => window.desktop?.openPath?.(state.finder_notes_path)}>
                  Open recipe notes
                </button>
              </div>
            </div>
          </div>
        )}

        </div>
      </main>

      {showTerminal && (
        <div
          className="terminal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTerminal(false);
          }}
        >
          <div
            className="terminal-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="terminal-chrome">
                <span className="terminal-title">Backend output</span>
              <button
                className="terminal-close"
                onClick={() => setShowTerminal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="terminal-output-wrap">
              <pre ref={terminalRef} className="terminal-body">
                {terminalText || (
                  <span className="terminal-empty">
                    Backend stdout/stderr will appear here when the app runs.
                  </span>
                )}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
