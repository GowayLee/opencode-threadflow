export const SEARCH_SESSION_COMMAND_NAME = "search-session";

export const sessionSearchCommand = {
  description:
    "Search recent sessions and return copyable session IDs for explicit references",
  template: `Render the plugin-provided session search result block exactly as-is.

Rules:
- The plugin may inject a synthetic text block that begins with \`## Session Search Results\`.
- If that block exists, output it verbatim and nothing else.
- If that block does not exist, output exactly: Session search is unavailable.
- Do not summarize, reformat, explain, or add extra commentary.

Search query:
"""
$ARGUMENTS
"""`,
} as const;
