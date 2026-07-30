'use client';

import React from 'react';
import { type ConfusionMatrixAnalyticsData } from '@/services/confusionMatrixService';

interface ConfusionMatrixProps {
  data: ConfusionMatrixAnalyticsData;
  loading?: boolean;
  error?: string | null;
}

export function ConfusionMatrix({ data, loading = false, error = null }: ConfusionMatrixProps) {
  if (loading) {
    return (
      <div
        className="bg-white rounded-lg shadow p-6"
        role="status"
        aria-label="Loading confusion matrix"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Screening Accuracy</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6" role="alert">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Screening Accuracy</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const total =
    data.truePositives + data.falsePositives + data.trueNegatives + data.falseNegatives;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">AI Screening Accuracy</h2>

      <div className="mb-8">
        <div className="grid grid-cols-2 gap-4 mb-4" role="table" aria-label="Confusion matrix">
          {/* TP */}
          <div
            className="bg-green-50 border-2 border-green-200 rounded-lg p-4"
            role="row"
            aria-label="True Positives"
          >
            <div className="text-sm font-medium text-green-700 mb-1">True Positives (TP)</div>
            <div className="text-3xl font-bold text-green-900">{data.truePositives}</div>
            <p className="text-xs text-green-600 mt-2">Correctly recommended for offer</p>
          </div>

          {/* FP */}
          <div
            className="bg-red-50 border-2 border-red-200 rounded-lg p-4"
            role="row"
            aria-label="False Positives"
          >
            <div className="text-sm font-medium text-red-700 mb-1">False Positives (FP)</div>
            <div className="text-3xl font-bold text-red-900">{data.falsePositives}</div>
            <p className="text-xs text-red-600 mt-2">Incorrectly recommended for offer</p>
          </div>

          {/* TN */}
          <div
            className="bg-green-50 border-2 border-green-200 rounded-lg p-4"
            role="row"
            aria-label="True Negatives"
          >
            <div className="text-sm font-medium text-green-700 mb-1">True Negatives (TN)</div>
            <div className="text-3xl font-bold text-green-900">{data.trueNegatives}</div>
            <p className="text-xs text-green-600 mt-2">Correctly rejected/held</p>
          </div>

          {/* FN */}
          <div
            className="bg-red-50 border-2 border-red-200 rounded-lg p-4"
            role="row"
            aria-label="False Negatives"
          >
            <div className="text-sm font-medium text-red-700 mb-1">False Negatives (FN)</div>
            <div className="text-3xl font-bold text-red-900">{data.falseNegatives}</div>
            <p className="text-xs text-red-600 mt-2">Missed offer candidates</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg" role="region" aria-label="Precision metric">
            <div className="text-sm font-medium text-blue-700">Precision</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{(data.precision * 100).toFixed(2)}%</div>
            <p className="text-xs text-blue-600 mt-2">Of recommended, how many were correct</p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg" role="region" aria-label="Recall metric">
            <div className="text-sm font-medium text-purple-700">Recall</div>
            <div className="text-2xl font-bold text-purple-900 mt-1">{(data.recall * 100).toFixed(2)}%</div>
            <p className="text-xs text-purple-600 mt-2">Of actual positives, how many caught</p>
          </div>

          <div className="p-4 bg-indigo-50 rounded-lg" role="region" aria-label="F1 score metric">
            <div className="text-sm font-medium text-indigo-700">F1 Score</div>
            <div className="text-2xl font-bold text-indigo-900 mt-1">{(data.f1Score * 100).toFixed(2)}%</div>
            <p className="text-xs text-indigo-600 mt-2">Harmonic balance of precision & recall</p>
          </div>

          <div className="p-4 bg-teal-50 rounded-lg" role="region" aria-label="Accuracy metric">
            <div className="text-sm font-medium text-teal-700">Accuracy</div>
            <div className="text-2xl font-bold text-teal-900 mt-1">{(data.accuracy * 100).toFixed(2)}%</div>
            <p className="text-xs text-teal-600 mt-2">Overall correctness across all cases</p>
          </div>
        </div>
      </div>

      {total === 0 && (
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
          No screening data available for this requisition.
        </div>
      )}
    </div>
  );
}
