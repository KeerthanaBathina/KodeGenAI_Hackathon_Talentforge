import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NotificationProviderWrapper } from '../components/NotificationProviderWrapper';
import { ToastProvider } from '../contexts/ToastContext';
import { ToastContainer } from '../components/ToastContainer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body-inter',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-heading-plus-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Interview Platform',
  description: 'Frontend deployed via Vercel with preview environments.'
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${plusJakarta.variable}`}>
        <ToastProvider>
          <ToastContainer />
          <NotificationProviderWrapper>
            {children}
          </NotificationProviderWrapper>
        </ToastProvider>
      </body>
    </html>
  );
}
