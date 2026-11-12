// Serves the presentation page (the playground) on the local network and
// records what phones report.
//   npm run bench                         then open the printed address on the phone
//   PIECES=/path/to/sprite.svg npm run bench
//                                         use the pieces of a cm-chessboard sprite
import { build } from "esbuild";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { spriteToCss } from "../scripts/sprite-to-css.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const logDir = fileURLToPath(new URL("../.tmp/bench/", import.meta.url));

async function bundle() {
  const out = await build({ absWorkingDir: root, entryPoints: ["bench/bench.ts"], bundle: true, format: "esm", target: "es2020", minify: true, write: false });
  return out.outputFiles[0].text;
}

const files = {
  "/": ["bench/index.html", "text/html; charset=utf-8"],
  "/lightsquare.css": ["src/lightsquare.css", "text/css"],
  "/pieces.css": ["src/pieces/cburnett.css", "text/css"],
  "/icon.svg": ["docs/icons/icon.svg", "image/svg+xml"],
  "/icon-small.svg": ["docs/icons/icon-small.svg", "image/svg+xml"],
  "/apple-touch-icon.png": ["docs/icons/apple-touch-icon.png", "image/png"],
  "/results.json": ["compare/results.json", "application/json"],
};

/**
 * Start the page's server. `pieces` is the path of a cm-chessboard sprite to
 * offer as a second piece set; `port` 0 takes any free port (the tests do).
 */
export async function startServer({ port = 3055, host = "0.0.0.0", pieces = process.env.PIECES, quiet = false } = {}) {
  mkdirSync(logDir, { recursive: true });
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "POST" && path === "/log") {
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const entry = { at: new Date().toISOString(), from: req.socket.remoteAddress, ...JSON.parse(body) };
        if (!quiet) {
          appendFileSync(`${logDir}phone.jsonl`, `${JSON.stringify(entry)}\n`);
          console.log(`${entry.at} ${entry.kind}: lowPower=${entry.lowPower} fps=${entry.fps} worstGap=${entry.worstGap} set=${entry.setMedian}/${entry.setWorst} input=${entry.inputMedian}/${entry.inputWorst} slide=${entry.slideMedian}/${entry.slideWorst}`);
        }
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
      return;
    }
    try {
      if (path === "/bench.js") return void res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }).end(await bundle());
      if (path === "/config.json") return void res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ extraPieces: !!pieces }));
      if (path === "/pieces-extra.css") return void res.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" }).end(pieces ? spriteToCss(readFileSync(pieces, "utf8"), "extra") : "");
      const file = files[path];
      if (!file) return void res.writeHead(404).end();
      res.writeHead(200, { "content-type": file[1], "cache-control": "no-store" }).end(readFileSync(root + file[0]));
    } catch (e) {
      res.writeHead(path === "/results.json" ? 404 : 500).end(String(e));
    }
  });
  await new Promise((resolve) => server.listen(port, host, resolve));
  return { server, port: server.address().port };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer({ port: Number(process.env.PORT ?? 3055) });
  const addresses = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`Lightsquare: http://localhost:${port}`);
  for (const address of addresses) console.log(`  on the phone:    http://${address}:${port}`);
  console.log(`  results go to:   ${logDir}phone.jsonl`);
  console.log(`  extra piece set: ${process.env.PIECES ?? "none (set PIECES=/path/to/sprite.svg)"}`);
}
