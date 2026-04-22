import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        soft: '0 20px 55px -30px rgba(15, 23, 42, 0.35)',
      },
      backgroundImage: {
        'noise-light': 'radial-gradient(circle at 1px 1px, rgba(99, 102, 241, 0.08) 0.5px, transparent 0)',
      },
    },
  },
  plugins: [],
};
