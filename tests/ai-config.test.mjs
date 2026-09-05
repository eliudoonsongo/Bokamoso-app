import test from "node:test";
import assert from "node:assert/strict";
import { aiConfig } from "../src/lib/ai-config.ts";

test("AI configuration stays in sample mode without a nonempty provider key", () => {
  assert.equal(aiConfig({}), null);
  assert.equal(aiConfig({ NVIDIA_MODEL: "z-ai/glm-5.2", GEMINI_MODEL: "gemini-test" }), null);
  assert.equal(aiConfig({ NVIDIA_API_KEY: " ", GEMINI_API_KEY: "\n" }), null);
});

test("NVIDIA takes precedence and defaults to an available NVIDIA-hosted model", () => {
  assert.deepEqual(aiConfig({ NVIDIA_API_KEY: "nvidia-test-key", GEMINI_API_KEY: "gemini-test-key" }), {
    provider: "nvidia", model: "nvidia/nemotron-3-super-120b-a12b",
  });
});

test("AI model overrides are normalized and blank overrides use defaults", () => {
  assert.deepEqual(aiConfig({ NVIDIA_API_KEY: "test-key", NVIDIA_MODEL: " z-ai/custom-model " }), {
    provider: "nvidia", model: "z-ai/custom-model",
  });
  assert.equal(aiConfig({ NVIDIA_API_KEY: "test-key", NVIDIA_MODEL: " " }).model, "nvidia/nemotron-3-super-120b-a12b");
});

test("Gemini remains available only when no NVIDIA key is configured", () => {
  assert.deepEqual(aiConfig({ GEMINI_API_KEY: "test-key" }), { provider: "gemini", model: "gemini-3.8-flash" });
  assert.deepEqual(aiConfig({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" }), {
    provider: "gemini", model: "gemini-test",
  });
});

test("public AI configuration contains no credential values", () => {
  const environment = { NVIDIA_API_KEY: "nvidia-test-secret", GEMINI_API_KEY: "gemini-test-secret" };
  const serialized = JSON.stringify(aiConfig(environment));
  assert.equal(serialized.includes(environment.NVIDIA_API_KEY), false);
  assert.equal(serialized.includes(environment.GEMINI_API_KEY), false);
  assert.deepEqual(Object.keys(aiConfig(environment)), ["provider", "model"]);
});