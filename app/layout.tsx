import './globals.css';
import MobileRegister from './mobile-register';

export const metadata = {
  title: 'البوابة الإلكترونية لمدارس التعليم المستمر | تعليم نجران',
  description: 'البوابة الإلكترونية لمدارس التعليم المستمر بالإدارة العامة للتعليم بمنطقة نجران',
  manifest: '/manifest.json',
  themeColor: '#0b6b50',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'مدارس التعليم المستمر', statusBarStyle: 'default' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="مدارس التعليم المستمر"/><meta name="theme-color" content="#0b6b50"/></head><body><MobileRegister />{children}</body></html>;
}