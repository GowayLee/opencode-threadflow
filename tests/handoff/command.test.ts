import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { handoffCommand } from "../../src/commands/handoff.ts";

describe("commands/handoff", () => {
  test("template describes handoff-id and predecessor marker rules", () => {
    assert.match(handoffCommand.template, /顶部 marker 块：/);
    assert.match(
      handoffCommand.template,
      /无 resolved predecessor sessions 时：/,
    );
    assert.match(
      handoffCommand.template,
      /有 resolved predecessor sessions 时：/,
    );
    assert.match(
      handoffCommand.template,
      /\[handoff-source-chain\]: <session ID label; session ID label; …>/,
    );
    assert.match(handoffCommand.template, /\[handoff-id\]: <本次 handoff ID>/);
    assert.match(handoffCommand.template, /逐字复制 `本次 handoff ID`/);
    assert.match(
      handoffCommand.template,
      /不要根据当前 session ID 推导、组合或重编号/,
    );
    assert.doesNotMatch(
      handoffCommand.template,
      /hdf<current-session-id without ses_>-n/,
    );
    assert.doesNotMatch(handoffCommand.template, /hdf<id>-n/);
    assert.match(handoffCommand.template, /不是 child session ID/);
    assert.match(handoffCommand.template, /不能传给 `read_session`/);
    assert.match(
      handoffCommand.template,
      /\[handoff-predecessor-sessions\]: <resolved child session ID> <label>/,
    );
    assert.match(
      handoffCommand.template,
      /label 由你基于对应前序 handoff note 的内容生成/,
    );
    assert.match(
      handoffCommand.template,
      /不要把 predecessor sessions 合并进 `\[handoff-source-chain\]:`/,
    );
    assert.match(handoffCommand.template, /上游链路：/);
    assert.match(
      handoffCommand.template,
      /前序子会话（从本 session 之前的 handoff note 出发）：/,
    );
    assert.match(
      handoffCommand.template,
      /以上 session 均可通过 `read_session` 回看完整上下文/,
    );
  });

  test("template treats user goal as continuation direction, not planning work", () => {
    assert.match(handoffCommand.template, /接续方向或粗略任务线索/);
    assert.match(handoffCommand.template, /只用于指导你筛选和强调当前 session/);
    assert.match(
      handoffCommand.template,
      /完整方案设计、实施计划或细粒度任务拆分/,
    );
    assert.match(handoffCommand.template, /### 接续方向/);
    assert.match(handoffCommand.template, /### 开局动作/);
    assert.doesNotMatch(handoffCommand.template, /### 下一步目标/);
    assert.doesNotMatch(handoffCommand.template, /### 建议起步动作/);
  });

  test("template uses handoff note naming", () => {
    assert.match(handoffCommand.description, /handoff note/);
    assert.match(handoffCommand.template, /handoff note/);
    assert.match(handoffCommand.template, /## Handoff Note/);
    assert.doesNotMatch(handoffCommand.description, /handoff draft/);
    assert.doesNotMatch(handoffCommand.template, /handoff draft/);
    assert.doesNotMatch(handoffCommand.template, /## Handoff Draft/);
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
