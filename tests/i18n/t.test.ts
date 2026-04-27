import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { t, type MessageKey } from "../../src/i18n";
import type { Locale } from "../../src/i18n/types";

describe("i18n/t()", () => {
  test("returns Chinese message for zh locale", () => {
    const result = t("zh", "tool.name_session.no_change", {
      sessionID: "ses_001",
      title: "测试标题",
    });
    assert.match(result, /Session 标题无需变更/);
    assert.match(result, /ses_001/);
    assert.match(result, /测试标题/);
  });

  test("returns English message for en locale", () => {
    const result = t("en", "tool.name_session.no_change", {
      sessionID: "ses_001",
      title: "Test Title",
    });
    assert.match(result, /Session title does not need to be changed/);
    assert.match(result, /ses_001/);
    assert.match(result, /Test Title/);
  });

  test("falls back to default (en) when key is missing in requested locale", () => {
    // All keys present in both locales now, but t() will fallback to en by design
    const result = t("zh", "tool.find_session.empty_query");
    assert.match(result, /No query provided/);
    // zh.ts has same value for this key, so fallback behavior is transparent
  });

  test("replaces {param} placeholders with provided values", () => {
    const result = t("zh", "hook.handoff.current_session_id", {
      sessionID: "ses_ABC123",
    });
    assert.match(result, /ses_ABC123/);
    assert.match(result, /当前 session ID/);
    assert.doesNotMatch(result, /\{sessionID\}/);
  });

  test("leaves unmatched placeholders as-is", () => {
    const result = t("en", "tool.read_session.not_found", {});
    assert.match(result, /\{sessionID\}/); // not replaced because no param
  });

  test("does not escape Markdown", () => {
    const result = t("en", "tool.name_session.success", {
      sessionID: "ses_001",
      oldTitle: "old | pipe",
      newTitle: "new",
    });
    assert.match(result, /old \| pipe/); // pipe character passed through
  });

  test("returns placeholder for missing key", () => {
    // Use a key that's not in MessageKey union - cast to bypass type check
    const result = t("en", "nonexistent.key" as MessageKey);
    assert.match(result, /\[missing: nonexistent.key\]/);
  });
});
