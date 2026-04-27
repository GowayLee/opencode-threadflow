import type {
  FilePart,
  Message,
  OpencodeClient,
  Part,
  ToolPart,
} from "@opencode-ai/sdk/v2";
import type { Locale } from "../i18n/types";
import { t } from "../i18n";

const INJECTION_TEXT_LIMIT = 300;

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
  markers: string[];
};

type TranscriptEntry = {
  role: "user" | "assistant";
  kind: "message" | "file-context";
  synthetic: boolean;
  truncated: boolean;
  preserveNewlines: boolean;
  content: string;
};

type ActivityRecord =
  | {
      kind: "read";
      files: string[];
    }
  | {
      kind: "command";
      commands: string[];
    }
  | {
      kind: "patch";
      files: string[];
    }
  | {
      kind: "question";
      answers: string[];
      questionCount?: number;
    }
  | {
      kind: "subtask";
      items: string[];
    };

type CompressedAssistantMessage = {
  entries: TranscriptEntry[];
  activity: ActivityRecord[];
  markers: string[];
};

type CompressedTurn = {
  turnID: string;
  userEntries: TranscriptEntry[];
  assistantMessages: CompressedAssistantMessage[];
  markers: string[];
};

type PreviewMessage = {
  role: "user" | "assistant";
  content: string;
};

type PreviewTurn = {
  turnID: string;
  originalIndex: number;
  messages: PreviewMessage[];
};

type PreviewSelection = {
  effectiveTurns: PreviewTurn[];
  selectedTurns: PreviewTurn[];
};

type ActivityIndex = {
  filesRead: string[];
  filesPatched: string[];
  commands: string[];
  questionsAnswered: string[];
  subtasks: string[];
};

type ReductionSummary = {
  compressedTurns: CompressedTurn[];
  reducedTurns: CompressedTurn[];
  omittedTurnCount: number;
  compressedContent: string[];
  omittedContent: string[];
};

type BuildContextPackParams = {
  client: OpencodeClient;
  directory: string;
  sessionID: string;
  locale: Locale;
};

export async function buildSessionContextPack({
  client,
  directory,
  sessionID,
  locale,
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
  const activityIndex = buildActivityIndex(reduction.compressedTurns);

  return renderContextPack({
    locale,
    session: normalized.session,
    compressedTurns: reduction.compressedTurns,
    activitySummary: activityIndex,
    compressedContent: reduction.compressedContent,
  });
}

export async function buildSessionPreviewPack({
  client,
  directory,
  sessionID,
  locale,
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
  const previewSelection = selectPreviewTurns(assembledTurns);

  return renderPreviewPack({
    locale,
    session: normalized.session,
    effectiveTurns: previewSelection.effectiveTurns,
    selectedTurns: previewSelection.selectedTurns,
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
  const compressedContent = new Set<string>();
  const repeatedReadPaths = new Set<string>();
  const compressedTurns: CompressedTurn[] = [];
  let omittedTurnCount = 0;

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (!turn) {
      continue;
    }

    const compressedTurn = compressTurn({
      turn,
      turnNumber: index + 1,
      compressedContent,
      repeatedReadPaths,
    });

    if (!shouldIncludeTurn(compressedTurn)) {
      omittedTurnCount += 1;
      continue;
    }

    compressedTurns.push(compressedTurn);
  }

  const compressedMarkers = sortStrings(Array.from(compressedContent));

  return {
    compressedTurns,
    reducedTurns: compressedTurns,
    omittedTurnCount,
    compressedContent: compressedMarkers,
    omittedContent: compressedMarkers,
  };
}

export function buildActivityIndex(turns: CompressedTurn[]): ActivityIndex {
  const filesRead = new Set<string>();
  const filesPatched = new Set<string>();
  const commands = new Set<string>();
  const questionsAnswered = new Set<string>();
  const subtasks = new Set<string>();

  for (const turn of turns) {
    for (const assistantMessage of turn.assistantMessages) {
      for (const activity of assistantMessage.activity) {
        switch (activity.kind) {
          case "read":
            for (const file of activity.files) {
              filesRead.add(file);
            }
            break;
          case "patch":
            for (const file of activity.files) {
              filesPatched.add(file);
            }
            break;
          case "command":
            for (const command of activity.commands) {
              commands.add(command);
            }
            break;
          case "question":
            if (activity.answers.length > 0) {
              for (const answer of activity.answers) {
                questionsAnswered.add(answer);
              }
              break;
            }
            if (activity.questionCount !== undefined) {
              questionsAnswered.add(
                `${activity.questionCount} question${pluralize(activity.questionCount)}`,
              );
            }
            break;
          case "subtask":
            for (const item of activity.items) {
              subtasks.add(item);
            }
            break;
        }
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
  locale: Locale;
  session: SessionMetadata;
  compressedTurns?: CompressedTurn[];
  reducedTurns?: CompressedTurn[];
  activitySummary?: ActivityIndex;
  activityIndex?: ActivityIndex;
  compressedContent?: string[];
  omittedContent?: string[];
}): string {
  const { locale, session } = input;
  const compressedTurns = input.compressedTurns ?? input.reducedTurns ?? [];
  const activitySummary = input.activitySummary ??
    input.activityIndex ?? {
      filesRead: [],
      filesPatched: [],
      commands: [],
      questionsAnswered: [],
      subtasks: [],
    };
  const compressedContent =
    input.compressedContent ?? input.omittedContent ?? [];

  const lines = [
    "# Session Context Pack",
    "",
    "## Session",
    `- Title: ${formatTitle(locale, session.title)}`,
    `- Updated At: ${new Date(session.updatedAt).toISOString()}`,
    "",
    "## Transcript",
    "",
  ];

  if (compressedTurns.length === 0) {
    lines.push(t(locale, "render.no_included_turns"), "");
  }

  for (const turn of compressedTurns) {
    lines.push(`### Turn ${turn.turnID}`);

    if (turn.markers.length > 0) {
      lines.push(`- Notes: ${turn.markers.join("; ")}`);
    }

    for (const entry of turn.userEntries) {
      lines.push(...renderTranscriptEntry(locale, entry));
    }

    for (const assistantMessage of turn.assistantMessages) {
      for (const entry of assistantMessage.entries) {
        lines.push(...renderTranscriptEntry(locale, entry));
      }

      if (assistantMessage.activity.length > 0) {
        lines.push(`- ${t(locale, "render.assistant_activity")}:`);
        lines.push(
          ...renderActivityRecords(locale, assistantMessage.activity, 1),
        );
      }

      if (assistantMessage.markers.length > 0) {
        lines.push(`- Assistant Notes: ${assistantMessage.markers.join("; ")}`);
      }
    }

    lines.push("");
  }

  lines.push("## Activity", "");

  const activitySections = renderActivitySections(locale, activitySummary);
  if (activitySections.length === 0) {
    lines.push(`- ${t(locale, "render.none")}`, "");
  } else {
    lines.push(...activitySections, "");
  }

  lines.push("## Compressed Content");
  if (compressedContent.length === 0) {
    lines.push(`- ${t(locale, "render.none")}`);
  } else {
    for (const item of compressedContent) {
      lines.push(`- ${localizeRenderTokens(locale, item)}`);
    }
  }

  return lines.join("\n");
}

function selectPreviewTurns(turns: AssembledTurn[]): PreviewSelection {
  const effectiveTurns = turns
    .map((turn, index): PreviewTurn | null => {
      const messages = extractPreviewMessages(turn);
      if (messages.length === 0) {
        return null;
      }

      return {
        turnID: `T${index + 1}`,
        originalIndex: index,
        messages,
      };
    })
    .filter((turn): turn is PreviewTurn => turn !== null);

  const selectedIndexes = new Set<number>();
  for (const turn of effectiveTurns.slice(0, 2)) {
    selectedIndexes.add(turn.originalIndex);
  }
  for (const turn of effectiveTurns.slice(-3)) {
    selectedIndexes.add(turn.originalIndex);
  }

  return {
    effectiveTurns,
    selectedTurns: effectiveTurns.filter((turn) =>
      selectedIndexes.has(turn.originalIndex),
    ),
  };
}

function extractPreviewMessages(turn: AssembledTurn): PreviewMessage[] {
  return [
    ...extractPreviewMessagesFromParts("user", turn.userParts),
    ...turn.assistantMessages.flatMap((message) =>
      extractPreviewMessagesFromParts("assistant", message.parts),
    ),
  ];
}

function extractPreviewMessagesFromParts(
  role: "user" | "assistant",
  parts: NormalizedPart[],
): PreviewMessage[] {
  const messages: PreviewMessage[] = [];

  for (const part of parts) {
    if (part.type !== "text" || part.synthetic || part.ignored) {
      continue;
    }

    const content = normalizeInlineText(part.text);
    if (!content) {
      continue;
    }

    messages.push({ role, content });
  }

  return messages;
}

function renderPreviewPack(input: {
  locale: Locale;
  session: SessionMetadata;
  effectiveTurns: PreviewTurn[];
  selectedTurns: PreviewTurn[];
}): string {
  const { locale } = input;
  const lines = [
    "# Session Context Preview",
    "",
    "## Session",
    `- Title: ${formatTitle(locale, input.session.title)}`,
    `- Session ID: ${input.session.id}`,
    `- Updated At: ${new Date(input.session.updatedAt).toISOString()}`,
    "",
    "## Transcript Preview",
    "",
  ];

  if (input.selectedTurns.length === 0) {
    lines.push(t(locale, "render.no_previewable_turns"), "");
  }

  for (let index = 0; index < input.selectedTurns.length; index += 1) {
    const previousTurn = input.selectedTurns[index - 1];
    const currentTurn = input.selectedTurns[index];
    if (!currentTurn) {
      continue;
    }

    if (previousTurn) {
      const omittedCount = countOmittedEffectiveTurnsBetween({
        effectiveTurns: input.effectiveTurns,
        startIndex: previousTurn.originalIndex,
        endIndex: currentTurn.originalIndex,
      });

      if (omittedCount > 0) {
        lines.push(
          t(locale, "render.middle_turns_omitted", {
            count: String(omittedCount),
            plural: pluralize(omittedCount),
          }),
          "",
        );
      }
    }

    lines.push(`### Turn ${currentTurn.turnID}`);
    for (const message of currentTurn.messages) {
      lines.push(...renderPreviewMessage(locale, message));
    }
    lines.push("");
  }

  lines.push(
    t(locale, "render.preview_notice_title"),
    "",
    t(locale, "render.preview_notice_line"),
    t(locale, "render.preview_notice_read_full", {
      sessionID: input.session.id,
    }),
  );

  return lines.join("\n");
}

function countOmittedEffectiveTurnsBetween(input: {
  effectiveTurns: PreviewTurn[];
  startIndex: number;
  endIndex: number;
}): number {
  return input.effectiveTurns.filter(
    (turn) =>
      turn.originalIndex > input.startIndex &&
      turn.originalIndex < input.endIndex,
  ).length;
}

function renderPreviewMessage(
  locale: Locale,
  message: PreviewMessage,
): string[] {
  const label = t(locale, `render.role.${message.role}`);

  if (message.content.includes("\n")) {
    return [`- ${label}:`, ...indentLines(message.content.split("\n"), 1)];
  }

  return [`- ${label}: ${message.content}`];
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

  return assistantMessage;
}

function compressTurn(input: {
  turn: AssembledTurn;
  turnNumber: number;
  compressedContent: Set<string>;
  repeatedReadPaths: Set<string>;
}): CompressedTurn {
  return {
    turnID: `T${input.turnNumber}`,
    userEntries: dedupeEntries(
      compressUserParts(input.turn.userParts, input.compressedContent),
    ),
    assistantMessages: input.turn.assistantMessages.map((message) =>
      compressAssistantMessage({
        message,
        compressedContent: input.compressedContent,
        repeatedReadPaths: input.repeatedReadPaths,
      }),
    ),
    markers: dedupePreserveOrder(input.turn.markers),
  };
}

function compressUserParts(
  parts: NormalizedPart[],
  compressedContent: Set<string>,
): TranscriptEntry[] {
  if (parts.length === 0) {
    return [
      {
        role: "user",
        kind: "message",
        synthetic: false,
        truncated: false,
        preserveNewlines: false,
        content: "[missing user message]",
      },
    ];
  }

  const entries: TranscriptEntry[] = [];

  for (const part of parts) {
    switch (part.type) {
      case "text": {
        const entry = compressTextEntry({
          role: "user",
          text: part.text,
          synthetic: part.synthetic,
          compressedContent,
        });
        if (entry) {
          entries.push(entry);
        }
        break;
      }
      case "file": {
        entries.push(buildFileReferenceEntry("user", part.path));
        break;
      }
      case "reasoning":
        compressedContent.add("[reasoning omitted]");
        break;
      default:
        break;
    }
  }

  return entries;
}

function compressAssistantMessage(input: {
  message: AssembledAssistantMessage;
  compressedContent: Set<string>;
  repeatedReadPaths: Set<string>;
}): CompressedAssistantMessage {
  const entries: TranscriptEntry[] = [];
  const activity: ActivityRecord[] = [];
  const markers = [...input.message.markers];

  for (const part of input.message.parts) {
    switch (part.type) {
      case "text": {
        const entry = compressTextEntry({
          role: "assistant",
          text: part.text,
          synthetic: part.synthetic,
          compressedContent: input.compressedContent,
        });
        if (entry) {
          entries.push(entry);
        }
        break;
      }
      case "reasoning": {
        input.compressedContent.add("[reasoning omitted]");
        break;
      }
      case "tool": {
        activity.push(
          ...summarizeToolActivity({
            part,
            compressedContent: input.compressedContent,
            repeatedReadPaths: input.repeatedReadPaths,
          }),
        );
        break;
      }
      case "patch": {
        const files = sortStrings(dedupePreserveOrder(part.files));
        if (files.length > 0) {
          activity.push({
            kind: "patch",
            files,
          });
        }
        break;
      }
      case "file": {
        entries.push(buildFileReferenceEntry("assistant", part.path));
        break;
      }
      case "other": {
        break;
      }
      default:
        break;
    }
  }

  return {
    entries: dedupeEntries(entries),
    activity: mergeActivities(activity),
    markers: dedupePreserveOrder(markers),
  };
}

function summarizeToolActivity(input: {
  part: Extract<NormalizedPart, { type: "tool" }>;
  compressedContent: Set<string>;
  repeatedReadPaths: Set<string>;
}): ActivityRecord[] {
  const activity: ActivityRecord[] = [];
  const toolInput = input.part.input;

  switch (input.part.tool) {
    case "read": {
      const filePath =
        getString(toolInput.filePath) ?? getString(toolInput.path);
      if (filePath) {
        if (input.repeatedReadPaths.has(filePath)) {
          input.compressedContent.add("[repeated file read omitted]");
        }
        input.repeatedReadPaths.add(filePath);
        activity.push({
          kind: "read",
          files: [filePath],
        });
      }
      if (input.part.output) {
        input.compressedContent.add("[tool output truncated]");
      }
      break;
    }
    case "bash": {
      const command = normalizeInlineText(getString(toolInput.command) ?? "");
      if (command) {
        activity.push({
          kind: "command",
          commands: [command],
        });
      }
      if (input.part.output) {
        input.compressedContent.add("[tool output truncated]");
      }
      break;
    }
    case "question": {
      const answers = getAnswers(input.part.metadata?.answers);
      const questionCount = getArrayLength(toolInput.questions);
      if (answers.length > 0 || questionCount !== undefined) {
        const questionActivity: Extract<ActivityRecord, { kind: "question" }> =
          {
            kind: "question",
            answers,
          };
        if (questionCount !== undefined) {
          questionActivity.questionCount = questionCount;
        }
        activity.push(questionActivity);
      }
      break;
    }
    case "task": {
      const description =
        normalizeInlineText(getString(toolInput.description) ?? "") ||
        "[unknown subtask]";
      const sessionID = getString(input.part.metadata?.sessionId);
      activity.push({
        kind: "subtask",
        items: [sessionID ? `${description} (${sessionID})` : description],
      });
      break;
    }
    case "apply_patch": {
      const files = extractPatchFiles(getString(toolInput.patchText) ?? "");
      if (files.length > 0) {
        activity.push({
          kind: "patch",
          files,
        });
      }
      break;
    }
    default: {
      if (input.part.output) {
        input.compressedContent.add("[tool output truncated]");
      }
      break;
    }
  }

  if (input.part.status === "error" && input.part.error) {
    input.compressedContent.add("[tool output truncated]");
  }

  return activity;
}

function compressTextEntry(input: {
  role: "user" | "assistant";
  text: string;
  synthetic: boolean;
  compressedContent: Set<string>;
}): TranscriptEntry | null {
  if (input.synthetic) {
    const isFileContext = looksLikeFileContext(input.text);
    const prepared = isFileContext
      ? normalizeMultilineText(input.text)
      : normalizeSyntheticText(input.text);

    if (!prepared) {
      return null;
    }

    const truncationMarker = isFileContext
      ? "[file content truncated]"
      : "[synthetic content truncated]";
    const { content, truncated } = truncateText({
      text: prepared,
      limit: INJECTION_TEXT_LIMIT,
      marker: truncationMarker,
      preserveNewlines: true,
      compressedContent: input.compressedContent,
    });

    return {
      role: input.role,
      kind: isFileContext ? "file-context" : "message",
      synthetic: true,
      truncated,
      preserveNewlines: true,
      content,
    };
  }

  const content = normalizeInlineText(input.text);
  if (!content) {
    return null;
  }

  return {
    role: input.role,
    kind: "message",
    synthetic: false,
    truncated: false,
    preserveNewlines: false,
    content,
  };
}

function buildFileReferenceEntry(
  role: "user" | "assistant",
  path: string | undefined,
): TranscriptEntry {
  return {
    role,
    kind: "file-context",
    synthetic: false,
    truncated: false,
    preserveNewlines: false,
    content: path ?? "[unknown]",
  };
}

function mergeActivities(records: ActivityRecord[]): ActivityRecord[] {
  const readFiles = new Set<string>();
  const commands = new Set<string>();
  const patchFiles = new Set<string>();
  const questionAnswers = new Set<string>();
  const subtasks = new Set<string>();
  let questionCount: number | undefined;

  for (const record of records) {
    switch (record.kind) {
      case "read":
        for (const file of record.files) {
          readFiles.add(file);
        }
        break;
      case "command":
        for (const command of record.commands) {
          commands.add(command);
        }
        break;
      case "patch":
        for (const file of record.files) {
          patchFiles.add(file);
        }
        break;
      case "question":
        for (const answer of record.answers) {
          questionAnswers.add(answer);
        }
        if (record.questionCount !== undefined) {
          questionCount = (questionCount ?? 0) + record.questionCount;
        }
        break;
      case "subtask":
        for (const item of record.items) {
          subtasks.add(item);
        }
        break;
    }
  }

  const merged: ActivityRecord[] = [];

  if (readFiles.size > 0) {
    merged.push({
      kind: "read",
      files: sortStrings(Array.from(readFiles)),
    });
  }

  if (commands.size > 0) {
    merged.push({
      kind: "command",
      commands: sortStrings(Array.from(commands)),
    });
  }

  if (patchFiles.size > 0) {
    merged.push({
      kind: "patch",
      files: sortStrings(Array.from(patchFiles)),
    });
  }

  if (questionAnswers.size > 0 || questionCount !== undefined) {
    const questionActivity: Extract<ActivityRecord, { kind: "question" }> = {
      kind: "question",
      answers: sortStrings(Array.from(questionAnswers)),
    };
    if (questionCount !== undefined) {
      questionActivity.questionCount = questionCount;
    }
    merged.push(questionActivity);
  }

  if (subtasks.size > 0) {
    merged.push({
      kind: "subtask",
      items: sortStrings(Array.from(subtasks)),
    });
  }

  return merged;
}

function shouldIncludeTurn(turn: CompressedTurn): boolean {
  if (turn.markers.length > 0) {
    return true;
  }

  if (turn.userEntries.length > 0) {
    return true;
  }

  return turn.assistantMessages.some(
    (message) =>
      message.entries.length > 0 ||
      message.activity.length > 0 ||
      message.markers.length > 0,
  );
}

function renderTranscriptEntry(
  locale: Locale,
  entry: TranscriptEntry,
): string[] {
  const label = buildEntryLabel(locale, entry);
  const content = localizeRenderTokens(locale, entry.content);

  if (entry.preserveNewlines || content.includes("\n")) {
    return [`- ${label}:`, ...indentLines(content.split("\n"), 1)];
  }

  return [`- ${label}: ${content}`];
}

function renderActivityRecords(
  locale: Locale,
  records: ActivityRecord[],
  indentLevel: number,
): string[] {
  const lines: string[] = [];

  for (const record of records) {
    lines.push(...renderActivityRecord(locale, record, indentLevel));
  }

  return lines;
}

function renderActivityRecord(
  locale: Locale,
  record: ActivityRecord,
  indentLevel: number,
): string[] {
  const prefix = "  ".repeat(indentLevel);
  const detailPrefix = "  ".repeat(indentLevel + 1);

  switch (record.kind) {
    case "read":
      return [
        `${prefix}- ${t(locale, "render.activity.read.summary", { count: String(record.files.length), plural: pluralize(record.files.length) })}`,
        ...record.files.map((file) => `${detailPrefix}- ${file}`),
      ];
    case "command":
      return [
        `${prefix}- ${t(locale, "render.activity.commands.summary", { count: String(record.commands.length), plural: pluralize(record.commands.length) })}`,
        ...record.commands.map((command) => `${detailPrefix}- ${command}`),
      ];
    case "patch":
      return [
        `${prefix}- ${t(locale, "render.activity.patches.summary", { count: String(record.files.length), plural: pluralize(record.files.length) })}`,
        ...record.files.map((file) => `${detailPrefix}- ${file}`),
      ];
    case "question": {
      if (record.answers.length > 0) {
        return [
          `${prefix}- ${t(locale, "render.activity.questions.summary", { count: String(record.answers.length), plural: pluralize(record.answers.length) })}`,
          ...record.answers.map(
            (answer) =>
              `${detailPrefix}- ${localizeRenderTokens(locale, answer)}`,
          ),
        ];
      }

      const questionCount = record.questionCount ?? 0;
      return [
        `${prefix}- ${t(locale, "render.activity.questions.summary", { count: String(questionCount), plural: pluralize(questionCount) }).replace(/:$/, "")}`,
      ];
    }
    case "subtask":
      return [
        `${prefix}- ${t(locale, "render.activity.subtasks.summary", { count: String(record.items.length), plural: pluralize(record.items.length) })}`,
        ...record.items.map(
          (item) => `${detailPrefix}- ${localizeRenderTokens(locale, item)}`,
        ),
      ];
  }
}

function renderActivitySections(
  locale: Locale,
  activityIndex: ActivityIndex,
): string[] {
  const lines: string[] = [];

  appendActivitySection(
    locale,
    lines,
    "render.activity.read.title",
    "render.activity.read.summary",
    activityIndex.filesRead,
  );
  appendActivitySection(
    locale,
    lines,
    "render.activity.commands.title",
    "render.activity.commands.summary",
    activityIndex.commands,
  );
  appendActivitySection(
    locale,
    lines,
    "render.activity.patches.title",
    "render.activity.patches.summary",
    activityIndex.filesPatched,
  );
  appendActivitySection(
    locale,
    lines,
    "render.activity.questions.title",
    "render.activity.questions.summary",
    activityIndex.questionsAnswered,
  );
  appendActivitySection(
    locale,
    lines,
    "render.activity.subtasks.title",
    "render.activity.subtasks.summary",
    activityIndex.subtasks,
  );

  return lines;
}

function appendActivitySection(
  locale: Locale,
  lines: string[],
  titleKey: Parameters<typeof t>[1],
  summaryKey: Parameters<typeof t>[1],
  items: string[],
): void {
  if (items.length === 0) {
    return;
  }

  lines.push(`### ${t(locale, titleKey)}`);
  lines.push(
    `- ${t(locale, summaryKey, {
      count: String(items.length),
      plural: pluralize(items.length),
    })}`,
  );
  for (const item of items) {
    lines.push(`  - ${localizeRenderTokens(locale, item)}`);
  }
  lines.push("");
}

function buildEntryLabel(locale: Locale, entry: TranscriptEntry): string {
  const roleLabel = t(locale, `render.role.${entry.role}`);
  const base =
    entry.kind === "file-context"
      ? `${roleLabel} ${t(locale, "render.file_context")}`
      : roleLabel;
  const qualifiers: string[] = [];

  if (entry.synthetic) {
    qualifiers.push(t(locale, "render.qualifier.synthetic"));
  }
  if (entry.truncated) {
    qualifiers.push(t(locale, "render.qualifier.truncated"));
  }

  if (qualifiers.length === 0) {
    return base;
  }

  return `${base} (${qualifiers.join(", ")})`;
}

function normalizeSyntheticText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  return normalized;
}

function normalizeMultilineText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(input: {
  text: string;
  limit: number;
  marker: string;
  preserveNewlines: boolean;
  compressedContent: Set<string>;
}): { content: string; truncated: boolean } {
  if (input.text.length <= input.limit) {
    return {
      content: input.text,
      truncated: false,
    };
  }

  input.compressedContent.add(input.marker);
  const head = input.text.slice(0, input.limit).trimEnd();

  return {
    content: input.preserveNewlines
      ? `${head}\n${input.marker}`
      : `${head} ${input.marker}`,
    truncated: true,
  };
}

function dedupeEntries(entries: TranscriptEntry[]): TranscriptEntry[] {
  const seen = new Set<string>();
  const result: TranscriptEntry[] = [];

  for (const entry of entries) {
    const key = [
      entry.role,
      entry.kind,
      String(entry.synthetic),
      String(entry.truncated),
      String(entry.preserveNewlines),
      entry.content,
    ].join("\u0000");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(entry);
  }

  return result;
}

function indentLines(lines: string[], indentLevel: number): string[] {
  const prefix = "  ".repeat(indentLevel);
  return lines.map((line) => `${prefix}${line}`);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pluralize(count: number): string {
  return count === 1 ? "" : "s";
}

function localizeRenderTokens(locale: Locale, value: string): string {
  return value
    .replaceAll(
      "[missing user message]",
      t(locale, "render.missing_user_message"),
    )
    .replaceAll("[reasoning omitted]", t(locale, "render.reasoning_omitted"))
    .replaceAll(
      "[repeated file read omitted]",
      t(locale, "render.repeated_file_read_omitted"),
    )
    .replaceAll(
      "[tool output truncated]",
      t(locale, "render.tool_output_truncated"),
    )
    .replaceAll(
      "[file content truncated]",
      t(locale, "render.file_content_truncated"),
    )
    .replaceAll(
      "[synthetic content truncated]",
      t(locale, "render.synthetic_content_truncated"),
    )
    .replaceAll("[unknown subtask]", t(locale, "render.unknown_subtask"))
    .replaceAll("[unknown]", t(locale, "render.unknown"));
}

function looksLikeFileContext(text: string): boolean {
  return (
    text.includes("<path>") &&
    (text.includes("<content>") || text.includes("<entries>"))
  );
}

function extractPatchFiles(patchText: string): string[] {
  const files = new Set<string>();

  for (const line of patchText.split("\n")) {
    const match = line.match(/^\*\*\* (?:Add|Delete|Update) File: (.+)$/);
    if (match?.[1]) {
      files.add(match[1].trim());
    }
  }

  return sortStrings(Array.from(files));
}

function isSyntheticPart(part: Part): boolean {
  return part.type === "text" && (part.synthetic ?? false);
}

function getAnswers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function formatTitle(locale: Locale, value: string): string {
  const title = value.trim();
  return title || t(locale, "render.unknown");
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
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

function getArrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}
