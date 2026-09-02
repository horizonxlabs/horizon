import type { LocaleProps } from "@/shared/locale";
import { LOCALES } from "@/shared/locale";
import { languageSwitcherContent } from "@/shared/language-switcher-content";

/**
 * TH ⇄ EN switcher, rendered as plain anchors — the landing app ships zero client components
 * (enforced by tests/unit/landing-web-render-smoke.test.mjs), so this cannot be a stateful
 * dropdown. The current locale is marked with `aria-current` and rendered as non-interactive
 * text rather than a self-link; every other locale links to its own root path.
 */
export function LanguageSwitcher({ locale }: LocaleProps) {
  return (
    <ul className="flex items-center gap-3 text-sm">
      {LOCALES.map((target) => {
        const { label } = languageSwitcherContent[target];
        return (
          <li key={target}>
            {target === locale ? (
              <span aria-current="true" lang={target} className="text-body font-medium">
                {label}
              </span>
            ) : (
              <a
                href={`/${target}`}
                lang={target}
                className="text-muted hover:text-body transition-colors"
              >
                {label}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
