'use client';

/**
 * Threshold Range Visualizer Component
 *
 * Visual representation of screening threshold ranges
 */

import React from 'react';
import type { RangeValidationError } from '@/types/policy';

interface ThresholdRangeVisualizerProps {
  reject: number | string;
  borderlineMin: number | string;
  borderlineMax: number | string;
  shortlist: number | string;
  errors: RangeValidationError[];
}

export const ThresholdRangeVisualizer: React.FC<ThresholdRangeVisualizerProps> = ({
  reject,
  borderlineMin,
  borderlineMax,
  shortlist,
  errors,
}) => {
  const rejectNum = Number(reject);
  const borderlineMinNum = Number(borderlineMin);
  const borderlineMaxNum = Number(borderlineMax);
  const shortlistNum = Number(shortlist);

  // Calculate percentages for each segment
  const rejectWidth = Math.max(0, rejectNum);
  const borderlineWidth = Math.max(0, borderlineMaxNum - borderlineMinNum);
  const reviewWidth = Math.max(0, shortlistNum - borderlineMaxNum);
  const greenWidth = Math.max(0, 100 - shortlistNum);

  const hasErrors = errors.length > 0;
  const errorFields = new Set(errors.map((e) => e.field));

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
      <div className="space-y-3">
        {/* Visual Range Bar */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-700">Score Range</span>
            <span className="text-xs text-gray-500">(0-100)</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium w-6 text-gray-600">0</span>

            <div className="flex-1 h-10 rounded overflow-hidden flex border-2 border-gray-300 bg-white">
              {/* Reject Range (Red) */}
              {rejectWidth > 0 && (
                <div
                  className={`flex items-center justify-center transition-colors ${
                    errorFields.has('rejectThreshold')
                      ? 'bg-red-400'
                      : 'bg-red-200 hover:bg-red-300'
                  }`}
                  style={{ width: `${rejectWidth}%` }}
                  title={`Auto-reject: 0-${rejectNum}`}
                >
                  {rejectWidth > 12 && (
                    <span className="text-xs font-semibold text-red-800">Reject</span>
                  )}
                </div>
              )}

              {/* Borderline Min to Borderline Max (Yellow) */}
              {borderlineWidth > 0 && (
                <div
                  className={`flex items-center justify-center transition-colors ${
                    errorFields.has('borderlineMin') || errorFields.has('borderlineMax')
                      ? 'bg-yellow-400'
                      : 'bg-yellow-200 hover:bg-yellow-300'
                  }`}
                  style={{ width: `${borderlineWidth}%` }}
                  title={`Manual Review: ${borderlineMinNum}-${borderlineMaxNum}`}
                >
                  {borderlineWidth > 12 && (
                    <span className="text-xs font-semibold text-yellow-800">Review</span>
                  )}
                </div>
              )}

              {/* Borderline Max to Shortlist (Light Green) */}
              {reviewWidth > 0 && (
                <div
                  className="flex items-center justify-center bg-green-100 hover:bg-green-200 transition-colors"
                  style={{ width: `${reviewWidth}%` }}
                  title={`Potential Shortlist: ${borderlineMaxNum}-${shortlistNum}`}
                >
                  {reviewWidth > 12 && (
                    <span className="text-xs font-semibold text-green-800">Review</span>
                  )}
                </div>
              )}

              {/* Shortlist Range (Dark Green) */}
              {greenWidth > 0 && (
                <div
                  className={`flex items-center justify-center transition-colors ${
                    errorFields.has('shortlistThreshold')
                      ? 'bg-green-400'
                      : 'bg-green-200 hover:bg-green-300'
                  }`}
                  style={{ width: `${greenWidth}%` }}
                  title={`Auto-shortlist: ${shortlistNum}-100`}
                >
                  {greenWidth > 12 && (
                    <span className="text-xs font-semibold text-green-800">Shortlist</span>
                  )}
                </div>
              )}
            </div>

            <span className="text-xs font-medium w-6 text-gray-600">100</span>
          </div>
        </div>

        {/* Threshold Labels */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-red-200 rounded border border-red-400"></span>
            <span className="text-gray-600">
              Reject:{' '}
              <span className={errorFields.has('rejectThreshold') ? 'text-red-600 font-bold' : ''}>
                {isNaN(rejectNum) ? '—' : rejectNum}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-yellow-200 rounded border border-yellow-400"></span>
            <span className="text-gray-600">
              Min:{' '}
              <span
                className={
                  errorFields.has('borderlineMin') ? 'text-red-600 font-bold' : ''
                }
              >
                {isNaN(borderlineMinNum) ? '—' : borderlineMinNum}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-yellow-200 rounded border border-yellow-400"></span>
            <span className="text-gray-600">
              Max:{' '}
              <span
                className={
                  errorFields.has('borderlineMax') ? 'text-red-600 font-bold' : ''
                }
              >
                {isNaN(borderlineMaxNum) ? '—' : borderlineMaxNum}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-green-200 rounded border border-green-400"></span>
            <span className="text-gray-600">
              Shortlist:{' '}
              <span
                className={
                  errorFields.has('shortlistThreshold') ? 'text-red-600 font-bold' : ''
                }
              >
                {isNaN(shortlistNum) ? '—' : shortlistNum}
              </span>
            </span>
          </div>
        </div>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-xs font-medium text-red-800 mb-1">Validation Issues:</p>
            <ul className="space-y-1">
              {errors.map((error, i) => (
                <li key={i} className="text-xs text-red-700 flex items-start gap-2">
                  <span className="text-red-500 mt-1">•</span>
                  <span>{error.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Info Message */}
        {!errors.length && (
          <p className="text-xs text-gray-600 italic">
            Range shows how applications will be automatically categorized based on their scores.
          </p>
        )}
      </div>
    </div>
  );
};

export default ThresholdRangeVisualizer;
