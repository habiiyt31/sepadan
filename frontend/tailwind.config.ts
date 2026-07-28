import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#10131a",
          900: "#161b26",
          800: "#1f2635",
          700: "#2a3345",
          600: "#3a4459",
        },
        brass: {
          300: "#e8cf9b",
          400: "#ddb968",
          500: "#c9a24b",
          600: "#a8843a",
        },
        peg: {
          400: "#8fb2de",
          500: "#6f9bd1",
          600: "#5580b8",
        },
        alert: {
          400: "#dc7a71",
          500: "#cc5c52",
          600: "#ab4941",
        },
        confirm: {
          400: "#9ac295",
          500: "#7fa87a",
          600: "#658c60",
        },
        parchment: "#e8e3d6",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "peg-line":
          "linear-gradient(90deg, transparent, rgba(201,162,75,0.35) 15%, rgba(201,162,75,0.35) 85%, transparent)",
      },
    },
  },
  plugins: [],
};

export default config;
