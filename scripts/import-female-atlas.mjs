import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const commit = "d72b4f6db42e41a8db84b1c19ff6d86ee7b65284";
const manifestSha = "7ca542e2c4e8cf8af22927c0cc5cd9510c236a22";
const destination = new URL("../public/atlas/hra-female-v1.5/", import.meta.url);
const listing = await fetch(`https://api.github.com/repos/ashemag/human-atlas/contents/public/models?ref=${commit}`, {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "Bokamoso-atlas-import" },
  signal: AbortSignal.timeout(30_000),
});
if (!listing.ok) throw new Error(`The pinned upstream asset list returned HTTP ${listing.status}.`);
const assets = (await listing.json()).filter((entry) => entry.name === "atlas-female.json" || /^female-\d+\.bin(?:\.gz)?$/.test(entry.name));
assert.equal(assets.length, 21);
assert.equal(assets.find((entry) => entry.name === "atlas-female.json")?.sha, manifestSha);
await mkdir(destination, { recursive: true });
const integrity = [];

for (const asset of assets) {
  const target = new URL(asset.name, destination);
  let bytes;
  try { bytes = await readFile(target); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(`https://raw.githubusercontent.com/ashemag/human-atlas/${commit}/public/models/${asset.name}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${asset.name} returned HTTP ${response.status}.`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  assert.equal(bytes.length, asset.size, `${asset.name}: byte count`);
  const gitHash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  assert.equal(gitHash, asset.sha, `${asset.name}: upstream Git hash`);
  try { await writeFile(target, bytes, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  integrity.push({ name: asset.name, bytes: bytes.length, gitSha: asset.sha, sha256: createHash("sha256").update(bytes).digest("hex") });
}

const atlas = JSON.parse(await readFile(new URL("atlas-female.json", destination), "utf8"));
assert.equal(atlas.sex, "female");
assert.equal(atlas.parts.length, 888);
assert.equal(atlas.concepts.length, 1073);
const parts = new Set(atlas.parts.map((part) => part.id));
assert.equal(parts.size, atlas.parts.length);
const chunks = await Promise.all(atlas.chunks.map(async (chunk) => {
  assert.match(chunk.url, /^\/models\/female-\d+\.bin$/);
  assert.match(chunk.gzip, /^\/models\/female-\d+\.bin\.gz$/);
  const bytes = await readFile(new URL(chunk.url.split("/").at(-1), destination));
  const compressed = await readFile(new URL(chunk.gzip.split("/").at(-1), destination));
  assert.equal(bytes.length, chunk.bytes);
  assert.equal(compressed.length, chunk.gzipBytes);
  assert.deepEqual(gunzipSync(compressed), bytes);
  return bytes;
}));
for (const part of atlas.parts) {
  const buffer = chunks[part.chunk];
  const positions = new Float32Array(buffer.buffer, buffer.byteOffset + part.positions, part.vertexCount * 3);
  const indices = new Uint32Array(buffer.buffer, buffer.byteOffset + part.indices, part.indexCount);
  for (const position of positions) assert.ok(Number.isFinite(position));
  for (const index of indices) assert.ok(index < part.vertexCount);
}
for (const concept of atlas.concepts) for (const element of concept.elements) assert.ok(parts.has(element));
assert.equal(atlas.parts.reduce((total, part) => total + part.indexCount / 3, 0), atlas.triangles);

const record = JSON.stringify({
  upstreamRepository: "https://github.com/ashemag/human-atlas", upstreamCommit: commit,
  dataset: "https://doi.org/10.48539/HBM352.BTSQ.586", license: "CC-BY-4.0",
  sourceGeometry: "https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb",
  files: integrity,
}, null, 2) + "\n";
try { await writeFile(new URL("provenance.json", destination), record, { flag: "wx" }); }
catch (error) {
  if (error.code !== "EEXIST") throw error;
  assert.equal(await readFile(new URL("provenance.json", destination), "utf8"), record);
}
console.log(JSON.stringify({ verifiedFiles: assets.length, parts: atlas.parts.length, concepts: atlas.concepts.length, triangles: atlas.triangles, gzipBytes: atlas.chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0) }));