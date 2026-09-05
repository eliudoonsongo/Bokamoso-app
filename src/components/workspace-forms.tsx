"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Check, FileText, Loader2, Plus, UploadCloud } from "lucide-react";
import { api } from "@/lib/client";
import type { Source } from "@/lib/learning";
import type { Notebook, Note, WorkspaceData } from "@/lib/types";

export function AddSourceForm({ data, onAdded }: { data: WorkspaceData; onAdded: (source: Source) => void }) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [type, setType] = useState("textbook_chapter");
  const [adminKey, setAdminKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  function chooseFile(next: File | undefined) { if (!next) return; setFile(next); if (!title) setTitle(next.name.replace(/\.(pdf|txt|md)$/i, "")); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData();
    form.set("notebookId", data.notebook.id); form.set("type", type); form.set("title", title);
    if (mode === "file" && file) form.set("file", file); else form.set("text", text);
    try { onAdded(await api<Source>("/api/sources", { method: "POST", body: form, headers: adminKey ? { "x-admin-key": adminKey } : {} })); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <form className="stack-form" onSubmit={submit}>
    <div className="segmented-control"><button type="button" className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}><UploadCloud size={16} /> Upload a file</button><button type="button" className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><FileText size={16} /> Paste text</button></div>
    {mode === "file" ? <><input ref={fileInput} type="file" accept=".pdf,.txt,.md" className="sr-only" aria-label="Choose study material file" onChange={(event) => chooseFile(event.target.files?.[0])} />
      <button type="button" className={`upload-area ${dragging ? "dragging" : ""}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}><span className="upload-icon">{file ? <FileText size={29} /> : <UploadCloud size={29} />}</span><strong>{file ? file.name : "Choose a file or drop it here"}</strong><span>{file ? `${(file.size / 1024).toFixed(0)} KB` : "PDF, TXT, Markdown · Up to 5 MB"}</span></button></> : <label>Study material<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste your chapter or syllabus text..." rows={8} required minLength={100} maxLength={60000} /></label>}
    <label>Source title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Forces and free-body diagrams" required maxLength={160} /></label>
    <label>Source type<select value={type} onChange={(event) => setType(event.target.value)}><option value="textbook_chapter">Textbook chapter / study notes</option><option value="curriculum_syllabus">Curriculum / syllabus</option></select></label>
    <div className="metadata-strip"><BookOpen size={16} /><span>Grade {data.notebook.grade}</span><span>{data.notebook.subject}</span></div>
    {data.adminProtected && <label>Administrator upload key<input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} required autoComplete="off" /></label>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="button primary full-width" type="submit" disabled={busy || (mode === "file" && !file)}>{busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}{busy ? "Reading and segmenting..." : "Add source"}</button>
  </form>;
}

export function NewNotebookForm({ onCreated }: { onCreated: (notebook: Notebook) => void }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Physical Sciences");
  const [grade, setGrade] = useState(11);
  const [module, setModule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { onCreated(await api<Notebook>("/api/notebooks", { method: "POST", body: JSON.stringify({ title, grade, subject, module: module || title }) })); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <form className="stack-form" onSubmit={submit}><label>Notebook name<input autoFocus required minLength={2} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. The chemistry of life" /></label><div className="form-columns"><label>Grade<select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Grade {index + 1}</option>)}</select></label><label>Subject<input required value={subject} onChange={(event) => setSubject(event.target.value)} list="subject-options" minLength={2} maxLength={80} /><datalist id="subject-options">{["Physical Sciences", "Mathematics", "Life Sciences", "English", "Geography", "History", "Accounting"].map((item) => <option key={item} value={item} />)}</datalist></label></div><label>Module / unit<input value={module} onChange={(event) => setModule(event.target.value)} placeholder={title || "Module name"} maxLength={100} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full-width" disabled={busy}>{busy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />} Create notebook</button></form>;
}

export function NoteForm({ notebookId, onSaved }: { notebookId: string; onSaved: (note: Note) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { onSaved(await api<Note>("/api/notes", { method: "POST", body: JSON.stringify({ notebookId, title, content }) })); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <form className="stack-form" onSubmit={submit}><label>Title<input autoFocus required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled note" /></label><label>Note<textarea required rows={9} maxLength={20000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Capture an idea, a connection, a question..." /></label>{error && <p role="alert" className="form-error">{error}</p>}<button className="button primary full-width" disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />} Save note</button></form>;
}

export function NotebookList({ data, onSelect, onCreate }: { data: WorkspaceData; onSelect: (id: string) => void; onCreate: () => void }) {
  return <div className="notebook-list">{data.notebooks.map((notebook) => <button key={notebook.id} onClick={() => onSelect(notebook.id)} className={notebook.id === data.notebook.id ? "selected" : ""}><span className="notebook-list-icon"><BookOpen size={24} /></span><div><h3>{notebook.title}</h3><p>Grade {notebook.grade} · {notebook.subject}</p></div>{notebook.id === data.notebook.id ? <Check size={18} /> : <ArrowRight size={18} />}</button>)}<button className="new-notebook-row" onClick={onCreate}><Plus size={20} /> New notebook</button></div>;
}

export function SourcePreview({ source, onRemove, protectedUpload }: { source: Source; onRemove: (key: string) => Promise<void>; protectedUpload: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() { setBusy(true); try { await onRemove(key); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <div className="source-preview"><div className="source-info-tags"><span>Grade {source.grade}</span><span>{source.subject}</span><span>{source.chunks.length} chunks</span><span>{source.type === "curriculum_syllabus" ? "Syllabus" : "Study material"}</span></div>{source.sample && <div className="sample-notice">Original Bokamoso sample material. Not an official textbook or verified syllabus.</div>}<div className="source-content">{source.text}</div><div className="source-preview-footer">{confirm ? <div className="delete-confirm"><p>Remove this source and invalidate its learning suite?</p>{protectedUpload && <input type="password" aria-label="Administrator upload key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Administrator key" />}<div className="button-row"><button className="button danger" disabled={busy} onClick={remove}>Remove source</button><button className="button secondary" onClick={() => setConfirm(false)}>Cancel</button></div></div> : <button className="text-button danger-text" onClick={() => setConfirm(true)}>Remove source</button>}{error && <p className="form-error" role="alert">{error}</p>}</div></div>;
}