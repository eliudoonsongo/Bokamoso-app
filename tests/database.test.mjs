import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { sampleNotebook, sampleSources, sampleSuite } from "../src/lib/demo.ts";
import { emptyProgress } from "../src/lib/learning.ts";

const database = new PGlite();
const namespace = "database-test";
const sourceIds = sampleSources.map((source) => source.id);

before(async () => {
  await database.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  const migration = await readFile(new URL("../supabase/migrations/20260905000100_bokamoso_store.sql", import.meta.url), "utf8");
  await database.exec(migration);
});

after(async () => { await database.close(); });

async function createNotebook({ owner = randomUUID(), id = randomUUID(), sources = sampleSources, scope = namespace, ifEmpty = false } = {}) {
  const result = await database.query(
    "SELECT public.bokamoso_create_notebook($1, $2, $3, $4, $5, $6, $7, $8) AS notebook",
    [scope, owner, JSON.stringify({ ...sampleNotebook, id }), JSON.stringify(emptyProgress()), JSON.stringify(sources), JSON.stringify(sampleSuite), "sample-suite", ifEmpty],
  );
  return result.rows[0].notebook;
}

async function count(table, notebookId) {
  const result = await database.query(`SELECT count(*)::int AS total FROM public.${table} WHERE notebook_id = $1`, [notebookId]);
  return result.rows[0].total;
}

test("Supabase tables enable RLS and deny browser roles all data and RPC access", async () => {
  const tables = await database.query("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE 'bokamoso_%'");
  assert.equal(tables.rows.length, 6);
  for (const table of tables.rows) {
    assert.equal(table.relrowsecurity, true, table.relname);
    for (const role of ["anon", "authenticated"]) {
      const privileges = await database.query("SELECT has_table_privilege($1, $2, 'SELECT, INSERT, UPDATE, DELETE') AS allowed", [role, `public.${table.relname}`]);
      assert.equal(privileges.rows[0].allowed, false, `${role}: ${table.relname}`);
    }
    const server = await database.query("SELECT has_table_privilege('service_role', $1, 'SELECT, INSERT, UPDATE, DELETE') AS allowed", [`public.${table.relname}`]);
    assert.equal(server.rows[0].allowed, true);
  }
  const functions = await database.query("SELECT oid, proname, prosecdef FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'bokamoso_%'");
  assert.equal(functions.rows.length, 3);
  for (const entry of functions.rows) {
    assert.equal(entry.prosecdef, false);
    for (const role of ["anon", "authenticated"]) {
      const result = await database.query("SELECT has_function_privilege($1, $2::oid, 'EXECUTE') AS allowed", [role, entry.oid]);
      assert.equal(result.rows[0].allowed, false, `${role}: ${entry.proname}`);
    }
  }
  await database.exec("SET ROLE anon");
  try {
    await assert.rejects(database.query("SELECT data FROM public.bokamoso_notebooks"), { code: "42501" });
    await assert.rejects(database.query("SELECT public.bokamoso_delete_source('foreign', 'source')"), { code: "42501" });
  } finally { await database.exec("RESET ROLE"); }
});

test("Supabase notebook creation seeds data atomically and reuses only the same owner and namespace", async () => {
  const owner = randomUUID();
  const first = await createNotebook({ owner, ifEmpty: true });
  const again = await createNotebook({ owner, ifEmpty: true });
  assert.equal(again.id, first.id);
  assert.equal(await count("bokamoso_sources", first.id), 3);
  assert.equal(await count("bokamoso_progress", first.id), 1);
  assert.equal(await count("bokamoso_suites", first.id), 1);
  assert.notEqual((await createNotebook({ owner, scope: "another-test", ifEmpty: true })).id, first.id);
  assert.notEqual((await createNotebook({ ifEmpty: true })).id, first.id);
});

test("Supabase seed failure rolls back both the notebook and its progress", async () => {
  const id = randomUUID();
  await assert.rejects(createNotebook({ id, sources: [{ title: "Missing source ID" }] }), { code: "23502" });
  const result = await database.query("SELECT id FROM public.bokamoso_notebooks WHERE id = $1", [id]);
  assert.deepEqual(result.rows, []);
  assert.equal(await count("bokamoso_progress", id), 0);
});

test("Supabase revision checks reject stale progress writes", async () => {
  const notebook = await createNotebook();
  const query = "UPDATE public.bokamoso_progress SET data = $1, revision = revision + 1 WHERE notebook_id = $2 AND revision = $3 RETURNING revision";
  const first = await database.query(query, [JSON.stringify({ ...emptyProgress(), xp: 20 }), notebook.id, 0]);
  const stale = await database.query(query, [JSON.stringify({ ...emptyProgress(), xp: 40 }), notebook.id, 0]);
  assert.equal(first.rows.length, 1);
  assert.equal(stale.rows.length, 0);
  const saved = await database.query("SELECT data, revision FROM public.bokamoso_progress WHERE notebook_id = $1", [notebook.id]);
  assert.equal(saved.rows[0].data.xp, 20);
  assert.equal(Number(saved.rows[0].revision), 1);
});

test("Supabase source deletion invalidates suites and rejects a stale regeneration", async () => {
  const notebook = await createNotebook();
  const other = await createNotebook();
  await database.query("SELECT public.bokamoso_delete_source($1, $2)", [notebook.id, sourceIds[0]]);
  assert.equal(await count("bokamoso_sources", notebook.id), 2);
  assert.equal(await count("bokamoso_suites", notebook.id), 0);
  assert.equal(await count("bokamoso_suites", other.id), 1);
  await assert.rejects(database.query("SELECT public.bokamoso_save_suite($1, $2, $3, $4)", [notebook.id, "stale-suite", JSON.stringify(sampleSuite), JSON.stringify(sourceIds)]), /no longer available/);
  assert.equal(await count("bokamoso_suites", notebook.id), 0);
});

test("Supabase suite replacement becomes latest and foreign keys clean child records", async () => {
  const notebook = await createNotebook();
  for (const id of ["new-suite", "sample-suite"]) {
    await database.query("SELECT public.bokamoso_save_suite($1, $2, $3, $4)", [notebook.id, id, JSON.stringify(sampleSuite), JSON.stringify(sourceIds)]);
  }
  const latest = await database.query("SELECT id FROM public.bokamoso_suites WHERE notebook_id = $1 ORDER BY position DESC LIMIT 1", [notebook.id]);
  assert.equal(latest.rows[0].id, "sample-suite");
  await database.query("INSERT INTO public.bokamoso_notes(id, notebook_id, data) VALUES ($1, $2, '{}')", [randomUUID(), notebook.id]);
  await database.query("INSERT INTO public.bokamoso_messages(id, notebook_id, data) VALUES ($1, $2, '{}')", [randomUUID(), notebook.id]);
  await database.query("DELETE FROM public.bokamoso_notebooks WHERE id = $1", [notebook.id]);
  for (const table of ["bokamoso_sources", "bokamoso_suites", "bokamoso_progress", "bokamoso_notes", "bokamoso_messages"]) {
    assert.equal(await count(table, notebook.id), 0, table);
  }
});