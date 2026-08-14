// The platform's built-in "design-system" skill, seeded into skill governance for every
// install (global scope). Loaded by the model on demand (progressive disclosure) for
// design-heavy turns, so the deep playbook never bloats the base prompt. Admins can
// supersede it per org/project through the Knowledge & Skills console like any skill.

export const DESIGN_SYSTEM_SKILL = {
  key: "design-system",
  name: "Enterprise Design Playbook",
  description:
    "Deep visual-design playbook — load for dashboards, redesigns, 'ทำให้สวย/ปรับ design', or any screen where visual quality is the point.",
  instruction: `# Enterprise Design Playbook

You are designing for enterprise users who compare this app to Linear, Vercel, and Stripe dashboards. The bar: restrained, precise, expensive-looking. Wow comes from hierarchy and polish, never from decoration.

## Screen blueprints

### Dashboard (dark chrome)
1. AppShell: dark sidebar (brand + AppShellNavItem per section), title in the topbar, a primary action in headerActions.
2. Bento grid: \`grid gap-4 grid-cols-2 lg:grid-cols-4\`. Row 1 = 3–4 StatCards (mono tabular values, delta badges, sparkline on the most important KPI).
3. Main zone: \`grid gap-4 lg:grid-cols-3\` — the chart/table Card spans \`lg:col-span-2\`, a supporting list (recent items, top N) beside it.
4. Density: cards use p-5, gap-4 everywhere; number-heavy tables switch to text-sm with font-mono tabular-nums on amount columns, right-aligned.

### Management / CRUD
PageHeader (title + Button) → filter row (\`flex gap-2\`: Input search grows, Select filters shrink-0) → Table in a Card. Row hover bg-slate-50, selected row ring-1 ring-brand-500/40. Create/edit in Dialog (max-w-lg, Field per input, footer Cancel + primary). Status columns always use Badge with semantic variants — never colored text.

### Approval / workflow screens
Timeline column (steps with success/current/pending states using semantic colors), detail Card beside it. Current step: bg-brand-50 border-brand-200. Use Badge variant="warning" for pending, "success" for approved.

### Report / document screens
max-w-4xl mx-auto, generous whitespace (space-y-8), section Cards with CardHeader, print-friendly (avoid dark backgrounds here).

## Color discipline
- One brand accent per screen (brand-600) for: the single primary action, active nav, key numbers. Everything else neutral slate.
- Semantic only through tokens: success-600/warning-600/danger-600/info-600 text on their -100 backgrounds. Never raw green/red/yellow utilities for status.
- Dark chrome uses surface-dark / surface-dark-raised / surface-dark-border — separation via borders, not shadows. Light content areas keep shadow-sm + border-slate-200.
- Backgrounds: page bg-slate-50, cards white. In dark zones: text-slate-300 default, white only for emphasis.

## Typography discipline
- Anuphan Variable is already the default; Thai text needs leading-relaxed (Thai vowel marks clip with tight line-height) — headings in Thai use leading-snug, never leading-none.
- Scale per screen: ONE text-2xl/3xl title, section titles text-sm font-semibold uppercase tracking-wide text-slate-500, body text-sm, metadata text-xs text-slate-400.
- Numbers users compare (amounts, counts, IDs, dates in tables): font-mono tabular-nums, right-aligned in columns.
- Weights: 600 for titles/values, 500 for labels, 400 body — never 700+ except hero numbers.

## Material & depth
- Elevation ladder: flat (bg only) → border → border + shadow-sm → Dialog shadow-xl. Skip levels, never stack heavy shadows.
- Translucency sparingly: overlay panels may use backdrop-blur + bg-white/80 (or bg-slate-950/60 on dark); never on content cards.
- Radius: rounded-lg controls, rounded-xl cards, rounded-full pills/avatars — consistent per screen.
- Motion: transition-colors duration-150 on every interactive element; content entrances need no animation. Skeleton for anything async.

## States checklist (every screen ships all of these)
- Empty → EmptyState with icon + one-line why + CTA.
- Loading → Skeleton mirroring the final layout (not a spinner).
- Error → danger-100 bg Card with retry Button.
- Hover/focus-visible on every clickable; disabled at opacity-50.

## Data visualization without chart libraries
- Trends: StatCard sparkline or CSS bar rows (\`h-2 rounded-full bg-brand-200\` track + \`bg-brand-600\` fill sized by percentage).
- Distributions: horizontal bar list — label, bar, mono value per row; sort descending.
- Progress: thin bars (h-1.5) with semantic fill; never donut charts in CSS.

## Believable demo data (mock phase)
Seed data sells the design: Thai names/companies for Thai users (สมชาย วงศ์สวัสดิ์, บจก. รุ่งเรืองโลจิสติกส์), realistic amounts (฿12,450 not ฿100), mixed statuses skewed realistic (mostly success, some pending, few failed), dates spread over recent weeks. 8–15 rows minimum.`
} as const;
