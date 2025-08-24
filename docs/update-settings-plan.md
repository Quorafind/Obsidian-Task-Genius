# obsidian:// deep link rollout plan for Task Genius settings

This plan documents the exact deep-link formats supported by the plugin and where to add "Open Settings" buttons across the docs-site so users can jump directly to the right configuration screens in Obsidian.

## Supported URI formats

Primary scheme (recommended):
- Open plugin settings root
  - obsidian://task-genius/settings
- Open a specific tab
  - obsidian://task-genius/settings?tab=<tabId>
- Open tab and scroll to a section (where supported)
  - obsidian://task-genius/settings?tab=<tabId>&section=<sectionId>
- Open tab and focus the search box with a query
  - obsidian://task-genius/settings?tab=<tabId>&search=<text>
- Trigger tab-specific actions (currently on MCP tab):
  - Enable MCP server: obsidian://task-genius/settings?tab=mcp-integration&action=enable
  - Test MCP connection: obsidian://task-genius/settings?tab=mcp-integration&action=test
  - Regenerate auth token: obsidian://task-genius/settings?tab=mcp-integration&action=regenerate-token

Alternative legacy form (also supported):
- obsidian://task-genius?action=settings (less explicit; prefer the path-based form above)

Notes
- Use ASCII punctuation exactly as shown: obsidian:// (not full‑width colon).
- MCP Integration tab exists on desktop only; on mobile, deep links will land on the General tab.

## Tab IDs you can link to

- general
- index
- view-settings
- file-filter
- progress-bar
- task-status
- task-handler
- task-filter
- project
- workflow
- date-priority
- quick-capture
- task-timer
- time-parsing
- timeline-sidebar
- reward
- habit
- ics-integration
- mcp-integration (desktop only)
- beta-test
- experimental
- about

Special sections
- On the MCP Integration tab, section=cursor expands and scrolls to the Cursor client configuration section when present:
  - obsidian://task-genius/settings?tab=mcp-integration&section=cursor

## Placement plan in docs-site

Add a small call-to-action button near the top of each page’s Configuration or Getting Started section. Use consistent labels and the recommended links below.

Already good
- MCP Integration index: Includes Enable/Test deep links. Keep as is.
- MCP Clients (Cursor, Claude Desktop, Claude Code): Include “Open MCP Settings” deep links. Keep/expand with regenerate-token link in troubleshooting where helpful.

Add/update these pages
- /docs/getting-started
  - Add an “Open Task Genius Settings” button: obsidian://task-genius/settings
- /docs/installation/index, /docs/installation/community, /docs/installation/manual
  - After “Enable the plugin”, add: “Open Task Genius Settings”: obsidian://task-genius/settings
- /docs/quick-capture
  - Add: “Open Quick Capture Settings”: obsidian://task-genius/settings?tab=quick-capture
- /docs/habit
  - Add: “Open Habit Settings”: obsidian://task-genius/settings?tab=habit
- /docs/task-view/habit-view
  - Add: “Open Habit Settings”: obsidian://task-genius/settings?tab=habit
- /docs/ics-support
  - Add: “Open ICS Integration Settings”: obsidian://task-genius/settings?tab=ics-integration
- /docs/progress-bars
  - Add: “Open Progress Display Settings”: obsidian://task-genius/settings?tab=progress-bar
- /docs/task-status
  - Add: “Open Checkbox Status Settings”: obsidian://task-genius/settings?tab=task-status
- /docs/filtering
  - Add: “Open Task Filter Settings”: obsidian://task-genius/settings?tab=task-filter
- /docs/date-priority
  - Add: “Open Dates & Priority Settings”: obsidian://task-genius/settings?tab=date-priority
- /docs/task-view/timeline-sidebar-view
  - Add: “Open Timeline Sidebar Settings”: obsidian://task-genius/settings?tab=timeline-sidebar
- /docs/workflows
  - Add: “Open Workflows Settings”: obsidian://task-genius/settings?tab=workflow
- /docs/reward
  - Add: “Open Rewards Settings”: obsidian://task-genius/settings?tab=reward

Optional advanced links
- MCP quick actions (place in troubleshooting sections):
  - Enable server: obsidian://task-genius/settings?tab=mcp-integration&action=enable
  - Test connection: obsidian://task-genius/settings?tab=mcp-integration&action=test
  - Regenerate token: obsidian://task-genius/settings?tab=mcp-integration&action=regenerate-token
- Jump straight to Cursor section (MCP Integration):
  - obsidian://task-genius/settings?tab=mcp-integration§ion=cursor

## Copy and style guidelines

- Button label conventions
  - Primary: “Open … Settings” (e.g., “Open MCP Settings”).
  - Keep labels short; avoid sentence case after the first word.
- Use a styled anchor tag in MDX pages for visual prominence, e.g.:
  - <a href="obsidian://task-genius/settings?tab=habit" className="btn btn-primary">Open Habit Settings</a>
- Place the button right after the first paragraph of the Configuration section, or at the end of the Installation steps.
- Include a one-line fallback for users whose environment blocks deeplinks: “If the button doesn’t work, open Obsidian → Settings → Community Plugins → Task Genius → [Tab Name].”

## Consistency notes for client docs

- Server name in examples
  - Our server name auto-derives from the vault (e.g., my-vault-tasks) with a fallback obsidian-tasks. For simplicity, standardize docs examples to obsidian-tasks unless showing multi-vault setups.
- Auth header format
  - Always show: Authorization: Bearer TOKEN+APP_ID
- Ports
  - Default port 7777. Use 7778, 7779 in multi-vault examples.

## Validation checklist

- All new links use ASCII obsidian:// and correct tab IDs.
- MCP action links validated on desktop (enable, test, regenerate-token).
- Mobile gracefully shows General tab when MCP tab not available.
- Pages render with a single primary button per configuration area to reduce clutter.

