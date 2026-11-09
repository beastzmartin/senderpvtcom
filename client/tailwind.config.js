/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          dark: '#111b21',
          panel: '#202c33',
          border: '#2a3942',
          bubbleOut: '#005c4b',
          bubbleIn: '#202c33',
          green: '#25d366',
          teal: '#00a884',
          accent: '#128c7e',
          lightBg: '#efeae2',
        }
      }
    },
  },
  plugins: [],
}

