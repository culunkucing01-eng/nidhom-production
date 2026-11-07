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
const userIds = ["ADMIN", "LEADERSHIP", "TEACHER"].map((role) => `kelas-test-${role.toLowerCase()}-${randomUUID()}`);
const tokens = userIds.map(() => randomBytes(32).toString("base64url"));
const tokenHashes = await Promise.all(tokens.map(hashToken));
const classIds = [];
const scheduleIds = [];
const teacherId = `kelas-test-guru-${randomUUID()}`;
const subjectId = `kelas-test-mapel-${randomUUID()}`;
const fixturePasswordHash = randomBytes(32).toString("hex");

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

async function request(baseUrl, path, { token, method = "GET", body } = {}) {
  const headers = { Origin: baseUrl };
  if (token) {
    headers.Cookie = `nidhom_session=${token}`;
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
  const userRows = userIds.map((id, index) => {
    const role = ["ADMIN", "LEADERSHIP", "TEACHER"][index];
    return `(${sqlLiteral(id)}, ${sqlLiteral(`${role.toLowerCase()}_${tag.toLowerCase()}`)}, ${sqlLiteral(fixturePasswordHash)}, '${role}', 1, 0)`;
  });
  const sessionRows = userIds.map((id, index) =>
    `(${sqlLiteral(`kelas-session-${tag}-${index}`)}, ${sqlLiteral(id)}, ${sqlLiteral(tokenHashes[index])}, ${sqlLiteral(expiresAt)}, ${sqlLiteral(now)}, ${sqlLiteral(now)})`,
  );
  return `
    INSERT INTO users (id, username, password_hash, role, is_active, must_change_password)
    VALUES ${userRows.join(",\n")};
    INSERT INTO sessions (id, user_id, token_hash, expires_at, last_activity_at, created_at)
    VALUES ${sessionRows.join(",\n")};
    INSERT INTO guru (id, kode, nama)
    VALUES (${sqlLiteral(teacherId)}, ${sqlLiteral(`KG-${tag}`)}, 'Guru Fixture');
    INSERT INTO mata_pelajaran (id, nama_arab)
    VALUES (${sqlLiteral(subjectId)}, 'Fixture Subject');
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
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('kelas', 'jadwal', 'guru', 'mata_pelajaran', 'users', 'sessions')",
      true,
    ),
  )[0]?.results ?? [];
  const tableNames = new Set(schema.map((row) => row.name));
  if (!["kelas", "jadwal", "guru", "mata_pelajaran", "users", "sessions"].every((name) => tableNames.has(name))) {
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

  const adminToken = tokens[0];
  const leadershipToken = tokens[1];
  const teacherToken = tokens[2];
  const unauthenticated = await request(baseUrl, "/api/kelas");
  assert(unauthenticated.response.status === 401, "unauthenticated list access is denied");
  const unauthenticatedDetail = await request(baseUrl, `/api/kelas/${randomUUID()}`);
  const unauthenticatedCreate = await request(baseUrl, "/api/kelas", {
    method: "POST",
    body: { nama: `Tanpa Sesi ${tag}` },
  });
  const unauthenticatedUpdate = await request(baseUrl, `/api/kelas/${randomUUID()}`, {
    method: "PUT",
    body: { nama: `Tanpa Sesi ${tag}` },
  });
  const unauthenticatedStatus = await request(baseUrl, `/api/kelas/${randomUUID()}/status`, {
    method: "PATCH",
    body: { isActive: false },
  });
  assert(
    unauthenticatedDetail.response.status === 401 &&
      unauthenticatedCreate.response.status === 401 &&
      unauthenticatedUpdate.response.status === 401 &&
      unauthenticatedStatus.response.status === 401,
    "all class detail and mutation endpoints require a valid session",
  );

  const list = await request(baseUrl, "/api/kelas", { token: adminToken });
  assert(list.response.status === 200, "ADMIN can list classes");
  assert(list.payload.pagination.page === 1, "class list defaults to page one");

  const nonAdminList = await request(baseUrl, "/api/kelas", { token: teacherToken });
  assert(nonAdminList.response.status === 200, "authenticated non-admin can read classes");

  const invalid = await request(baseUrl, "/api/kelas", {
    token: adminToken,
    method: "POST",
    body: { nama: "  " },
  });
  assert(invalid.response.status === 400, "required class name is validated on the server");

  const created = await request(baseUrl, "/api/kelas", {
    token: adminToken,
    method: "POST",
    body: { nama: `  Kelas Uji ${tag}  ` },
  });
  assert(created.response.status === 201, "ADMIN can create a class");
  assert(created.payload.data.nama === `Kelas Uji ${tag}`, "class name is trimmed by the backend");
  classIds.push(created.payload.data.id);

  const duplicate = await request(baseUrl, "/api/kelas", {
    token: adminToken,
    method: "POST",
    body: { nama: `Kelas Uji ${tag}` },
  });
  assert(duplicate.response.status === 409, "duplicate class name returns HTTP 409");

  const detail = await request(baseUrl, `/api/kelas/${created.payload.data.id}`, {
    token: adminToken,
  });
  assert(
    detail.response.status === 200 &&
      detail.payload.data.nama === `Kelas Uji ${tag}` &&
      detail.payload.data.jadwal_aktif === 0,
    "ADMIN can retrieve class detail and active schedule count",
  );

  const updated = await request(baseUrl, `/api/kelas/${created.payload.data.id}`, {
    token: adminToken,
    method: "PUT",
    body: { nama: `Nama Kelas Uji ${tag}` },
  });
  assert(
    updated.response.status === 200 &&
      updated.payload.data.nama === `Nama Kelas Uji ${tag}`,
    "ADMIN can update a class name",
  );

  const duplicateTarget = await request(baseUrl, "/api/kelas", {
    token: adminToken,
    method: "POST",
    body: { nama: "Kelas Tujuan Duplikat" },
  });
  assert(duplicateTarget.response.status === 201, "duplicate update target fixture is created");
  classIds.push(duplicateTarget.payload.data.id);
  const conflictingUpdate = await request(baseUrl, `/api/kelas/${created.payload.data.id}`, {
    token: adminToken,
    method: "PUT",
    body: { nama: duplicateTarget.payload.data.nama },
  });
  assert(conflictingUpdate.response.status === 409, "duplicate class name on update returns HTTP 409");
  const caseInsensitiveDuplicate = await request(baseUrl, "/api/kelas", {
    token: adminToken,
    method: "POST",
    body: { nama: duplicateTarget.payload.data.nama.toLowerCase() },
  });
  assert(caseInsensitiveDuplicate.response.status === 409, "case-insensitive duplicate class name returns HTTP 409");

  const search = await request(
    baseUrl,
    `/api/kelas?q=${encodeURIComponent(`Nama Kelas Uji ${tag}`)}`,
    { token: adminToken },
  );
  assert(
    search.response.status === 200 &&
      search.payload.data.some((kelas) => kelas.id === created.payload.data.id),
    "class search matches name",
  );

  for (let index = 0; index < 9; index += 1) {
    const result = await request(baseUrl, "/api/kelas", {
      token: adminToken,
      method: "POST",
      body: { nama: `Kelas Paginate ${tag} ${index}` },
    });
    assert(result.response.status === 201, `pagination fixture ${index + 1} is created`);
    classIds.push(result.payload.data.id);
  }
  const firstPage = await request(
    baseUrl,
    `/api/kelas?q=${encodeURIComponent(`Kelas Paginate ${tag}`)}&per_page=5&page=1`,
    { token: adminToken },
  );
  const secondPage = await request(
    baseUrl,
    `/api/kelas?q=${encodeURIComponent(`Kelas Paginate ${tag}`)}&per_page=5&page=2`,
    { token: adminToken },
  );
  assert(
    firstPage.response.status === 200 &&
      firstPage.payload.data.length === 5 &&
      firstPage.payload.pagination.total === 9 &&
      secondPage.payload.data.length === 4 &&
      secondPage.payload.pagination.page === 2,
    "pagination returns bounded, distinct pages and total count",
  );

  const statusChange = await request(
    baseUrl,
    `/api/kelas/${created.payload.data.id}/status`,
    { token: adminToken, method: "PATCH", body: { isActive: false } },
  );
  assert(
    statusChange.response.status === 200 && statusChange.payload.data.is_active === 0,
    "ADMIN can deactivate a class without deleting it",
  );
  const activeList = await request(
    baseUrl,
    `/api/kelas?q=${encodeURIComponent(`Nama Kelas Uji ${tag}`)}`,
    { token: adminToken },
  );
  const inactiveList = await request(
    baseUrl,
    `/api/kelas?q=${encodeURIComponent(`Nama Kelas Uji ${tag}`)}&status=inactive`,
    { token: adminToken },
  );
  const allList = await request(
    baseUrl,
    `/api/kelas?q=${encodeURIComponent(`Nama Kelas Uji ${tag}`)}&status=all`,
    { token: adminToken },
  );
  assert(
    activeList.payload.data.length === 0 &&
      inactiveList.payload.data.length === 1 &&
      allList.payload.data.length === 1,
    "default, inactive, and all class filters behave as expected",
  );
  const reactivated = await request(
    baseUrl,
    `/api/kelas/${created.payload.data.id}/status`,
    { token: adminToken, method: "PATCH", body: { isActive: true } },
  );
  assert(
    reactivated.response.status === 200 && reactivated.payload.data.is_active === 1,
    "ADMIN can reactivate an existing class",
  );

  for (const [role, token] of [["LEADERSHIP", leadershipToken], ["TEACHER", teacherToken]]) {
    const create = await request(baseUrl, "/api/kelas", {
      token,
      method: "POST",
      body: { nama: `Ditolak ${role} ${tag}` },
    });
    const update = await request(baseUrl, `/api/kelas/${created.payload.data.id}`, {
      token,
      method: "PUT",
      body: { nama: `Perubahan Ditolak ${role} ${tag}` },
    });
    const status = await request(baseUrl, `/api/kelas/${created.payload.data.id}/status`, {
      token,
      method: "PATCH",
      body: { isActive: false },
    });
    assert(
      create.response.status === 403 &&
        update.response.status === 403 &&
        status.response.status === 403,
      `${role} cannot create, edit, or change class status`,
    );
  }

  const activeScheduleClass = await request(baseUrl, "/api/kelas", {
    token: adminToken,
    method: "POST",
    body: { nama: `Kelas Dengan Jadwal ${tag}` },
  });
  assert(activeScheduleClass.response.status === 201, "active schedule class fixture is created");
  classIds.push(activeScheduleClass.payload.data.id);
  const activeScheduleId = `kelas-jadwal-aktif-${randomUUID()}`;
  scheduleIds.push(activeScheduleId);
  runLocalD1(
    `INSERT INTO jadwal (id, kelas_id, guru_id, mata_pelajaran_id, day_index, period, is_active)
     VALUES (${sqlLiteral(activeScheduleId)}, ${sqlLiteral(activeScheduleClass.payload.data.id)}, ${sqlLiteral(teacherId)}, ${sqlLiteral(subjectId)}, 0, 1, 1);`,
  );
  const blockedStatus = await request(
    baseUrl,
    `/api/kelas/${activeScheduleClass.payload.data.id}/status`,
    { token: adminToken, method: "PATCH", body: { isActive: false } },
  );
  assert(
    blockedStatus.response.status === 409 &&
      blockedStatus.payload.jadwalAktif === 1 &&
      blockedStatus.payload.error.includes("jadwal aktif"),
    "class with active schedules returns a clear conflict and stays active",
  );
  const activeScheduleDetail = await request(
    baseUrl,
    `/api/kelas/${activeScheduleClass.payload.data.id}`,
    { token: adminToken },
  );
  assert(
    activeScheduleDetail.payload.data.is_active === 1 &&
      activeScheduleDetail.payload.data.jadwal_aktif === 1,
    "blocked deactivation leaves the class and active schedule unchanged",
  );

  runLocalD1(
    `UPDATE jadwal SET is_active = 0 WHERE id = ${sqlLiteral(activeScheduleId)};`,
  );
  const historicalStatus = await request(
    baseUrl,
    `/api/kelas/${activeScheduleClass.payload.data.id}/status`,
    { token: adminToken, method: "PATCH", body: { isActive: false } },
  );
  const historicalRows = JSON.parse(
    runLocalD1(
      `SELECT COUNT(*) AS total FROM jadwal WHERE id = ${sqlLiteral(activeScheduleId)} AND kelas_id = ${sqlLiteral(activeScheduleClass.payload.data.id)} AND is_active = 0`,
      true,
    ),
  )[0]?.results ?? [];
  assert(
    historicalStatus.response.status === 200 &&
      historicalStatus.payload.data.is_active === 0 &&
      historicalRows[0]?.total === 1,
    "class with historical schedules can be deactivated while its relation remains",
  );

  const noDelete = await request(
    baseUrl,
    `/api/kelas/${activeScheduleClass.payload.data.id}`,
    { token: adminToken, method: "DELETE" },
  );
  assert(noDelete.response.status === 404 || noDelete.response.status === 405, "permanent class deletion is not provided");

  const invalidQuery = await request(baseUrl, "/api/kelas?per_page=1000", {
    token: adminToken,
  });
  assert(invalidQuery.response.status === 400, "invalid pagination limits are rejected");

  const logout = await request(baseUrl, "/auth/logout", {
    token: teacherToken,
    method: "POST",
  });
  assert(logout.response.ok, "existing logout endpoint remains reachable");

  console.log("Kelas API local tests completed.");
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
      const scheduleDeletes = scheduleIds
        .map((id) => `DELETE FROM jadwal WHERE id = ${sqlLiteral(id)};`)
        .join("\n");
      const classDeletes = classIds
        .map((id) => `DELETE FROM kelas WHERE id = ${sqlLiteral(id)};`)
        .join("\n");
      runLocalD1(`
        ${scheduleDeletes}
        ${classDeletes}
        DELETE FROM mata_pelajaran WHERE id = ${sqlLiteral(subjectId)};
        DELETE FROM guru WHERE id = ${sqlLiteral(teacherId)};
        DELETE FROM sessions
        WHERE user_id IN (${userIds.map(sqlLiteral).join(", ")});
        DELETE FROM users
        WHERE id IN (${userIds.map(sqlLiteral).join(", ")});
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
