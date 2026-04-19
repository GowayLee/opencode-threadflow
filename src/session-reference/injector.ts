import type { Part, TextPartInput } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { buildSessionContextPack } from "./refinement";
import {
  parseSessionReferences,
  type InvalidSessionReference,
} from "./reference-parser";

type SessionReferenceInjectorParams = {
  client: OpencodeClient;
  directory: string;
  parts: Part[];
};

export async function buildSessionReferenceInjectionParts({
  client,
  directory,
  parts,
}: SessionReferenceInjectorParams): Promise<Part[]> {
  const parsed = parseSessionReferences(parts);
  if (parsed.references.length === 0 && parsed.invalidReferences.length === 0) {
    return [];
  }

  const injectedParts: Part[] = [];

  for (const entry of parsed.entries) {
    if ("reason" in entry) {
      injectedParts.push(
        createSyntheticTextPart(renderInvalidReferenceBlock(entry), {
          threadflow: {
            type: "session-reference-error",
            source: entry.source,
          },
        }),
      );
      continue;
    }

    const contextPack = await buildSessionContextPack({
      client,
      directory,
      sessionID: entry.sessionID,
    });

    if (!contextPack) {
      injectedParts.push(
        createSyntheticTextPart(
          renderInvalidReferenceBlock({
            source: entry.source,
            reason: `No session was found for \`${entry.sessionID}\`.`,
          }),
          {
            threadflow: {
              type: "session-reference-error",
              source: entry.source,
              sessionID: entry.sessionID,
            },
          },
        ),
      );
      continue;
    }

    injectedParts.push(
      createSyntheticTextPart(
        [
          "[Session Reference]",
          `session_id: ${entry.sessionID}`,
          `source: ${entry.source}`,
          "",
          contextPack,
          "[/Session Reference]",
        ].join("\n"),
        {
          threadflow: {
            type: "session-reference",
            source: entry.source,
            sessionID: entry.sessionID,
          },
        },
      ),
    );
  }

  return injectedParts;
}

type InjectSessionReferenceContextParams = {
  client: OpencodeClient;
  directory: string;
  sessionID: string;
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  variant?: string;
  parts: Part[];
};

export async function injectSessionReferenceContext({
  client,
  directory,
  sessionID,
  agent,
  model,
  variant,
  parts,
}: InjectSessionReferenceContextParams): Promise<number> {
  const injectedParts = await buildSessionReferenceInjectionParts({
    client,
    directory,
    parts,
  });

  if (injectedParts.length === 0) {
    return 0;
  }

  await client.session.prompt({
    sessionID,
    directory,
    noReply: true,
    ...(agent ? { agent } : {}),
    ...(model ? { model } : {}),
    ...(variant ? { variant } : {}),
    parts: injectedParts.map(toPromptTextPart),
  });

  return injectedParts.length;
}

function renderInvalidReferenceBlock(
  reference: InvalidSessionReference,
): string {
  return [
    "[Session Reference Error]",
    `source: ${reference.source}`,
    `reason: ${reference.reason}`,
    "[/Session Reference Error]",
  ].join("\n");
}

function createSyntheticTextPart(
  text: string,
  metadata: Record<string, unknown>,
): Part {
  return {
    type: "text",
    text,
    synthetic: true,
    metadata,
  } as unknown as Part;
}

function toPromptTextPart(part: Part): TextPartInput {
  if (part.type !== "text") {
    throw new TypeError(`Expected injected text part, received ${part.type}.`);
  }

  return {
    type: "text",
    text: part.text,
    ...(part.synthetic !== undefined ? { synthetic: part.synthetic } : {}),
    ...(part.metadata ? { metadata: part.metadata } : {}),
  };
}
