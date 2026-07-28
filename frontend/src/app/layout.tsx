import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NotificationProviderWrapper } from '../components/NotificationProviderWrapper';
import { ToastProvider } from '../contexts/ToastContext';
import { ToastContainer } from '../components/ToastContainer';

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
      <body>
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
