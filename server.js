import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import apocHandler from "./api/apoc.js";
import passageHandler from "./api/passage.js";
import studyHandler from "./api/study.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/study") {
    await studyHandler(toVercelRequest(request, url), toVercelResponse(response));
    return;
  }

  if (url.pathname === "/api/passage") {
    await passageHandler(toVercelRequest(request, url), toVercelResponse(response));
    return;
  }

  if (url.pathname === "/api/apoc") {
    await apocHandler(toVercelRequest(request, url), toVercelResponse(response));
    return;
  }

  await serveStatic(url.pathname, response);
}).listen(port, () => {
  console.log(`Bible study app running at http://localhost:${port}`);
});

function toVercelRequest(request, url) {
  return {
    method: request.method,
    headers: request.headers,
    query: Object.fromEntries(url.searchParams.entries())
  };
}

function toVercelResponse(response) {
  return {
    setHeader(name, value) {
      response.setHeader(name, value);
    },
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(body));
    }
  };
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = normalize(join(root, decoded));

  if (!filePath.startsWith(root) || filePath.includes(`${root}api/`)) {
    sendNotFound(response);
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      sendNotFound(response);
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", types[extname(filePath)] || "application/octet-stream");
    createReadStream(filePath).pipe(response);
  } catch {
    sendNotFound(response);
  }
}

function sendNotFound(response) {
  response.statusCode = 404;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Not found");
}
