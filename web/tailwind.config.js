/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        violet: '#7c3aed',
        'surface-980': '#060609',
        surface: {
          950: "#060c1a",
          900: "rgba(8, 18, 38, 0.9)",
          800: "rgba(12, 24, 52, 0.95)",
          700: "rgba(16, 32, 64, 0.97)",
        },
        polka: {
          50: "#fff1f3",
          100: "#ffe0e5",
          200: "#ffc6cf",
          300: "#ff9bac",
          400: "#ff5f7a",
          500: "#e6007a",
          600: "#c30066",
          700: "#a30055",
          800: "#880049",
          900: "#740041",
        },
        accent: {
          blue: "#06b6d4",
          teal: "#0891b2",
          purple: "#a78bfa",
          green: "#34d399",
          orange: "#fb923c",
          red: "#f87171",
          yellow: "#fbbf24",
        },
        clinical: "#0ea5e9",
        text: {
          primary: "#f0eef5",
          secondary: "#ccc9d8",
          tertiary: "#b0acbe",
          muted: "#8e8ba0",
        },
      },
      fontFamily: {
        display: ['"Instrument Sans"', "system-ui", "-apple-system", "sans-serif"],
        body: ['"Instrument Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "shimmer": "shimmer 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(230, 0, 122, 0.15)",
        "glow-lg": "0 0 48px -8px rgba(230, 0, 122, 0.2)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)",
        "card-hover":
          "0 4px 12px 0 rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
      },
    },
  },
  plugins: [],
};
