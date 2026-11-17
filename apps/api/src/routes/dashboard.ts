import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

const dashboardRoutes = new Hono<AuthEnv>();

dashboardRoutes.get("/stats", async (c) => {
  try {
    const [guruCount, kelasCount, mapelCount, jadwalCount, absenCount, perizinanCount] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM guru WHERE is_active = 1").first<{ total: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM kelas WHERE is_active = 1").first<{ total: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM mata_pelajaran WHERE is_active = 1").first<{ total: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM jadwal WHERE is_active = 1").first<{ total: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM absen").first<{ total: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM perizinan").first<{ total: number }>(),
    ]);

    let lastSuccessfulSync: string | null = null;
    let recentSyncActivity: Array<Record<string, unknown>> = [];
    try {
      const lastSync = await c.env.DB.prepare(
        "SELECT created_at AS last_sync FROM import_runs WHERE status IN ('completed','partial') ORDER BY created_at DESC LIMIT 1",
      ).first<{ last_sync: string | null }>();
      lastSuccessfulSync = lastSync?.last_sync ?? null;
      const recentRuns = await c.env.DB.prepare(
        "SELECT id, file_name, sheet_name, entity_type, status, total_rows, inserted_count, updated_count, failed_count, created_at FROM import_runs ORDER BY created_at DESC LIMIT 10",
      ).all();
      recentSyncActivity = (recentRuns.results ?? []) as Array<Record<string, unknown>>;
    } catch (error) {
      console.error("Dashboard import history query failed.", error);
    }

    return c.json({
      stats: {
        totalTeachers: guruCount?.total ?? 0,
        totalClasses: kelasCount?.total ?? 0,
        totalSubjects: mapelCount?.total ?? 0,
        totalSchedules: jadwalCount?.total ?? 0,
        totalAbsen: absenCount?.total ?? 0,
        totalPerizinan: perizinanCount?.total ?? 0,
        lastSuccessfulSync,
      },
      recentSyncActivity,
    });
  } catch {
    console.error("Dashboard stats query failed.");
    return c.json({ error: "Statistik dashboard tidak dapat dimuat." }, 500);
  }
});

export default dashboardRoutes;
