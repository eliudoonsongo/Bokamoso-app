"use client";

import { useDeferredValue, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, EyeOff, Focus, Info, Layers3, Loader2, MessageSquare, Pause, RotateCcw, RotateCw, Save, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import AnatomyScene from "@/vendor/human-atlas/scene";
import { SYSTEMS, type Atlas, type Concept, type SceneState, type SystemId, type View } from "@/vendor/human-atlas/anatomy";
import { ATLAS_ASSET_PATH, ATLAS_ATTRIBUTION, ATLAS_SOURCE_URL, ATLAS_TOPICS, anatomyNote, anatomyQuestion, describeAnatomy, initialAtlasState, parseAtlas, searchAnatomy } from "@/lib/atlas-study";
import { atlasNotebookUrl, isLifeSciences } from "@/lib/atlas-navigation";
import { api } from "@/lib/client";
import type { Note, WorkspaceData } from "@/lib/types";
import { IconButton, Modal } from "../ui";
import styles from "./atlas.module.css";

type MobilePanel = "model" | "layers" | "structure";
const organSystems: SystemId[] = ["cardiac", "respiratory", "digestive", "urinary", "endocrine", "reproductive"];

export default function AtlasExplorer() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const notebookId = params.get("notebook");
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [contextError, setContextError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [viewerError, setViewerError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<SceneState>(() => initialAtlasState());
  const [topicId, setTopicId] = useState("overview");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [chosen, setChosen] = useState<Concept | null>(null);
  const [panel, setPanel] = useState<MobilePanel>("model");
  const [about, setAbout] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedDrafts, setSavedDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${ATLAS_ASSET_PATH}/atlas.json`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("The anatomy catalog could not be loaded."); return parseAtlas(await response.json()); })
      .then(setAtlas)
      .catch((failure) => { if (!controller.signal.aborted) setCatalogError(failure instanceof Error ? failure.message : "The anatomy catalog could not be loaded."); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!notebookId) return;
    const controller = new AbortController();
    api<WorkspaceData>(`/api/workspace?notebookId=${encodeURIComponent(notebookId)}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!isLifeSciences(data.notebook.subject)) throw new Error("This notebook is not a Life Sciences notebook. The atlas is available as a reference only.");
        setWorkspace(data);
      })
      .catch((failure) => { if (!controller.signal.aborted) setContextError((failure as Error).message); });
    return () => controller.abort();
  }, [notebookId]);

  const topic = ATLAS_TOPICS.find((item) => item.id === topicId) || ATLAS_TOPICS[0];
  const requestedSources = new Set(params.getAll("source"));
  const sourceIds = workspace?.sources.filter((source) => requestedSources.has(source.id)).map((source) => source.id) || [];
  const backUrl = atlasNotebookUrl(contextError ? null : notebookId, workspace ? sourceIds : [...requestedSources]);
  const results = atlas ? searchAnatomy(atlas, deferredQuery) : [];
  const details = atlas && chosen ? describeAnatomy(atlas, chosen) : null;
  const selectionKey = chosen ? `${chosen.id}:${chosen.elements.join(",")}` : "";
  const observation = drafts[selectionKey] || "";
  const saved = Object.hasOwn(savedDrafts, selectionKey) && savedDrafts[selectionKey] === observation;
  const selection = new Set(state.selected);
  const visibleCount = atlas?.parts.filter((part) => state.isolate ? selection.has(part.id) : state.visible.includes(part.system) || selection.has(part.id)).length || 0;
  const activeSystems = SYSTEMS.filter((system) => atlas?.parts.some((part) => part.system === system.id));
  const ready = progress === 100 && !viewerError;

  function choose(concept: Concept) {
    setChosen(concept);
    setState((previous) => ({ ...previous, selected: concept.elements, isolate: false, rotate: false }));
    setNotice("");
    setPanel("model");
  }

  function choosePart(id: string) {
    const part = atlas?.parts.find((item) => item.id === id);
    if (part) choose({ id: part.conceptId, name: part.name, elements: [part.id] });
  }

  function showSystems(systems: SystemId[]) {
    setChosen(null);
    setState((previous) => ({ ...previous, visible: systems, selected: [], isolate: false, rotate: false }));
  }

  function toggleSystem(system: SystemId) {
    showSystems(state.visible.includes(system) ? state.visible.filter((id) => id !== system) : [...state.visible, system]);
  }

  function changeTopic(id: string) {
    const selectedTopic = ATLAS_TOPICS.find((item) => item.id === id) || ATLAS_TOPICS[0];
    setTopicId(selectedTopic.id);
    setChosen(null);
    setState((previous) => ({ ...initialAtlasState(selectedTopic), reset: previous.reset + 1 }));
    setPanel("model");
  }

  function reset() {
    setChosen(null);
    setQuery("");
    setState((previous) => ({ ...initialAtlasState(topic), reset: previous.reset + 1 }));
  }

  function retryViewer() {
    setViewerError("");
    setProgress(0);
    setSceneAttempt((previous) => previous + 1);
  }

  async function saveObservation() {
    if (!workspace || !atlas || !chosen || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const note = anatomyNote(atlas, chosen, observation);
      await api<Note>("/api/notes", { method: "POST", body: JSON.stringify({ notebookId: workspace.notebook.id, ...note }) });
      setSavedDrafts((previous) => ({ ...previous, [selectionKey]: observation }));
      setNotice(`Saved ${chosen.name} to your notebook.`);
    } catch (failure) { setNotice((failure as Error).message); }
    finally { setSaving(false); }
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.identity}><Activity size={26} /><div><h1>Human Atlas</h1><p>{workspace ? `Grade ${workspace.notebook.grade} / ${workspace.notebook.subject}` : "Life Sciences"}</p></div></div>
      <div className={styles.notebookContext}>{workspace?.notebook.title || (notebookId && !contextError ? "Opening notebook..." : "Anatomy reference")}</div>
      <Link href={backUrl} prefetch={false} className={styles.back}><ArrowLeft size={16} /><span>{notebookId ? "Notebook" : "Your notebooks"}</span></Link>
      <IconButton icon={Info} label="Atlas source and scope" onClick={() => setAbout(true)} />
    </header>

    <div className={styles.toolbar}>
      <label className={styles.topicControl}><BookOpen size={16} /><span className={styles.desktopLabel}>Study topic</span><select aria-label="Study topic" value={topicId} onChange={(event) => changeTopic(event.target.value)}>{ATLAS_TOPICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div className={styles.cameraControls} role="group" aria-label="Anatomy camera controls">
        <select aria-label="Camera view" value={state.view} disabled={state.explode > 0.8} onChange={(event) => setState((previous) => ({ ...previous, view: event.target.value as View, reset: previous.reset + 1, rotate: false }))}>
          <option value="front">Front</option><option value="three-quarter">3/4 view</option><option value="side">Side</option><option value="back">Back</option>
        </select>
        <IconButton icon={ZoomOut} label="Zoom out" disabled={!ready} onClick={() => setState((previous) => ({ ...previous, zoom: (previous.zoom || 0) - 1 }))} />
        <IconButton icon={ZoomIn} label="Zoom in" disabled={!ready} onClick={() => setState((previous) => ({ ...previous, zoom: (previous.zoom || 0) + 1 }))} />
        <IconButton icon={state.rotate ? Pause : RotateCw} label={state.rotate ? "Pause rotation" : "Rotate anatomy"} disabled={!ready || state.explode >= 0.4 || state.isolate} onClick={() => setState((previous) => ({ ...previous, rotate: !previous.rotate }))} />
        <IconButton icon={RotateCcw} label="Reset anatomy view" onClick={reset} />
      </div>
    </div>

    <nav className={styles.mobileTabs} aria-label="Atlas panels">
      {([{ id: "model", label: "3D view", icon: Activity }, { id: "layers", label: "Find & layers", icon: Layers3 }, { id: "structure", label: "Study", icon: BookOpen }] as const).map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={panel === id} onClick={() => { setPanel(id); setState((previous) => ({ ...previous, rotate: false })); }}><Icon size={16} />{label}</button>)}
    </nav>

    {contextError && <p className={styles.contextError} role="alert">{contextError}</p>}
    <div className={styles.workbench} data-panel={panel}>
      <aside className={styles.layers} aria-label="Anatomy search and systems">
        <div className={styles.searchField}><Search size={16} /><input type="search" aria-label="Search anatomy" placeholder="Structure or atlas ID" value={query} maxLength={160} onChange={(event) => setQuery(event.target.value)} /><IconButton icon={X} label="Clear anatomy search" disabled={!query} onClick={() => setQuery("")} /></div>
        <section className={styles.searchResults} aria-label="Anatomy search results">
          <div className={styles.sectionHeading}><h2>{query ? "Search results" : "Key structures"}</h2><span>{results.length}{query && results.length === 80 ? "+" : ""}</span></div>
          {!atlas ? <p className={styles.muted}>{catalogError ? "Catalog unavailable" : "Loading structures..."}</p> : results.length ? <ul>{results.map((concept) => <li key={concept.id}><button type="button" onClick={() => choose(concept)} aria-pressed={chosen?.id === concept.id}><span>{concept.name}<small>{concept.id}</small></span><ChevronRight size={14} /></button></li>)}</ul> : <p className={styles.muted}>No matching modeled structures.</p>}
        </section>
        <section className={styles.systems} aria-label="Anatomical systems">
          <div className={styles.sectionHeading}><h2>Systems</h2><IconButton icon={EyeOff} label="Hide all systems" disabled={!atlas} onClick={() => showSystems([])} /></div>
          <div className={styles.presets} role="group" aria-label="System presets">
            <button type="button" disabled={!atlas} aria-pressed={activeSystems.length > 0 && activeSystems.every((system) => state.visible.includes(system.id))} onClick={() => showSystems(activeSystems.map((system) => system.id))}>All</button>
            <button type="button" disabled={!atlas} aria-pressed={state.visible.length === 1 && state.visible[0] === "skeletal"} onClick={() => showSystems(["skeletal"])}>Skeleton</button>
            <button type="button" disabled={!atlas} aria-pressed={state.visible.length === organSystems.length && organSystems.every((id) => state.visible.includes(id))} onClick={() => showSystems([...organSystems])}>Organs</button>
          </div>
          <div className={styles.systemList}>{activeSystems.map((system) => <div className={styles.systemRow} key={system.id}>
            <button type="button" title={`Show only ${system.name.toLowerCase()}`} onClick={() => showSystems([system.id])}><span className={styles.swatch} style={{ "--system-color": system.color } as CSSProperties} />{system.name}<small>{atlas?.parts.filter((part) => part.system === system.id).length}</small></button>
            <input type="checkbox" aria-label={`Show ${system.name.toLowerCase()}`} checked={state.visible.includes(system.id)} onChange={() => toggleSystem(system.id)} />
          </div>)}</div>
        </section>
      </aside>

      <section className={styles.canvasColumn} aria-label="3D anatomy explorer">
        <div className={styles.viewport} data-ready={ready}>
          {atlas && !viewerError && <AnatomyScene key={sceneAttempt} atlas={atlas} state={state} onSelect={choosePart} onProgress={setProgress} onError={setViewerError} />}
          {!catalogError && !viewerError && !ready && <div className={styles.loading} role="status"><Loader2 size={22} className="spin" /><strong>{atlas ? "Loading anatomy" : "Opening the catalog"}</strong><progress value={progress} max={100} aria-label="Anatomy download progress" /><span>{progress}% / {atlas ? `${atlas.parts.length.toLocaleString()} modeled pieces` : "BodyParts3D 4.0"}</span></div>}
          {(catalogError || viewerError) && <div className={styles.viewerError} role="alert"><Info size={24} /><p>{catalogError || viewerError}</p><button type="button" className="button secondary" onClick={() => { if (catalogError) { setCatalogError(""); setAttempt((previous) => previous + 1); } else retryViewer(); }}><RotateCcw size={15} />Retry viewer</button></div>}
          {ready && visibleCount === 0 && <div className={styles.emptyView}><Layers3 size={28} /><p>No systems visible</p><button type="button" className="button secondary" onClick={reset}>Restore topic systems</button></div>}
        </div>
        <div className={styles.explodeRow}><label htmlFor="atlas-explode">Explode</label><input id="atlas-explode" aria-label="Explode anatomy" type="range" min={0} max={100} step={1} value={Math.round(state.explode * 100)} disabled={!ready || state.isolate} onChange={(event) => { const value = Number(event.target.value) / 100; setState((previous) => ({ ...previous, explode: value, view: value > 0.8 ? "front" : previous.view, rotate: false })); }} /><output htmlFor="atlas-explode">{Math.round(state.explode * 100)}%</output></div>
        <div className={styles.selectionStrip}><span>{chosen ? chosen.name : `${visibleCount.toLocaleString()} pieces visible`}</span>{chosen ? <><button type="button" className={styles.mobileInspect} onClick={() => setPanel("structure")}>Inspect <ChevronRight size={14} /></button><IconButton icon={X} label="Clear selected structure" onClick={() => { setChosen(null); setState((previous) => ({ ...previous, selected: [], isolate: false })); }} /></> : <span className={styles.referenceTag}>Adult male reference</span>}</div>
      </section>

      <aside className={styles.inspector} aria-label="Anatomy study panel">
        <div className={styles.sectionHeading}><h2>{chosen ? "Selected structure" : "Study focus"}</h2><span>{chosen ? `${chosen.elements.length} pieces` : "Life Sciences"}</span></div>
        {chosen && details ? <>
          <h2 className={styles.structureName}>{chosen.name}</h2>
          <p className={styles.structureId}>{chosen.id}</p>
          <div className={styles.systemTags}>{details.systems.map((system) => <span key={system.id}><i style={{ background: system.color }} />{system.name}</span>)}</div>
          <span className={styles.overviewType}>{details.descriptionKind}</span><p className={styles.description}>{details.description}</p>
          <button type="button" className={`button ${state.isolate ? "primary" : "secondary"} ${styles.isolate}`} aria-pressed={state.isolate} disabled={!ready} onClick={() => { setState((previous) => ({ ...previous, isolate: !previous.isolate, explode: 0, rotate: false })); setPanel("model"); }}><Focus size={17} />{state.isolate ? "Show surrounding anatomy" : "Isolate structure"}</button>
          {details.parts.length > 1 && <details className={styles.members}><summary>{details.parts.length} included pieces</summary><ul>{details.parts.slice(0, 50).map((part) => <li key={part.id}><button type="button" onClick={() => choosePart(part.id)}>{part.name}<ChevronRight size={13} /></button></li>)}</ul>{details.parts.length > 50 && <small>50 of {details.parts.length} pieces shown</small>}</details>}
          <div className={styles.observation}><label htmlFor="atlas-observation">Your observation</label><textarea id="atlas-observation" value={observation} maxLength={6000} rows={3} placeholder="Structure, position, function..." onChange={(event) => setDrafts((previous) => ({ ...previous, [selectionKey]: event.target.value }))} />
            <button type="button" className={`button primary ${styles.save}`} disabled={!workspace || saving || saved} onClick={saveObservation}>{saving ? <Loader2 size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}{saved ? "Saved to notebook" : "Save observation"}</button>
            {workspace && sourceIds.length ? <Link prefetch={false} href={atlasNotebookUrl(notebookId, sourceIds, anatomyQuestion(chosen))} className={styles.ask}><MessageSquare size={15} />Ask notebook<ArrowUpRight size={14} /></Link> : <button type="button" className={styles.ask} disabled title="No notebook sources are selected"><MessageSquare size={15} />Ask notebook</button>}
            <small>{workspace ? `${sourceIds.length} notebook sources selected` : notebookId && !contextError ? "Connecting notebook..." : "Reference only / no notebook attached"}</small>
          </div>
        </> : <div className={styles.topicIntro}><h3>{topic.label}</h3><ul>{topic.landmarks.map((name) => { const concept = atlas?.concepts.find((item) => item.name === name); return <li key={name}><button type="button" disabled={!concept} onClick={() => concept && choose(concept)}><Focus size={15} />{name}<ChevronRight size={14} /></button></li>; })}</ul></div>}
        <section className={styles.investigation}><h3>Investigate</h3><ol>{topic.questions.map((question) => <li key={question}>{question}</li>)}</ol></section>
        <p className={styles.referenceScope}>Adult male anatomy. Organ shapes and system colors are a reference, not a complete representation of human variation.</p>
      </aside>
    </div>

    {notice && <div className={styles.notice} role="status"><span>{notice}</span><IconButton icon={X} label="Dismiss atlas notification" onClick={() => setNotice("")} /></div>}
    <footer className={styles.footer}><span>BodyParts3D 4.0<span className={styles.desktopLabel}> / {atlas?.parts.length.toLocaleString() || "2,234"} meshes / 33 MB compressed geometry</span></span><button type="button" onClick={() => setAbout(true)}>Source & scope <ArrowUpRight size={12} /></button></footer>

    {about && <Modal title="Human Atlas: source & scope" onClose={() => setAbout(false)}><div className={styles.credits}>
      <h3>BodyParts3D 4.0</h3><p>An adult male anatomical reference with 2,234 source meshes, 3,432 named concepts and 15 display systems. A named concept may contain several pieces. System colors are illustrative, not natural tissue colors.</p>
      <p>The model does not represent every structure, microscopic detail, sex or human variation. Female reproductive anatomy is not included. This is an educational reference, not a diagnostic or surgical tool, and not a verified school syllabus.</p>
      <p>Organ overviews and general system descriptions come from Human Atlas. Bokamoso adds study prompts and notebook observations. Atlas content is separate from uploaded sources; looking at a structure does not award XP or assessed mastery.</p>
      <h3>Credits</h3><p>{ATLAS_ATTRIBUTION}. Human Atlas application code by ashemag, MIT licensed.</p>
      <p>Upstream adaptations include coordinate conversion, simplified geometry with a 0.2% relative error limit, quantized normals and compressed chunks. Bokamoso preserves the supplied geometry and adapts the camera, navigation and learning interface.</p>
      <a href={ATLAS_SOURCE_URL} target="_blank" rel="noreferrer">BodyParts3D dataset <ArrowUpRight size={14} /></a>
      <a href="https://github.com/ashemag/human-atlas" target="_blank" rel="noreferrer">Original Human Atlas project <ArrowUpRight size={14} /></a>
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 data license <ArrowUpRight size={14} /></a>
      <a href="/atlas/ATTRIBUTION.md" target="_blank" rel="noreferrer">Complete data attribution <ArrowUpRight size={14} /></a>
      <a href="/atlas/HUMAN-ATLAS-LICENSE.txt" target="_blank" rel="noreferrer">Human Atlas MIT license <ArrowUpRight size={14} /></a>
    </div></Modal>}
  </main>;
}