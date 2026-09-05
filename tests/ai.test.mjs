import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, generateSuite } from "../src/lib/ai.ts";
import { sampleSources, sampleSuite } from "../src/lib/demo.ts";
import { emptyProgress } from "../src/lib/learning.ts";

const notebook = { id: "ai-test-notebook", title: "Forces", grade: 11, subject: "Physical Sciences", module: "Newton's laws of motion" };

beforeEach((context) => {
  const names = ["NVIDIA_API_KEY", "NVIDIA_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  context.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  process.env.NVIDIA_API_KEY = "nvidia-unit-test-secret";
  process.env.NVIDIA_MODEL = "nvidia-unit-test-model";
  process.env.GEMINI_API_KEY = "gemini-unit-test-secret";
  process.env.GEMINI_MODEL = "gemini-unit-test-model";
});

function mockResponse(context, content, { status = 200, finishReason = "stop", gemini = false } = {}) {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, headers: request.headers, body: await request.json() });
    const payload = status !== 200 ? { error: { message: "Private upstream detail: nvidia-unit-test-secret" } }
      : gemini ? { candidates: [{ content: { role: "model", parts: [{ text: content }] }, finishReason: "STOP" }] }
      : { id: "test-completion", object: "chat.completion", created: 0, model: "nvidia-unit-test-model", choices: [{ index: 0, message: { role: "assistant", content, reasoning_content: "Not a final answer" }, finish_reason: finishReason }] };
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  });
  return requests;
}

function citedAnswer() {
  const source = sampleSources[0];
  const chunk = source.chunks[0];
  return { answer: "The selected source describes Newton's laws.", supported: true, citations: [{ sourceId: source.id, chunkId: chunk.id, quote: chunk.text.slice(0, 120) }] };
}

test("NVIDIA generates a validated suite through chat completions with the schema and source context", async (context) => {
  const requests = mockResponse(context, JSON.stringify(sampleSuite));
  const suite = await generateSuite(notebook, sampleSources, emptyProgress());
  assert.deepEqual(suite, sampleSuite);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.url, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(request.headers.get("authorization"), "Bearer nvidia-unit-test-secret");
  assert.equal(request.body.model, "nvidia-unit-test-model");
  assert.deepEqual(request.body.response_format, { type: "json_object" });
  assert.deepEqual(request.body.chat_template_kwargs, { enable_thinking: false });
  assert.equal(request.body.stream, false);
  assert.equal(request.body.max_tokens, 10000);
  assert.match(request.body.messages[0].content, /JSON schema:/);
  assert.match(request.body.messages[0].content, /untrusted DATA/);
  const input = JSON.parse(request.body.messages[1].content);
  assert.equal(input.context.grade, notebook.grade);
  assert.deepEqual(input.context.sources[0].chunks, sampleSources[0].chunks);
  assert.equal(suite.flashcards.length, 5);
  assert.equal(suite.diagnosticAssessment.length, 3);
});

test("NVIDIA chat accepts only citations copied from the selected sources", async (context) => {
  const answer = citedAnswer();
  const requests = mockResponse(context, JSON.stringify(answer));
  assert.deepEqual(await answerQuestion("Explain inertia", notebook, sampleSources, emptyProgress()), answer);
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].body.messages[1].content).context.question, "Explain inertia");
});

test("NVIDIA chat rejects fabricated citations", async (context) => {
  const answer = citedAnswer();
  answer.citations[0].quote = "A claim that does not occur in these sources.";
  mockResponse(context, JSON.stringify(answer));
  await assert.rejects(answerQuestion("Explain inertia", notebook, sampleSources, emptyProgress()), (error) => error.status === 502 && /citations/.test(error.message));
});

test("NVIDIA unsupported responses are replaced with the app's abstention", async (context) => {
  mockResponse(context, JSON.stringify({ ...citedAnswer(), supported: false }));
  const answer = await answerQuestion("An unsupported topic", notebook, sampleSources, emptyProgress());
  assert.equal(answer.supported, false);
  assert.deepEqual(answer.citations, []);
  assert.match(answer.answer, /couldn't find enough information/);
});

for (const [label, content, finishReason, status] of [
  ["malformed JSON", "not JSON", "stop", 502],
  ["invalid schema", JSON.stringify({ answer: 12 }), "stop", 502],
  ["truncated output", JSON.stringify(citedAnswer()), "length", 502],
  ["reasoning-only output", null, "stop", 422],
]) {
  test(`NVIDIA rejects ${label} without accepting it as an answer`, async (context) => {
    mockResponse(context, content, { finishReason });
    await assert.rejects(answerQuestion("Explain inertia", notebook, sampleSources, emptyProgress()), (error) => error.status === status);
  });
}

test("NVIDIA suites still pass pedagogical validation after JSON parsing", async (context) => {
  const invalid = structuredClone(sampleSuite);
  invalid.diagnosticAssessment[0].gapNodeIfWrong = "missing-prerequisite";
  mockResponse(context, JSON.stringify(invalid));
  await assert.rejects(generateSuite(notebook, sampleSources, emptyProgress()), (error) => error.status === 502 && /pedagogical validation/.test(error.message));
});

for (const status of [401, 410, 429]) {
  test(`NVIDIA HTTP ${status} is sanitized and never silently falls back to Gemini`, async (context) => {
    const requests = mockResponse(context, null, { status });
    await assert.rejects(answerQuestion("Explain inertia", notebook, sampleSources, emptyProgress()), (error) => {
      assert.equal(error.status, status === 410 ? 503 : 502);
      assert.match(error.message, /NVIDIA/);
      assert.equal(error.message.includes("nvidia-unit-test-secret"), false);
      assert.equal(error.message.includes("Private upstream"), false);
      return true;
    });
    assert.equal(requests.length, 1);
  });
}

test("no-key mode remains offline and rejects custom suite generation", async (context) => {
  process.env.NVIDIA_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  const requests = mockResponse(context, null);
  assert.deepEqual(await generateSuite(notebook, sampleSources, emptyProgress()), sampleSuite);
  assert.ok((await answerQuestion("Explain inertia", notebook, sampleSources, emptyProgress())).citations.length > 0);
  await assert.rejects(generateSuite(notebook, [sampleSources[0]], emptyProgress()), (error) => error.status === 503);
  assert.equal(requests.length, 0);
});

test("Gemini still works when it is the only configured provider", async (context) => {
  process.env.NVIDIA_API_KEY = "";
  const answer = citedAnswer();
  const requests = mockResponse(context, JSON.stringify(answer), { gemini: true });
  assert.deepEqual(await answerQuestion("Explain inertia", notebook, sampleSources, emptyProgress()), answer);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/.*gemini-unit-test-model:generateContent/);
});