import type {
  AssistantMessage,
  FilePart,
  Message,
  OpencodeClient,
  Part,
  PatchPart,
  StepFinishPart,
  TextPart,
  ToolPart,
} from "@opencode-ai/sdk/v2";

type SessionMessage = {
  info: Message;
  parts: Part[];
};

type SessionMetadata = {
  id: string;
  title: string;
  updatedAt: number;
};

type NormalizedTranscript = {
  session: SessionMetadata;
  messages: NormalizedMessage[];
};

type NormalizedMessage = {
  role: Message["role"];
  messageID: string;
  parentID?: string;
  synthetic: boolean;
  parts: NormalizedPart[];
};

type NormalizedPart =
  | {
      type: "text";
      synthetic: boolean;
      ignored: boolean;
      text: string;
    }
  | {
      type: "reasoning";
      text: string;
    }
  | {
      type: "tool";
      tool: string;
      status: ToolPart["state"]["status"];
      input: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      title?: string;
      output?: string;
      error?: string;
      attachments?: FilePart[];
    }
  | {
      type: "patch";
      files: string[];
    }
  | {
      type: "step-finish";
      reason: string;
    }
  | {
      type: "file";
      path?: string;
      synthetic: boolean;
    }
  | {
      type: "other";
      partType: Part["type"];
    };

type AssembledTurn = {
  userMessageID: string;
  userParts: NormalizedPart[];
  assistantMessages: AssembledAssistantMessage[];
  markers: string[];
};

type AssembledAssistantMessage = {
  messageID: string;
  parentID?: string;
  parts: NormalizedPart[];
  stepFinishReason?: string;
  markers: string[];
};

type ReducedTurn = {
  turnID: string;
  userMessageID: string;
  userText: string;
  userFlags: string[];
  assistantMessages: ReducedAssistantMessage[];
  markers: string[];
};

type ReducedAssistantMessage = {
  messageID: string;
  text?: string;
  toolLines: string[];
  patchFiles: string[];
  fileLines: string[];
  stepFinishReason?: string;
  markers: string[];
};

type ActivityIndex = {
  filesRead: string[];
  filesPatched: string[];
  commands: string[];
  questionsAnswered: string[];
  subtasks: string[];
};

type ReductionSummary = {
  reducedTurns: ReducedTurn[];
  omittedTurnCount: number;
  omittedContent: string[];
};

type BuildContextPackParams = {
  client: OpencodeClient;
  directory: string;
  sessionID: string;
};

export async function buildSessionContextPack({
  client,
  directory,
  sessionID,
}: BuildContextPackParams): Promise<string | null> {
  const [sessionResponse, messagesResponse] = await Promise.all([
    client.session.get({
      directory,
      sessionID,
    }),
    client.session.messages({
      directory,
      sessionID,
    }),
  ]);

  const session = sessionResponse.data;
  if (!session) {
    return null;
  }

  const normalized = normalizeTranscript({
    session: {
      id: session.id,
      title: session.title,
      updatedAt: session.time.updated,
    },
    messages: messagesResponse.data ?? [],
  });
  const assembledTurns = assembleTurns(normalized.messages);
  const reduction = reduceTurns(assembledTurns);
  const activityIndex = buildActivityIndex(reduction.reducedTurns);

  return renderContextPack({
    session: normalized.session,
    reducedTurns: reduction.reducedTurns,
    activityIndex,
    omittedContent: reduction.omittedContent,
    omittedTurnCount: reduction.omittedTurnCount,
    totalTurnCount: assembledTurns.length,
  });
}

export function normalizeTranscript(input: {
  session: SessionMetadata;
  messages: SessionMessage[];
}): NormalizedTranscript {
  return {
    session: input.session,
    messages: input.messages.map((message) => {
      const normalizedMessage: NormalizedMessage = {
        role: message.info.role,
        messageID: message.info.id,
        synthetic: message.parts.some(isSyntheticPart),
        parts: message.parts.map(normalizePart),
      };

      if (message.info.role === "assistant") {
        normalizedMessage.parentID = message.info.parentID;
      }

      return normalizedMessage;
    }),
  };
}

export function assembleTurns(messages: NormalizedMessage[]): AssembledTurn[] {
  const turns: AssembledTurn[] = [];
  const turnByUserMessageID = new Map<string, AssembledTurn>();

  for (const message of messages) {
    if (message.role === "user") {
      const turn: AssembledTurn = {
        userMessageID: message.messageID,
        userParts: message.parts,
        assistantMessages: [],
        markers: [],
      };
      turns.push(turn);
      turnByUserMessageID.set(message.messageID, turn);
      continue;
    }

    const assistantMessage = buildAssistantMessage(message);
    const parentTurn = message.parentID
      ? turnByUserMessageID.get(message.parentID)
      : undefined;

    if (parentTurn) {
      parentTurn.assistantMessages.push(assistantMessage);
      continue;
    }

    turns.push({
      userMessageID: `[missing-user:${message.parentID ?? "unknown"}]`,
      userParts: [],
      assistantMessages: [assistantMessage],
      markers: [
        message.parentID
          ? `orphan assistant message for parent ${message.parentID}`
          : "assistant message without parentID",
      ],
    });
  }

  return turns;
}

export function reduceTurns(turns: AssembledTurn[]): ReductionSummary {
  const omittedReasons = new Set<string>();
  const repeatedReadPaths = new Set<string>();
  const reducedTurns: ReducedTurn[] = [];
  let omittedTurnCount = 0;

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (!turn) {
      continue;
    }
    const reducedTurn = reduceTurn(
      turn,
      index + 1,
      omittedReasons,
      repeatedReadPaths,
    );

    if (shouldOmitTurn(reducedTurn)) {
      omittedTurnCount += 1;
      continue;
    }

    reducedTurns.push(reducedTurn);
  }

  return {
    reducedTurns,
    omittedTurnCount,
    omittedContent: sortStrings(Array.from(omittedReasons)),
  };
}

export function buildActivityIndex(turns: ReducedTurn[]): ActivityIndex {
  const filesRead = new Set<string>();
  const filesPatched = new Set<string>();
  const commands = new Set<string>();
  const questionsAnswered = new Set<string>();
  const subtasks = new Set<string>();

  for (const turn of turns) {
    for (const assistantMessage of turn.assistantMessages) {
      for (const toolLine of assistantMessage.toolLines) {
        if (toolLine.startsWith("read ")) {
          const path = extractFieldValue(toolLine, "filePath");
          if (path) filesRead.add(path);
        }
        if (toolLine.startsWith("bash ")) {
          const command = extractFieldValue(toolLine, "command");
          if (command) commands.add(command);
        }
        if (toolLine.startsWith("question ")) {
          const answers = extractFieldValue(toolLine, "answers");
          if (answers) questionsAnswered.add(answers);
        }
        if (toolLine.startsWith("task ")) {
          const description = extractFieldValue(toolLine, "description");
          const sessionID = extractFieldValue(toolLine, "sessionID");
          if (description || sessionID) {
            subtasks.add(
              sessionID
                ? `${description ?? "[unknown]"} (${sessionID})`
                : (description ?? "[unknown]"),
            );
          }
        }
      }

      for (const file of assistantMessage.patchFiles) {
        filesPatched.add(file);
      }
    }
  }

  return {
    filesRead: sortStrings(Array.from(filesRead)),
    filesPatched: sortStrings(Array.from(filesPatched)),
    commands: sortStrings(Array.from(commands)),
    questionsAnswered: sortStrings(Array.from(questionsAnswered)),
    subtasks: sortStrings(Array.from(subtasks)),
  };
}

export function renderContextPack(input: {
  session: SessionMetadata;
  reducedTurns: ReducedTurn[];
  activityIndex: ActivityIndex;
  omittedContent: string[];
  omittedTurnCount: number;
  totalTurnCount: number;
}): string {
  const lines = [
    "# Session Context Pack",
    "",
    "## Session",
    `- ID: ${input.session.id}`,
    `- Title: ${formatTitle(input.session.title)}`,
    `- Updated At: ${new Date(input.session.updatedAt).toISOString()}`,
    "",
    "## Transcript Skeleton",
    "",
  ];

  if (input.reducedTurns.length === 0) {
    lines.push("[no included turns]", "");
  }

  for (const turn of input.reducedTurns) {
    lines.push(`### Turn ${turn.turnID}`);
    lines.push(`- User Message: ${turn.userMessageID}`);
    lines.push(`- User Text: ${turn.userText}`);
    lines.push(`- User Flags: ${turn.userFlags.join(", ")}`);
    if (turn.markers.length > 0) {
      lines.push(`- Turn Markers: ${turn.markers.join(", ")}`);
    }
    lines.push("- Assistant Messages:");

    if (turn.assistantMessages.length === 0) {
      lines.push("  - [none]");
    }

    for (const assistantMessage of turn.assistantMessages) {
      lines.push(`  - ${assistantMessage.messageID}`);
      if (assistantMessage.text) {
        lines.push(`    - Text: ${assistantMessage.text}`);
      }
      for (const toolLine of assistantMessage.toolLines) {
        lines.push(`    - Tool: ${toolLine}`);
      }
      if (assistantMessage.patchFiles.length > 0) {
        lines.push(
          `    - Patch Files: ${assistantMessage.patchFiles.join(", ")}`,
        );
      }
      for (const fileLine of assistantMessage.fileLines) {
        lines.push(`    - File: ${fileLine}`);
      }
      if (assistantMessage.stepFinishReason) {
        lines.push(`    - Step Finish: ${assistantMessage.stepFinishReason}`);
      }
      if (assistantMessage.markers.length > 0) {
        lines.push(`    - Markers: ${assistantMessage.markers.join(", ")}`);
      }
    }

    lines.push("");
  }

  lines.push("## Activity Index");
  lines.push(renderIndexLine("Files Read", input.activityIndex.filesRead));
  lines.push(
    renderIndexLine("Files Patched", input.activityIndex.filesPatched),
  );
  lines.push(renderIndexLine("Commands", input.activityIndex.commands));
  lines.push(
    renderIndexLine(
      "Questions Answered",
      input.activityIndex.questionsAnswered,
    ),
  );
  lines.push(renderIndexLine("Subtasks", input.activityIndex.subtasks));
  lines.push("");

  lines.push("## Omitted Content");
  if (input.omittedContent.length === 0) {
    lines.push("- [none]");
  } else {
    for (const item of input.omittedContent) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");

  lines.push("## Pack Coverage");
  lines.push(`- Source Session: ${input.session.id}`);
  lines.push(`- Included Turns: ${input.reducedTurns.length}`);
  lines.push(`- Omitted Turns: ${input.omittedTurnCount}`);
  lines.push(
    `- Coverage Mode: ${input.omittedTurnCount > 0 ? "selective" : "full"}`,
  );
  lines.push(
    `- Omission Policy: ${
      input.omittedTurnCount > 0
        ? "type-based reduction with selective turn omission"
        : "type-based reduction"
    }`,
  );
  lines.push(`- Source Turns: ${input.totalTurnCount}`);

  return lines.join("\n");
}

function normalizePart(part: Part): NormalizedPart {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        synthetic: part.synthetic ?? false,
        ignored: part.ignored ?? false,
        text: part.text,
      };
    case "reasoning":
      return {
        type: "reasoning",
        text: part.text,
      };
    case "tool":
      return buildNormalizedToolPart(part);
    case "patch":
      return {
        type: "patch",
        files: part.files,
      };
    case "step-finish":
      return {
        type: "step-finish",
        reason: part.reason,
      };
    case "file": {
      const normalizedPart: Extract<NormalizedPart, { type: "file" }> = {
        type: "file",
        synthetic: false,
      };

      const path = getFileSourcePath(part);
      if (path) {
        normalizedPart.path = path;
      }

      return normalizedPart;
    }
    default:
      return {
        type: "other",
        partType: part.type,
      };
  }
}

function buildNormalizedToolPart(
  part: ToolPart,
): Extract<NormalizedPart, { type: "tool" }> {
  const normalizedPart: Extract<NormalizedPart, { type: "tool" }> = {
    type: "tool",
    tool: part.tool,
    status: part.state.status,
    input: part.state.input,
  };

  const metadata = getToolStateMetadata(part.state);
  if (metadata) {
    normalizedPart.metadata = metadata;
  }

  const title = getToolStateTitle(part.state);
  if (title) {
    normalizedPart.title = title;
  }

  const output = getToolStateOutput(part.state);
  if (output) {
    normalizedPart.output = output;
  }

  const error = getToolStateError(part.state);
  if (error) {
    normalizedPart.error = error;
  }

  if (part.state.status === "completed" && part.state.attachments) {
    normalizedPart.attachments = part.state.attachments;
  }

  return normalizedPart;
}

function buildAssistantMessage(
  message: NormalizedMessage,
): AssembledAssistantMessage {
  const assistantMessage: AssembledAssistantMessage = {
    messageID: message.messageID,
    parts: message.parts,
    markers: [],
  };

  if (message.parentID) {
    assistantMessage.parentID = message.parentID;
  }

  const stepFinishReason = getStepFinishReason(message.parts);
  if (stepFinishReason) {
    assistantMessage.stepFinishReason = stepFinishReason;
  }

  return assistantMessage;
}

function reduceTurn(
  turn: AssembledTurn,
  turnNumber: number,
  omittedReasons: Set<string>,
  repeatedReadPaths: Set<string>,
): ReducedTurn {
  const userFlags = new Set<string>();
  const markers = [...turn.markers];
  const userTexts: string[] = [];

  if (turn.userParts.length === 0) {
    userTexts.push("[missing user message]");
    userFlags.add("synthetic=false");
  }

  for (const part of turn.userParts) {
    if (part.type === "text") {
      if (part.synthetic) {
        omittedReasons.add(classifySyntheticOmission(part.text));
        continue;
      }

      userFlags.add("synthetic=false");
      if (part.text.includes("@@ses_")) {
        userFlags.add("contains-reference=true");
      }

      if (isTemplateHeavyText(part.text)) {
        userFlags.add("template-heavy=true");
        userTexts.push("[template body omitted]");
        omittedReasons.add("[document omitted]");
        continue;
      }

      const preview = summarizeText(part.text, 240);
      if (preview) {
        userTexts.push(preview);
      }
      continue;
    }

    if (part.type === "file") {
      userFlags.add("contains-file-part=true");
      continue;
    }
  }

  if (!userFlags.has("synthetic=false")) {
    userFlags.add("synthetic=true");
  }

  const assistantMessages = turn.assistantMessages.map((message) =>
    reduceAssistantMessage(message, omittedReasons, repeatedReadPaths),
  );

  return {
    turnID: `T${turnNumber}`,
    userMessageID: turn.userMessageID,
    userText:
      userTexts.length > 0
        ? dedupePreserveOrder(userTexts).join(" / ")
        : "[omitted]",
    userFlags: sortStrings(Array.from(userFlags)),
    assistantMessages,
    markers,
  };
}

function reduceAssistantMessage(
  message: AssembledAssistantMessage,
  omittedReasons: Set<string>,
  repeatedReadPaths: Set<string>,
): ReducedAssistantMessage {
  const textLines: string[] = [];
  const toolLines: string[] = [];
  const patchFiles = new Set<string>();
  const fileLines = new Set<string>();
  const markers = [...message.markers];

  for (const part of message.parts) {
    switch (part.type) {
      case "text": {
        if (part.synthetic) {
          omittedReasons.add(classifySyntheticOmission(part.text));
          continue;
        }

        const preview = summarizeText(part.text, 220);
        if (preview && !isPureTransitionText(preview)) {
          textLines.push(preview);
        }
        break;
      }
      case "reasoning": {
        omittedReasons.add("[reasoning omitted]");
        break;
      }
      case "tool": {
        const summary = summarizeTool(part, omittedReasons, repeatedReadPaths);
        if (summary) {
          toolLines.push(summary);
        }
        break;
      }
      case "patch": {
        for (const file of part.files) {
          patchFiles.add(file);
        }
        break;
      }
      case "file": {
        fileLines.add(part.path ?? "[unknown]");
        break;
      }
      case "other": {
        markers.push(`contains ${part.partType}`);
        break;
      }
      default:
        break;
    }
  }

  const reducedAssistantMessage: ReducedAssistantMessage = {
    messageID: message.messageID,
    toolLines: dedupePreserveOrder(toolLines),
    patchFiles: sortStrings(Array.from(patchFiles)),
    fileLines: sortStrings(Array.from(fileLines)),
    markers,
  };

  if (textLines.length > 0) {
    reducedAssistantMessage.text = dedupePreserveOrder(textLines).join(" / ");
  }

  if (message.stepFinishReason) {
    reducedAssistantMessage.stepFinishReason = message.stepFinishReason;
  }

  return reducedAssistantMessage;
}

function shouldOmitTurn(turn: ReducedTurn): boolean {
  if (turn.markers.length > 0) {
    return false;
  }

  const hasUserSignal = turn.userText !== "[omitted]";
  if (hasUserSignal) {
    return false;
  }

  return !turn.assistantMessages.some(
    (message) =>
      Boolean(message.text) ||
      message.toolLines.length > 0 ||
      message.patchFiles.length > 0 ||
      message.fileLines.length > 0 ||
      message.markers.length > 0,
  );
}

function summarizeTool(
  part: Extract<NormalizedPart, { type: "tool" }>,
  omittedReasons: Set<string>,
  repeatedReadPaths: Set<string>,
): string {
  const fields: string[] = [];
  const input = part.input;

  switch (part.tool) {
    case "read": {
      const filePath = getString(input.filePath) ?? getString(input.path);
      if (filePath) {
        fields.push(`filePath=${filePath}`);
        if (repeatedReadPaths.has(filePath)) {
          omittedReasons.add("[repeated file read omitted]");
        }
        repeatedReadPaths.add(filePath);
      }

      const loaded = getBoolean(part.metadata?.loaded);
      const truncated = getBoolean(part.metadata?.truncated);
      if (loaded !== undefined) fields.push(`loaded=${loaded}`);
      if (truncated !== undefined) fields.push(`truncated=${truncated}`);
      if (part.output) omittedReasons.add("[tool output truncated]");
      break;
    }
    case "bash": {
      const command = getString(input.command);
      const workdir = getString(input.workdir);
      const exit = getNumber(part.metadata?.exit);
      if (command) fields.push(`command=${summarizeText(command, 120)}`);
      if (workdir) fields.push(`workdir=${workdir}`);
      if (exit !== undefined) fields.push(`exit=${exit}`);
      if (part.output) omittedReasons.add("[tool output truncated]");
      break;
    }
    case "glob":
    case "grep": {
      const pattern = getString(input.pattern);
      const path = getString(input.path);
      const matchCount = getNumber(part.metadata?.matchCount);
      if (pattern) fields.push(`pattern=${pattern}`);
      if (path) fields.push(`path=${path}`);
      if (matchCount !== undefined) fields.push(`matchCount=${matchCount}`);
      break;
    }
    case "webfetch": {
      const url = getString(input.url);
      const format = getString(input.format);
      if (url) fields.push(`url=${url}`);
      if (format) fields.push(`format=${format}`);
      if (part.output) omittedReasons.add("[tool output truncated]");
      break;
    }
    case "skill": {
      const name = getString(input.name) ?? getString(part.metadata?.name);
      if (name) fields.push(`name=${name}`);
      omittedReasons.add("[skill output omitted]");
      break;
    }
    case "todowrite": {
      const todos =
        getTodoCount(input.todos) ?? getTodoCount(part.metadata?.todos);
      if (todos !== undefined) fields.push(`todos=${todos}`);
      break;
    }
    case "question": {
      const questionCount = getArrayLength(input.questions);
      const answers = formatAnswers(part.metadata?.answers);
      if (questionCount !== undefined)
        fields.push(`questions=${questionCount}`);
      if (answers) fields.push(`answers=${answers}`);
      break;
    }
    case "task": {
      const description = getString(input.description);
      const subagentType = getString(input.subagent_type);
      const sessionID = getString(part.metadata?.sessionId);
      if (description) {
        fields.push(`description=${summarizeText(description, 80)}`);
      }
      if (subagentType) fields.push(`subagent=${subagentType}`);
      if (sessionID) fields.push(`sessionID=${sessionID}`);
      break;
    }
    case "apply_patch": {
      fields.push(`status=${part.status}`);
      break;
    }
    default: {
      if (part.title) fields.push(`title=${summarizeText(part.title, 80)}`);
      if (part.error) fields.push(`error=${summarizeText(part.error, 80)}`);
      if (part.output) omittedReasons.add("[tool output truncated]");
      break;
    }
  }

  if (part.status === "error" && part.error) {
    fields.push(`error=${summarizeText(part.error, 120)}`);
  }

  return [part.tool, ...fields].join(" ").trim();
}

function getStepFinishReason(parts: NormalizedPart[]): string | undefined {
  for (const part of parts) {
    if (part.type === "step-finish") {
      return part.reason;
    }
  }

  return undefined;
}

function isSyntheticPart(part: Part): boolean {
  return part.type === "text" && (part.synthetic ?? false);
}

function classifySyntheticOmission(text: string): string {
  if (
    text.includes("[Session Reference]") ||
    text.includes("# Session Context Pack")
  ) {
    return "[session reference injection omitted]";
  }

  if (
    text.includes("Called the Read tool") ||
    (text.includes("<path>") && text.includes("<content>"))
  ) {
    return "[synthetic read injection omitted]";
  }

  return "[synthetic content omitted]";
}

function isTemplateHeavyText(text: string): boolean {
  return (
    text.length >= 1200 ||
    text.includes("Implement tasks from an OpenSpec change") ||
    text.includes("Enter explore mode") ||
    text.includes("## Handoff Draft") ||
    text.includes("### 当前任务背景")
  );
}

function isPureTransitionText(text: string): boolean {
  const normalized = text.trim();
  return (
    normalized === "" ||
    normalized === "我会先看一下。" ||
    normalized === "我先检查一下。"
  );
}

function summarizeText(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }
  if (collapsed.length <= limit) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, limit - 3))}...`;
}

function renderIndexLine(label: string, values: string[]): string {
  return `- ${label}: ${values.length > 0 ? values.join(", ") : "[none]"}`;
}

function formatTitle(value: string): string {
  const title = value.trim();
  return title || "[unknown]";
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function extractFieldValue(line: string, key: string): string | undefined {
  const match = line.match(
    new RegExp(`${escapeRegExp(key)}=(.+?)(?= [A-Za-z][A-Za-z0-9_]*=|$)`),
  );
  return match?.[1]?.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getToolStateMetadata(
  state: ToolPart["state"],
): Record<string, unknown> | undefined {
  if ("metadata" in state && state.metadata) {
    return state.metadata;
  }

  return undefined;
}

function getToolStateTitle(state: ToolPart["state"]): string | undefined {
  if ("title" in state && typeof state.title === "string") {
    return state.title;
  }

  return undefined;
}

function getToolStateOutput(state: ToolPart["state"]): string | undefined {
  if ("output" in state && typeof state.output === "string") {
    return state.output;
  }

  return undefined;
}

function getToolStateError(state: ToolPart["state"]): string | undefined {
  if ("error" in state && typeof state.error === "string") {
    return state.error;
  }

  return undefined;
}

function getFileSourcePath(part: FilePart): string | undefined {
  const source = part.source;
  if (!source) {
    return part.filename;
  }

  switch (source.type) {
    case "file":
    case "symbol":
      return source.path;
    case "resource":
      return source.uri;
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getArrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function getTodoCount(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function formatAnswers(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const answers = value.filter(
    (item): item is string => typeof item === "string",
  );
  if (answers.length === 0) {
    return undefined;
  }

  return `[${answers.join(", ")}]`;
}
