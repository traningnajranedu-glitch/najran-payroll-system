import './globals.css';

export const metadata = {
  title: 'نظام مسيرات الرواتب | قسم التعليم المستمر - تعليم نجران',
  description: 'نظام إلكتروني لإدارة مسيرات رواتب المدارس بالإدارة العامة للتعليم بمنطقة نجران',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
