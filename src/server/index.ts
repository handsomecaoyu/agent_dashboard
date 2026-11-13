import { join } from "node:path";
import { Service } from "./service.js";
import { createApp, dataDirectory } from "./http.js";
const port = Number(process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535");
const service = new Service(join(dataDirectory(), "dashboard.sqlite"));
const server = createApp(service);
server.on("error", (error) => {
  console.error("Dashboard server failed:", error.message);
  service.close();
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.error(`Agent Dashboard listening at http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      service.close();
      process.exit(0);
    }),
  );
