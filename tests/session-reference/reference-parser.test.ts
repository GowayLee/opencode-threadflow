import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseSessionReferences } from "../../src/session-reference/reference-parser.ts";
import { textPart } from "./test-helpers.ts";

describe("session-reference/reference-parser", () => {
  test("keeps first-seen order and de-duplicates repeated valid ids", () => {
    const parsed = parseSessionReferences([
      textPart(
        "Use @@ses_existingref01 and @@bad and @@ses_missingref01 and again @@ses_existingref01",
      ) as never,
    ]);

    assert.deepEqual(
      parsed.entries.map((entry) => entry.source),
      ["@@ses_existingref01", "@@bad", "@@ses_missingref01"],
    );
    assert.deepEqual(
      parsed.references.map((entry) => entry.sessionID),
      ["ses_existingref01", "ses_missingref01"],
    );
    assert.equal(parsed.invalidReferences.length, 1);
    assert.match(
      parsed.invalidReferences[0]?.reason ?? "",
      /complete `session-id`/,
    );
  });

  test("ignores synthetic text parts when parsing explicit references", () => {
    const parsed = parseSessionReferences([
      textPart("@@ses_realref01") as never,
      textPart("@@ses_hiddenref02", true) as never,
    ]);

    assert.deepEqual(
      parsed.references.map((entry) => entry.sessionID),
      ["ses_realref01"],
    );
  });
});
