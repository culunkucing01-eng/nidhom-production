import { Hono } from "hono";
import authRoutes from "./routes/auth";
import guruRoutes from "./routes/guru";
import kelasRoutes from "./routes/kelas";
import mapelRoutes from "./routes/mapel";
import importsRoutes from "./routes/imports";
import jadwalRoutes from "./routes/jadwal";
import perizinanRoutes from "./routes/perizinan";
import izinRoutes from "./routes/izin";
import absenRoutes from "./routes/absen";
import teacherAuthRoutes from "./routes/teacher-auth";
import dashboardRoutes from "./routes/dashboard";
import syncRoutes from "./routes/sync";
import { applicationAuthMiddleware, type AuthEnv } from "./middleware/auth";

const app = new Hono<AuthEnv>();

// Middleware auth global — WAJIB didaftarkan SEBELUM rute agar membungkusnya
// (termasuk /auth/me & /auth/change-password). Endpoint publik di-whitelist di
// applicationAuthMiddleware (login/logout admin & teacher, guru-list publik).
app.use("*", applicationAuthMiddleware);

// ── Auth (admin login) — dilindungi applicationAuthMiddleware (didaftarkan di atas) ─────────────
app.route("/auth", authRoutes);

// ── Teacher portal auth (name-only, no password) ──────────────────────────────
app.route("/api/teacher", teacherAuthRoutes);

// ── All other routes require an authenticated session ─────────────────────────
app.route("/api/guru", guruRoutes);
app.route("/api/kelas", kelasRoutes);
app.route("/api/mapel", mapelRoutes);
app.route("/api/imports", importsRoutes);
app.route("/api/jadwal", jadwalRoutes);
app.route("/api/perizinan", perizinanRoutes);
app.route("/api/izin", izinRoutes);
app.route("/api/absen", absenRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/sync", syncRoutes);

app.get("/message", (c) => c.text("Hello Hono!"));

export default app;

