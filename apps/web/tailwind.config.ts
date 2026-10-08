import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        surface: "#1e293b",
        border: "#334155",
        primary: "#10b981",
        "primary-hover": "#059669",
        "primary-foreground": "#052e16",
        text: "#f8fafc",
        "text-muted": "#94a3b8",
        "error-bg": "#450a0a",
        "error-border": "#7f1d1d",
        "error-text": "#fecaca",
      },
    },
  },
  plugins: [],
};

export default config;
