import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'li.masi.guitarophone',
  appName: 'Guitarophone',
  webDir: 'dist',
  backgroundColor: '#140d08',
  ios: {
    // The guitar fills the whole screen; the page must never scroll or bounce.
    scrollEnabled: false,
    contentInset: 'never',
  },
  plugins: {
    // Full screen: no status bar, navigation bar or home indicator.
    SystemBars: {
      hidden: true,
      initialViewportFitValueHint: 'cover',
    },
  },
  android: {
    backgroundColor: '#140d08',
  },
};

export default config;
