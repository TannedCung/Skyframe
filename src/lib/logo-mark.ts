interface LogoColors {
  cream100: string;
  ink900: string;
  teal400: string;
  yellow300: string;
  coral500: string;
}

export function logoMarkSvg(size: number, colors: LogoColors): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="${colors.cream100}"/><g transform="translate(11,11)"><rect x="0" y="0" width="42" height="42" rx="4" fill="none" stroke="${colors.ink900}" stroke-width="2.5"/><line x1="0" y1="11" x2="42" y2="11" stroke="${colors.ink900}" stroke-width="2.5"/><rect x="1.5" y="12.5" width="39" height="11" fill="${colors.teal400}"/><rect x="1.5" y="23.5" width="39" height="17" fill="${colors.yellow300}"/><circle cx="30" cy="20" r="5.5" fill="${colors.coral500}"/></g></svg>`;
}

export const LOGO_CSS_COLORS: LogoColors = {
  cream100: "var(--color-cream-100, #FFF6DE)",
  ink900: "var(--color-ink-900, #2A1E15)",
  teal400: "var(--color-teal-400, #8BDFDD)",
  yellow300: "var(--color-yellow-300, #FFE394)",
  coral500: "var(--color-coral-500, #F48F68)",
};

export const LOGO_HEX_COLORS: LogoColors = {
  cream100: "#FFF6DE",
  ink900: "#2A1E15",
  teal400: "#8BDFDD",
  yellow300: "#FFE394",
  coral500: "#F48F68",
};
