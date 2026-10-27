import type { CapacitorConfig } from '@capacitor/cli';

/**
 * MDA — Android wrapper (Capacitor).
 * Build the web app first (`npm run build`), then `npx cap sync android`.
 *
 * The packaged app loads the built SPA from `dist`. API requests must reach the
 * hosted backend: set VITE_API_BASE at build time, or ship `server.url` below
 * (live-reload / remote hosting).
 */
const config: CapacitorConfig = {
  appId: 'com.mda.medicinedata',
  appName: 'MDA — MedicineData',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#050c1a',
  },
  plugins: {
    /*
     * Native HTTP. Without it every API call from the WebView (origin https://localhost)
     * is cross-origin and depends on the *server* sending CORS headers — which a server
     * deployed before v1.8.2 does not. With it, requests are executed by Android itself
     * and reach any deployed version of the API. See src/lib/nativeHttp.ts.
     */
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#050c1a',
      androidScaleType: 'CENTER_CROP',
    },
  },
  // server: { url: 'https://your-mda-host.example.com', cleartext: false },
};

export default config;
