# Next.js Starter Home Design

## Goal

Replace the raw default Next.js starter text with a polished, lightweight landing state for newly created applications.

## Scope

- Keep the exact visible message: "Your app starts here. Ask the AI to build a feature."
- Center the message in both axes across the viewport.
- Use a dark indigo-to-violet gradient, soft decorative glow, and a readable elevated content panel.
- Add only the styles needed by this starter page; do not add dependencies, interaction, navigation, mock data, or new routes.
- Preserve the template's Next.js App Router and TypeScript compatibility.

## Implementation

Update `templates/nextjs-base/app/page.tsx` to render a semantic `main` landmark containing the exact message. Give the page a local style block so every newly provisioned app is visually complete without relying on a shared stylesheet. The layout must adapt cleanly from desktop to narrow mobile viewports.

## Validation

Run the golden-template unit test and the template package build/typecheck where available. Confirm the existing message remains present in the template source and no locked template files are changed.
