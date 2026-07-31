import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#121316",
          900: "#1a1c20",
          800: "#24272c",
          700: "#31353c",
          600: "#43484f",
        },
        verdigris: {
          300: "#a8c9c0",
          400: "#7bab9f",
          500: "#5a9186",
          600: "#48756c",
        },
        seal: {
          gold: "#b08d57",
          "gold-light": "#cba876",
        },
        amber: {
          400: "#d6a869",
          500: "#c4934a",
        },
        brick: {
          400: "#c47870",
          500: "#b1544a",
        },
        sage: {
          400: "#96b58a",
          500: "#7c9b6f",
        },
        parchment: "#e4e1d6",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
