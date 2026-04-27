import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { handoffCommand } from "../../src/commands/handoff.ts";

describe("commands/handoff", () => {
  test("template describes handoff-id and predecessor marker rules", () => {
    assert.match(handoffCommand.template, /Handoff identity marker:/);
    assert.match(handoffCommand.template, /\[handoff-id\]: <handoff-id>/);
    assert.match(handoffCommand.template, /Predecessor session sources:/);
    assert.match(
      handoffCommand.template,
      /\[handoff-predecessor-sessions\]: <resolved child session ID> via <handoff-id>/,
    );
    assert.match(
      handoffCommand.template,
      /Do not merge predecessor sessions into `\[handoff-source-chain\]:`/,
    );
  });

  test("template keeps examples as placeholders, not fake concrete session IDs", () => {
    assert.doesNotMatch(handoffCommand.template, /ses_AAA/);
    assert.doesNotMatch(handoffCommand.template, /ses_BBB/);
    assert.doesNotMatch(handoffCommand.template, /ses_CCC/);
    assert.doesNotMatch(handoffCommand.template, /`ses_X`/);
    assert.match(handoffCommand.template, /<oldest session ID>/);
    assert.match(handoffCommand.template, /<current session ID>/);
  });
});
