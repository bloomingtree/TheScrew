/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          orange: '#f36f11',
          blue: '#034c7a',
          cyan: '#00c5d4',
        },
        background: {
          cream: '#fff1e8',
          workspace: '#fffffe',
        },
        button: {
          bg: '#f5f4f2',
          text: '#292929',
        },
        cream: {
          50: '#fff1e8',
          900: '#292929',
          700: '#292929',
          600: '#292929',
          500: '#034c7a',
        },
        workspace: {
          50: '#fffffe',
        },
        glass: {
          bg: 'rgba(255, 255, 255, 0.1)',
          border: 'rgba(255, 255, 255, 0.2)',
          text: 'rgba(255, 255, 255, 0.9)',
        },
        neon: {
          purple: '#a855f7',
          blue: '#3b82f6',
          pink: '#ec4899',
        },
      },
      animation: {
        'gradient-x': 'gradient-x 15s ease infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center'
          },
        },
        'fadeIn': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        }
      },
    },
  },
  plugins: [],
}
