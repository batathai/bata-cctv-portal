import type { Config } from "tailwindcss";

// BATA Thailand corporate theme
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#D71920", // BATA red — primary
          dark: "#B01319",
          light: "#F04952",
          50: "#FDEBEC",
          100: "#FBD6D8",
        },
        surface: {
          DEFAULT: "#FFFFFF", // secondary
          muted: "#F7F7F8",
          dark: "#151719",
        },
        ink: {
          DEFAULT: "#333333", // accent (text/graphite)
          soft: "#5C5C5C",
          faint: "#8A8A8A",
        },
        status: {
          healthy: "#1E9E5A",
          partial: "#E2A400",
          offline: "#D71920",
          unknown: "#8A8A8A",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 8px rgba(0,0,0,0.04)",
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
