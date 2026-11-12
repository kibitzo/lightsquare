// Serves the bench page on the local network and records what phones report.
//   npm run bench -w lightsquare      then open the printed address on the phone
import { build } from "esbuild";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const logDir = fileURLToPath(new URL("../../../.tmp/lightsquare-bench/", import.meta.url));
const port = Number(process.env.PORT ?? 3055);
mkdirSync(logDir, { recursive: true });

async function bundle() {
  const out = await build({ absWorkingDir: root, entryPoints: ["bench/bench.ts"], bundle: true, format: "esm", target: "es2020", minify: true, write: false });
  return out.outputFiles[0].text;
}

const files = {
  "/": ["bench/index.html", "text/html; charset=utf-8"],
  "/lightsquare.css": ["src/lightsquare.css", "text/css"],
  "/pieces.css": ["src/pieces/cburnett.css", "text/css"],
};

createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (req.method === "POST" && path === "/log") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const entry = { at: new Date().toISOString(), from: req.socket.remoteAddress, ...JSON.parse(body) };
      appendFileSync(`${logDir}phone.jsonl`, `${JSON.stringify(entry)}\n`);
      console.log(`${entry.at} ${entry.kind}: lowPower=${entry.lowPower} fps=${entry.fps} worstGap=${entry.worstGap} set=${entry.setMedian}/${entry.setWorst} input=${entry.inputMedian}/${entry.inputWorst} slide=${entry.slideMedian}/${entry.slideWorst}`);
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
    return;
  }
  try {
    if (path === "/bench.js") return void res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }).end(await bundle());
    const file = files[path];
    if (!file) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": file[1], "cache-control": "no-store" }).end(readFileSync(root + file[0]));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(port, "0.0.0.0", () => {
  const addresses = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`Lightsquare bench: http://localhost:${port}`);
  for (const address of addresses) console.log(`  on the phone:    http://${address}:${port}`);
  console.log(`  results go to:   ${logDir}phone.jsonl`);
});
