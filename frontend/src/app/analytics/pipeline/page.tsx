'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { PipelineKpiCards } from '@/components/analytics/PipelineKpiCards';
import { RequisitionFilter } from '@/components/analytics/RequisitionFilter';
import { FunnelChart } from '@/components/analytics/FunnelChart';
import { ConfusionMatrix } from '@/components/analytics/ConfusionMatrix';
import { NoShowKpiCard } from '@/components/analytics/NoShowKpiCard';
import { NoShowSparkline } from '@/components/analytics/NoShowSparkline';
import {
  fetchOpenRequisitions,
  fetchPipelineAnalytics,
  type PipelineAnalyticsData,
  type RequisitionOption
} from '@/services/pipelineAnalyticsService';
import { fetchFunnelAnalytics, type FunnelAnalyticsData } from '@/services/analyticsFunnelService';
import {
  fetchConfusionMatrixAnalytics,
  type ConfusionMatrixAnalyticsData
} from '@/services/confusionMatrixService';
import { fetchNoShowAnalytics, type NoShowAnalyticsData } from '@/services/noShowAnalyticsService';

const FILTER_DEBOUNCE_MS = 300;

function formatLastUpdated(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString();
}

export default function PipelineAnalyticsPage() {
  const [kpiData, setKpiData] = useState<PipelineAnalyticsData | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);

  const [funnelData, setFunnelData] = useState<FunnelAnalyticsData | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelError, setFunnelError] = useState<string | null>(null);

  const [matrixData, setMatrixData] = useState<ConfusionMatrixAnalyticsData | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  const [noShowData, setNoShowData] = useState<NoShowAnalyticsData | null>(null);
  const [noShowLoading, setNoShowLoading] = useState(true);
  const [noShowError, setNoShowError] = useState<string | null>(null);

  const [requisitions, setRequisitions] = useState<RequisitionOption[]>([]);
  const [requisitionsLoading, setRequisitionsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequisitionId, setSelectedRequisitionId] = useState<string | undefined>();
  const [debouncedRequisitionId, setDebouncedRequisitionId] = useState<string | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRequisitionId(selectedRequisitionId);
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [selectedRequisitionId]);

  useEffect(() => {
    async function loadRequisitions() {
      try {
        const data = await fetchOpenRequisitions();
        setRequisitions(data);
      } catch {
        setRequisitions([]);
      } finally {
        setRequisitionsLoading(false);
      }
    }

    void loadRequisitions();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadKpis() {
      setKpiLoading(true);
      setKpiError(null);
      setFunnelLoading(true);
      setFunnelError(null);
      setMatrixLoading(true);
      setMatrixError(null);
      setNoShowLoading(true);
      setNoShowError(null);

      try {
        const [kpiPayload, funnelPayload, matrixPayload, noShowPayload] = await Promise.all([
          fetchPipelineAnalytics(debouncedRequisitionId),
          fetchFunnelAnalytics(debouncedRequisitionId),
          fetchConfusionMatrixAnalytics(debouncedRequisitionId),
          fetchNoShowAnalytics(debouncedRequisitionId)
        ]);

        if (!cancelled) {
          setKpiData(kpiPayload);
          setFunnelData(funnelPayload);
          setMatrixData(matrixPayload);
          setNoShowData(noShowPayload);
        }
      } catch (error) {
        if (!cancelled) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to load analytics';
          setKpiError(errorMsg);
          setFunnelError(errorMsg);
          setMatrixError(errorMsg);
          setNoShowError(errorMsg);
          setKpiData(null);
          setFunnelData(null);
          setMatrixData(null);
          setNoShowData(null);
        }
      } finally {
        if (!cancelled) {
          setKpiLoading(false);
          setFunnelLoading(false);
          setMatrixLoading(false);
          setNoShowLoading(false);
        }
      }
    }

    void loadKpis();

    return () => {
      cancelled = true;
    };
  }, [debouncedRequisitionId]);

  const activeFilterLabel = useMemo(() => {
    if (!selectedRequisitionId) {
      return 'All requisitions';
    }

    return requisitions.find((item) => item.id === selectedRequisitionId)?.title ?? 'Selected requisition';
  }, [requisitions, selectedRequisitionId]);

  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-8" aria-labelledby="pipeline-dashboard-heading">
      <header className="mb-6">
        <h1 id="pipeline-dashboard-heading" className="text-3xl font-bold text-gray-900">
          Pipeline Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          Monitor applications, shortlist performance, time-to-hire, and offer acceptance trends.
        </p>
      </header>

      <div className="mb-4 text-sm text-gray-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p>
          Scope: <span className="font-medium text-gray-900">{activeFilterLabel}</span>
        </p>
        <p aria-live="polite" data-testid="last-updated-label">
          Last updated: {formatLastUpdated(kpiData?.lastRefreshedAt ?? null)}
        </p>
      </div>

      <div className="mb-6">
        <RequisitionFilter
          options={requisitions}
          selectedRequisitionId={selectedRequisitionId}
          searchTerm={searchTerm}
          loading={requisitionsLoading}
          onSearchTermChange={setSearchTerm}
          onSelectionChange={setSelectedRequisitionId}
          onClear={() => {
            setSearchTerm('');
            setSelectedRequisitionId(undefined);
          }}
        />
      </div>

      <PipelineKpiCards data={kpiData} loading={kpiLoading} error={kpiError} />

      <section className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4" aria-label="No-show analytics panel">
        <NoShowKpiCard data={noShowData} loading={noShowLoading} error={noShowError} />
        <div className="xl:col-span-2">
          <NoShowSparkline
            trend30d={noShowData?.trend30d ?? []}
            loading={noShowLoading}
            error={noShowError}
          />
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          {funnelData && (
            <FunnelChart
              stages={funnelData.stages}
              largestDropTransition={funnelData.largestDropTransition}
              loading={funnelLoading}
              error={funnelError}
            />
          )}
        </div>

        <div>
          {matrixData && <ConfusionMatrix data={matrixData} loading={matrixLoading} error={matrixError} />}
        </div>
      </div>
    </main>
  );
}
