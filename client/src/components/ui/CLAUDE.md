# client/src/components/ui/

## Purpose

The app's generic UI primitive library — thin shadcn-style wrappers over
`@base-ui/react` components. Consumed by every page and feature component;
owns no feature-specific logic itself.

## Ownership

Only these wrapper files. Feature-specific composition (e.g. the assignee
typeahead built from `autocomplete.tsx`, or the tab layout in
`Settings.tsx`) belongs to the consuming page/component, not here.

## Local Contracts

- Every wrapper imports the base-ui primitive under an aliased
  `XPrimitive` name and re-exports one styled component per part, each with
  `data-slot="x-part-name"` and `cn(baseClasses, className)`.
- Use base-ui's `render` prop for polymorphic rendering — e.g. `<Badge
  render={<a href=... />}>`, `<Button render={<a href="/api/google/connect"
  />}>`. This is **not** `asChild` (that's the Radix convention; this
  project uses base-ui, not Radix).
- Style state via Tailwind v4's bare boolean data-attribute variants
  (`data-open:`, `data-disabled:`, `data-active:`, `data-highlighted:`,
  `data-placeholder:`) and bracket syntax for key-value ones
  (`data-[size=default]:`, `data-[side=bottom]:`). Before adding a new
  wrapper, check the primitive's own `*DataAttributes` export/type in
  `client/node_modules/@base-ui/react/<name>/*.d.ts` for the real attribute
  name — don't guess from memory or from a similar-looking primitive.
- Current primitives and their exported parts: `alert` (Alert,
  AlertDescription), `autocomplete` (Autocomplete, AutocompleteInputGroup,
  AutocompleteInput, AutocompleteClear, AutocompleteContent,
  AutocompleteItem, AutocompleteEmpty), `badge` (Badge — variants: default,
  secondary, destructive, outline, ghost, link, critical, serious, warning,
  label), `button` (Button — variants: default, outline, secondary, ghost,
  destructive, link; sizes incl. `icon`/`icon-xs`/`icon-sm`/`icon-lg`),
  `card` (Card, CardHeader, CardTitle, CardDescription, CardAction,
  CardContent, CardFooter), `input` (Input), `label` (Label), `select`
  (Select + Group/Value/Trigger/Content/Label/Item/Separator/ScrollUp-
  Down-Button), `tabs` (Tabs, TabsList, TabsTab, TabsPanel), `textarea`
  (Textarea).

## Work Guidance

- Match the structure of the closest existing wrapper file exactly when
  adding a sibling primitive (same import style, same `data-slot` naming,
  same `cn()` merge pattern).
- Keep each file scoped to one primitive family — don't fold a new
  primitive into an existing file.

## Verification

(No dedicated check beyond the client-wide `tsc --noEmit` — see
`client/CLAUDE.md`.)

## Child DOX Index

None — leaf directory.
