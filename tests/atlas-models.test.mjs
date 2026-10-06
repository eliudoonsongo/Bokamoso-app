import test from "node:test";
import assert from "node:assert/strict";
import { ATLAS_MODELS, atlasChunkUrl, atlasModelId } from "../src/lib/atlas-models.ts";

test("atlas model selection defaults safely and preserves an explicit female choice", () => {
  assert.equal(atlasModelId("female"), "female");
  for (const value of [null, undefined, "male", "invalid", "https://external.example"]) assert.equal(atlasModelId(value), "male");
  assert.notEqual(ATLAS_MODELS.male.assetPath, ATLAS_MODELS.female.assetPath);
  assert.match(ATLAS_MODELS.female.attribution, /Browne.*Schlehlein.*CC BY 4.0/);
  assert.match(ATLAS_MODELS.female.scope, /partial skeleton and muscle/);
});

test("model assets stay inside their own versioned same-origin directory", () => {
  assert.equal(atlasChunkUrl("male", "/models/body-0.bin"), "/atlas/bodyparts3d-v4/body-0.bin");
  assert.equal(atlasChunkUrl("female", "/models/female-2.bin.gz", true), "/atlas/hra-female-v1.5/female-2.bin.gz");
  for (const path of ["/models/body-0.bin", "/models/../female-0.bin", "https://example.test/female-0.bin", "/models/female-0.bin?key=1"]) {
    assert.throws(() => atlasChunkUrl("female", path));
  }
  assert.throws(() => atlasChunkUrl("male", "/models/female-0.bin"));
  assert.throws(() => atlasChunkUrl("female", "/models/female-0.bin.gz"));
});