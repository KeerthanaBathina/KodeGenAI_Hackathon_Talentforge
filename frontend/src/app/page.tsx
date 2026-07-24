import React from 'react';

export default function HomePage() {
  return (
    <main className="home">
      <h1>AI Interview Platform</h1>
      <p>Frontend baseline is live and ready for Vercel preview deployments.</p>
      <div className="home-actions">
        <a href="/register">Create account</a>
        <a href="/verify-otp">Verify OTP</a>
      </div>
    </main>
  );
}
