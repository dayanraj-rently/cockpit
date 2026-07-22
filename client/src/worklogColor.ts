// The same validated 8-hue categorical palette used for the `--label` badge
// token (see index.css), reused here as a hash-to-color assignment per issue
// key so a given issue always renders the same color across reloads and
// columns. Each slot carries its own light/dark foreground pick rather than
// a derived formula — some steps (violet in particular) invert which text
// color reads better between modes.
const PALETTE: Array<{ light: { bg: string; fg: string }; dark: { bg: string; fg: string } }> = [
  { light: { bg: "#2a78d6", fg: "#ffffff" }, dark: { bg: "#3987e5", fg: "#ffffff" } }, // blue
  { light: { bg: "#008300", fg: "#ffffff" }, dark: { bg: "#008300", fg: "#ffffff" } }, // green
  { light: { bg: "#e87ba4", fg: "#1a1a1a" }, dark: { bg: "#d55181", fg: "#ffffff" } }, // magenta
  { light: { bg: "#eda100", fg: "#1a1a1a" }, dark: { bg: "#c98500", fg: "#1a1a1a" } }, // yellow
  { light: { bg: "#1baf7a", fg: "#1a1a1a" }, dark: { bg: "#199e70", fg: "#ffffff" } }, // aqua
  { light: { bg: "#eb6834", fg: "#ffffff" }, dark: { bg: "#d95926", fg: "#ffffff" } }, // orange
  { light: { bg: "#4a3aa7", fg: "#ffffff" }, dark: { bg: "#9085e9", fg: "#1a1a1a" } }, // violet
  { light: { bg: "#e34948", fg: "#ffffff" }, dark: { bg: "#e66767", fg: "#1a1a1a" } }, // red
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getIssueColor(issueKey: string, isDark: boolean): { bg: string; fg: string } {
  const slot = PALETTE[hashString(issueKey) % PALETTE.length];
  return isDark ? slot.dark : slot.light;
}
