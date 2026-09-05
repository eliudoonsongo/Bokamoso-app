import test from "node:test";
import assert from "node:assert/strict";
import { validateSuite, emptyProgress, gradeAnswer, claimQuest, segmentSource } from "../src/lib/learning.ts";

const fixture = () => ({
  moduleSummary: "A source-grounded sample.",
  mindMap: [
    { id: "root", label: "Motion", parentId: null, summary: "Motion." },
    { id: "force", label: "Force", parentId: "root", summary: "A push or pull." },
    { id: "mass", label: "Mass", parentId: "root", summary: "Mass." },
  ],
  flashcards: Array.from({ length: 5 }, (_, index) => ({ cardId: `card-${index}`, front: "Force?", back: "A push or pull.", hint: "Interaction." })),
  videoSummaryScript: ["00:00-00:30", "00:30-01:00", "01:00-01:30"].map((timestamp, index) => ({ segment: `segment-${index}`, timestamp, visualCue: "A force arrow.", narration: "A push or pull." })),
  diagnosticAssessment: ["Recall", "Understanding", "Application"].map((bloomLevel, index) => ({ questionId: `q-${index}`, question: "What is a force?", options: ["A push or pull", "A colour"], correctOptionIndex: 0, bloomLevel, gapNodeIfWrong: "force", explanation: "A force is a push or pull." })),
  gamifiedQuestPlan: { questTitle: "Force finder", narrativeHook: "Identify forces.", targetNode: "force", xpReward: 100, badgeName: "Force finder" },
});

test("accepts the exact learning-suite contract", () => assert.equal(validateSuite(fixture()).flashcards.length, 5));

test("rejects malformed trees, answer indices, count, timing and prerequisite IDs", () => {
  const mutations = [
    (suite) => { suite.mindMap[1].parentId = "force"; },
    (suite) => { suite.diagnosticAssessment[0].correctOptionIndex = 10; },
    (suite) => { suite.flashcards.pop(); },
    (suite) => { suite.videoSummaryScript[2].timestamp = "01:00-01:20"; },
    (suite) => { suite.diagnosticAssessment[0].gapNodeIfWrong = "unknown"; },
  ];
  for (const mutate of mutations) {
    const suite = fixture();
    mutate(suite);
    assert.throws(() => validateSuite(suite));
  }
});

test("wrong answers immediately flag the prerequisite; a correct retry closes it", () => {
  const suite = fixture();
  const failed = gradeAnswer(emptyProgress(), suite, "q-0", 1);
  assert.deepEqual(failed.progress.gapNodes, ["force"]);
  assert.equal(failed.progress.xp, 0);
  const corrected = gradeAnswer(failed.progress, suite, "q-0", 0);
  assert.deepEqual(corrected.progress.gapNodes, []);
  assert.deepEqual(corrected.progress.masteredNodes, ["force"]);
  assert.equal(corrected.progress.xp, 20);
  assert.equal(gradeAnswer(corrected.progress, suite, "q-0", 0).progress.xp, 20);
});

test("quest XP is gated and can only be claimed once", () => {
  const suite = fixture();
  assert.throws(() => claimQuest(emptyProgress(), suite, "suite-1"));
  const completed = suite.diagnosticAssessment.reduce((progress, question) => gradeAnswer(progress, suite, question.questionId, 0).progress, emptyProgress());
  const rewarded = claimQuest(completed, suite, "suite-1");
  assert.equal(rewarded.xp, 160);
  assert.equal(claimQuest(rewarded, suite, "suite-1").xp, 160);
  assert.equal(claimQuest(rewarded, suite, "regenerated-suite").xp, 160);
});

test("every overlapping material chunk preserves its curriculum metadata", () => {
  const source = segmentSource({ id: "source", title: "Chapter", type: "textbook_chapter", format: "text", grade: 11, subject: "Physical Sciences", module: "Motion", text: "a".repeat(4000), sample: false });
  assert.equal(source.chunks.length, 3);
  assert.equal(source.chunks[0].text.slice(-200), source.chunks[1].text.slice(0, 200));
  assert.equal(source.chunks[1].metadata.grade, 11);
});