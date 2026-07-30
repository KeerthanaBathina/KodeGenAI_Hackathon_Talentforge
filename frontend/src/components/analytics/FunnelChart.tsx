'use client';

import React, { useState } from 'react';
import { type FunnelStage } from '@/services/analyticsFunnelService';

interface FunnelChartProps {
  stages: FunnelStage[];
  largestDropTransition: string | null;
  loading?: boolean;
  error?: string | null;
}

export function FunnelChart({
  stages,
  largestDropTransition,
  loading = false,
  error = null
}: FunnelChartProps) {
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  if (loading) {
    return (
      <div
        className="bg-white rounded-lg shadow p-6"
        role="status"
        aria-label="Loading funnel chart"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Funnel Visualization</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6" role="alert">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Funnel Visualization</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Funnel Visualization</h2>
        <p className="text-gray-500">No funnel data available.</p>
      </div>
    );
  }

  const maxCount = Math.max(...stages.map((s) => s.stageCount));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Funnel Visualization</h2>

      <div className="space-y-4" role="table" aria-label="Funnel stages">
        {stages.map((stage) => {
          const widthPercent = maxCount === 0 ? 0 : (stage.stageCount / maxCount) * 100;
          const isLargestDrop = stage.stageName === largestDropTransition;

          return (
            <div
              key={stage.stageName}
              className="mb-6"
              role="row"
              onMouseEnter={() => setHoveredStage(stage.stageName)}
              onMouseLeave={() => setHoveredStage(null)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <label
                    htmlFor={`stage-${stage.stageName}`}
                    className="font-medium text-gray-900 capitalize"
                    role="columnheader"
                  >
                    {stage.stageName.replace(/_/g, ' ')}
                  </label>
                  <p className="text-sm text-gray-600">
                    {stage.stageCount} count • {stage.conversionRatePct}% conversion
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-semibold text-gray-900">{stage.stageCount}</div>
                  {isLargestDrop && (
                    <div className="inline-block px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded mt-1">
                      Largest Drop
                    </div>
                  )}
                </div>
              </div>

              <div className="relative w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                <div
                  id={`stage-${stage.stageName}`}
                  className={`h-full rounded-full transition-all duration-300 flex items-center justify-center text-xs font-semibold text-white ${
                    isLargestDrop ? 'bg-amber-500' : 'bg-blue-500'
                  } ${hoveredStage === stage.stageName ? 'opacity-80' : 'opacity-100'}`}
                  style={{ width: `${widthPercent}%` }}
                  role="progressbar"
                  aria-valuenow={stage.stageCount}
                  aria-valuemin={0}
                  aria-valuemax={maxCount}
                >
                  {widthPercent > 15 && `${Math.round(widthPercent)}%`}
                </div>
              </div>

              {isLargestDrop && hoveredStage === stage.stageName && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-gray-700">
                  <strong>Largest Drop Transition:</strong> {stage.dropCount} dropped
                  ({stage.dropRatePct}% from previous stage)
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
