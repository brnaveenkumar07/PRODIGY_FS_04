import { createServer } from "node:http";

import next from "next";

import { initSocketServer } from "./src/lib/socket";

const dev = process.env.NODE_ENV !== "production";
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

function resolvePublicHost(hostValue: string): string {
  if (hostValue === "0.0.0.0" || hostValue === "::") {
    return "localhost";
  }
  return hostValue;
}

async function bootstrap() {
  const app = next({ dev, hostname: host, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    void handle(req, res);
  });

  initSocketServer(httpServer);

  httpServer.listen(port, host, () => {
    const publicHost = resolvePublicHost(host);
    console.log(`> Server ready on http://${publicHost}:${port}`);
  });
}

void bootstrap().catch((error) => {
  console.error("Failed to bootstrap server", error);
  process.exit(1);
});
