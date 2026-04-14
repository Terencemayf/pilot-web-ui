# Dark Theme TODO

Branch: `feat/dark-theme`, based on PR #6

## Critical (Broken in Dark Mode)
1. **MarkdownRenderer.vue** — `.hljs` syntax highlighting colors are hardcoded dark-on-light values (lines 170-188). Code blocks are nearly unreadable in dark mode. Need `[data-theme='dark']` overrides.
2. **dark-variables.scss** — Dead code. Defines values that conflict with the actual dark theme implementation. Never imported anywhere. Should be deleted.

## Critical (Missing Feature)
3. **AppSidebar.vue animation switching** — Sidebar currently uses `<canvas>` to play `dance.mp4`, which has a white background. Looks jarring against the dark UI. Need to switch animation based on theme:
   - Light theme: `dance.gif` (white bg, normal colors)
   - Dark theme: `dance_dark.gif` (dark bg `#0c0c0e`, inverted colors)
   - Consider replacing the `<canvas>` + video approach with `<img>` loading the theme-appropriate GIF to simplify implementation
   - Assets available: `dance.gif`, `dance_dark.gif`, `thinking.gif`, `thinking_dark.gif` in `src/assets/`

## Medium (Visual Glitches)
4. **MessageItem.vue** line 276 — `rgba(0,0,0,0.04)` attachment background invisible in dark mode
5. **MessageItem.vue** line 333 — `rgba(0,0,0,0.03)` tool line hover invisible in dark mode
6. **MessageList.vue** line 160 — `rgba(0,0,0,0.03)` tool call item background invisible in dark mode
7. **MarkdownRenderer.vue** line 134 — `rgba(0,0,0,0.03)` code header background
8. **MarkdownRenderer.vue** line 155 — `rgba(0,0,0,0.05)` copy button hover background

## Minor (Hardcoded Colors)
9. **ChatInput.vue** lines 394,396 — Hardcoded `#4a90d9` should use `$accent-primary`
10. **LogsView.vue** lines 241,261 — Hardcoded `#d9720f` should use `$warning`
11. **Naive UI missing dark overrides** — Tabs, Select dropdown, Dropdown, Tooltip, Popconfirm, Dialog, Spin
