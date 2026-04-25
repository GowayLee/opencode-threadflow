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

  if (injectedParts.length > 0) {
    injectedParts.push(
      createSyntheticTextPart(
        [
          "When responding, start with a brief session-reference loading report.",
          "For each successfully loaded session, list the session ID with its title.",
          "For each failed reference, note the failure reason.",
          "Keep this report concise -- at most one line per reference.",
          "Do not stop after the loading report.",
          "Continue with the user's current request, using the loaded session content as reference material when relevant.",
        ].join(" "),
        {
          threadflow: {
            type: "session-reference-prompt",
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

export async function buildSessionReferenceFeedback({
  client,
  parts,
}: SessionReferenceInjectorParams): Promise<Part[]> {
  const parsed = parseSessionReferences(parts);
  if (parsed.entries.length === 0) {
    return [];
  }

  const successItems: Array<{ displayID: string; title: string }> = [];
  const errorItems: Array<{ displayID: string; reason: string }> = [];

  for (const entry of parsed.entries) {
    if ("reason" in entry) {
      const displayID = entry.source.slice(2);
      errorItems.push({ displayID, reason: "requires complete session-id" });
    } else {
      const { data: session } = await client.session.get({
        sessionID: entry.sessionID,
      });
      if (!session) {
        errorItems.push({
          displayID: entry.sessionID,
          reason: "session not found",
        });
      } else {
        let title: string = session.title ?? "";
        if (title.length > 80) {
          title = title.slice(0, 80) + "…";
        }
        successItems.push({ displayID: entry.sessionID, title });
      }
    }
  }

  const lines: string[] = [];
  lines.push("[Session Reference]");

  if (successItems.length === 1 && errorItems.length === 0) {
    const item = successItems[0]!;
    lines.push(`Loaded ${item.displayID}: "${item.title}"`);
  } else {
    const headerParts: string[] = [];
    if (successItems.length > 0) {
      headerParts.push(`${successItems.length} loaded`);
    }
    if (errorItems.length > 0) {
      const errorLabel =
        errorItems.length === 1 ? "1 error" : `${errorItems.length} errors`;
      headerParts.push(errorLabel);
    }
    lines.push(`${headerParts.join(", ")}:`);

    for (const item of successItems) {
      lines.push(`  ${item.displayID}: "${item.title}"`);
    }
    for (const item of errorItems) {
      lines.push(`  ${item.displayID}: ${item.reason}`);
    }
  }

  lines.push("[/Session Reference]");

  return [{ type: "text", text: lines.join("\n") } as Part];
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

export function toPromptTextPart(part: Part): TextPartInput {
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
