'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';

interface EmailDeliveryProps {
  emailDelivery?: {
    totalAttempted: number;
    successful: number;
    failed: number;
    successRate: number;
    failedEmails: Array<{
      id: string;
      to: string;
      templateType: string;
      status: string;
      createdAt: string;
    }>;
  };
}

/**
 * Email Delivery Metrics Section
 * Displays email delivery statistics and failed emails list
 */
export function EmailDeliverySection({ emailDelivery }: EmailDeliveryProps) {
  const [showFailedEmails, setShowFailedEmails] = useState(false);

  if (!emailDelivery) return null;

  const { totalAttempted, successful, failed, successRate, failedEmails } = emailDelivery;

  return (
    <section>
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">Email Delivery Metrics (Last 60 min)</h2>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Success Rate"
          value={`${successRate}%`}
          subtitle={`${successful} delivered`}
          color={successRate >= 95 ? 'green' : successRate >= 90 ? 'amber' : 'red'}
        />
        <MetricCard title="Total Attempted" value={totalAttempted} subtitle="emails sent" color="blue" />
        <MetricCard title="Successful" value={successful} subtitle="delivered" color="green" />
        <MetricCard
          title="Failed"
          value={failed}
          subtitle={failed > 0 ? 'needs attention' : 'all good'}
          color={failed > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Failed Emails Expandable Section */}
      {failed > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowFailedEmails(!showFailedEmails)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900">Failed Emails ({failed})</h3>
            <span className="text-blue-600 font-medium flex items-center gap-2">
              {showFailedEmails ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Hide
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  View Failed
                </>
              )}
            </span>
          </button>

          {showFailedEmails && (
            <div className="border-t border-gray-200">
              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        To
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Template
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {failedEmails.map((email) => (
                      <tr key={email.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-sm text-gray-900 font-medium">{email.to}</td>
                        <td className="px-6 py-3 text-sm text-gray-600">
                          <span className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                            {email.templateType}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-block px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                            {email.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-600">
                          {format(new Date(email.createdAt), 'PPp')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 text-center">
                <Link
                  href="/admin/health/email/failed"
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                >
                  View All Failed Emails ({failed} total) →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Good Message */}
      {failed === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">✓</div>
          <h3 className="text-lg font-semibold text-green-900">All Email Deliveries Successful</h3>
          <p className="text-green-700 mt-1">
            {totalAttempted} emails delivered with {successRate}% success rate
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Metric Card Component
 * Displays a single metric with color coding
 */
function MetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  color: 'green' | 'amber' | 'red' | 'blue';
}) {
  const colorConfig = {
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      subtitle: 'text-green-700',
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      subtitle: 'text-amber-700',
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      subtitle: 'text-red-700',
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      subtitle: 'text-blue-700',
    },
  };

  const config = colorConfig[color];

  return (
    <div className={`${config.bg} border ${config.border} rounded-lg p-4`}>
      <h3 className={`text-sm font-medium opacity-75 ${config.text}`}>{title}</h3>
      <p className={`text-3xl font-bold mt-2 ${config.text}`}>{value}</p>
      <p className={`text-xs opacity-75 mt-1 ${config.subtitle}`}>{subtitle}</p>
    </div>
  );
}
