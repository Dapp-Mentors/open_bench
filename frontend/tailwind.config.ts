import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["'DM Sans'", "sans-serif"],
        display: ["'Space Mono'", "monospace"],
      },
      colors: {
        bench: {
          bg:        "#0a0b0d",
          surface:   "#111318",
          border:    "#1e2128",
          muted:     "#2a2d36",
          text:      "#c8cdd8",
          subtle:    "#5a6072",
          green:     "#00e676",
          amber:     "#ffb300",
          red:       "#ff4444",
          blue:      "#4da6ff",
          cyan:      "#00bcd4",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan": "scan 2s linear infinite",
        "fadeIn": "fadeIn 0.4s ease forwards",
        "slideUp": "slideUp 0.4s ease forwards",
        "blink": "blink 1s step-end infinite",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
