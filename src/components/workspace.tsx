"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, Atom, Award, BookMarked, BookOpen, BookOpenText, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, Download, Ellipsis, FileText, Flag, GraduationCap, Layers, Loader2, MessageSquare, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Share2, ShieldCheck, SlidersHorizontal, Sparkles, StickyNote, Target, Trash2, Video, X, Zap, type LucideIcon } from "lucide-react";
import { api, downloadJson } from "@/lib/client";
import type { LearnerProgress, LearningSuite, Source } from "@/lib/learning";
import type { ChatMessage, Note, WorkspaceData } from "@/lib/types";
import { AddSourceForm, NewNotebookForm, NotebookList, NoteForm, SourcePreview } from "./workspace-forms";
import { Diagnostic, Flashcards, MindMap, ProgressView, Quest, StudyGuide, VideoSummary, type ProgressAction, type StudyTool } from "./study-tools";
import { IconButton, Modal } from "./ui";

type ModalView = StudyTool | "add-source" | "source" | "notebooks" | "new-notebook" | "settings" | "export" | "new-note" | "note" | null;

const toolLabels: Record<StudyTool, string> = { map: "Mind map", flashcards: "Flashcards", video: "Video overview", quiz: "Quick quiz", quest: "Your learning quest", progress: "My progress", guide: "Study guide" };
const studioTools: { id: StudyTool; label: string; detail: string; icon: LucideIcon; tone: string }[] = [
  { id: "video", label: "Video overview", detail: "See the bigger picture", icon: Video, tone: "peach" },
  { id: "flashcards", label: "Flashcards", detail: "Make it stick", icon: Layers, tone: "lavender" },
  { id: "map", label: "Mind map", detail: "Connect the dots", icon: Network, tone: "blue" },
  { id: "quiz", label: "Quick quiz", detail: "Check your understanding", icon: CircleHelp, tone: "rose" },
  { id: "guide", label: "Study guide", detail: "Your key takeaways", icon: BookOpen, tone: "mint" },
  { id: "quest", label: "Learning quest", detail: "Your next challenge", icon: Flag, tone: "yellow" },
];

export default function Workspace() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [generating, setGenerating] = useState(false);
  const [modal, setModal] = useState<ModalView>(null);
  const [previewSource, setPreviewSource] = useState<Source | null>(null);
  const [previewNote, setPreviewNote] = useState<Note | null>(null);
  const [toast, setToast] = useState("");
  const [activePane, setActivePane] = useState<"sources" | "chat" | "studio">("chat");
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [chatTab, setChatTab] = useState<"chat" | "notes">("chat");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [savedFilter, setSavedFilter] = useState<"all" | "notes">("all");
  const [exportCopied, setExportCopied] = useState(false);
  const [switchingNotebook, setSwitchingNotebook] = useState(false);
  const chatBottom = useRef<HTMLDivElement>(null);
  const navigationVersion = useRef(0);
  const activeNotebookId = useRef("");

  useEffect(() => {
    let active = true;
    const notebookId = new URLSearchParams(window.location.search).get("notebook");
    api<WorkspaceData>(`/api/workspace${notebookId ? `?notebookId=${encodeURIComponent(notebookId)}` : ""}`)
      .then((workspace) => { if (!active) return; activeNotebookId.current = workspace.notebook.id; setData(workspace); setSelected(workspace.sources.map((source) => source.id)); })
      .catch((failure) => { if (active) setLoadError(failure.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 5000); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { if (data?.messages.length || asking) chatBottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [data?.messages.length, asking]);

  async function loadNotebook(id?: string) {
    const version = ++navigationVersion.current;
    setModal(null); setLoadError(""); setSwitchingNotebook(true); setAsking(false); setGenerating(false); setPendingQuestion(""); setToast("");
    try {
      const workspace = await api<WorkspaceData>(`/api/workspace${id ? `?notebookId=${encodeURIComponent(id)}` : ""}`);
      if (navigationVersion.current !== version) return;
      activeNotebookId.current = workspace.notebook.id;
      setData(workspace); setSelected(workspace.sources.map((source) => source.id)); setQuestion(""); setSearch(""); setChatTab("chat"); setClearConfirm(false);
      window.history.replaceState(null, "", `?notebook=${encodeURIComponent(workspace.notebook.id)}`);
    } catch (failure) { if (navigationVersion.current !== version) return; if (data) setToast((failure as Error).message); else setLoadError((failure as Error).message); }
    finally { if (navigationVersion.current === version) setSwitchingNotebook(false); }
  }

  const suiteCurrent = Boolean(data?.suite && selected.length === data.suiteSourceIds.length && selected.every((id) => data.suiteSourceIds.includes(id)));
  const suite = suiteCurrent ? data?.suite : null;
  const rootNodeId = suite?.mindMap.find((node) => node.parentId === null)?.id;
  const isSample = Boolean(data?.sources.length && data.sources.every((source) => source.sample));
  const mastered = data?.suite?.mindMap.filter((node) => data.progress.masteredNodes.includes(node.id)).length || 0;
  const totalNodes = data?.suite?.mindMap.length || 0;
  const mastery = totalNodes ? Math.round(mastered / totalNodes * 100) : 0;
  const gap = suite?.mindMap.find((node) => data?.progress.gapNodes.includes(node.id));
  const disabledWork = asking || generating;

  function toggleSource(id: string) { setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]); }
  function openSource(source: Source) { setPreviewSource(source); setModal("source"); }
  function openTool(tool: StudyTool) { if (!suite) { setToast("Generate a learning suite from the selected sources first."); return; } setModal(tool); }

  async function generate(openAfter?: StudyTool) {
    if (!data || !selected.length) return;
    const version = navigationVersion.current;
    setGenerating(true);
    try {
      const response = await fetch("/api/suite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notebookId: data.notebook.id, sourceIds: selected }) });
      const result = await response.json();
      if (navigationVersion.current !== version) return;
      if (!response.ok) throw new Error(result.error);
      setData((previous) => previous ? { ...previous, suite: result as LearningSuite, suiteId: response.headers.get("X-Suite-Id"), suiteSourceIds: [...selected] } : previous);
      setToast("Your learning suite is ready.");
      if (openAfter) setModal(openAfter);
    } catch (failure) { if (navigationVersion.current === version) setToast((failure as Error).message); }
    finally { if (navigationVersion.current === version) setGenerating(false); }
  }

  async function ask(value: string) {
    if (!data || !value.trim() || asking || !selected.length) return;
    const version = navigationVersion.current;
    setAsking(true); setPendingQuestion(value.trim()); setQuestion(""); setChatTab("chat");
    try { const result = await api<{ user: ChatMessage; assistant: ChatMessage }>("/api/chat", { method: "POST", body: JSON.stringify({ notebookId: data.notebook.id, sourceIds: selected, question: value.trim() }) }); if (navigationVersion.current !== version) return; setData((previous) => previous ? { ...previous, messages: [...previous.messages, result.user, result.assistant] } : previous); }
    catch (failure) { if (navigationVersion.current !== version) return; setToast((failure as Error).message); setQuestion(value); }
    finally { if (navigationVersion.current === version) { setAsking(false); setPendingQuestion(""); } }
  }

  async function recordProgress(action: ProgressAction) {
    if (!data || !data.suiteId) throw new Error("No active learning suite.");
    const version = navigationVersion.current;
    const result = await api<{ progress: LearnerProgress }>("/api/progress", { method: "POST", body: JSON.stringify({ ...action, notebookId: data.notebook.id, suiteId: data.suiteId }) });
    if (navigationVersion.current !== version) return;
    setData((previous) => previous ? { ...previous, progress: result.progress } : previous);
  }

  async function saveAsNote(title: string, content: string) {
    if (!data) return;
    const version = navigationVersion.current;
    try { const note = await api<Note>("/api/notes", { method: "POST", body: JSON.stringify({ notebookId: data.notebook.id, title, content }) }); if (navigationVersion.current !== version) return; setData((previous) => previous ? { ...previous, notes: [note, ...previous.notes] } : previous); setToast("Saved to your notes."); }
    catch (failure) { if (navigationVersion.current === version) setToast((failure as Error).message); }
  }

  async function removeNote(noteId: string) {
    if (!data) return;
    const version = navigationVersion.current;
    try { await api("/api/notes", { method: "DELETE", body: JSON.stringify({ notebookId: data.notebook.id, noteId }) }); if (navigationVersion.current !== version) return; setData((previous) => previous ? { ...previous, notes: previous.notes.filter((note) => note.id !== noteId) } : previous); setModal(null); setToast("Note removed."); }
    catch (failure) { if (navigationVersion.current === version) setToast((failure as Error).message); }
  }

  async function clearChat() {
    if (!data) return;
    const version = navigationVersion.current;
    try { await api("/api/chat", { method: "DELETE", body: JSON.stringify({ notebookId: data.notebook.id }) }); if (navigationVersion.current !== version) return; setData((previous) => previous ? { ...previous, messages: [] } : previous); setClearConfirm(false); }
    catch (failure) { if (navigationVersion.current === version) setToast((failure as Error).message); }
  }

  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setToast("Copied to clipboard."); } catch { setToast("Clipboard access is unavailable. Use the JSON download instead."); } }

  if (!data || switchingNotebook) return <div className="loading-workspace"><div className="loading-brand"><BookOpenText size={32} /><span>bokamoso<span className="brand-dot">.</span></span></div>{loadError ? <><p role="alert">{loadError}</p><button className="button primary" onClick={() => loadNotebook()}>Reload workspace <ArrowRight size={16} /></button></> : <><Loader2 size={24} className="spin" /><p>Opening your notebook...</p></>}</div>;

  const visibleSources = data.sources.filter((source) => source.title.toLowerCase().includes(search.toLowerCase()));
  const toolModal = modal && modal in toolLabels ? modal as StudyTool : null;
  const modalTitle = toolModal ? toolLabels[toolModal] : modal === "add-source" ? "Add sources" : modal === "source" ? previewSource?.title || "Source" : modal === "notebooks" ? "Your notebooks" : modal === "new-notebook" ? "Create a notebook" : modal === "settings" ? "Workspace settings" : modal === "export" ? "Export your learning suite" : modal === "new-note" ? "A thought worth keeping" : previewNote?.title || "Note";

  return <div className="app-shell">
    <header className="app-header"><div className="header-left"><button className="brand" onClick={() => setModal("notebooks")} aria-label="Bokamoso notebooks"><span className="brand-symbol"><BookOpenText size={25} strokeWidth={1.6} /></span><span>bokamoso<span className="brand-dot">.</span></span></button><span className="header-divider" /><button className="breadcrumb" onClick={() => setModal("notebooks")}>My notebooks <ChevronRight size={14} /></button><span className="header-notebook-name">{data.notebook.title}</span></div><div className="header-actions"><button className="xp-indicator" onClick={() => openTool("progress")} title="View learning progress"><Zap size={16} /> <strong>{data.progress.xp}</strong> XP</button><button className="button header-progress" onClick={() => openTool("progress")}><Award size={16} /> My progress</button><IconButton icon={Settings2} label="Workspace settings" onClick={() => setModal("settings")} /><button className="profile-avatar" aria-label="Learner profile" onClick={() => openTool("progress")}>L</button></div></header>

    <div className="notebook-toolbar"><div className="notebook-heading"><button className="notebook-symbol" onClick={() => setModal("notebooks")} aria-label="Switch notebook"><Atom size={27} strokeWidth={1.4} /></button><div><h1>{data.notebook.title}<button className="title-dropdown" aria-label="Switch notebook" onClick={() => setModal("notebooks")}><ChevronDown size={17} /></button></h1><div className="notebook-meta"><span>Grade {data.notebook.grade}</span><span className="meta-separator" /><span>{data.notebook.subject}</span><span className="meta-separator" /><span className="notebook-type">{isSample ? "Sample notebook" : "Personal notebook"}</span></div></div></div><div className="notebook-toolbar-actions"><span className="save-status"><CheckCircle2 size={14} /> All changes saved</span><button className="button secondary" onClick={() => setModal("export")} disabled={!suite}><Share2 size={15} /> Export</button></div></div>

    <nav className="mobile-pane-tabs" aria-label="Workspace panels">{(["sources", "chat", "studio"] as const).map((pane) => <button key={pane} className={activePane === pane ? "active" : ""} onClick={() => setActivePane(pane)}>{pane === "sources" ? <FileText size={16} /> : pane === "chat" ? <MessageSquare size={16} /> : <Sparkles size={16} />}{pane === "chat" ? "Learn" : pane[0].toUpperCase() + pane.slice(1)}{pane === "sources" && <span>{data.sources.length}</span>}</button>)}</nav>

    <main className={`workspace-grid ${sourcesCollapsed ? "sources-collapsed" : ""}`}>
      <aside className={`workspace-pane sources-pane ${activePane === "sources" ? "mobile-active" : ""}`}>
        <div className="pane-header"><h2>Sources <span className="count-tag">{data.sources.length}</span></h2><IconButton icon={sourcesCollapsed ? PanelLeftOpen : PanelLeftClose} label={sourcesCollapsed ? "Expand sources" : "Collapse sources"} onClick={() => setSourcesCollapsed(!sourcesCollapsed)} /></div>
        <div className="source-actions"><button className="button add-source-button" onClick={() => setModal("add-source")} disabled={disabledWork}><Plus size={17} /> Add sources</button><div className="source-search"><Search size={16} /><input aria-label="Search sources" placeholder="Search sources" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button aria-label="Clear source search" onClick={() => setSearch("")}><X size={13} /></button>}</div></div>
          <label className="select-all-row"><span>Select all sources</span><input type="checkbox" checked={data.sources.length > 0 && selected.length === data.sources.length} disabled={disabledWork || !data.sources.length} onChange={(event) => setSelected(event.target.checked ? data.sources.map((source) => source.id) : [])} /></label>
          <div className="source-list">{visibleSources.map((source, index) => <div key={source.id} className={`source-row ${selected.includes(source.id) ? "source-selected" : ""}`}><button className="source-open" onClick={() => openSource(source)}><span className={`source-file-icon source-color-${index % 3}`}><FileText size={18} strokeWidth={1.6} /></span><span><strong>{source.title}</strong><small>{source.format === "pdf" ? "PDF document" : source.type === "curriculum_syllabus" ? "Curriculum syllabus" : "Study notes"}<span>·</span>{source.sample ? "Sample" : `${source.chunks.length} chunks`}</small></span></button><input type="checkbox" aria-label={`Select ${source.title}`} checked={selected.includes(source.id)} disabled={disabledWork} onChange={() => toggleSource(source.id)} /></div>)}{!visibleSources.length && <div className="small-empty"><FileText size={26} /><p>{data.sources.length ? "No matching sources." : "No sources yet."}</p>{!data.sources.length && <button className="text-button" onClick={() => setModal("add-source")}>Add your first source <Plus size={14} /></button>}</div>}</div>
          <div className="source-bottom"><div className="source-grounding"><span className="grounding-icon"><ShieldCheck size={20} /></span><div><strong>Rooted in your sources</strong><p>Your selected material.<br />Your learning, in context.</p></div></div><div className="source-count"><span>{selected.length} of {data.sources.length} sources selected</span><span className="status-dot" /></div></div>
      </aside>

      <section className={`workspace-pane chat-pane ${activePane === "chat" ? "mobile-active" : ""}`}>
        <div className="pane-header"><div className="pane-tabs"><button className={chatTab === "chat" ? "active" : ""} onClick={() => setChatTab("chat")}>Learn</button><button className={chatTab === "notes" ? "active" : ""} onClick={() => setChatTab("notes")}>My notes {data.notes.length > 0 && <span>{data.notes.length}</span>}</button></div><div className="pane-heading-actions"><span className="grounded-label"><span className="status-dot" />{data.aiConfigured ? "Source-grounded AI" : "Source-grounded"}</span><IconButton icon={Ellipsis} label="Chat options" onClick={() => setClearConfirm(!clearConfirm)} /></div>{clearConfirm && <div className="chat-options-menu"><button disabled={asking || !data.messages.length} onClick={clearChat}><Trash2 size={15} /> Clear conversation</button><button onClick={() => setClearConfirm(false)}><X size={15} /> Cancel</button></div>}</div>
        <div className="chat-scroll">
          {chatTab === "notes" ? <div className="notes-view"><div className="notes-view-heading"><h3>Your notes</h3><button className="button secondary" onClick={() => setModal("new-note")}><Plus size={15} /> Add note</button></div>{data.notes.length ? data.notes.map((note) => <button className="note-preview-row" key={note.id} onClick={() => { setPreviewNote(note); setModal("note"); }}><StickyNote size={19} /><div><h4>{note.title}</h4><p>{note.content.slice(0, 160)}</p></div><ChevronRight size={16} /></button>) : <div className="notes-empty"><StickyNote size={37} strokeWidth={1.25} /><h3>A little space for your big ideas.</h3><button className="text-button" onClick={() => setModal("new-note")}><Plus size={15} /> Write a note</button></div>}</div> : <>
            <div className={`module-overview ${data.messages.length ? "compact-overview" : ""}`}><div className="module-icon"><Atom size={34} strokeWidth={1.3} /></div><div className="overview-eyebrow"><span>YOUR LEARNING NOTEBOOK</span><span>{selected.length} sources</span></div><h2>{data.notebook.title}</h2><p className="module-description">{suite ? suite.moduleSummary : !data.sources.length ? "A fresh page. A new perspective." : "Your sources are ready. Create a learning suite for this selection."}</p>
              {suite && <><div className="concept-chips">{suite.mindMap.filter((node) => node.parentId === rootNodeId).slice(0, 4).map((node) => <button key={node.id} onClick={() => ask(`Explain ${node.label} using the source material.`)} disabled={asking}><span />{node.label.replace(/^(First law: |Second law: |Third law: )/, "")}</button>)}</div><div className="overview-actions"><button className="button overview-action" onClick={() => saveAsNote(`${data.notebook.title}: overview`, suite.moduleSummary)}><Plus size={15} /> Save to note</button><button className="button overview-action" onClick={() => openTool("guide")}><BookOpen size={15} /> Study guide</button><button className="button overview-action" onClick={() => openTool("map")}><Network size={15} /> Mind map</button></div></>}
              {!suite && <button className="button primary" onClick={() => data.sources.length ? generate() : setModal("add-source")} disabled={generating || (data.sources.length > 0 && !selected.length)}>{generating ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}{data.sources.length ? "Generate learning suite" : "Add your first source"}</button>}
            </div>
            {!data.messages.length && !asking && suite && <div className="learning-start"><div className="learning-start-heading"><span className="tiny-spark"><Sparkles size={16} /></span><h3>A little curiosity goes a long way.</h3></div><p>Where would you like to start?</p><div className="suggested-questions">{(isSample ? ["Explain Newton's first law in simple terms", "How are force, mass and acceleration connected?", "Walk me through a worked example"] : [`Explain ${suite.mindMap[1]?.label} in simple terms`, `What are the key ideas in ${data.notebook.module}?`, "Show an application from these sources"]).map((prompt) => <button key={prompt} disabled={asking || !selected.length} onClick={() => ask(prompt)}><MessageSquare size={16} /><span>{prompt}</span><ArrowUp size={15} className="prompt-arrow" /></button>)}</div></div>}
            <div className="chat-messages">{data.messages.map((message) => <article key={message.id} className={`chat-message ${message.role}`}><div className={`message-avatar ${message.role === "assistant" ? "assistant-avatar" : ""}`}>{message.role === "assistant" ? <Sparkles size={17} /> : "L"}</div><div className="message-body"><span className="message-author">{message.role === "assistant" ? "Bokamoso" : "You"}{message.role === "assistant" && !data.aiConfigured && <small>Source excerpts</small>}</span><p>{message.content}</p>{message.citations && message.citations.length > 0 && <div className="citation-row">{message.citations.map((citation, index) => { const source = data.sources.find((item) => item.id === citation.sourceId); return <button key={`${citation.chunkId}-${index}`} title={citation.quote} onClick={() => source && openSource(source)} disabled={!source}><span>{index + 1}</span>{source?.title || "Source removed"}</button>; })}</div>}{message.role === "assistant" && <div className="message-actions"><IconButton icon={Copy} label="Copy answer" onClick={() => copy(message.content)} /><button className="text-button" onClick={() => saveAsNote(message.content.split("\n")[0].slice(0, 80), message.content)}><Plus size={14} /> Save to note</button></div>}</div></article>)}{asking && <><article className="chat-message user"><div className="message-avatar">L</div><div className="message-body"><span className="message-author">You</span><p>{pendingQuestion}</p></div></article><div className="thinking-indicator"><Sparkles size={18} /><span>Reading your sources</span><span className="thinking-dots"><i /><i /><i /></span></div></>}<div ref={chatBottom} /></div>
          </>}
        </div>
        <div className="chat-composer-area"><form className={`chat-composer ${asking ? "is-busy" : ""}`} onSubmit={(event: FormEvent) => { event.preventDefault(); ask(question); }}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={selected.length ? "Ask a question, follow a thought..." : "Select a source to start learning"} aria-label="Ask a question about your sources" rows={2} maxLength={2000} disabled={asking || !selected.length} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(question); } }} /><div className="composer-bottom"><span><BookOpen size={13} /> {selected.length} sources</span><button type="submit" className="send-button" aria-label="Send question" disabled={asking || !question.trim() || !selected.length}>{asking ? <Loader2 size={19} className="spin" /> : <ArrowUp size={20} />}</button></div></form><div className="chat-disclaimer">{data.aiConfigured ? "AI can make mistakes. Always check your sources." : "Sample workspace · Responses are excerpts from selected sources."}</div></div>
      </section>

      <aside className={`workspace-pane studio-pane ${activePane === "studio" ? "mobile-active" : ""}`}><div className="pane-header"><h2>Studio <Sparkles size={15} /></h2><IconButton icon={SlidersHorizontal} label="Studio settings" onClick={() => setModal("settings")} /></div><div className="studio-scroll"><div className="studio-intro"><h3>Make it make sense.</h3><p>A new way into what you&apos;re learning.</p></div><div className="studio-tool-grid">{studioTools.map(({ id, label, detail, icon: Icon, tone }) => <button className={`studio-tool ${tone}`} key={id} disabled={generating || !selected.length} onClick={() => suite ? openTool(id) : generate(id)}><div><Icon size={21} strokeWidth={1.65} /><ArrowRight size={14} className="tool-arrow" /></div><strong>{label}</strong><span>{detail}</span></button>)}</div>
          <button className="generate-button" disabled={!selected.length || generating || asking} onClick={() => generate()}>{generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}{generating ? "Creating your learning suite..." : "Generate learning suite"}<span>{generating ? "" : <ArrowRight size={15} />}</span></button>
          <section className="quest-preview"><div className="section-heading"><h3><Flag size={15} /> YOUR NEXT STEP</h3><span className="personalised-tag">For you</span></div><div className="quest-preview-content"><span className="quest-small-icon"><Target size={24} strokeWidth={1.4} /></span><div><h4>{gap ? `Revisit ${gap.label.toLowerCase()}` : data.suite?.gamifiedQuestPlan.questTitle || "Start your learning journey"}</h4><p>{gap ? "One gap. A clear next step." : "Small steps. Stronger understanding."}</p></div></div><div className="quest-preview-footer"><span><Zap size={14} /> {data.suite?.gamifiedQuestPlan.xpReward || 100} XP <span className="reward-dot" /> <Clock3 size={13} /> 5 min</span><button onClick={() => suite ? openTool("quest") : generate("quest")} disabled={!selected.length || generating}>Start quest <ArrowRight size={15} /></button></div></section>
          <section className="saved-materials"><div className="section-heading"><h3>IN YOUR NOTEBOOK <span>{(data.suite ? 2 : 0) + data.notes.length}</span></h3><button className="saved-filter" title="Filter saved items" onClick={() => setSavedFilter(savedFilter === "all" ? "notes" : "all")}>{savedFilter === "all" ? "All" : "Notes"}<ChevronDown size={12} /></button></div>{data.suite && savedFilter === "all" && <><button className="saved-item" disabled={!suite} onClick={() => openTool("map")}><span className="saved-item-icon blue"><Network size={18} /></span><span><strong>The bigger picture</strong><small>Mind map · {data.suite.mindMap.length} concepts</small></span><ChevronRight size={15} /></button><button className="saved-item" disabled={!suite} onClick={() => openTool("flashcards")}><span className="saved-item-icon lavender"><Layers size={18} /></span><span><strong>A little recall goes a long way</strong><small>Flashcards · 5 cards</small></span><ChevronRight size={15} /></button></>}{data.notes.slice(0, 3).map((note) => <button className="saved-item" key={note.id} onClick={() => { setPreviewNote(note); setModal("note"); }}><span className="saved-item-icon yellow"><StickyNote size={18} /></span><span><strong>{note.title}</strong><small>Personal note</small></span><ChevronRight size={15} /></button>)}<button className="add-note-button" onClick={() => setModal("new-note")}><Plus size={16} /> Add a note</button></section>
        </div><button className="studio-progress" onClick={() => openTool("progress")}><span className="progress-ring" style={{ background: `conic-gradient(var(--green) ${mastery}%, #e5ebe6 0)` }}><span>{mastery}<small>%</small></span></span><span><strong>A little wiser, every day.</strong><small>{mastered} of {totalNodes} concepts mastered</small></span><ChevronRight size={16} /></button></aside>
    </main>

    <footer className="app-footer"><span><span className="footer-brand-mark">b.</span> A brighter tomorrow starts with a little understanding.</span><span>Bokamoso <span className="footer-dot">·</span> Made for your next chapter <BookOpen size={12} /></span></footer>

    {toast && <div className="toast" role="status"><span>{toast}</span><IconButton icon={X} label="Dismiss notification" onClick={() => setToast("")} /></div>}
    {modal && <Modal title={modalTitle} subtitle={toolModal ? `${data.notebook.title} · ${selected.length} selected sources` : modal === "add-source" ? `${data.notebook.subject} · Grade ${data.notebook.grade}` : undefined} onClose={() => { setModal(null); setExportCopied(false); }} wide={modal === "map" || modal === "video" || modal === "source"}>
      {modal === "add-source" && <AddSourceForm data={data} onAdded={(source) => { if (activeNotebookId.current !== data.notebook.id) return; setData((previous) => previous ? { ...previous, sources: [...previous.sources, source] } : previous); setSelected((previous) => [...previous, source.id]); setModal(null); setToast("Source added and segmented. Generate a new learning suite when you're ready."); }} />}
      {modal === "source" && previewSource && <SourcePreview source={previewSource} protectedUpload={data.adminProtected} onRemove={async (key) => { await api("/api/sources", { method: "DELETE", body: JSON.stringify({ notebookId: data.notebook.id, sourceId: previewSource.id }), headers: key ? { "x-admin-key": key } : {} }); if (activeNotebookId.current !== data.notebook.id) return; setData((previous) => previous ? { ...previous, sources: previous.sources.filter((source) => source.id !== previewSource.id), suite: null, suiteId: null, suiteSourceIds: [] } : previous); setSelected((previous) => previous.filter((id) => id !== previewSource.id)); setModal(null); setToast("Source removed."); }} />}
      {modal === "notebooks" && <NotebookList data={data} onSelect={loadNotebook} onCreate={() => setModal("new-notebook")} />}
      {modal === "new-notebook" && <NewNotebookForm onCreated={(notebook) => loadNotebook(notebook.id)} />}
      {modal === "new-note" && <NoteForm notebookId={data.notebook.id} onSaved={(note) => { if (activeNotebookId.current !== data.notebook.id) return; setData((previous) => previous ? { ...previous, notes: [note, ...previous.notes] } : previous); setModal(null); setToast("Note saved."); }} />}
      {modal === "note" && previewNote && <div className="note-reader"><p>{previewNote.content}</p><div className="note-reader-footer"><button className="button secondary" onClick={() => copy(previewNote.content)}><Copy size={15} /> Copy note</button><button className="button danger" onClick={() => removeNote(previewNote.id)}><Trash2 size={15} /> Delete note</button></div></div>}
      {modal === "settings" && <div className="settings-view"><div className="settings-row"><span><Sparkles size={20} /><span><strong>Learning engine</strong><small>{data.ai ? `${data.ai.provider === "nvidia" ? "NVIDIA" : "Gemini"} · ${data.ai.model}` : "Sample mode · Source excerpts"}</small></span></span><span className={`status-tag ${data.aiConfigured ? "connected-tag" : ""}`}>{data.aiConfigured ? "Configured" : "Not connected"}</span></div><div className="settings-row"><span><ShieldCheck size={20} /><span><strong>Source grounding</strong><small>Selected material only</small></span></span><CheckCircle2 className="green-text" size={19} /></div><div className="settings-row"><span><GraduationCap size={20} /><span><strong>Learner profile</strong><small>Anonymous · This browser</small></span></span><span className="status-tag">SQLite</span></div><div className="settings-row"><span><BookMarked size={20} /><span><strong>Upload access</strong><small>{data.adminProtected ? "Administrator key required" : "Local development"}</small></span></span><span className="status-tag">{data.adminProtected ? "Protected" : "Local"}</span></div><div className="settings-metadata"><span>Grade {data.notebook.grade}</span><span>{data.notebook.subject}</span><span>{data.notebook.module}</span></div></div>}
      {modal === "export" && <div className="export-view"><span className="export-symbol"><Share2 size={28} /></span><h3>{data.notebook.title}</h3><p>Learning suite · JSON</p><div className="export-inventory"><span><Network size={17} /> Mind map</span><span><Layers size={17} /> 5 flashcards</span><span><Video size={17} /> 90-second script</span><span><CircleHelp size={17} /> 3 questions</span><span><Flag size={17} /> Personalised quest</span></div><button className="button primary full-width" disabled={!suite} onClick={() => { downloadJson(suite, "bokamoso-learning-suite.json"); setToast("Learning suite downloaded."); }}><Download size={17} /> Download JSON</button><button className="button secondary full-width" disabled={!suite} onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(suite, null, 2)); setExportCopied(true); } catch { setToast("Clipboard unavailable. Use the download instead."); } }}>{exportCopied ? <Check size={17} /> : <Copy size={17} />}{exportCopied ? "Copied" : "Copy JSON"}</button></div>}
      {suite && modal === "flashcards" && <Flashcards suite={suite} progress={data.progress} onRecord={recordProgress} />}
      {suite && modal === "map" && <MindMap suite={suite} progress={data.progress} />}
      {suite && modal === "video" && <VideoSummary suite={suite} sample={isSample} />}
      {suite && modal === "quiz" && <Diagnostic suite={suite} onRecord={recordProgress} onOpenQuest={() => setModal("quest")} />}
      {suite && modal === "quest" && <Quest suite={suite} progress={data.progress} onRecord={recordProgress} onOpen={openTool} />}
      {suite && modal === "progress" && <ProgressView suite={suite} progress={data.progress} onOpen={openTool} />}
      {suite && modal === "guide" && <StudyGuide suite={suite} onOpen={openTool} />}
    </Modal>}
  </div>;
}