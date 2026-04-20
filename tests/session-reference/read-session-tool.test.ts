import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createReadSessionTool } from "../../src/session-reference/read-session-tool.ts";
import { createSampleClient, loadRawSample, ROOT } from "./test-helpers.ts";

describe("session-reference/read-session-tool", () => {
  test("rejects incomplete session ids before reading", async () => {
    const toolDefinition = createReadSessionTool({
      client: createSampleClient([]) as never,
      directory: ROOT,
    }) as unknown as {
      execute: (
        args: { sessionID: string },
        context: { metadata: (value: unknown) => void },
      ) => Promise<string>;
    };

    const metadataCalls: unknown[] = [];
    const result = await toolDefinition.execute(
      { sessionID: "partial-id" },
      { metadata: (value) => metadataCalls.push(value) },
    );

    assert.match(result, /Session could not be read\./);
    assert.match(result, /requires a complete `session-id`/);
    assert.equal(metadataCalls.length, 0);
  });

  test("returns a context pack and records metadata for valid sessions", async () => {
    const sample = await loadRawSample("ses_25ecc5a89fferms5vu4KQ9OwP3");
    const metadataCalls: unknown[] = [];
    const toolDefinition = createReadSessionTool({
      client: createSampleClient([sample]) as never,
      directory: ROOT,
    }) as unknown as {
      execute: (
        args: { sessionID: string },
        context: { metadata: (value: unknown) => void },
      ) => Promise<string>;
    };

    const result = await toolDefinition.execute(
      { sessionID: sample.session.id },
      { metadata: (value) => metadataCalls.push(value) },
    );

    assert.match(result, /# Session Context Pack/);
    assert.match(result, /## Transcript/);
    assert.match(result, /## Activity/);
    assert.match(result, /## Compressed Content/);
    assert.match(result, new RegExp(`- Title: ${sample.session.title}`));
    assert.deepEqual(metadataCalls, [
      {
        title: `Read session ${sample.session.id}`,
        metadata: {
          sessionID: sample.session.id,
        },
      },
    ]);
  });
});
