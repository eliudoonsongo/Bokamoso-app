import { z } from "zod";

const text = z.string().trim().min(1).max(6000);
const identifier = z.string().min(1).max(160);

export const learningSuiteSchema = z.strictObject({
  moduleSummary: text,
  mindMap: z.array(z.strictObject({
    id: identifier,
    label: text,
    parentId: identifier.nullable(),
    summary: text,
  })).min(3).max(30),
  flashcards: z.array(z.strictObject({
    cardId: identifier,
    front: text,
    back: text,
    hint: text,
  })).length(5),
  videoSummaryScript: z.array(z.strictObject({
    segment: identifier,
    timestamp: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
    visualCue: text,
    narration: text,
  })).min(3).max(12),
  diagnosticAssessment: z.array(z.strictObject({
    questionId: identifier,
    question: text,
    options: z.array(text).min(2).max(5),
    correctOptionIndex: z.number().int().min(0),
    bloomLevel: z.enum(["Recall", "Understanding", "Application"]),
    gapNodeIfWrong: identifier,
    explanation: text,
  })).length(3),
  gamifiedQuestPlan: z.strictObject({
    questTitle: text,
    narrativeHook: text,
    targetNode: identifier,
    xpReward: z.number().int().min(1).max(1000),
    badgeName: text,
  }),
});

export type LearningSuite = z.infer<typeof learningSuiteSchema>;

export type LearnerProgress = {
  xp: number;
  masteredNodes: string[];
  gapNodes: string[];
  completedQuestionIds: string[];
  claimedQuests: string[];
  reviewedCardIds: string[];
};

export const emptyProgress = (): LearnerProgress => ({
  xp: 0,
  masteredNodes: [],
  gapNodes: [],
  completedQuestionIds: [],
  claimedQuests: [],
  reviewedCardIds: [],
});

export function timestampSeconds(timestamp: string): [number, number] {
  return timestamp.split("-").map((part) => {
    const [minutes, seconds] = part.split(":").map(Number);
    if (seconds > 59) throw new Error("Invalid script timestamp.");
    return minutes * 60 + seconds;
  }) as [number, number];
}

export function validateSuite(input: unknown): LearningSuite {
  const suite = learningSuiteSchema.parse(input);
  const nodes = new Map(suite.mindMap.map((node) => [node.id, node]));
  if (nodes.size !== suite.mindMap.length) throw new Error("Concept IDs must be unique.");
  if (suite.mindMap.filter((node) => node.parentId === null).length !== 1) {
    throw new Error("A mind map must have exactly one root.");
  }
  for (const node of suite.mindMap) {
    const ancestors = new Set<string>([node.id]);
    let parent = node.parentId;
    while (parent !== null) {
      if (!nodes.has(parent) || ancestors.has(parent)) throw new Error("Invalid concept hierarchy.");
      ancestors.add(parent);
      parent = nodes.get(parent)!.parentId;
    }
  }
  const levels = ["Recall", "Understanding", "Application"];
  for (const [index, question] of suite.diagnosticAssessment.entries()) {
    if (question.correctOptionIndex >= question.options.length) throw new Error("Invalid answer index.");
    if (!nodes.has(question.gapNodeIfWrong)) throw new Error("Unknown prerequisite node.");
    if (question.bloomLevel !== levels[index]) throw new Error("Questions must progress through Bloom levels.");
  }
  for (const ids of [suite.flashcards.map((card) => card.cardId), suite.diagnosticAssessment.map((question) => question.questionId), suite.videoSummaryScript.map((segment) => segment.segment)]) {
    if (new Set(ids).size !== ids.length) throw new Error("Content IDs must be unique.");
  }
  if (!nodes.has(suite.gamifiedQuestPlan.targetNode)) throw new Error("Unknown quest target.");
  let lastEnd = 0;
  for (const segment of suite.videoSummaryScript) {
    const [start, end] = timestampSeconds(segment.timestamp);
    if (start !== lastEnd || end <= start) throw new Error("Script timestamps must be continuous.");
    lastEnd = end;
  }
  if (lastEnd !== 90) throw new Error("The explainer must be exactly 90 seconds.");
  return suite;
}

export function gradeAnswer(progress: LearnerProgress, suite: LearningSuite, questionId: string, optionIndex: number) {
  const question = suite.diagnosticAssessment.find((item) => item.questionId === questionId);
  if (!question || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) {
    throw new Error("Invalid assessment answer.");
  }
  const correct = optionIndex === question.correctOptionIndex;
  const node = question.gapNodeIfWrong;
  const firstCorrect = correct && !progress.completedQuestionIds.includes(questionId);
  const next = structuredClone(progress);
  if (correct) {
    next.masteredNodes = [...new Set([...next.masteredNodes, node])];
    next.gapNodes = next.gapNodes.filter((gap) => gap !== node);
    next.completedQuestionIds = [...new Set([...next.completedQuestionIds, questionId])];
    if (firstCorrect) next.xp += 20;
  } else {
    next.gapNodes = [...new Set([...next.gapNodes, node])];
    next.masteredNodes = next.masteredNodes.filter((mastered) => mastered !== node);
  }
  return { progress: next, correct, xpEarned: firstCorrect ? 20 : 0, gapNode: correct ? null : node, explanation: question.explanation };
}

export function questUnlocked(progress: LearnerProgress, suite: LearningSuite) {
  return suite.diagnosticAssessment.every((question) => progress.completedQuestionIds.includes(question.questionId))
    && !suite.diagnosticAssessment.some((question) => progress.gapNodes.includes(question.gapNodeIfWrong));
}

export function claimQuest(progress: LearnerProgress, suite: LearningSuite, suiteId: string): LearnerProgress {
  if (!questUnlocked(progress, suite)) throw new Error("Complete the diagnostic and close its prerequisite gaps first.");
  if (progress.claimedQuests.length > 0) return progress;
  return { ...progress, xp: progress.xp + suite.gamifiedQuestPlan.xpReward, claimedQuests: [...progress.claimedQuests, suiteId] };
}

export type Source = {
  id: string;
  title: string;
  type: "curriculum_syllabus" | "textbook_chapter";
  format: "pdf" | "text";
  grade: number;
  subject: string;
  module: string;
  text: string;
  chunks: { id: string; text: string; metadata: { grade: number; subject: string; module: string; type: string } }[];
  sample: boolean;
};

export function segmentSource(source: Omit<Source, "chunks">): Source {
  const content = source.text.replace(/\r\n/g, "\n").trim();
  const chunks: Source["chunks"] = [];
  for (let offset = 0; offset < content.length; offset += 1600) {
    chunks.push({
      id: `${source.id}-${chunks.length + 1}`,
      text: content.slice(offset, offset + 1800),
      metadata: { grade: source.grade, subject: source.subject, module: source.module, type: source.type },
    });
  }
  return { ...source, text: content, chunks };
}