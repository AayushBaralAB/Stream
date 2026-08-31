/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        card: '#141414',
        'card-foreground': '#fafafa',
        primary: '#3b82f6',
        'primary-foreground': '#fafafa',
        secondary: '#262626',
        'secondary-foreground': '#fafafa',
        muted: '#262626',
        'muted-foreground': '#a3a3a3',
        accent: '#3b82f6',
        'accent-foreground': '#fafafa',
        destructive: '#ef4444',
        'destructive-foreground': '#fafafa',
        border: '#262626',
        input: '#262626',
        ring: '#3b82f6',
      },
    },
  },
  plugins: [],
}