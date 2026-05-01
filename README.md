# GitHub Social Score

Generate UI scorecards and SVG output for a GitHub user.

## SVG rendering

Use `format=svg` with `user`:

- Auto theme (default):
  - `/?format=svg&user=torvalds`
- Light theme:
  - `/?format=svg&user=torvalds&theme=light`
- Dark theme:
  - `/?format=svg&user=torvalds&theme=dark`

### Theme and color options

- `theme`: `light`, `dark`, or `auto`.
- Optional validated color overrides (hex only):
  - `bg`
  - `text`
  - `accent`

Example override:

- `/?format=svg&user=torvalds&theme=dark&accent=%23ff7b72`
