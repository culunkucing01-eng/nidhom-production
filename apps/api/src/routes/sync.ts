import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

const syncRoutes = new Hono<AuthEnv>();

syncRoutes.get("/state", async (c) => {
  const user = c.get("authUser");
  try {
    const common = await Promise.all([
      c.env.DB.prepare("SELECT MAX(updated_at) AS value FROM jadwal").first<{ value: string | null }>(),
      c.env.DB.prepare("SELECT MAX(updated_at) AS value FROM kelas").first<{ value: string | null }>(),
      c.env.DB.prepare("SELECT MAX(updated_at) AS value FROM mata_pelajaran").first<{ value: string | null }>(),
    ]);

    if (user.role === "ADMIN") {
      const [pending, latest, decision] = await Promise.all([
        c.env.DB.prepare("SELECT COUNT(*) AS total FROM izin_pengajuan WHERE status = 'PENDING'").first<{ total: number }>(),
        c.env.DB.prepare("SELECT id FROM izin_pengajuan ORDER BY created_at DESC, id DESC LIMIT 1").first<{ id: string | null }>(),
        c.env.DB.prepare("SELECT MAX(updated_at) AS value FROM izin_pengajuan WHERE status <> 'PENDING'").first<{ value: string | null }>(),
      ]);
      return c.json({
        pendingIzinCount: pending?.total ?? 0,
        latestIzinId: latest?.id ?? null,
        latestScheduleUpdateAt: common[0]?.value ?? null,
        latestClassUpdateAt: common[1]?.value ?? null,
        latestSubjectUpdateAt: common[2]?.value ?? null,
        latestIzinDecisionAt: decision?.value ?? null,
      });
    }

    const guruId = user.teacher?.id;
    if (!guruId) return c.json({ error: "Identitas guru tidak tersedia." }, 403);
    const [latest, decision, schedule] = await Promise.all([
      c.env.DB.prepare("SELECT id FROM izin_pengajuan WHERE guru_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").bind(guruId).first<{ id: string | null }>(),
      c.env.DB.prepare("SELECT MAX(updated_at) AS value FROM izin_pengajuan WHERE guru_id = ? AND status <> 'PENDING'").bind(guruId).first<{ value: string | null }>(),
      c.env.DB.prepare("SELECT MAX(j.updated_at) AS value FROM jadwal j WHERE j.guru_id = ?").bind(guruId).first<{ value: string | null }>(),
    ]);
    return c.json({
      pendingIzinCount: 0,
      latestIzinId: latest?.id ?? null,
      latestScheduleUpdateAt: schedule?.value ?? common[0]?.value ?? null,
      latestClassUpdateAt: common[1]?.value ?? null,
      latestSubjectUpdateAt: common[2]?.value ?? null,
      latestIzinDecisionAt: decision?.value ?? null,
    });
  } catch (error) {
    console.error("Sync state query failed.", error);
    return c.json({ error: "Status sinkronisasi belum dapat dimuat." }, 503);
  }
});

export default syncRoutes;