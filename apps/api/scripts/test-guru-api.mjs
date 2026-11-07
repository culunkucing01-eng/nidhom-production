import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:net";

const config = JSON.parse(readFileSync("wrangler.local.jsonc", "utf8"));
const database = config.d1_databases?.find((entry) => entry.binding === "DB");
if (
  config.main !== "src/local.ts" ||
  !database?.database_name ||
  "database_id" in database
) {
  throw new Error("Local test refused: Wrangler local D1 configuration is not isolated.");
}

const wranglerPath = resolve("node_modules/wrangler/bin/wrangler.js");
const tag = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const adminId = `guru-test-admin-${randomUUID()}`;
const teacherId = `guru-test-teacher-${randomUUID()}`;
const adminUsername = `guru_test_admin_${tag.toLowerCase()}`;
const teacherUsername = `guru_test_teacher_${tag.toLowerCase()}`;
const adminToken = randomBytes(32).toString("base64url");
const teacherToken = randomBytes(32).toString("base64url");
const adminTokenHash = await hashToken(adminToken);
const teacherTokenHash = await hashToken(teacherToken);
const fixturePasswordHash = randomBytes(32).toString("hex");
const fixtureGuruIds = [];

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runLocalD1(sql, json = false) {
  return execFileSync(
    process.execPath,
    [
      wranglerPath,
      "d1",
      "execute",
      database.database_name,
      "--local",
      "--config",
      "wrangler.local.jsonc",
      ...(json ? ["--json"] : []),
      "--command",
      sql,
    ],
    {
      encoding: "utf8",
      stdio: json ? ["ignore", "pipe", "ignore"] : "ignore",
    },
  );
}

async function hashToken(token) {
  const digest = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Buffer.from(digest).toString("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`PASS: ${message}`);
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const { port } = server.address();
  await new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
  return port;
}

async function waitForServer(url, processHandle) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error("Local Wrangler server exited before becoming ready.");
    }
    try {
      const response = await fetch(`${url}/auth/me`);
      await response.body?.cancel();
      if (response.status === 401) {
        return;
      }
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
  throw new Error("Local Wrangler server did not become ready.");
}

function cookie(token) {
  return `nidhom_session=${token}`;
}

async function request(baseUrl, path, { token, method = "GET", body } = {}) {
  const headers = { Origin: baseUrl };
  if (token) {
    headers.Cookie = cookie(token);
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    payload = await response.json();
  } else {
    await response.body?.cancel();
  }
  return { response, payload };
}

function fixtureSql() {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  return `
    INSERT INTO users (id, username, password_hash, role, is_active, must_change_password)
    VALUES
      (${sqlLiteral(adminId)}, ${sqlLiteral(adminUsername)}, ${sqlLiteral(fixturePasswordHash)}, 'ADMIN', 1, 0),
      (${sqlLiteral(teacherId)}, ${sqlLiteral(teacherUsername)}, ${sqlLiteral(fixturePasswordHash)}, 'TEACHER', 1, 0);
    INSERT INTO sessions (id, user_id, token_hash, expires_at, last_activity_at, created_at)
    VALUES
      (${sqlLiteral(`guru-session-admin-${tag}`)}, ${sqlLiteral(adminId)}, ${sqlLiteral(adminTokenHash)}, ${sqlLiteral(expiresAt)}, ${sqlLiteral(now)}, ${sqlLiteral(now)}),
      (${sqlLiteral(`guru-session-teacher-${tag}`)}, ${sqlLiteral(teacherId)}, ${sqlLiteral(teacherTokenHash)}, ${sqlLiteral(expiresAt)}, ${sqlLiteral(now)}, ${sqlLiteral(now)});
  `;
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let fixturesCreated = false;
let thrownError;

try {
  const schema = JSON.parse(
    runLocalD1(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('guru', 'users', 'sessions')",
      true,
    ),
  )[0]?.results ?? [];
  const tableNames = new Set(schema.map((row) => row.name));
  if (!["guru", "users", "sessions"].every((name) => tableNames.has(name))) {
    throw new Error("Local D1 schema is incomplete. Apply local migrations before this test.");
  }

  fixturesCreated = true;
  runLocalD1(fixtureSql());

  server = spawn(
    process.execPath,
    [
      wranglerPath,
      "dev",
      "--local",
      "--config",
      "wrangler.local.jsonc",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { stdio: "ignore" },
  );
  await waitForServer(baseUrl, server);

  const unauthenticated = await request(baseUrl, "/api/guru");
  assert(unauthenticated.response.status === 401, "unauthenticated list access is denied");

  const authenticatedUser = await request(baseUrl, "/auth/me", { token: adminToken });
  assert(
    authenticatedUser.response.status === 200 &&
      authenticatedUser.payload?.user?.role === "ADMIN",
    "existing authenticated session resolves the ADMIN role",
  );
  assert(
    !JSON.stringify(authenticatedUser.payload).includes("password_hash"),
    "session response does not expose password hash fields",
  );

  const teacherList = await request(baseUrl, "/api/guru", { token: teacherToken });
  assert(teacherList.response.status === 200, "authenticated non-admin can read guru list");
  const teacherCreate = await request(baseUrl, "/api/guru", {
    token: teacherToken,
    method: "POST",
    body: { kode: `TEST-${tag}`, nama: "Tidak boleh dibuat" },
  });
  assert(teacherCreate.response.status === 403, "non-admin cannot create guru");
  await request(baseUrl, `/api/guru/${randomUUID()}`, {
    token: teacherToken,
    method: "PUT",
    body: { kode: `TEST-${tag}`, nama: "Tidak boleh diubah" },
  }).then(({ response }) => assert(response.status === 403, "non-admin cannot edit guru"));
  await request(baseUrl, `/api/guru/${randomUUID()}/status`, {
    token: teacherToken,
    method: "PATCH",
    body: { isActive: false },
  }).then(({ response }) => assert(response.status === 403, "non-admin cannot change guru status"));

  const invalid = await request(baseUrl, "/api/guru", {
    token: adminToken,
    method: "POST",
    body: { kode: " ", nama: "" },
  });
  assert(invalid.response.status === 400, "required guru fields are validated on the server");

  const firstGuru = await request(baseUrl, "/api/guru", {
    token: adminToken,
    method: "POST",
    body: { kode: `test-${tag}`, nama: `Guru Uji ${tag}` },
  });
  assert(firstGuru.response.status === 201, "ADMIN can create guru");
  fixtureGuruIds.push(firstGuru.payload.data.id);
  assert(firstGuru.payload.data.kode === `TEST-${tag}`, "guru code is normalized consistently");

  const duplicate = await request(baseUrl, "/api/guru", {
    token: adminToken,
    method: "POST",
    body: { kode: `TEST-${tag.toLowerCase()}`, nama: "Kode duplikat" },
  });
  assert(duplicate.response.status === 409, "duplicate guru code returns conflict");

  const detail = await request(baseUrl, `/api/guru/${firstGuru.payload.data.id}`, {
    token: adminToken,
  });
  assert(
    detail.response.status === 200 &&
      detail.payload.data.nama === `Guru Uji ${tag}`,
    "ADMIN can retrieve guru detail",
  );

  const updated = await request(baseUrl, `/api/guru/${firstGuru.payload.data.id}`, {
    token: adminToken,
    method: "PUT",
    body: { kode: `UPDATED-${tag}`, nama: `NamaUji${tag}` },
  });
  assert(
    updated.response.status === 200 && updated.payload.data.kode === `UPDATED-${tag}`,
    "ADMIN can update guru code and name",
  );

  const nameSearch = await request(
    baseUrl,
    `/api/guru?q=${encodeURIComponent(`NamaUji${tag}`)}`,
    { token: adminToken },
  );
  assert(
    nameSearch.response.status === 200 &&
      nameSearch.payload.data.some((guru) => guru.id === firstGuru.payload.data.id),
    "list search matches guru name",
  );
  const codeSearch = await request(
    baseUrl,
    `/api/guru?q=${encodeURIComponent(`UPDATED-${tag}`)}`,
    { token: adminToken },
  );
  assert(
    codeSearch.response.status === 200 &&
      codeSearch.payload.data.some((guru) => guru.id === firstGuru.payload.data.id),
    "list search matches guru code",
  );

  for (let index = 0; index < 10; index += 1) {
    const created = await request(baseUrl, "/api/guru", {
      token: adminToken,
      method: "POST",
      body: {
        kode: `TEST-${tag}-${index}`,
        nama: `Guru Uji ${tag} ${index}`,
      },
    });
    assert(created.response.status === 201, `pagination fixture ${index + 1} is created`);
    fixtureGuruIds.push(created.payload.data.id);
  }

  const firstPage = await request(
    baseUrl,
    `/api/guru?q=${encodeURIComponent(`TEST-${tag}`)}&per_page=5&page=1`,
    { token: adminToken },
  );
  const secondPage = await request(
    baseUrl,
    `/api/guru?q=${encodeURIComponent(`TEST-${tag}`)}&per_page=5&page=2`,
    { token: adminToken },
  );
  assert(
    firstPage.response.status === 200 &&
      firstPage.payload.data.length === 5 &&
      firstPage.payload.pagination.total === 10 &&
      secondPage.payload.data.length === 5 &&
      secondPage.payload.pagination.page === 2,
    "pagination returns bounded, distinct pages and total count",
  );

  const statusChange = await request(
    baseUrl,
    `/api/guru/${firstGuru.payload.data.id}/status`,
    { token: adminToken, method: "PATCH", body: { isActive: false } },
  );
  assert(
    statusChange.response.status === 200 && statusChange.payload.data.is_active === 0,
    "ADMIN can deactivate guru without deleting the record",
  );
  const activeList = await request(
    baseUrl,
    `/api/guru?q=${encodeURIComponent(`UPDATED-${tag}`)}`,
    { token: adminToken },
  );
  const inactiveList = await request(
    baseUrl,
    `/api/guru?q=${encodeURIComponent(`UPDATED-${tag}`)}&status=inactive`,
    { token: adminToken },
  );
  const allList = await request(
    baseUrl,
    `/api/guru?q=${encodeURIComponent(`UPDATED-${tag}`)}&status=all`,
    { token: adminToken },
  );
  assert(
    activeList.payload.data.length === 0 &&
      inactiveList.payload.data.length === 1 &&
      allList.payload.data.length === 1,
    "default, inactive, and all status filters behave as expected",
  );
  const reactivated = await request(
    baseUrl,
    `/api/guru/${firstGuru.payload.data.id}/status`,
    { token: adminToken, method: "PATCH", body: { isActive: true } },
  );
  assert(
    reactivated.response.status === 200 && reactivated.payload.data.is_active === 1,
    "ADMIN can reactivate an existing guru",
  );

  const invalidQuery = await request(baseUrl, "/api/guru?per_page=1000", {
    token: adminToken,
  });
  assert(invalidQuery.response.status === 400, "invalid pagination limits are rejected");

  const logout = await request(baseUrl, "/auth/logout", {
    token: teacherToken,
    method: "POST",
  });
  assert(logout.response.ok, "existing logout endpoint remains reachable");

  console.log("Guru API local tests completed.");
} catch (error) {
  thrownError = error;
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolvePromise) => {
      const timeout = setTimeout(resolvePromise, 5_000);
      server.once("close", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
    });
  }
  if (fixturesCreated) {
    try {
      const guruDeletes = fixtureGuruIds
        .map((id) => `DELETE FROM guru WHERE id = ${sqlLiteral(id)};`)
        .join("\n");
      runLocalD1(`
        ${guruDeletes}
        DELETE FROM sessions
        WHERE user_id IN (${sqlLiteral(adminId)}, ${sqlLiteral(teacherId)});
        DELETE FROM users
        WHERE id IN (${sqlLiteral(adminId)}, ${sqlLiteral(teacherId)});
      `);
      console.log("Temporary local D1 fixtures cleaned up.");
    } catch (cleanupError) {
      console.error("Failed to clean temporary local D1 fixtures.");
      thrownError ??= cleanupError;
    }
  }
}

if (thrownError) {
  throw thrownError;
}
