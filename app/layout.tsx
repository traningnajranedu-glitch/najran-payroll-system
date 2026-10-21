import './globals.css';
import './rifad-dashboard.css';
import MobileRegister from './mobile-register';

export const metadata = {
  title: 'بوابة رفاد لمدارس التعليم المستمر | تعليم نجران',
  description: 'بوابة رفاد لمدارس التعليم المستمر بالإدارة العامة للتعليم بمنطقة نجران',
  manifest: '/manifest.json',
  themeColor: '#073b7c',
  icons: { icon: '/portal-brand.svg?v=rifad-20261021', apple: '/portal-brand.svg?v=rifad-20261021' },
  appleWebApp: { capable: true, title: 'بوابة رفاد', statusBarStyle: 'default' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="مدارس التعليم المستمر"/><meta name="theme-color" content="#073b7c"/></head><body><a href="#main-content" className="skip-link">تجاوز إلى المحتوى الرئيسي</a><MobileRegister />{children}</body></html>;
}