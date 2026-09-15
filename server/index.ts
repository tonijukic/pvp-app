import express from "express";
import session from "express-session";
import { createServer } from "http";
import { config } from "./config";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { runMigrations } from "./db";
import { storage } from "./storage";
import { seedDev } from "./seed";

function log(msg: string) {
  console.log(`${new Date().toISOString()} [pvp] ${msg}`);
}

const app = express();
const httpServer = createServer(app);

// Render/TLS proxy: only trust it when cookies are marked secure, else the
// session cookie is dropped behind the proxy (login 200 but no cookie).
if (config.cookieSecure) {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: config.auth.sessionSecret,
    name: "sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8h
    },
  }),
);

(async () => {
  await registerRoutes(httpServer, app);
  app.get("/healthz", (_req, res) => res.status(200).type("text/plain").send("ok"));

  await runMigrations(); // no-op without DATABASE_URL
  await seedDev(storage); // no-op unless PVP_SEED=true

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = err as { message?: string; status?: number } | undefined;
    log(`error: ${e?.message ?? String(err)}`);
    res.status(e?.status ?? 500).json({ success: false, data: null, error: "Napaka strežnika" });
  });

  if (config.nodeEnv === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const listenOptions: { port: number; host: string; reusePort?: boolean } = {
    port: config.port,
    host: "0.0.0.0",
  };
  if (process.platform === "linux") listenOptions.reusePort = true;

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log(`port ${config.port} in use — set PORT to another value`);
      process.exit(1);
    }
    throw err;
  });
  httpServer.listen(listenOptions, () => log(`serving on port ${config.port}`));
})().catch((err) => {
  log(`fatal: ${err?.message ?? err}`);
  process.exit(1);
});
