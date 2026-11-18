/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        "surface-glass": "var(--surface-glass)",
        "surface-card": "var(--surface-card)",
        "surface-hover": "var(--surface-hover)",
        "border-glass": "var(--border-glass)",
        "border-subtle": "var(--border-subtle)",
        primary: {
          DEFAULT: "var(--text-primary)",
          muted: "var(--text-muted)",
          accent: "var(--color-accent)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          glow: "var(--color-accent-glow)",
        },
        status: {
          easy: "var(--status-easy)",
          hard: "var(--status-hard)",
          again: "var(--status-again)",
        },
        jlpt: {
          n5: "var(--jlpt-n5)",
          n4: "var(--jlpt-n4)",
          n3: "var(--jlpt-n3)",
          n2: "var(--jlpt-n2)",
          n1: "var(--jlpt-n1)",
        },
        industry: {
          it: "var(--ind-it)",
          finance: "var(--ind-finance)",
          fnb: "var(--ind-fnb)",
          healthcare: "var(--ind-healthcare)",
          manufacturing: "var(--ind-manufacturing)",
          general: "var(--ind-general)",
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        jp: ["'Noto Sans JP'", "'Hiragino Kaku Gothic ProN'", "Meiryo", "sans-serif"],
      },
      borderRadius: {
        card: "var(--card-radius)",
        pill: "var(--pill-radius)",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "glass-sm": "0 4px 16px 0 rgba(0, 0, 0, 0.25)",
        "neon-glow": "0 0 25px -5px var(--color-accent-glow)",
      },
      backdropBlur: {
        glass: "16px",
      },
      minHeight: {
        touch: "var(--touch-target-min)",
      },
      minWidth: {
        touch: "var(--touch-target-min)",
      }
    },
  },
  plugins: [],
}
