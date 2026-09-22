import './globals.css';

export const metadata = {
  title: 'البوابة الإلكترونية لمدارس التعليم المستمر | تعليم نجران',
  description: 'البوابة الإلكترونية لمدارس التعليم المستمر بالإدارة العامة للتعليم بمنطقة نجران',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
