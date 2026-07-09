import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0e13",
          900: "#0f151d",
          800: "#161f2b",
          700: "#212d3d",
        },
        mint: {
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
        },
        peg: {
          400: "#38bdf8",
          500: "#0ea5e9",
        },
        warn: {
          400: "#fb923c",
        },
        danger: {
          400: "#f87171",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34, 197, 94, 0.15), 0 8px 30px rgba(34, 197, 94, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
