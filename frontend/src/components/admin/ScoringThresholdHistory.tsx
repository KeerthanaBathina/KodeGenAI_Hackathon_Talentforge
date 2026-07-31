'use client';

import React, { useEffect, useState } from 'react';
import { ScoringThreshold } from '../../types/policy';
import { policyService } from '../../services/policyService';
import { DecimalChangeBadge } from './ChangeBadge';
import { ScoringThresholdDetailsModal } from './PolicyVersionDetailsModal';
import { ScoringThresholdComparisonModal } from './PolicyVersionComparisonModal';

interface ScoringThresholdHistoryProps {
  limit?: number;
}

interface JobFamily {
  id: string;
  name: string;
}

interface GroupedHistory {
  jobFamily: JobFamily;
  versions: ScoringThreshold[];
}

/**
 * History viewer for Scoring Thresholds
 * Grouped by job family with change tracking
 */
export function ScoringThresholdHistory({ limit = 20 }: ScoringThresholdHistoryProps) {
  const [allHistory, setAllHistory] = useState<ScoringThreshold[]>([]);
  const [jobFamilies, setJobFamilies] = useState<JobFamily[]>([]);
  const [selectedJobFamily, setSelectedJobFamily] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<ScoringThreshold | null>(null);
  const [compareVersions, setCompareVersions] = useState<[ScoringThreshold, ScoringThreshold] | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [jobFamiliesData, historyData] = await Promise.all([
        policyService.getJobFamilies(),
        policyService.getScoringThresholdHistory(limit),
      ]);
      setJobFamilies(jobFamiliesData);
      setAllHistory(historyData);
      const firstJobFamily = jobFamiliesData[0];
      if (firstJobFamily) {
        setSelectedJobFamily(firstJobFamily.id);
      }
    } catch (error) {
      console.error('Failed to load scoring threshold history:', error);
    } finally {
      setLoading(false);
    }
  }

  const groupedHistory: GroupedHistory[] = React.useMemo(() => {
    const grouped: { [key: string]: ScoringThreshold[] } = {};

    allHistory.forEach((threshold) => {
      const existing = grouped[threshold.jobFamilyId];
      if (existing) {
        existing.push(threshold);
      } else {
        grouped[threshold.jobFamilyId] = [threshold];
      }
    });

    return Object.entries(grouped)
      .map(([jobFamilyId, versions]) => ({
        jobFamily:
          jobFamilies.find((jf) => jf.id === jobFamilyId) || {
            id: jobFamilyId,
            name: jobFamilyId,
          },
        versions: versions.sort(
          (a, b) =>
            new Date(b.effectiveFrom).getTime() -
            new Date(a.effectiveFrom).getTime()
        ),
      }))
      .filter((group) =>
        selectedJobFamily ? group.jobFamily.id === selectedJobFamily : true
      )
      .sort((a, b) => a.jobFamily.name.localeCompare(b.jobFamily.name));
  }, [allHistory, jobFamilies, selectedJobFamily]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (allHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No scoring threshold history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Job Family Filter */}
      <div className="flex items-center gap-4">
        <label className="font-medium text-gray-700">Filter by Job Family:</label>
        <select
          value={selectedJobFamily}
          onChange={(e) => setSelectedJobFamily(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Job Families</option>
          {jobFamilies.map((jf) => (
            <option key={jf.id} value={jf.id}>
              {jf.name}
            </option>
          ))}
        </select>
      </div>

      {/* Grouped History by Job Family */}
      {groupedHistory.map((group) => (
        <div key={group.jobFamily.id} className="border rounded-lg overflow-hidden">
          {/* Group Header */}
          <div className="bg-blue-50 px-4 py-3 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              {group.jobFamily.name}
            </h3>
          </div>

          {/* History Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Effective From
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    AI Threshold
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Experience (Years)
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Created By
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.versions.map((version, index) => (
                  <tr
                    key={version.id}
                    className={`border-b hover:bg-gray-50 ${
                      index === 0 ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-sm">
                      {new Date(version.effectiveFrom).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <DecimalChangeBadge
                        current={version.aiShortlistThreshold}
                        previous={group.versions[index + 1]?.aiShortlistThreshold}
                        decimals={4}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <DecimalChangeBadge
                        current={version.confidenceThreshold}
                        previous={group.versions[index + 1]?.confidenceThreshold}
                        decimals={4}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {version.experienceThresholdYears}
                      </span>
                      {group.versions[index + 1] &&
                        group.versions[index + 1]?.experienceThresholdYears !==
                          version.experienceThresholdYears && (
                          <span className="ml-2 text-xs text-blue-600">●</span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {version.createdBy || 'N/A'}
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
                      {index < group.versions.length - 1 && (
                        <button
                          onClick={() => {
                            const nextVersion = group.versions[index + 1];
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
        </div>
      ))}

      {/* Modals */}
      {selectedVersion && (
        <ScoringThresholdDetailsModal
          isOpen={!!selectedVersion}
          onClose={() => setSelectedVersion(null)}
          version={selectedVersion}
          jobFamilyName={
            jobFamilies.find((jf) => jf.id === selectedVersion.jobFamilyId)
              ?.name
          }
          previousVersion={
            allHistory.find(
              (h) =>
                h.jobFamilyId === selectedVersion.jobFamilyId &&
                new Date(h.effectiveFrom).getTime() <
                  new Date(selectedVersion.effectiveFrom).getTime()
            )
          }
        />
      )}

      {compareVersions && (
        <ScoringThresholdComparisonModal
          isOpen={!!compareVersions}
          onClose={() => setCompareVersions(null)}
          versionA={compareVersions[0]}
          versionB={compareVersions[1]}
          jobFamilyName={
            jobFamilies.find((jf) => jf.id === compareVersions[0].jobFamilyId)
              ?.name
          }
        />
      )}
    </div>
  );
}
