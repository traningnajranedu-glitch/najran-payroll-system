import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sa.gov.najran.continuingeducation.portal',
  appName: 'البوابة الإلكترونية لمدارس التعليم المستمر',
  webDir: 'www',
  server: {
    url: 'https://najran-payroll-system.vercel.app',
    cleartext: false
  },
  android: {
    allowMixedContent: false
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
