/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cinema-themed palette: dark theatre, projector gold, curtain red
        theatre: {
          950: '#0a0a0f',
          900: '#121218',
          800: '#1c1c26',
          700: '#2a2a38',
        },
        projector: {
          DEFAULT: '#e8b923',
          light: '#f5d161',
          dark: '#b8901a',
        },
        curtain: {
          DEFAULT: '#9b1c1c',
          light: '#c62828',
          dark: '#6d1414',
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
