import './globals.css';
import MobileRegister from './mobile-register';

export const metadata = {
  title: 'البوابة الإلكترونية لمدارس التعليم المستمر | تعليم نجران',
  description: 'البوابة الإلكترونية لمدارس التعليم المستمر بالإدارة العامة للتعليم بمنطقة نجران',
  manifest: '/manifest.json',
  themeColor: '#0b6b50',
  appleWebApp: { capable: true, title: 'مدارس التعليم المستمر', statusBarStyle: 'default' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body><MobileRegister />{children}</body></html>;
}
