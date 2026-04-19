import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildSessionReferenceInjectionParts,
  injectSessionReferenceContext,
} from "../../src/session-reference/injector.ts";
import { createSampleClient, ROOT, textPart } from "./test-helpers.ts";

describe("session-reference/injector", () => {
  test("injects valid references, preserves order, de-duplicates ids and reports failures", async () => {
    const existingSession = {
      session: {
        id: "ses_existingref01",
        title: "existing ref",
        time: {
          updated: 1,
        },
      },
      messages: [
        {
          info: {
            id: "msg_ref_user",
            sessionID: "ses_existingref01",
            role: "user",
          },
          parts: [textPart("reference body")],
        },
      ],
    };

    const client = createSampleClient([existingSession]);
    const injected = await buildSessionReferenceInjectionParts({
      client: client as never,
      directory: ROOT,
      parts: [
        textPart(
          "Use @@ses_existingref01 then @@bad then @@ses_missingref01 and @@ses_existingref01 again",
        ) as never,
      ],
    });

    assert.equal(injected.length, 3);
    assert.match(
      (injected[0] as { text?: string }).text ?? "",
      /\[Session Reference\]/,
    );
    assert.match(
      (injected[0] as { text?: string }).text ?? "",
      /session_id: ses_existingref01/,
    );
    assert.match(
      (injected[1] as { text?: string }).text ?? "",
      /\[Session Reference Error\]/,
    );
    assert.match(
      (injected[1] as { text?: string }).text ?? "",
      /source: @@bad/,
    );
    assert.match(
      (injected[2] as { text?: string }).text ?? "",
      /No session was found for `ses_missingref01`\./,
    );
  });

  test("does not inject anything without explicit references", async () => {
    const client = createSampleClient([]);
    const injected = await buildSessionReferenceInjectionParts({
      client: client as never,
      directory: ROOT,
      parts: [textPart("No explicit references here") as never],
    });

    assert.equal(injected.length, 0);
  });

  test("preloads injected references through a noReply session prompt", async () => {
    const existingSession = {
      session: {
        id: "ses_existingref01",
        title: "existing ref",
        time: {
          updated: 1,
        },
      },
      messages: [
        {
          info: {
            id: "msg_ref_user",
            sessionID: "ses_existingref01",
            role: "user",
          },
          parts: [textPart("reference body")],
        },
      ],
    };

    const promptCalls: Array<Record<string, unknown>> = [];
    const client = createSampleClient([existingSession]) as unknown as {
      session: {
        get: (args: { sessionID: string }) => Promise<{ data: unknown }>;
        messages: (args: { sessionID: string }) => Promise<{ data: unknown[] }>;
        prompt: (args: Record<string, unknown>) => Promise<{ data: null }>;
      };
    };
    client.session.prompt = async (args) => {
      promptCalls.push(args);
      return { data: null };
    };

    const injectedCount = await injectSessionReferenceContext({
      client: client as never,
      directory: ROOT,
      sessionID: "ses_targetsession01",
      agent: "build",
      model: {
        providerID: "openai",
        modelID: "gpt-test",
      },
      variant: "default",
      parts: [textPart("Please read @@ses_existingref01") as never],
    });

    assert.equal(injectedCount, 1);
    assert.equal(promptCalls.length, 1);
    assert.equal(promptCalls[0]?.sessionID, "ses_targetsession01");
    assert.equal(promptCalls[0]?.directory, ROOT);
    assert.equal(promptCalls[0]?.noReply, true);
    assert.equal(promptCalls[0]?.agent, "build");
    assert.deepEqual(promptCalls[0]?.model, {
      providerID: "openai",
      modelID: "gpt-test",
    });
    assert.equal(promptCalls[0]?.variant, "default");

    const promptPart = (
      promptCalls[0]?.parts as Array<{
        type: string;
        text: string;
        synthetic?: boolean;
        metadata?: Record<string, unknown>;
      }>
    )?.[0];
    assert.equal(promptPart?.type, "text");
    assert.equal(promptPart?.synthetic, true);
    assert.deepEqual(promptPart?.metadata, {
      threadflow: {
        type: "session-reference",
        source: "@@ses_existingref01",
        sessionID: "ses_existingref01",
      },
    });
    assert.match(promptPart?.text ?? "", /\[Session Reference\]/);
    assert.match(promptPart?.text ?? "", /session_id: ses_existingref01/);
  });
});
