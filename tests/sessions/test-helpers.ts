import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SampleSession = {
  session: {
    id: string;
    title: string;
    slug?: string;
    time: {
      updated: number;
      archived?: number;
    };
  };
  messages: Array<{
    info: Record<string, unknown>;
    parts: Array<Record<string, unknown>>;
  }>;
};

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TEST_DIR, "../..");
const RUNTIME_DIR = path.join(ROOT, "docs/transcript-samples/runtime");

export async function loadRawSample(sessionID: string): Promise<SampleSession> {
  const filePath = path.join(RUNTIME_DIR, `${sessionID}.raw.json`);
  return JSON.parse(await readFile(filePath, "utf8")) as SampleSession;
}

export function createSampleClient(samples: SampleSession[]) {
  const sessions = new Map(
    samples.map((sample) => [sample.session.id, sample]),
  );

  return {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({
        data: sessions.get(sessionID)?.session ?? null,
      }),
      messages: async ({ sessionID }: { sessionID: string }) => ({
        data: sessions.get(sessionID)?.messages ?? [],
      }),
      prompt: async () => ({ data: null }),
    },
    experimental: {
      session: {
        list: async () => ({
          data: Array.from(sessions.values()).map((sample) => ({
            ...sample.session,
            slug: sample.session.slug ?? sample.session.id,
            time: {
              ...sample.session.time,
              archived: sample.session.time.archived ?? 0,
            },
          })),
        }),
      },
    },
  };
}

export function textPart(text: string, synthetic = false) {
  return {
    type: "text",
    text,
    ...(synthetic ? { synthetic: true } : {}),
  };
}
