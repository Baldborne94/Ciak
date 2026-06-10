/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cinema-themed palette — powered by CSS variables for dynamic theming
        theatre: {
          950: 'rgb(var(--colour-theatre-950) / <alpha-value>)',
          900: 'rgb(var(--colour-theatre-900) / <alpha-value>)',
          800: 'rgb(var(--colour-theatre-800) / <alpha-value>)',
          700: 'rgb(var(--colour-theatre-700) / <alpha-value>)',
        },
        projector: {
          DEFAULT: 'rgb(var(--colour-projector) / <alpha-value>)',
          light:   'rgb(var(--colour-projector-light) / <alpha-value>)',
          dark:    'rgb(var(--colour-projector-dark) / <alpha-value>)',
        },
        curtain: {
          DEFAULT: 'rgb(var(--colour-curtain) / <alpha-value>)',
          light:   'rgb(var(--colour-curtain-light) / <alpha-value>)',
          dark:    'rgb(var(--colour-curtain-dark) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        reel: '0 0 30px rgba(232, 185, 35, 0.15)',
      },
    },
  },
  plugins: [],
}
