import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildSessionReferenceInjectionParts,
  injectSessionReferenceContext,
  buildSessionReferenceFeedback,
} from "../../src/sessions/injector.ts";
import { parseSessionReferences } from "../../src/sessions/reference-parser.ts";
import { createSampleClient, ROOT, textPart } from "./test-helpers.ts";

describe("sessions/injector", () => {
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

    assert.equal(injected.length, 4);
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
    assert.match(
      (injected[3] as { text?: string }).text ?? "",
      /start with a brief session-reference loading report/,
    );
    assert.match(
      (injected[3] as { text?: string }).text ?? "",
      /Do not stop after the loading report/,
    );
    assert.match(
      (injected[3] as { text?: string }).text ?? "",
      /Continue with the user's current request/,
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

    assert.equal(injectedCount, 2);
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

    const promptPart2 = (
      promptCalls[0]?.parts as Array<{
        type: string;
        text: string;
        synthetic?: boolean;
        metadata?: Record<string, unknown>;
      }>
    )?.[1];
    assert.equal(promptPart2?.type, "text");
    assert.match(
      promptPart2?.text ?? "",
      /start with a brief session-reference loading report/,
    );
    assert.match(
      promptPart2?.text ?? "",
      /Do not stop after the loading report/,
    );
    assert.match(
      promptPart2?.text ?? "",
      /Continue with the user's current request/,
    );
  });

  // ── buildSessionReferenceFeedback tests ──

  describe("buildSessionReferenceFeedback", () => {
    test("3.1 single success reference produces loaded feedback with session ID and title", async () => {
      const session = {
        session: {
          id: "ses_abc123",
          title: "Implementing auth system",
          time: { updated: 1 },
        },
        messages: [],
      };
      const client = createSampleClient([session]);

      const parts = await buildSessionReferenceFeedback({
        client: client as never,
        directory: ROOT,
        parts: [textPart("check @@ses_abc123 for context") as never],
      });

      assert.equal(parts.length, 1);
      const part = parts[0] as {
        type: string;
        text: string;
        synthetic?: boolean;
      };
      assert.equal(part.type, "text");
      assert.match(part.text, /\[Session Reference\]/);
      assert.match(part.text, /Loaded ses_abc123:/);
      assert.match(part.text, /"Implementing auth system"/);
      assert.match(part.text, /\[\/Session Reference\]/);
    });

    test("3.2 multiple success references produce summary block listing all sessions", async () => {
      const sessionA = {
        session: {
          id: "ses_abc123",
          title: "Implementing auth system",
          time: { updated: 1 },
        },
        messages: [],
      };
      const sessionB = {
        session: {
          id: "ses_xyz789",
          title: "Database migration plan",
          time: { updated: 2 },
        },
        messages: [],
      };
      const client = createSampleClient([sessionA, sessionB]);

      const parts = await buildSessionReferenceFeedback({
        client: client as never,
        directory: ROOT,
        parts: [
          textPart("Use @@ses_abc123 and @@ses_xyz789 together") as never,
        ],
      });

      assert.equal(parts.length, 1);
      const part = parts[0] as {
        type: string;
        text: string;
      };
      assert.equal(part.type, "text");
      assert.match(part.text, /\[Session Reference\]/);
      assert.match(part.text, /2 loaded:/);
      assert.match(part.text, /ses_abc123: "Implementing auth system"/);
      assert.match(part.text, /ses_xyz789: "Database migration plan"/);
      assert.match(part.text, /\[\/Session Reference\]/);
    });

    test("3.3 pure failure references list all errors with reasons", async () => {
      const client = createSampleClient([]);

      const parts = await buildSessionReferenceFeedback({
        client: client as never,
        directory: ROOT,
        parts: [textPart("references: @@bad_ref and @@ses_missing99") as never],
      });

      assert.equal(parts.length, 1);
      const part = parts[0] as {
        type: string;
        text: string;
      };
      assert.match(part.text, /\[Session Reference\]/);
      assert.match(part.text, /2 errors:/);
      assert.match(part.text, /bad_ref: requires complete session-id/);
      assert.match(part.text, /ses_missing99: session not found/);
      assert.match(part.text, /\[\/Session Reference\]/);
    });

    test("3.4 mixed success and failure references listed in one block", async () => {
      const session = {
        session: {
          id: "ses_abc123",
          title: "Implementing auth system",
          time: { updated: 1 },
        },
        messages: [],
      };
      const client = createSampleClient([session]);

      const parts = await buildSessionReferenceFeedback({
        client: client as never,
        directory: ROOT,
        parts: [
          textPart(
            "See @@ses_abc123 @@bad_ref @@ses_missing99 for details",
          ) as never,
        ],
      });

      assert.equal(parts.length, 1);
      const part = parts[0] as {
        type: string;
        text: string;
      };
      assert.match(part.text, /\[Session Reference\]/);
      assert.match(part.text, /1 loaded, 2 errors:/);
      assert.match(part.text, /ses_abc123: "Implementing auth system"/);
      assert.match(part.text, /bad_ref: requires complete session-id/);
      assert.match(part.text, /ses_missing99: session not found/);
      assert.match(part.text, /\[\/Session Reference\]/);
    });

    test("3.5 no explicit references returns empty array", async () => {
      const client = createSampleClient([]);

      const parts = await buildSessionReferenceFeedback({
        client: client as never,
        directory: ROOT,
        parts: [textPart("No references here at all") as never],
      });

      assert.equal(parts.length, 0);
    });

    test("3.6 feedback part text is not re-parsed as session references", async () => {
      const session = {
        session: {
          id: "ses_abc123",
          title: "Implementing auth system",
          time: { updated: 1 },
        },
        messages: [],
      };
      const client = createSampleClient([session]);

      const feedbackParts = await buildSessionReferenceFeedback({
        client: client as never,
        directory: ROOT,
        parts: [textPart("review @@ses_abc123") as never],
      });

      assert.equal(feedbackParts.length, 1);

      const parsed = parseSessionReferences([...(feedbackParts as never[])]);

      assert.equal(parsed.entries.length, 0);
      assert.equal(parsed.references.length, 0);
      assert.equal(parsed.invalidReferences.length, 0);
    });
  });
});
