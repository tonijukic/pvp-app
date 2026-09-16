import type { Express } from "express";
import type { Server } from "http";
import { authRouter } from "./routes/auth";
import { trackerRouter } from "./routes/tracker";
import { usersRouter } from "./routes/users";
import { jobsRouter } from "./routes/jobs";
import { importRouter } from "./routes/import";
import { clientsRouter } from "./routes/clients";
import { servicesRouter } from "./routes/services";
import { requireAuth } from "./middleware/requireAuth";

/**
 * Mount all API routers. Public auth first, then everything behind requireAuth.
 */
export async function registerRoutes(_httpServer: Server, app: Express) {
  app.use("/api/auth", authRouter);

  app.use("/api", requireAuth, trackerRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use("/api/jobs", requireAuth, jobsRouter);
  app.use("/api/import", requireAuth, importRouter);
  app.use("/api/clients", requireAuth, clientsRouter);
  app.use("/api/services", requireAuth, servicesRouter);

  app.get("/api/ping", requireAuth, (_req, res) => {
    res.json({ success: true, data: { pong: true }, error: null });
  });
}
