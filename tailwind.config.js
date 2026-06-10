/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette "sala cinema": neri profondi, oro proiettore, rosso sipario
        cinema: {
          black: '#0a0a0f',
          dark: '#12121a',
          panel: '#1a1a24',
          border: '#2a2a38',
        },
        gold: {
          DEFAULT: '#e8b923',
          soft: '#f5d76e',
          deep: '#b8860b',
        },
        curtain: {
          DEFAULT: '#8b1a1a',
          light: '#c0392b',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Oswald', 'Impact', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        poster: '0 12px 40px -12px rgba(0, 0, 0, 0.8)',
        glow: '0 0 24px -4px rgba(232, 185, 35, 0.35)',
      },
      backgroundImage: {
        'spotlight': 'radial-gradient(ellipse at top, rgba(232,185,35,0.08), transparent 60%)',
        'film-fade': 'linear-gradient(to top, rgba(10,10,15,0.98) 0%, rgba(10,10,15,0.6) 50%, transparent 100%)',
      },
    },
  },
  plugins: [],
}
