import test from "node:test";
import assert from "node:assert/strict";
import { atlasNotebookUrl, atlasReturnState, atlasUrl, isLifeSciences } from "../src/lib/atlas-navigation.ts";

test("Human Atlas is offered for Life Science, Life Sciences and Biology notebooks", () => {
  for (const subject of ["Life Science", " Life Sciences ", "LIFE-SCIENCES", "biology"]) assert.equal(isLifeSciences(subject), true);
  for (const subject of ["Physical Sciences", "Mathematics", "", "Life skills"]) assert.equal(isLifeSciences(subject), false);
});

test("atlas navigation preserves notebook and source selection without an external redirect", () => {
  const notebook = "notebook/one?test=yes";
  const sources = ["source one", "source&two"];
  const outgoing = new URL(atlasUrl(notebook, sources), "https://bokamoso.example");
  assert.equal(outgoing.pathname, "/atlas");
  assert.equal(outgoing.searchParams.get("notebook"), notebook);
  assert.deepEqual(outgoing.searchParams.getAll("source"), sources);
  const returned = new URL(atlasNotebookUrl(notebook, sources, "How does the heart pump blood?"), outgoing);
  assert.equal(returned.origin, outgoing.origin);
  assert.equal(returned.pathname, "/");
  assert.equal(returned.searchParams.get("notebook"), notebook);
  assert.deepEqual(atlasReturnState(returned.searchParams, [...sources, "unselected"]), {
    sourceIds: sources, question: "How does the heart pump blood?",
  });
});

test("atlas return removes unavailable sources and preserves an intentionally empty selection", () => {
  const returned = new URL(atlasNotebookUrl("notebook", ["removed"], "Review the lungs"), "https://bokamoso.example");
  assert.deepEqual(atlasReturnState(returned.searchParams, ["existing"]), { sourceIds: [], question: "Review the lungs" });
  assert.equal(atlasReturnState(new URLSearchParams("question=ignore"), ["existing"]), null);
  assert.equal(atlasNotebookUrl(null, [], "ignore"), "/");
});

test("atlas question handoff respects the chat input limit", () => {
  const returned = new URL(atlasNotebookUrl("notebook", [], "question".repeat(400)), "https://bokamoso.example");
  assert.equal(atlasReturnState(returned.searchParams, []).question.length, 2000);
});

test("female reference survives a notebook round trip without changing the source selection", () => {
  const incoming = new URL(atlasUrl("biology", ["source-one"], "female"), "https://bokamoso.example");
  assert.equal(incoming.searchParams.get("model"), "female");
  const returned = new URL(atlasNotebookUrl("biology", ["source-one"], "Explain the uterus", "female"), incoming);
  assert.equal(returned.searchParams.get("atlasModel"), "female");
  assert.deepEqual(atlasReturnState(returned.searchParams, ["source-one", "source-two"]), { sourceIds: ["source-one"], question: "Explain the uterus" });
});