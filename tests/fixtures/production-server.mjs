import { spawn } from "node:child_process";
import { createServer } from "node:https";
import { request as forwardRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { generate } from "selfsigned";

const certificate = await generate([{ name: "commonName", value: "localhost" }], {
  algorithm: "sha256",
  keySize: 2048,
  extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }],
});

const application = spawn(process.execPath, [fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", "3111"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, NEXT_DIST_DIR: ".next-build" },
});

const server = createServer({ key: certificate.private, cert: certificate.cert }, (request, response) => {
  const upstream = forwardRequest({
    hostname: "127.0.0.1",
    port: 3111,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, "x-forwarded-proto": "https", "x-forwarded-host": request.headers.host },
  }, (result) => {
    response.writeHead(result.statusCode || 502, result.headers);
    result.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(503);
    response.end("Local production server is not ready.");
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  request.pipe(upstream);
});

function stop() {
  server.closeAllConnections();
  server.close();
  application.kill();
}

application.on("error", (error) => { console.error(error.message); stop(); process.exitCode = 1; });
application.on("exit", (code) => { server.closeAllConnections(); server.close(); process.exitCode = code || 0; });
server.on("error", (error) => { console.error(error.message); stop(); process.exitCode = 1; });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.listen(3110, "127.0.0.1");