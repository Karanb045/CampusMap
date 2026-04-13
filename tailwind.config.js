/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1B3A6B',
        secondary: '#0F6E56',
        accent: '#854F0B',
        surface: '#F5F7FA'
      }
    }
  },
  plugins: []
};

