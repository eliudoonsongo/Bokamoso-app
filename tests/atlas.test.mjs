import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { ATLAS_TOPICS, anatomyNote, anatomyQuestion, describeAnatomy, initialAtlasState, parseAtlas, searchAnatomy } from "../src/lib/atlas-study.ts";
import { decodeModelResponse } from "../src/vendor/human-atlas/model-download.ts";
import { createExplosionLayout } from "../src/vendor/human-atlas/explosion-layout.ts";
import { PointerTap } from "../src/vendor/human-atlas/pointer-tap.ts";

const manifest = JSON.parse(readFileSync(new URL("../public/atlas/bodyparts3d-v4/atlas.json", import.meta.url), "utf8"));
const atlas = parseAtlas(manifest);

test("the full atlas preserves source meshes and concepts with same-origin versioned assets", () => {
  assert.equal(atlas.parts.length, 2234);
  assert.equal(atlas.concepts.length, 3432);
  assert.equal(atlas.triangles, 2288268);
  assert.equal(atlas.chunks.length, 15);
  for (const chunk of atlas.chunks) {
    assert.match(chunk.url, /^\/atlas\/bodyparts3d-v4\/body-\d+\.bin$/);
    assert.match(chunk.gzip, /^\/atlas\/bodyparts3d-v4\/body-\d+\.bin\.gz$/);
  }
});

test("invalid geometry, external assets and missing concept members are rejected", () => {
  for (const mutate of [
    (copy) => { copy.chunks[0].url = "https://external.example/data.bin"; },
    (copy) => { copy.parts[0].indices = copy.chunks[0].bytes; },
    (copy) => { copy.parts[0].chunk = 200; },
    (copy) => { copy.concepts[0].elements = ["missing"]; },
    (copy) => { copy.parts[1].id = copy.parts[0].id; },
  ]) {
    const copy = structuredClone(manifest);
    mutate(copy);
    assert.throws(() => parseAtlas(copy));
  }
});

test("all Life Sciences topic landmarks resolve to actual selectable concepts", () => {
  for (const topic of ATLAS_TOPICS) {
    assert.ok(topic.questions.length >= 2);
    for (const landmark of topic.landmarks) assert.ok(atlas.concepts.some((concept) => concept.name === landmark), `${topic.label}: ${landmark}`);
    const state = initialAtlasState(topic);
    assert.deepEqual(state.visible, topic.systems);
    assert.equal(state.explode, 0);
    assert.equal(state.rotate, false);
    assert.deepEqual(state.selected, []);
    state.visible.pop();
    assert.notDeepEqual(state.visible, topic.systems);
  }
});

test("search handles anatomical names, source identifiers and common classroom aliases", () => {
  assert.equal(searchAnatomy(atlas, "HEART")[0].name, "heart");
  assert.equal(searchAnatomy(atlas, "FMA7088")[0].name, "heart");
  assert.equal(searchAnatomy(atlas, "windpipe")[0].name, "trachea");
  assert.deepEqual(searchAnatomy(atlas, "oesophagus"), searchAnatomy(atlas, "esophagus"));
  assert.deepEqual(searchAnatomy(atlas, "not-a-modeled-structure"), []);
  assert.ok(searchAnatomy(atlas, "left").length <= 80);
});

test("compound structures retain all pieces and descriptions distinguish system context", () => {
  const heart = searchAnatomy(atlas, "heart")[0];
  const kidney = searchAnatomy(atlas, "kidney")[0];
  assert.equal(describeAnatomy(atlas, heart).parts.length, 83);
  assert.equal(describeAnatomy(atlas, heart).descriptionKind, "Organ overview");
  assert.equal(describeAnatomy(atlas, kidney).descriptionKind, "System overview");
  const note = anatomyNote(atlas, heart, "Blood passes through two linked circuits.");
  assert.match(note.content, /My observation:/);
  assert.match(note.content, /FMA7088/);
  assert.match(note.content, /CC BY 4.0/);
  assert.match(note.content, /Not an assessed mastery record/);
  assert.ok(note.title.length <= 160);
  assert.match(anatomyQuestion(heart), /only my selected Life Sciences sources/);
});

test("geometry decoding accepts gzip files and already decompressed HTTP responses", async () => {
  const original = new Uint8Array([3, 1, 4, 1, 5, 9]);
  assert.deepEqual(new Uint8Array(await decodeModelResponse(new Response(gzipSync(original)), original.length, true)), original);
  assert.deepEqual(new Uint8Array(await decodeModelResponse(new Response(original), original.length, true)), original);
  await assert.rejects(decodeModelResponse(new Response(original), original.length + 1, false), /incomplete/);
  await assert.rejects(decodeModelResponse(new Response(null, { status: 404 }), original.length, false), /could not be loaded/);
});

test("exploded layout packs visible structures without overlap at mobile and desktop aspects", () => {
  const structures = atlas.parts.filter((part) => ["cardiac", "urinary"].includes(part.system));
  for (const aspect of [0.46, 1, 1.7]) {
    const cells = [...createExplosionLayout(structures, aspect).cells.values()];
    assert.equal(cells.length, structures.length);
    for (let first = 0; first < cells.length; first++) for (let second = first + 1; second < cells.length; second++) {
      assert.ok(Math.abs(cells[first].x - cells[second].x) >= (cells[first].width + cells[second].width) / 2 - 1e-8 || Math.abs(cells[first].y - cells[second].y) >= (cells[first].height + cells[second].height) / 2 - 1e-8);
    }
  }
  assert.equal(createExplosionLayout([]).cells.size, 0);
});

test("taps select but dragging, multitouch and cancelled gestures do not", () => {
  const pointer = new PointerTap();
  pointer.down(1, 10, 10, 5);
  assert.equal(pointer.up(1, 12, 10), true);
  pointer.down(1, 10, 10, 5);
  pointer.move(1, 40, 10);
  assert.equal(pointer.up(1, 10, 10), false);
  pointer.down(1, 10, 10, 12);
  pointer.down(2, 20, 20, 12);
  assert.equal(pointer.up(2, 20, 20), false);
  assert.equal(pointer.up(1, 10, 10), false);
  pointer.down(1, 10, 10, 5);
  pointer.cancel(1);
  assert.equal(pointer.up(1, 10, 10), false);
});