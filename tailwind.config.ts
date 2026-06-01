import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#070a0f",
        panel: "#0d1219",
        "panel-2": "#11171f",
        line: "#1c2430",
        muted: "#5b6878",
        text: "#c5d0dd",
        bright: "#eef3f9",
        long: "#1fd6a0",
        short: "#ff5470",
        warn: "#f5a623",
        accent: "#39c0ed",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 30px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};
export default config;
