/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Due varianti per il dispositivo, non per la larghezza: `mouse:` vale
      // dove si passa sopra le cose col puntatore, `tocco:` dove si tocca col
      // dito. Un comando che compare solo al passaggio del mouse si nasconde con
      // `mouse:opacity-0`, così sul telefono si vede sempre: con `opacity-0` le ✕
      // di «Continua la saga» c'erano ma non si vedevano, e non si potevano usare.
      screens: {
        mouse: { raw: '(hover: hover) and (pointer: fine)' },
        tocco: { raw: '(pointer: coarse)' },
      },
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
