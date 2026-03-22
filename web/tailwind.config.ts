import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // FloorEye design system colors (CSS variable-driven)
        "fe-bg": {
          base: "var(--color-bg-base)",
          card: "var(--color-bg-card)",
          sidebar: "var(--color-bg-sidebar)",
          hover: "var(--color-bg-hover)",
        },
        "fe-text": {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          sidebar: "var(--color-text-sidebar)",
        },
        brand: {
          DEFAULT: "var(--color-brand)",
          hover: "var(--color-brand-hover)",
          light: "var(--color-brand-light)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          light: "var(--color-danger-light)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          light: "var(--color-warning-light)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          light: "var(--color-success-light)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          light: "var(--color-info-light)",
        },
        edge: "var(--color-edge)",
        hybrid: "var(--color-hybrid)",
        "fe-border": {
          DEFAULT: "var(--color-border)",
          focus: "var(--color-border-focus)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "fe-sm": "var(--shadow-sm)",
        "fe-md": "var(--shadow-md)",
        "fe-lg": "var(--shadow-lg)",
        "fe-xl": "var(--shadow-xl)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "200ms",
        slow: "300ms",
      },
      keyframes: {
        "flash-row": {
          "0%": { backgroundColor: "rgb(240 253 250)" },
          "50%": { backgroundColor: "rgb(204 251 241)" },
          "100%": { backgroundColor: "transparent" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-right": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.75)" },
        },
      },
      animation: {
        "flash-row": "flash-row 2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
        "slide-right": "slide-right 0.3s ease-out",
        "slide-down": "slide-down 0.25s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
        shimmer: "shimmer 2s infinite linear",
        "pulse-dot": "pulse-dot 1.5s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
