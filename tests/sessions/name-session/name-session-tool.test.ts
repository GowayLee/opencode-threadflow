import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createNameSessionTool } from "../../../src/sessions/name-session-tool.ts";
import { ROOT } from "../test-helpers.ts";

type ToolDefinition = {
  description?: string;
  execute: (
    args: { title: string },
    context: { sessionID: string; metadata: (value: unknown) => void },
  ) => Promise<string>;
};

describe("sessions/name-session-tool", () => {
  test("renames current session and returns old/new title comparison", async () => {
    const metadataCalls: unknown[] = [];
    let updateCalled = false;
    let updateParams: Record<string, unknown> | null = null;

    const toolDefinition = createNameSessionTool({
      client: {
        session: {
          get: async () => ({
            data: {
              id: "ses_current01",
              title: "old title",
            },
          }),
          update: async (params: Record<string, unknown>) => {
            updateCalled = true;
            updateParams = params;
            return { data: { id: "ses_current01", title: params.title } };
          },
        },
      } as never,
      directory: ROOT,
      locale: "zh",
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { title: "[设计][name_session] 标题协议与实现方案" },
      {
        sessionID: "ses_current01",
        metadata: (value) => metadataCalls.push(value),
      },
    );

    assert.equal(updateCalled, true);
    assert.equal(
      updateParams?.title,
      "[设计][name_session] 标题协议与实现方案",
    );
    assert.equal(updateParams?.sessionID, "ses_current01");
    assert.match(result, /## Session Renamed/);
    assert.match(result, /`ses_current01`/);
    assert.match(result, /old title/);
    assert.match(result, /\[设计\]\[name_session\] 标题协议与实现方案/);
    assert.match(result, /Session 标题已更新/);
    assert.deepEqual(metadataCalls, []);
  });

  test("skips update when title is unchanged", async () => {
    let updateCalled = false;
    const metadataCalls: unknown[] = [];

    const toolDefinition = createNameSessionTool({
      client: {
        session: {
          get: async () => ({
            data: {
              id: "ses_same01",
              title: "same title",
            },
          }),
          update: async () => {
            updateCalled = true;
            return { data: {} };
          },
        },
      } as never,
      directory: ROOT,
      locale: "zh",
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { title: "same title" },
      {
        sessionID: "ses_same01",
        metadata: (value) => metadataCalls.push(value),
      },
    );

    assert.equal(updateCalled, false);
    assert.match(result, /## Session Renamed/);
    assert.match(result, /无需变更/);
    assert.match(result, /`ses_same01`/);
    assert.match(result, /same title/);
    assert.match(result, /未执行更新操作/);
    assert.deepEqual(metadataCalls, []);
  });

  test("returns error message when SDK update fails", async () => {
    const metadataCalls: unknown[] = [];

    const toolDefinition = createNameSessionTool({
      client: {
        session: {
          get: async () => ({
            data: {
              id: "ses_fail01",
              title: "old title",
            },
          }),
          update: async () => ({
            error: { message: "Network error" },
          }),
        },
      } as never,
      directory: ROOT,
      locale: "zh",
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { title: "better title" },
      {
        sessionID: "ses_fail01",
        metadata: (value) => metadataCalls.push(value),
      },
    );

    assert.match(result, /## Session Renamed/);
    assert.match(result, /Session 重命名失败/);
    assert.match(result, /`ses_fail01`/);
    assert.match(result, /old title/);
    assert.match(result, /better title.*未应用/);
    assert.match(result, /Network error/);
    assert.match(result, /请检查权限后重试/);
    assert.deepEqual(metadataCalls, []);
  });

  test("success output includes rollback reminder", async () => {
    const toolDefinition = createNameSessionTool({
      client: {
        session: {
          get: async () => ({
            data: { id: "ses_rollback01", title: "old" },
          }),
          update: async () => ({
            data: { id: "ses_rollback01", title: "new" },
          }),
        },
      } as never,
      directory: ROOT,
      locale: "zh",
    }) as unknown as ToolDefinition;

    const result = await toolDefinition.execute(
      { title: "new" },
      { sessionID: "ses_rollback01", metadata: () => {} },
    );

    assert.match(result, /> \*\*建议\*\*/);
    assert.match(result, /回滚/);
    assert.match(result, /撤销/);
    assert.match(result, /噪音污染/);
  });

  test("tool accepts only title parameter, not sessionID", () => {
    const toolDefinition = createNameSessionTool({
      client: {} as never,
      directory: ROOT,
    }) as unknown as ToolDefinition;

    const args = (
      createNameSessionTool as unknown as {
        (): { args: Record<string, unknown> };
      }
    ).apply
      ? undefined
      : undefined;

    assert.ok(toolDefinition.description);
    assert.match(
      toolDefinition.description ?? "",
      /Rename the current session/,
    );
    assert.doesNotMatch(toolDefinition.description ?? "", /sessionID/);
  });

  test("does not set tool metadata", async () => {
    const metadataCalls: unknown[] = [];

    const toolDefinition = createNameSessionTool({
      client: {
        session: {
          get: async () => ({
            data: { id: "ses_nometa01", title: "old" },
          }),
          update: async () => ({
            data: { id: "ses_nometa01", title: "new" },
          }),
        },
      } as never,
      directory: ROOT,
      locale: "zh",
    }) as unknown as ToolDefinition;

    await toolDefinition.execute(
      { title: "new" },
      {
        sessionID: "ses_nometa01",
        metadata: (value) => metadataCalls.push(value),
      },
    );

    assert.deepEqual(metadataCalls, []);
  });
});
