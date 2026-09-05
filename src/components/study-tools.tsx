"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Background, Controls, ReactFlow, Position, type Node, type Edge } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { ArrowRight, Award, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleHelp, Flag, Layers, Lightbulb, LockKeyhole, Network, Pause, Play, RotateCcw, Sparkles, Target, Trophy, Volume2, VolumeX, X, Zap } from "lucide-react";
import { questUnlocked, timestampSeconds, type LearnerProgress, type LearningSuite } from "@/lib/learning";
import { IconButton } from "./ui";

export type StudyTool = "map" | "flashcards" | "video" | "quiz" | "quest" | "progress" | "guide";
export type ProgressAction = { action: "answer"; questionId: string; optionIndex: number } | { action: "review-card"; cardId: string } | { action: "claim-quest" };
export type RecordProgress = (action: ProgressAction) => Promise<void>;

export function Flashcards({ suite, progress, onRecord }: { suite: LearningSuite; progress: LearnerProgress; onRecord: RecordProgress }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const card = suite.flashcards[index];
  const reviewed = suite.flashcards.filter((item) => progress.reviewedCardIds.includes(item.cardId)).length;

  function move(next: number) { setIndex(next); setFlipped(false); setHint(false); setError(""); }
  async function markReviewed() {
    setBusy(true);
    try { await onRecord({ action: "review-card", cardId: card.cardId }); if (index < 4) move(index + 1); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="flashcards-view">
    <div className="tool-meta"><span><Layers size={15} /> Card {index + 1} of 5</span><span>{reviewed} reviewed <CheckCircle2 size={15} /></span></div>
    <div className="five-track">{suite.flashcards.map((item, itemIndex) => <button key={item.cardId} title={`Go to card ${itemIndex + 1}`} aria-label={`Go to card ${itemIndex + 1}`} className={`${itemIndex === index ? "current" : ""} ${progress.reviewedCardIds.includes(item.cardId) ? "complete" : ""}`} onClick={() => move(itemIndex)} />)}</div>
    <button className={`flashcard ${flipped ? "is-flipped" : ""}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show question" : "Reveal answer"}>
      <span className="eyebrow">{flipped ? "THE ANSWER" : "ACTIVE RECALL"}</span>
      <span className="flashcard-text">{flipped ? card.back : card.front}</span>
      <span className="flip-label"><RotateCcw size={15} /> {flipped ? "Back to question" : "Reveal answer"}</span>
    </button>
    <div className="flashcard-hint">{hint ? <p><Lightbulb size={17} /> {card.hint}</p> : <button className="text-button" onClick={() => setHint(true)}><Lightbulb size={16} /> Show hint</button>}</div>
    <div className="flashcard-controls"><IconButton icon={ChevronLeft} label="Previous card" onClick={() => move(index - 1)} disabled={index === 0} /><button className="button primary" disabled={!flipped || busy} onClick={markReviewed}><Check size={16} /> {progress.reviewedCardIds.includes(card.cardId) ? "Reviewed" : "Got it"}</button><IconButton icon={ChevronRight} label="Next card" onClick={() => move(index + 1)} disabled={index === 4} /></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {reviewed === 5 && <div className="success-message"><CheckCircle2 size={18} /> All five cards reviewed.</div>}
  </div>;
}

export function MindMap({ suite, progress }: { suite: LearningSuite; progress: LearnerProgress }) {
  const [selected, setSelected] = useState(suite.mindMap.find((node) => node.parentId === null)!.id);
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 70, marginx: 20, marginy: 20 });
  for (const node of suite.mindMap) graph.setNode(node.id, { width: 190, height: 64 });
  for (const node of suite.mindMap) if (node.parentId) graph.setEdge(node.parentId, node.id);
  dagre.layout(graph);
  const nodes: Node[] = suite.mindMap.map((node) => ({
    id: node.id, data: { label: node.label },
    position: { x: graph.node(node.id).x - 95, y: graph.node(node.id).y - 32 },
    sourcePosition: Position.Right, targetPosition: Position.Left,
    className: `concept-node ${node.parentId === null ? "root-node" : ""} ${progress.gapNodes.includes(node.id) ? "gap-node" : ""} ${progress.masteredNodes.includes(node.id) ? "mastered-node" : ""}`,
    style: { width: 190, minHeight: 64 }, selected: selected === node.id,
  }));
  const edges: Edge[] = suite.mindMap.filter((node) => node.parentId).map((node) => ({ id: `${node.parentId}-${node.id}`, source: node.parentId!, target: node.id, type: "smoothstep", style: { stroke: "#acbfb5", strokeWidth: 1.5 } }));
  const active = suite.mindMap.find((node) => node.id === selected)!;

  return <><div className="tool-meta"><span><Network size={15} /> {nodes.length} connected concepts</span><span><span className="legend-dot green" /> Mastered <span className="legend-dot orange" /> Gap</span></div>
    <div className="mindmap-canvas"><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.16 }} minZoom={0.2} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => setSelected(node.id)}><Background color="#dce3dd" gap={20} size={1} /><Controls showInteractive={false} /></ReactFlow></div>
    <div className="concept-detail"><span className="concept-detail-icon"><Lightbulb size={22} /></span><div><h3>{active.label}</h3><p>{active.summary}</p></div></div>
  </>;
}

export function VideoSummary({ suite, sample }: { suite: LearningSuite; sample: boolean }) {
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const activeIndex = suite.videoSummaryScript.findIndex((segment) => { const [start, end] = timestampSeconds(segment.timestamp); return seconds >= start && seconds < end; });
  const segment = suite.videoSummaryScript[activeIndex < 0 ? suite.videoSummaryScript.length - 1 : activeIndex];
  const playbackStart = useEffectEvent(() => performance.now() - seconds * 1000);

  useEffect(() => {
    if (!playing) return;
    const started = playbackStart();
    const timer = window.setInterval(() => {
      const next = Math.min(90, (performance.now() - started) / 1000);
      setSeconds(next);
      if (next >= 90) setPlaying(false);
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    if (sound && playing) {
      const utterance = new SpeechSynthesisUtterance(segment.narration);
      utterance.lang = "en-GB";
      utterance.rate = 1;
      utterance.onerror = (event) => { if (event.error !== "interrupted" && event.error !== "canceled") setVoiceError("Voice playback is unavailable in this browser. The transcript remains available."); };
      window.speechSynthesis.speak(utterance);
    }
    return () => window.speechSynthesis.cancel();
  }, [sound, playing, segment]);

  function togglePlay() { if (seconds >= 90) setSeconds(0); setPlaying(!playing); }
  function seek(value: number) { setPlaying(false); setSeconds(value); }
  function toggleSound() { if (!("speechSynthesis" in window)) { setVoiceError("Voice playback is unavailable in this browser."); return; } setSound(!sound); }
  const clock = `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

  return <div className="video-view">
    <div className={`video-stage ${sample ? "sample-video" : ""}`}>
      {sample && <div className="video-photo" />}
      <span className="video-mode"><Sparkles size={13} /> ANIMATED EXPLAINER</span>
      <div className="video-slide" key={segment.segment}><span className="video-segment-number">{String((activeIndex < 0 ? suite.videoSummaryScript.length - 1 : activeIndex) + 1).padStart(2, "0")}</span><h3>{segment.segment}</h3><p>{segment.visualCue}</p></div>
      {!playing && <button className="video-center-play" aria-label={seconds >= 90 ? "Replay explainer" : "Play explainer"} onClick={togglePlay}>{seconds >= 90 ? <RotateCcw size={22} /> : <Play size={22} fill="currentColor" />}</button>}
    </div>
    <div className="video-controls"><IconButton icon={playing ? Pause : Play} label={playing ? "Pause explainer" : "Play explainer"} onClick={togglePlay} /><span>{clock}</span><input aria-label="Explainer position" type="range" min={0} max={90} value={seconds} step={0.5} onChange={(event) => seek(Number(event.target.value))} /><span>1:30</span><IconButton icon={sound ? Volume2 : VolumeX} label={sound ? "Mute narration" : "Enable narration"} onClick={toggleSound} /></div>
    <p className="narration" aria-live="off">{segment.narration}</p>
    {voiceError && <p role="status" className="form-error">{voiceError}</p>}
    <button className="button secondary" onClick={() => setShowScript(!showScript)}><BookOpen size={16} /> {showScript ? "Hide full script" : "Read full script"}</button>
    {showScript && <div className="script-list">{suite.videoSummaryScript.map((item) => <article key={item.segment}><button className="script-time" onClick={() => seek(timestampSeconds(item.timestamp)[0])}>{item.timestamp.split("-")[0]}</button><div><h4>{item.segment}</h4><p>{item.narration}</p><small>{item.visualCue}</small></div></article>)}</div>}
  </div>;
}

export function Diagnostic({ suite, onRecord, onOpenQuest }: { suite: LearningSuite; onRecord: RecordProgress; onOpenQuest: () => void }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const question = suite.diagnosticAssessment[index];
  const node = suite.mindMap.find((item) => item.id === question.gapNodeIfWrong)!;

  async function checkAnswer() {
    if (selected === null) return;
    setBusy(true); setError("");
    const correct = selected === question.correctOptionIndex;
    setResult(correct);
    try {
      await onRecord({ action: "answer", questionId: question.questionId, optionIndex: selected });
      setAnswers((previous) => ({ ...previous, [question.questionId]: correct }));
    } catch (failure) { setError((failure as Error).message); setResult(null); }
    finally { setBusy(false); }
  }
  function next() { if (index === 2) setFinished(true); else { setIndex(index + 1); setSelected(null); setResult(null); } }
  function retry() { setSelected(null); setResult(null); setError(""); }
  const score = Object.values(answers).filter(Boolean).length;

  if (finished) return <div className="quiz-finish"><div className="award-circle"><Flag size={34} /></div><span className="eyebrow">DIAGNOSTIC COMPLETE</span><h2>{score === 3 ? "You're finding your force." : "Your next step is clearer."}</h2><p>{score} of 3 questions answered correctly. {score === 3 ? "Your quest reward is ready." : "Your prerequisite gaps have been saved to your learning path."}</p><div className="diagnostic-results">{suite.diagnosticAssessment.map((item) => <div key={item.questionId}>{answers[item.questionId] ? <CheckCircle2 size={19} /> : <Target size={19} />}<span>{item.bloomLevel}</span><b>{answers[item.questionId] ? "Understood" : "Needs practice"}</b></div>)}</div><button className="button primary" onClick={onOpenQuest}>View my quest <ArrowRight size={16} /></button><button className="text-button" onClick={() => { setFinished(false); setIndex(0); retry(); }}><RotateCcw size={15} /> Try again</button></div>;

  return <div className="diagnostic-view"><div className="tool-meta"><span>Question {index + 1} of 3</span><span className="bloom-label">{question.bloomLevel}</span></div><div className="three-track">{suite.diagnosticAssessment.map((item, itemIndex) => <span key={item.questionId} className={itemIndex <= index ? "complete" : ""} />)}</div><h3 className="diagnostic-question">{question.question}</h3><div className="answer-options">{question.options.map((option, optionIndex) => <button key={optionIndex} className={`answer-option ${selected === optionIndex ? "selected" : ""} ${result !== null && optionIndex === question.correctOptionIndex ? "correct" : ""} ${result === false && selected === optionIndex ? "incorrect" : ""}`} aria-pressed={selected === optionIndex} disabled={result !== null || busy} onClick={() => setSelected(optionIndex)}><span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span>{result !== null && optionIndex === question.correctOptionIndex && <Check size={18} />}{result === false && selected === optionIndex && <X size={18} />}</button>)}</div>
    {result !== null && <div className={`answer-feedback ${result ? "positive" : "needs-work"}`} role="status"><strong>{result ? <CheckCircle2 size={19} /> : <Lightbulb size={19} />}{result ? "That's right." : "Let's close this gap."}</strong><p>{question.explanation}</p>{!result && <div className="gap-feedback"><Target size={14} /> Prerequisite: {node.label}</div>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="diagnostic-footer"><span><Zap size={15} /> 20 XP per new correct answer</span>{result === null ? <button className="button primary" onClick={checkAnswer} disabled={selected === null || busy}>Check answer <ArrowRight size={16} /></button> : <div className="button-row">{!result && <button className="button secondary" onClick={retry} disabled={busy}>Try again</button>}<button className="button primary" onClick={next} disabled={busy}>{index === 2 ? "See results" : "Next question"} <ArrowRight size={16} /></button></div>}</div>
  </div>;
}

export function Quest({ suite, progress, onRecord, onOpen }: { suite: LearningSuite; progress: LearnerProgress; onRecord: RecordProgress; onOpen: (tool: StudyTool) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = suite.gamifiedQuestPlan;
  const gap = suite.mindMap.find((node) => progress.gapNodes.includes(node.id));
  const target = gap || suite.mindMap.find((node) => node.id === plan.targetNode)!;
  const claimed = progress.claimedQuests.length > 0;
  const unlocked = questUnlocked(progress, suite);
  const cardsReviewed = suite.flashcards.every((card) => progress.reviewedCardIds.includes(card.cardId));
  async function claim() { setBusy(true); try { await onRecord({ action: "claim-quest" }); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }

  return <div className="quest-view"><div className="quest-intro"><div className="award-circle"><Trophy size={34} /></div><div><span className="eyebrow">{claimed ? "MISSION COMPLETE" : gap ? "YOUR PERSONALISED MISSION" : "YOUR NEXT MISSION"}</span><h2>{gap ? `Master ${gap.label.toLowerCase()}` : plan.questTitle}</h2><p>{gap ? target.summary : plan.narrativeHook}</p></div></div><div className="quest-rewards"><span><Zap size={17} /> {plan.xpReward} XP</span><span><Award size={17} /> {plan.badgeName}</span><span><Target size={17} /> {target.label}</span></div><div className="quest-steps"><button onClick={() => onOpen("map")}><span className="step-number">1</span><div><h3>Connect the concepts</h3><p>{target.label}</p></div><ArrowRight size={18} /></button><button onClick={() => onOpen("flashcards")}><span className={`step-number ${cardsReviewed ? "done" : ""}`}>{cardsReviewed ? <Check size={17} /> : "2"}</span><div><h3>Build your recall</h3><p>{suite.flashcards.filter((card) => progress.reviewedCardIds.includes(card.cardId)).length} of 5 flashcards reviewed</p></div><ArrowRight size={18} /></button><button onClick={() => onOpen("quiz")}><span className={`step-number ${unlocked ? "done" : ""}`}>{unlocked ? <Check size={17} /> : "3"}</span><div><h3>Put it into practice</h3><p>Answer all 3 diagnostic questions correctly and close their gaps</p></div><ArrowRight size={18} /></button></div><button className={`button ${claimed ? "secondary" : "primary"} quest-claim`} disabled={!unlocked || claimed || busy} onClick={claim}>{claimed ? <CheckCircle2 size={18} /> : unlocked ? <Trophy size={18} /> : <LockKeyhole size={18} />}{claimed ? "Quest complete. Reward earned." : unlocked ? `Claim ${plan.xpReward} XP` : "Complete the diagnostic to unlock"}</button>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}

export function ProgressView({ suite, progress, onOpen }: { suite: LearningSuite; progress: LearnerProgress; onOpen: (tool: StudyTool) => void }) {
  const mastered = suite.mindMap.filter((node) => progress.masteredNodes.includes(node.id));
  const gaps = suite.mindMap.filter((node) => progress.gapNodes.includes(node.id));
  return <div className="progress-view"><div className="progress-stats"><div><Zap size={21} /><strong>{progress.xp}</strong><span>Total XP</span></div><div><CheckCircle2 size={21} /><strong>{mastered.length}</strong><span>Mastered concepts</span></div><div><Target size={21} /><strong>{gaps.length}</strong><span>Knowledge gaps</span></div></div><div className="section-label">YOUR CONCEPT JOURNEY</div><div className="concept-progress-list">{suite.mindMap.filter((node) => node.parentId !== null).map((node) => <div key={node.id}><span className={progress.masteredNodes.includes(node.id) ? "green-text" : progress.gapNodes.includes(node.id) ? "orange-text" : "muted"}>{progress.masteredNodes.includes(node.id) ? <CheckCircle2 size={20} /> : progress.gapNodes.includes(node.id) ? <Target size={20} /> : <Circle size={20} />}</span><div><h3>{node.label}</h3><p>{progress.masteredNodes.includes(node.id) ? "Evidence from your diagnostic" : progress.gapNodes.includes(node.id) ? "A prerequisite to revisit" : "Not assessed yet"}</p></div><span className="status-tag">{progress.masteredNodes.includes(node.id) ? "Mastered" : progress.gapNodes.includes(node.id) ? "Needs practice" : "To explore"}</span></div>)}</div><button className="button primary" onClick={() => onOpen(gaps.length ? "quest" : "quiz")}>{gaps.length ? "Continue my mission" : "Check my understanding"}<ArrowRight size={16} /></button></div>;
}

export function StudyGuide({ suite, onOpen }: { suite: LearningSuite; onOpen: (tool: StudyTool) => void }) {
  return <div className="study-guide"><p className="guide-summary">{suite.moduleSummary}</p>{suite.mindMap.filter((node) => node.parentId !== null).map((node, index) => <article key={node.id}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{node.label}</h3><p>{node.summary}</p></div></article>)}<div className="button-row"><button className="button secondary" onClick={() => onOpen("flashcards")}><Layers size={16} /> Review flashcards</button><button className="button primary" onClick={() => onOpen("quiz")}><CircleHelp size={16} /> Test my understanding</button></div></div>;
}