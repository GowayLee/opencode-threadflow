import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parseChainMarker,
  formatChainForInjection,
  buildHandoffInjectionText,
  extractUpstreamChain,
} from "../../src/session-reference/chain-parser.ts";

describe("session-reference/chain-parser", () => {
  describe("parseChainMarker", () => {
    // 4.2 标准 `; ` 分隔的 marker 行解析（多条目）
    test("parses standard semicolon-separated marker with multiple entries", () => {
      const entries = parseChainMarker(
        "ses_AAA Implement auth; ses_BBB Fix token; ses_CCC Add OAuth",
      );

      assert.deepEqual(entries, [
        { id: "ses_AAA", label: "Implement auth" },
        { id: "ses_BBB", label: "Fix token" },
        { id: "ses_CCC", label: "Add OAuth" },
      ]);
    });

    // 4.2 标准 `; ` 分隔的 marker 行解析（单条目）
    test("parses standard semicolon-separated marker with single entry", () => {
      const entries = parseChainMarker("ses_CCC Some work");

      assert.deepEqual(entries, [{ id: "ses_CCC", label: "Some work" }]);
    });

    // 4.3 非标准分隔符（`,`、`→`）时 ID 仍正确提取
    test("tolerates comma-separated entries via ID anchoring", () => {
      const entries = parseChainMarker(
        "ses_AAA Implement auth, ses_BBB Fix token",
      );

      assert.equal(entries.length, 2);
      assert.equal(entries[0]!.id, "ses_AAA");
      assert.equal(entries[1]!.id, "ses_BBB");
    });

    test("tolerates arrow-separated entries via ID anchoring", () => {
      const entries = parseChainMarker(
        "ses_AAA Implement auth → ses_BBB Fix token",
      );

      assert.equal(entries.length, 2);
      assert.equal(entries[0]!.id, "ses_AAA");
      assert.equal(entries[1]!.id, "ses_BBB");
    });

    // 4.4 仅含单 session 的 marker 行解析
    test("parses single-entry marker", () => {
      const entries = parseChainMarker("ses_XYZ Fix login bug");

      assert.deepEqual(entries, [{ id: "ses_XYZ", label: "Fix login bug" }]);
    });

    // 4.5 标签为空字符串的条目解析
    test("returns empty label when no text follows the ID", () => {
      const entries = parseChainMarker("ses_AAA");

      assert.deepEqual(entries, [{ id: "ses_AAA", label: "" }]);
    });

    test("returns empty labels for entries with only separators between IDs", () => {
      const entries = parseChainMarker("ses_AAA; ses_BBB");

      assert.deepEqual(entries, [
        { id: "ses_AAA", label: "" },
        { id: "ses_BBB", label: "" },
      ]);
    });

    // 4.6 英文标签与中文标签的解析
    test("parses English labels correctly", () => {
      const entries = parseChainMarker(
        "ses_AAA Implement user auth; ses_BBB Fix token refresh",
      );

      assert.deepEqual(entries, [
        { id: "ses_AAA", label: "Implement user auth" },
        { id: "ses_BBB", label: "Fix token refresh" },
      ]);
    });

    test("parses Chinese labels correctly", () => {
      const entries = parseChainMarker(
        "ses_AAA 实现用户认证; ses_BBB 修复token刷新",
      );

      assert.deepEqual(entries, [
        { id: "ses_AAA", label: "实现用户认证" },
        { id: "ses_BBB", label: "修复token刷新" },
      ]);
    });

    test("parses mixed English and Chinese labels", () => {
      const entries = parseChainMarker(
        "ses_AAA Implement auth 实现认证; ses_BBB Fix 修复 OAuth token",
      );

      assert.equal(entries.length, 2);
      assert.equal(entries[0]!.id, "ses_AAA");
      assert.equal(entries[1]!.id, "ses_BBB");
    });

    // Edge: empty payload
    test("returns empty array for empty payload", () => {
      const entries = parseChainMarker("");

      assert.deepEqual(entries, []);
    });

    // Edge: payload with no session IDs
    test("returns empty array when no ses_ IDs are present", () => {
      const entries = parseChainMarker("Just some text without IDs");

      assert.deepEqual(entries, []);
    });

    test("handles IDs that appear to overlap due to lack of separators", () => {
      // Without any separator, the regex greedily matches the longest
      // alphanumeric sequence after `ses_`, treating `ses_AAAses` as one ID.
      const entries = parseChainMarker("ses_AAAses_BBB");

      assert.equal(entries.length, 1);
      assert.equal(entries[0]!.id, "ses_AAAses");
    });

    // Edge: payload with mixed separator residues
    test("trims leading and trailing separator residues from labels", () => {
      const entries = parseChainMarker("ses_AAA  ,,|→→ labelA →→||;,; ses_BBB");

      assert.equal(entries.length, 2);
      assert.equal(entries[0]!.label, "labelA");
      assert.equal(entries[1]!.label, "");
    });
  });

  describe("formatChainForInjection", () => {
    // 4.7 formatChainForInjection() 输出格式正确性
    test("formats a multi-entry chain with labels as arrow chain", () => {
      const chain = [
        { id: "ses_AAA", label: "Implement auth" },
        { id: "ses_BBB", label: "Fix token" },
      ];
      const formatted = formatChainForInjection(chain);

      assert.equal(formatted, "`ses_AAA` Implement auth → `ses_BBB` Fix token");
    });

    test("formats a single-entry chain with label", () => {
      const chain = [{ id: "ses_CCC", label: "Some work" }];
      const formatted = formatChainForInjection(chain);

      assert.equal(formatted, "`ses_CCC` Some work");
    });

    test("formats entries with empty labels as bare ID", () => {
      const chain = [
        { id: "ses_AAA", label: "" },
        { id: "ses_BBB", label: "Fix bug" },
      ];
      const formatted = formatChainForInjection(chain);

      assert.equal(formatted, "`ses_AAA` → `ses_BBB` Fix bug");
    });

    test("returns empty string for empty chain", () => {
      const formatted = formatChainForInjection([]);

      assert.equal(formatted, "");
    });

    test("Chinese labels are formatted correctly", () => {
      const chain = [
        { id: "ses_AAA", label: "实现用户认证" },
        { id: "ses_BBB", label: "修复token刷新" },
      ];
      const formatted = formatChainForInjection(chain);

      assert.equal(
        formatted,
        "`ses_AAA` 实现用户认证 → `ses_BBB` 修复token刷新",
      );
    });
  });

  // 4.8 handoff 注入测试：有上游链条 vs 无上游场景
  describe("buildHandoffInjectionText", () => {
    test("with upstream chain, includes session ID and task flow with labels", () => {
      const text = buildHandoffInjectionText({
        sessionID: "ses_CCC",
        upstreamChain: [
          { id: "ses_AAA", label: "Implement auth" },
          { id: "ses_BBB", label: "Fix token" },
        ],
      });

      assert.match(text, /当前 session ID: `ses_CCC`/);
      assert.match(
        text,
        /上游任务流: `ses_AAA` Implement auth → `ses_BBB` Fix token/,
      );
      assert.match(text, /read_session/);
      assert.match(text, /§ included by opencode-threadflow plugin/);
    });

    test("without upstream chain, only includes session ID (existing behavior)", () => {
      const text = buildHandoffInjectionText({
        sessionID: "ses_CCC",
        upstreamChain: [],
      });

      assert.match(text, /This session ID: `ses_CCC`/);
      assert.doesNotMatch(text, /上游任务流/);
      assert.doesNotMatch(text, /read_session/);
      assert.doesNotMatch(text, /当前 session ID/);
    });

    test("with upstream chain containing Chinese labels", () => {
      const text = buildHandoffInjectionText({
        sessionID: "ses_CCC",
        upstreamChain: [
          { id: "ses_AAA", label: "实现用户认证" },
          { id: "ses_BBB", label: "修复token刷新" },
        ],
      });

      assert.match(text, /当前 session ID: `ses_CCC`/);
      assert.match(
        text,
        /上游任务流: `ses_AAA` 实现用户认证 → `ses_BBB` 修复token刷新/,
      );
    });

    test("injection text starts and ends with delimiter", () => {
      const text = buildHandoffInjectionText({
        sessionID: "ses_CCC",
        upstreamChain: [],
      });

      assert.ok(text.startsWith("---\n"));
      assert.match(text, /---$/);
    });
  });

  // 4.9 标记仅匹配非 synthetic part 的行为 + extractUpstreamChain
  describe("extractUpstreamChain", () => {
    test("extracts upstream chain from marker line, excluding current session", () => {
      const chain = extractUpstreamChain(
        "[handoff-source-chain]: ses_AAA Implement auth; ses_BBB Fix token; ses_CCC Add OAuth",
        "ses_CCC",
      );

      assert.deepEqual(chain, [
        { id: "ses_AAA", label: "Implement auth" },
        { id: "ses_BBB", label: "Fix token" },
      ]);
    });

    test("returns empty when marker only contains current session", () => {
      const chain = extractUpstreamChain(
        "[handoff-source-chain]: ses_CCC Some work",
        "ses_CCC",
      );

      assert.deepEqual(chain, []);
    });

    test("returns empty when no marker is present", () => {
      const chain = extractUpstreamChain(
        "Just a regular message without any marker",
        "ses_CCC",
      );

      assert.deepEqual(chain, []);
    });

    test("returns empty when marker is in synthetic-like content (text is just text for this unit)", () => {
      // extractUpstreamChain only cares about the regex match in the text;
      // the "synthetic" filtering is done at the plugin level, not here.
      // This test verifies the function still works on arbitrary text.
      const syntheticInjectionText =
        "---\n" +
        "§ included by opencode-threadflow plugin\n" +
        "\n" +
        "This session ID: `ses_AAA`\n" +
        "---\n" +
        "[handoff-source-chain]: ses_AAA Fake in synthetic";

      const chain = extractUpstreamChain(syntheticInjectionText, "ses_ZZZ");

      // The marker IS found in synthetic text at this level, but the plugin
      // filters synthetic parts before calling this function.
      assert.equal(chain.length, 1);
      assert.equal(chain[0]!.id, "ses_AAA");
    });

    test("tolerates multiline text and finds marker on any line", () => {
      const chain = extractUpstreamChain(
        "Some other text\n[handoff-source-chain]: ses_AAA Init; ses_BBB Continue\nMore text",
        "ses_BBB",
      );

      assert.deepEqual(chain, [{ id: "ses_AAA", label: "Init" }]);
    });
  });
});
