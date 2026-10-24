/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Primary — electric blue → cyan, as in the MDA identity */
        brand: {
          50: '#eef7ff', 100: '#d9ecff', 200: '#b6dbff', 300: '#79c2ff', 400: '#38a4ff',
          500: '#1185ff', 600: '#0068f0', 700: '#0a53c4', 800: '#0f459e', 900: '#123b7d', 950: '#0a1f45',
        },
        /* Surfaces — deep navy instead of neutral slate */
        ink: {
          50: '#f2f6fd', 100: '#e4ecf9', 200: '#cbdaf1', 300: '#a2b9dd', 400: '#7f9dc9',
          500: '#5f7fae', 600: '#35527c', 700: '#233c5f', 800: '#132844', 900: '#0a1930', 950: '#050c1a',
        },
        aqua: { 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
      },
      fontFamily: {
        sans: ['Inter Variable', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        ar: ['IBM Plex Sans Arabic', 'Inter Variable', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(3,10,24,.18), 0 18px 40px -26px rgba(0,0,0,.85)',
        float: '0 16px 40px -16px rgba(17,133,255,.65)',
        glow: '0 0 0 1px rgba(56,164,255,.18), 0 18px 50px -24px rgba(17,133,255,.75)',
        tile: '0 10px 24px -12px rgba(2,10,26,.9)',
        inner1: 'inset 0 1px 0 rgba(255,255,255,.06)',
      },
      borderRadius: { '2xl': '1.15rem', '3xl': '1.6rem', '4xl': '2rem' },
      spacing: { '4.5': '1.125rem', '18': '4.5rem' },
      backgroundImage: {
        'brand-grad': 'linear-gradient(135deg,#1b6dff 0%,#0aa7ff 55%,#22d3ee 100%)',
        'brand-grad-soft': 'linear-gradient(135deg,rgba(27,109,255,.18),rgba(34,211,238,.12))',
        'hero-grad': 'linear-gradient(135deg,#0b2f7a 0%,#1257d6 45%,#0891b2 100%)',
        'tile-grad': 'linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,.02))',
      },
      animation: {
        'fade-up': 'fadeUp .45s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fadeIn .3s ease both',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        'float-slow': 'floatSlow 7s ease-in-out infinite',
        'aurora': 'aurora 18s ease-in-out infinite',
        'shimmer': 'shimmer 2.6s linear infinite',
        'ping-slow': 'pingSlow 3s cubic-bezier(0,0,.2,1) infinite',
        'rise': 'rise .6s cubic-bezier(.22,1,.36,1) both',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: .55 } },
        floatSlow: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        rise: { '0%': { opacity: 0, transform: 'translateY(24px) scale(.98)' }, '100%': { opacity: 1, transform: 'translateY(0) scale(1)' } },
        aurora: {
          '0%,100%': { transform: 'translate3d(-2%,-1%,0) scale(1)' },
          '50%': { transform: 'translate3d(3%,2%,0) scale(1.08)' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pingSlow: { '0%': { transform: 'scale(1)', opacity: .5 }, '80%,100%': { transform: 'scale(1.9)', opacity: 0 } },
      },
    },
  },
  plugins: [],
};
