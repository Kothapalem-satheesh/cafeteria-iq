import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#020817",
          900: "#0a1628",
          800: "#0f2040",
          700: "#162d55",
          600: "#1e3a6e",
          500: "#2952a3",
        },
        amber: {
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
        cluster: {
          1: "#6366f1",
          2: "#10b981",
          3: "#f59e0b",
          4: "#ec4899",
          5: "#ef4444",
          6: "#06b6d4",
        },
      },
    },
  },
  plugins: [forms],
};
