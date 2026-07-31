'use client';

import React, { useEffect, useState } from 'react';
import { ScreeningThreshold } from '../../types/policy';
import { policyService } from '../../services/policyService';
import { ChangeBadge } from './ChangeBadge';
import { ScreeningThresholdDetailsModal } from './PolicyVersionDetailsModal';
import { ScreeningThresholdComparisonModal } from './PolicyVersionComparisonModal';

interface ScreeningThresholdHistoryProps {
  limit?: number;
}

/**
 * History viewer for Screening Thresholds
 * Shows all versions with change tracking and comparison
 */
export function ScreeningThresholdHistory({ limit = 20 }: ScreeningThresholdHistoryProps) {
  const [history, setHistory] = useState<ScreeningThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<ScreeningThreshold | null>(null);
  const [compareVersions, setCompareVersions] = useState<[ScreeningThreshold, ScreeningThreshold] | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      setLoading(true);
      const data = await policyService.getScreeningThresholdHistory(limit);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load screening threshold history:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No screening threshold history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="px-4 py-3 text-left text-sm font-semibold">Version</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Effective From</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Shortlist</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Borderline Range</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Reject</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Created</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.map((version, index) => (
              <tr
                key={version.id}
                className={`border-b hover:bg-gray-50 ${
                  index === 0 ? 'bg-green-50' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">v{version.version}</span>
                    {index === 0 && (
                      <span className="inline-block px-2 py-1 text-xs font-bold text-white bg-green-600 rounded">
                        Current
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(version.effectiveFrom).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <ChangeBadge
                    current={version.shortlistThreshold}
                    previous={history[index + 1]?.shortlistThreshold}
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div>
                    {version.borderlineMin} - {version.borderlineMax}
                    {history[index + 1] &&
                      (history[index + 1]?.borderlineMin !== version.borderlineMin ||
                        history[index + 1]?.borderlineMax !== version.borderlineMax) && (
                        <span className="ml-2 text-xs text-blue-600">●</span>
                      )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ChangeBadge
                    current={version.rejectThreshold}
                    previous={history[index + 1]?.rejectThreshold}
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(version.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button
                    onClick={() => setSelectedVersion(version)}
                    className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    Details
                  </button>
                  {index < history.length - 1 && (
                    <button
                      onClick={() => {
                        const nextVersion = history[index + 1];
                        if (nextVersion) {
                          setCompareVersions([version, nextVersion]);
                        }
                      }}
                      className="px-3 py-1 text-purple-600 hover:bg-purple-50 rounded"
                    >
                      Compare
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {selectedVersion && (
        <ScreeningThresholdDetailsModal
          isOpen={!!selectedVersion}
          onClose={() => setSelectedVersion(null)}
          version={selectedVersion}
          previousVersion={
            history[history.indexOf(selectedVersion) + 1] || undefined
          }
        />
      )}

      {compareVersions && (
        <ScreeningThresholdComparisonModal
          isOpen={!!compareVersions}
          onClose={() => setCompareVersions(null)}
          versionA={compareVersions[0]}
          versionB={compareVersions[1]}
        />
      )}
    </div>
  );
}
