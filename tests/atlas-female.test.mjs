import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { anatomyNote, anatomyQuestion, atlasSelectionKey, atlasSystems, atlasTopics, describeAnatomy, initialAtlasState, parseAtlas, searchAnatomy } from "../src/lib/atlas-study.ts";

const base = new URL("../public/atlas/hra-female-v1.5/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("atlas-female.json", base), "utf8"));
const female = parseAtlas(manifest, "female");

test("female manifest and all binary geometry match the pinned upstream import", () => {
  const provenance = JSON.parse(readFileSync(new URL("provenance.json", base), "utf8"));
  assert.equal(provenance.upstreamCommit, "d72b4f6db42e41a8db84b1c19ff6d86ee7b65284");
  for (const file of provenance.files) {
    const bytes = readFileSync(new URL(file.name, base));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
  const buffers = manifest.chunks.map((chunk) => {
    const original = readFileSync(new URL(chunk.url.split("/").at(-1), base));
    assert.deepEqual(gunzipSync(readFileSync(new URL(chunk.gzip.split("/").at(-1), base))), original);
    assert.equal(original.length, chunk.bytes);
    return original;
  });
  for (const part of female.parts) {
    const buffer = buffers[part.chunk];
    const coordinates = new Float32Array(buffer.buffer, buffer.byteOffset + part.positions, part.vertexCount * 3);
    const indices = new Uint32Array(buffer.buffer, buffer.byteOffset + part.indices, part.indexCount);
    for (const value of coordinates) assert.ok(Number.isFinite(value));
    for (const index of indices) assert.ok(index < part.vertexCount);
  }
  assert.equal(female.parts.length, 888);
  assert.equal(female.concepts.length, 1073);
  assert.equal(female.triangles, 1810038);
  assert.equal(female.parts.reduce((total, part) => total + part.indexCount / 3, 0), female.triangles);
});

test("female catalog identity and assets cannot be loaded as male", () => {
  assert.equal(female.sex, "female");
  assert.throws(() => parseAtlas(manifest));
  const male = JSON.parse(readFileSync(new URL("../public/atlas/bodyparts3d-v4/atlas.json", import.meta.url), "utf8"));
  assert.throws(() => parseAtlas(male, "female"));
  const mixed = structuredClone(manifest);
  mixed.chunks[0].url = "/models/body-0.bin";
  assert.throws(() => parseAtlas(mixed, "female"));
  assert.ok(female.chunks.every((chunk) => chunk.url.startsWith("/atlas/hra-female-v1.5/")));
});

test("female study landmarks exist and pregnancy references are separately opt-in", () => {
  const topics = atlasTopics("female");
  for (const topic of topics) for (const name of topic.landmarks) assert.ok(female.concepts.some((concept) => concept.name === name), `${topic.label}: ${name}`);
  assert.equal(female.parts.filter((part) => part.system === "pregnancy").length, 8);
  assert.equal(initialAtlasState(topics[0]).visible.includes("pregnancy"), false);
  assert.equal(initialAtlasState(topics.find((topic) => topic.id === "pregnancy")).visible.includes("pregnancy"), true);
  assert.ok(atlasSystems(female).some((system) => system.id === "pregnancy"));
  assert.equal(atlasSystems(female).some((system) => system.id === "endocrine"), false);
  assert.equal(topics.some((topic) => topic.label === "Male reproduction"), false);
});

test("female reproductive descriptions, notes and questions identify the correct reference", () => {
  const uterus = searchAnatomy(female, "uterus")[0];
  assert.equal(uterus.id, "HRA:VH_F_uterus");
  assert.equal(describeAnatomy(female, uterus).parts.length, 10);
  assert.equal(describeAnatomy(female, uterus).descriptionKind, "Organ overview");
  assert.match(describeAnatomy(female, searchAnatomy(female, "Left ovary")[0]).description, /oocytes/);
  for (const part of female.parts.filter((part) => part.system === "reproductive")) {
    const description = describeAnatomy(female, { id: part.conceptId, name: part.name, elements: [part.id] }).description;
    assert.doesNotMatch(description, /\bmale reproductive|sperm production/);
  }
  const note = anatomyNote(female, uterus, "My female reference observation.");
  assert.match(note.title, /Female/);
  assert.match(note.content, /HRA united-female v1.5/);
  assert.match(note.content, /Browne.*Schlehlein/);
  assert.match(note.content, /partial skeleton and muscle/);
  assert.doesNotMatch(note.content, /BodyParts3D|adult male/);
  assert.match(anatomyQuestion(uterus, "female"), /female anatomy reference/);
  assert.notEqual(atlasSelectionKey("male", uterus), atlasSelectionKey("female", uterus));
});