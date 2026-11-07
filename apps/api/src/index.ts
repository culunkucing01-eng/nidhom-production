import { Hono } from "hono";
import authRoutes from "./routes/auth";
import guruRoutes from "./routes/guru";
import kelasRoutes from "./routes/kelas";
import mapelRoutes from "./routes/mapel";
import { applicationAuthMiddleware, type AuthEnv } from "./middleware/auth";

const app = new Hono<AuthEnv>();

app.use("*", applicationAuthMiddleware);
app.route("/auth", authRoutes);
app.route("/api/guru", guruRoutes);
app.route("/api/kelas", kelasRoutes);
app.route("/api/mapel", mapelRoutes);

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

export default app;
