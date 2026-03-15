import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import type { AppState, JobKind } from "./lib/types";

type TabKey = "updates" | "finder" | "research";

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

const tabs: { key: TabKey; label: string; eyebrow: string }[] = [
  { key: "updates", label: "Automated Updates", eyebrow: "Macro, FX, commodities, equities" },
  { key: "finder", label: "Report Finder", eyebrow: "Natural-language downloads and site recipes" },
  { key: "research", label: "Research Projects", eyebrow: "Full-length decks, docs, workbooks" }
];

function csvToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("research");
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [templateForm, setTemplateForm] = useState({
    name: "",
    family: "equity-research",
    outputFormats: "pptx,docx,pdf",
    sourcePath: "",
    notes: ""
  });

  const [projectForm, setProjectForm] = useState({
    name: "",
    objective: "",
    audience: "traders",
    family: "equity-research"
  });

  const [researchForm, setResearchForm] = useState({
    title: "",
    family: "equity-research",
    objective: "",
    audience: "traders",
    outputFormat: "pptx",
    projectId: "",
    templateId: "",
    providerNames: "premium-primary",
    sourcePaths: [] as string[],
    urls: "",
    customInstructions: "",
    questions: "What matters most for positioning?\nWhat charts or diagrams would sharpen the message?"
  });

  const [updateForm, setUpdateForm] = useState({
    name: "",
    cadence: "daily",
    family: "macro-update",
    outputFormat: "pdf",
    instruments: "EURUSD, XAUUSD, Brent, SPY",
    templateId: ""
  });

  const [finderForm, setFinderForm] = useState({
    title: "",
    projectId: "",
    sourceSite: "visionalpha-internal",
    request: "",
    downloadPaths: [] as string[],
    outputFormat: "pdf"
  });

  const [qaText, setQaText] = useState("");

  const selectedJob = useMemo(
    () => state.jobs.find((job) => job.id === selectedJobId) || state.jobs[0] || null,
    [selectedJobId, state.jobs]
  );

  async function refreshState() {
    setLoading(true);
    setError(null);
    try {
      const nextState = await api.state();
      setState(nextState);
      setSelectedJobId((current) => current || nextState.jobs[0]?.id || null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load app state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshState();
  }, []);

  async function withBusy(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    setError(null);
    try {
      await fn();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Something failed");
    } finally {
      setBusy(null);
    }
  }

  async function choosePaths(mode: "files" | "folders" | "mixed") {
    return window.desktop.pickPaths({ mode, multiple: true });
  }

  async function onTemplateSubmit(event: FormEvent) {
    event.preventDefault();
    await withBusy("Saving template", async () => {
      await api.registerTemplate({
        name: templateForm.name,
        family: templateForm.family,
        output_formats: csvToList(templateForm.outputFormats),
        source_path: templateForm.sourcePath,
        notes: templateForm.notes
      });
      setMessage("Template registered in the local library.");
      setTemplateForm((current) => ({ ...current, name: "", sourcePath: "", notes: "" }));
      await refreshState();
    });
  }

  async function onProjectSubmit(event: FormEvent) {
    event.preventDefault();
    await withBusy("Creating project", async () => {
      await api.createProject(projectForm);
      setMessage("Research project created.");
      setProjectForm({
        name: "",
        objective: "",
        audience: "traders",
        family: "equity-research"
      });
      await refreshState();
    });
  }

  async function createJob(kind: JobKind, payload: Record<string, unknown>, successMessage: string) {
    await withBusy("Scaffolding workspace", async () => {
      await api.createJob({
        kind,
        ...payload
      });
      setMessage(successMessage);
      await refreshState();
    });
  }

  async function onResearchSubmit(event: FormEvent) {
    event.preventDefault();
    await createJob(
      "research",
      {
        title: researchForm.title,
        family: researchForm.family,
        objective: researchForm.objective,
        audience: researchForm.audience,
        output_format: researchForm.outputFormat,
        project_id: researchForm.projectId || null,
        template_id: researchForm.templateId || null,
        provider_names: csvToList(researchForm.providerNames),
        source_paths: researchForm.sourcePaths,
        urls: researchForm.urls.split("\n").map((item) => item.trim()).filter(Boolean),
        custom_instructions: researchForm.customInstructions,
        question_prompts: researchForm.questions.split("\n").map((item) => item.trim()).filter(Boolean),
        valuation_required: true
      },
      "Research workspace prepared and ready for Codex."
    );
  }

  async function onUpdateDefinitionSubmit(event: FormEvent) {
    event.preventDefault();
    await withBusy("Saving update definition", async () => {
      await api.createUpdateDefinition({
        name: updateForm.name,
        cadence: updateForm.cadence,
        family: updateForm.family,
        output_format: updateForm.outputFormat,
        instruments: csvToList(updateForm.instruments),
        template_id: updateForm.templateId || null
      });
      setMessage("Automated update definition saved.");
      setUpdateForm((current) => ({ ...current, name: "" }));
      await refreshState();
    });
  }

  async function onFinderSubmit(event: FormEvent) {
    event.preventDefault();
    await createJob(
      "finder",
      {
        title: finderForm.title,
        family: "report-finder",
        objective: finderForm.request,
        audience: "internal-research",
        output_format: finderForm.outputFormat,
        project_id: finderForm.projectId || null,
        source_paths: finderForm.downloadPaths,
        custom_instructions: `Site target: ${finderForm.sourceSite}\nWrite discovered download targets, cookies/session assumptions, and any blockers into context/questions.md before attempting automation.`,
        question_prompts: [
          "Which reports should be prioritized if multiple match?",
          "What metadata should be preserved alongside downloads?"
        ]
      },
      "Report-finder workspace prepared. Add site specifics next and launch Codex when ready."
    );
  }

  async function launchJob(jobId: string) {
    await withBusy("Launching Codex", async () => {
      await api.launchJob(jobId);
      setMessage("Codex launch command prepared and opened locally.");
      await refreshState();
    });
  }

  async function appendAnswer() {
    if (!selectedJob || !qaText.trim()) {
      return;
    }
    await withBusy("Appending answer", async () => {
      await api.appendQa(selectedJob.id, { content: qaText.trim() });
      setQaText("");
      setMessage("Answer added to the workspace context.");
      await refreshState();
    });
  }

  const metrics = [
    { label: "Projects", value: state.projects.length.toString().padStart(2, "0") },
    { label: "Templates", value: state.templates.length.toString().padStart(2, "0") },
    { label: "Live Jobs", value: state.jobs.length.toString().padStart(2, "0") },
    { label: state.executor_name, value: state.executor_available ? "Ready" : "Missing" }
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">Local-First Finance AI</p>
          <h1>Market Workbench</h1>
          <p className="brand-copy">
            A desktop control room for full-length market research decks, docs, update notes, and
            report acquisition workflows.
          </p>
        </div>

        <nav className="tab-list">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab-button ${activeTab === tab.key ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.label}</span>
              <small>{tab.eyebrow}</small>
            </button>
          ))}
        </nav>

        <div className="status-card">
          <p className="status-title">Workspace root</p>
          <p className="status-path">{state.data_root || "Loading local storage..."}</p>
          <button className="ghost-button" onClick={() => refreshState()}>
            Refresh state
          </button>
        </div>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <p className="eyebrow">Cheap-by-design architecture</p>
            <h2>
              Codex stays local, the app handles the orchestration, and every run becomes a clean
              workspace folder you can inspect.
            </h2>
          </div>
          <div className="metric-grid">
            {metrics.map((metric) => (
              <article key={metric.label} className="metric-card">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        </section>

        {loading ? <div className="banner">Loading local service…</div> : null}
        {busy ? <div className="banner info">{busy}…</div> : null}
        {message ? <div className="banner success">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}

        <section className="workspace-grid">
          <div className="main-panel">
            {activeTab === "research" ? (
              <>
                <div className="panel-grid two-up">
                  <form className="panel" onSubmit={onProjectSubmit}>
                    <div className="panel-heading">
                      <p className="eyebrow">Project library</p>
                      <h3>New research project</h3>
                    </div>
                    <label>
                      Project name
                      <input
                        value={projectForm.name}
                        onChange={(event) =>
                          setProjectForm((current) => ({ ...current, name: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Objective
                      <textarea
                        rows={4}
                        value={projectForm.objective}
                        onChange={(event) =>
                          setProjectForm((current) => ({
                            ...current,
                            objective: event.target.value
                          }))
                        }
                        required
                      />
                    </label>
                    <div className="field-row">
                      <label>
                        Audience
                        <input
                          value={projectForm.audience}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              audience: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label>
                        Family
                        <input
                          value={projectForm.family}
                          onChange={(event) =>
                            setProjectForm((current) => ({ ...current, family: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <button className="primary-button">Create project</button>
                  </form>

                  <form className="panel" onSubmit={onTemplateSubmit}>
                    <div className="panel-heading">
                      <p className="eyebrow">Template library</p>
                      <h3>Register a style pack</h3>
                    </div>
                    <label>
                      Template name
                      <input
                        value={templateForm.name}
                        onChange={(event) =>
                          setTemplateForm((current) => ({ ...current, name: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <div className="field-row">
                      <label>
                        Family
                        <input
                          value={templateForm.family}
                          onChange={(event) =>
                            setTemplateForm((current) => ({ ...current, family: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Output formats
                        <input
                          value={templateForm.outputFormats}
                          onChange={(event) =>
                            setTemplateForm((current) => ({
                              ...current,
                              outputFormats: event.target.value
                            }))
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Template source path
                      <div className="picker-row">
                        <input
                          value={templateForm.sourcePath}
                          onChange={(event) =>
                            setTemplateForm((current) => ({
                              ...current,
                              sourcePath: event.target.value
                            }))
                          }
                          placeholder="/path/to/template.pptx"
                          required
                        />
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={async () => {
                            const paths = await choosePaths("files");
                            if (paths[0]) {
                              setTemplateForm((current) => ({ ...current, sourcePath: paths[0] }));
                            }
                          }}
                        >
                          Browse
                        </button>
                      </div>
                    </label>
                    <label>
                      Notes
                      <textarea
                        rows={4}
                        value={templateForm.notes}
                        onChange={(event) =>
                          setTemplateForm((current) => ({ ...current, notes: event.target.value }))
                        }
                      />
                    </label>
                    <button className="primary-button">Save template</button>
                  </form>
                </div>

                <form className="panel" onSubmit={onResearchSubmit}>
                  <div className="panel-heading">
                    <p className="eyebrow">Generation workspace</p>
                    <h3>Prepare a long-form research run</h3>
                  </div>
                  <div className="field-row three-up">
                    <label>
                      Job title
                      <input
                        value={researchForm.title}
                        onChange={(event) =>
                          setResearchForm((current) => ({ ...current, title: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Family
                      <input
                        value={researchForm.family}
                        onChange={(event) =>
                          setResearchForm((current) => ({ ...current, family: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Output format
                      <select
                        value={researchForm.outputFormat}
                        onChange={(event) =>
                          setResearchForm((current) => ({
                            ...current,
                            outputFormat: event.target.value
                          }))
                        }
                      >
                        <option value="pptx">PPTX</option>
                        <option value="docx">DOCX</option>
                        <option value="pdf">PDF</option>
                      </select>
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      Project
                      <select
                        value={researchForm.projectId}
                        onChange={(event) =>
                          setResearchForm((current) => ({ ...current, projectId: event.target.value }))
                        }
                      >
                        <option value="">No project</option>
                        {state.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Template
                      <select
                        value={researchForm.templateId}
                        onChange={(event) =>
                          setResearchForm((current) => ({ ...current, templateId: event.target.value }))
                        }
                      >
                        <option value="">No template</option>
                        {state.templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Providers
                      <input
                        value={researchForm.providerNames}
                        onChange={(event) =>
                          setResearchForm((current) => ({
                            ...current,
                            providerNames: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Objective
                    <textarea
                      rows={4}
                      value={researchForm.objective}
                      onChange={(event) =>
                        setResearchForm((current) => ({ ...current, objective: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Source files, folders, filings, transcripts
                    <div className="picker-stack">
                      <div className="picker-row">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={async () => {
                            const paths = await choosePaths("mixed");
                            setResearchForm((current) => ({
                              ...current,
                              sourcePaths: Array.from(new Set([...current.sourcePaths, ...paths]))
                            }));
                          }}
                        >
                          Add files or folders
                        </button>
                        <span>{researchForm.sourcePaths.length} items selected</span>
                      </div>
                      {researchForm.sourcePaths.length ? (
                        <div className="chip-list">
                          {researchForm.sourcePaths.map((path) => (
                            <span className="chip" key={path}>
                              {path}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label>
                    URLs
                    <textarea
                      rows={3}
                      value={researchForm.urls}
                      onChange={(event) =>
                        setResearchForm((current) => ({ ...current, urls: event.target.value }))
                      }
                      placeholder={"https://...\nhttps://..."}
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Custom instructions
                      <textarea
                        rows={6}
                        value={researchForm.customInstructions}
                        onChange={(event) =>
                          setResearchForm((current) => ({
                            ...current,
                            customInstructions: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Questions the agent should answer
                      <textarea
                        rows={6}
                        value={researchForm.questions}
                        onChange={(event) =>
                          setResearchForm((current) => ({ ...current, questions: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <button className="primary-button">Prepare research workspace</button>
                </form>
              </>
            ) : null}

            {activeTab === "updates" ? (
              <div className="panel-grid two-up">
                <form className="panel" onSubmit={onUpdateDefinitionSubmit}>
                  <div className="panel-heading">
                    <p className="eyebrow">Recurring runs</p>
                    <h3>Create an update definition</h3>
                  </div>
                  <label>
                    Name
                    <input
                      value={updateForm.name}
                      onChange={(event) =>
                        setUpdateForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <div className="field-row">
                    <label>
                      Cadence
                      <select
                        value={updateForm.cadence}
                        onChange={(event) =>
                          setUpdateForm((current) => ({ ...current, cadence: event.target.value }))
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="adhoc">Ad hoc</option>
                      </select>
                    </label>
                    <label>
                      Output
                      <select
                        value={updateForm.outputFormat}
                        onChange={(event) =>
                          setUpdateForm((current) => ({
                            ...current,
                            outputFormat: event.target.value
                          }))
                        }
                      >
                        <option value="pdf">PDF</option>
                        <option value="pptx">PPTX</option>
                        <option value="docx">DOCX</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Family
                    <input
                      value={updateForm.family}
                      onChange={(event) =>
                        setUpdateForm((current) => ({ ...current, family: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Instruments
                    <textarea
                      rows={4}
                      value={updateForm.instruments}
                      onChange={(event) =>
                        setUpdateForm((current) => ({
                          ...current,
                          instruments: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    Template
                    <select
                      value={updateForm.templateId}
                      onChange={(event) =>
                        setUpdateForm((current) => ({ ...current, templateId: event.target.value }))
                      }
                    >
                      <option value="">No template</option>
                      {state.templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primary-button">Save update definition</button>
                </form>

                <section className="panel">
                  <div className="panel-heading">
                    <p className="eyebrow">Runbook</p>
                    <h3>Definitions ready to run</h3>
                  </div>
                  <div className="stack-list">
                    {state.update_definitions.map((definition) => (
                      <article className="list-card" key={definition.id}>
                        <div>
                          <h4>{definition.name}</h4>
                          <p>
                            {definition.cadence} · {definition.family} · {definition.output_format}
                          </p>
                          <small>{definition.instruments.join(", ")}</small>
                        </div>
                        <button
                          className="ghost-button"
                          onClick={async () => {
                            await withBusy("Running update definition", async () => {
                              await api.runUpdateDefinition(definition.id);
                              setMessage("Update run prepared.");
                              await refreshState();
                            });
                          }}
                        >
                          Run now
                        </button>
                      </article>
                    ))}
                    {state.update_definitions.length === 0 ? (
                      <p className="empty-copy">
                        No recurring definitions yet. Save one here to stamp out daily or weekly
                        update workspaces.
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "finder" ? (
              <div className="panel-grid two-up">
                <form className="panel" onSubmit={onFinderSubmit}>
                  <div className="panel-heading">
                    <p className="eyebrow">Download workflows</p>
                    <h3>Prepare a report-finder task</h3>
                  </div>
                  <label>
                    Task title
                    <input
                      value={finderForm.title}
                      onChange={(event) =>
                        setFinderForm((current) => ({ ...current, title: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Project destination
                    <select
                      value={finderForm.projectId}
                      onChange={(event) =>
                        setFinderForm((current) => ({ ...current, projectId: event.target.value }))
                      }
                    >
                      <option value="">No project</option>
                      {state.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Source site
                    <input
                      value={finderForm.sourceSite}
                      onChange={(event) =>
                        setFinderForm((current) => ({ ...current, sourceSite: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Natural-language request
                    <textarea
                      rows={7}
                      value={finderForm.request}
                      onChange={(event) =>
                        setFinderForm((current) => ({ ...current, request: event.target.value }))
                      }
                      placeholder="Find the strongest recent Broadcom AI supplier reports with valuation detail, then download the best three into this project."
                      required
                    />
                  </label>
                  <div className="picker-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={async () => {
                        const paths = await choosePaths("folders");
                        setFinderForm((current) => ({ ...current, downloadPaths: paths }));
                      }}
                    >
                      Attach local download folders
                    </button>
                    <span>{finderForm.downloadPaths.length} folders linked</span>
                  </div>
                  <button className="primary-button">Prepare finder workspace</button>
                </form>

                <section className="panel">
                  <div className="panel-heading">
                    <p className="eyebrow">Recipe roadmap</p>
                    <h3>Internal-site automation notes</h3>
                  </div>
                  <p className="empty-copy">
                    The recipe engine is scaffolded locally. The site-specific automation design
                    doc for your internal report source lives in <code>notes/report-finder-recipes.md</code>.
                  </p>
                  <button
                    className="ghost-button"
                    onClick={() => window.desktop.openPath(state.finder_notes_path)}
                  >
                    Open recipe notes
                  </button>
                </section>
              </div>
            ) : null}
          </div>

          <aside className="rail">
            <section className="panel">
              <div className="panel-heading">
                <p className="eyebrow">Recent jobs</p>
                    <h3>Workspaces and launch actions</h3>
              </div>
              <div className="stack-list">
                {state.jobs.map((job) => (
                  <article
                    key={job.id}
                    className={`job-card ${selectedJob?.id === job.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <div>
                        <strong>{job.title}</strong>
                      <p>
                        {job.kind} · {job.family} · {job.output_format}
                      </p>
                      <small>{job.status}</small>
                    </div>
                    <div className="job-actions">
                      <button
                        className="ghost-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          launchJob(job.id);
                        }}
                      >
                        Launch
                      </button>
                      <button
                        className="ghost-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.desktop.openPath(job.workspace_path);
                        }}
                      >
                        Folder
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {selectedJob ? (
              <section className="panel detail-panel">
                <div className="panel-heading">
                  <p className="eyebrow">Selected job</p>
                  <h3>{selectedJob.title}</h3>
                </div>
                <p className="detail-meta">
                  {selectedJob.family} · {selectedJob.output_format} · {selectedJob.status}
                </p>
                <div className="detail-actions">
                  <button
                    className="ghost-button"
                    onClick={() => window.desktop.openPath(selectedJob.workspace_path)}
                  >
                    Open workspace
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => window.desktop.openPath(selectedJob.result_path)}
                  >
                    Open result folder
                  </button>
                </div>
                <label>
                  Prompt preview
                  <textarea readOnly rows={11} value={selectedJob.prompt_preview} />
                </label>
                <label>
                  Add an answer or clarification
                  <textarea
                    rows={4}
                    value={qaText}
                    onChange={(event) => setQaText(event.target.value)}
                    placeholder="Answer the agent's follow-up questions here, or add new guardrails before relaunching."
                  />
                </label>
                <button className="primary-button" onClick={() => appendAnswer()}>
                  Append to context
                </button>
                {selectedJob.question_log?.length ? (
                  <div className="qa-log">
                    {selectedJob.question_log.map((entry, index) => (
                      <article key={`${entry.timestamp}-${index}`} className="qa-entry">
                        <strong>{entry.role}</strong>
                        <p>{entry.content}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </aside>
        </section>
      </main>
    </div>
  );
}

export default App;
