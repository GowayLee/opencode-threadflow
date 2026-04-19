import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import { buildSessionContextPack } from "../src/session-reference/refinement.ts";

const ROOT = process.cwd();
const SAMPLE_DIR = path.join(ROOT, "docs/transcript-samples/runtime");

async function main() {
  const args = process.argv.slice(2);
  const { sessionID, useLive, outputPath } = parseArgs(args);

  if (!sessionID) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const pack = useLive
    ? await renderFromLiveSession(sessionID)
    : await renderFromSampleOrLive(sessionID);

  if (!pack) {
    console.error(`No session context pack could be produced for ${sessionID}.`);
    process.exitCode = 1;
    return;
  }

  if (outputPath) {
    const resolvedOutputPath = path.resolve(ROOT, outputPath);
    await writeFile(resolvedOutputPath, `${pack}\n`, "utf8");
    console.error(`Wrote context pack to ${resolvedOutputPath}`);
  }

  process.stdout.write(`${pack}\n`);
}

function parseArgs(args) {
  let sessionID;
  let useLive = false;
  let outputPath;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--live") {
      useLive = true;
      continue;
    }

    if (arg === "--out") {
      outputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (!sessionID) {
      sessionID = arg;
    }
  }

  return { sessionID, useLive, outputPath };
}

async function renderFromSampleOrLive(sessionID) {
  const samplePack = await renderFromSample(sessionID);
  if (samplePack) {
    return samplePack;
  }

  return renderFromLiveSession(sessionID);
}

async function renderFromSample(sessionID) {
  const samplePath = path.join(SAMPLE_DIR, `${sessionID}.raw.json`);

  try {
    const sample = JSON.parse(await readFile(samplePath, "utf8"));
    const sessions = new Map([[sample.session.id, sample]]);
    const client = {
      session: {
        get: async ({ sessionID: targetSessionID }) => ({
          data: sessions.get(targetSessionID)?.session ?? null,
        }),
        messages: async ({ sessionID: targetSessionID }) => ({
          data: sessions.get(targetSessionID)?.messages ?? [],
        }),
      },
    };

    return buildSessionContextPack({
      client,
      directory: ROOT,
      sessionID,
    });
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function renderFromLiveSession(sessionID) {
  const server = await createOpencodeServer({ port: 0 });
  const client = createOpencodeClient({ baseUrl: server.url });

  try {
    const adaptedClient = {
      session: {
        get: async ({ sessionID: targetSessionID }) =>
          client.session.get({ path: { id: targetSessionID } }),
        messages: async ({ sessionID: targetSessionID }) =>
          client.session.messages({
            path: { id: targetSessionID },
            query: { limit: 500 },
          }),
      },
    };

    return buildSessionContextPack({
      client: adaptedClient,
      directory: ROOT,
      sessionID,
    });
  } finally {
    server.close();
  }
}

function isMissingFileError(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT",
  );
}

function printUsage() {
  console.error(
    [
      "Usage: bun scripts/render-session-context-pack.mjs <session-id> [--live] [--out <file>]",
      "",
      "Default behavior:",
      "- If docs/transcript-samples/runtime/<session-id>.raw.json exists, render from the sample file.",
      "- Otherwise fall back to fetching the live session from the current OpenCode environment.",
      "",
      "Examples:",
      "- bun scripts/render-session-context-pack.mjs ses_25ecc5a89fferms5vu4KQ9OwP3",
      "- bun scripts/render-session-context-pack.mjs ses_25ecc5a89fferms5vu4KQ9OwP3 --out /tmp/pack.md",
      "- bun scripts/render-session-context-pack.mjs ses_live123 --live",
    ].join("\n"),
  );
}

await main();
