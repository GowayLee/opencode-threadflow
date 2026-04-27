import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { t, type MessageKey } from "../../src/i18n";
import type { Locale } from "../../src/i18n/types";
import { en } from "../../src/i18n/en";
import { zh } from "../../src/i18n/zh";

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

  test("falls back to default (en) when requested locale is unavailable", () => {
    const result = t("jp" as Locale, "tool.find_session.empty_query");
    assert.match(result, /No query provided/);
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

  test("keeps locale bundles on the same key set", () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  });

  test("does not introduce unsupported placeholders in zh messages", () => {
    const placeholderPattern = /\{(\w+)\}/g;

    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const enPlaceholders = new Set(
        [...en[key].matchAll(placeholderPattern)].map((match) => match[1]),
      );
      const zhPlaceholders = [
        ...(zh[key] ?? "").matchAll(placeholderPattern),
      ].map((match) => match[1]);

      for (const placeholder of zhPlaceholders) {
        assert.ok(
          enPlaceholders.has(placeholder),
          `${key} has unsupported zh placeholder {${placeholder}}`,
        );
      }
    }
  });

  test("uses localized Chinese text for previously untranslated messages", () => {
    assert.match(t("zh", "tool.find_session.empty_query"), /未提供 query/);
    assert.match(t("zh", "tool.read_session.unreadable"), /无法读取 session/);
    assert.match(t("zh", "tool.search.no_results"), /未找到匹配/);
    assert.match(t("zh", "command.session_search.template"), /原样渲染/);
  });
});
