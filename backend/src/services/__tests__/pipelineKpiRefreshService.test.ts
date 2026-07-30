import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeRawUnsafe: vi.fn(),
  executeRaw: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    $executeRawUnsafe: mocks.executeRawUnsafe,
    $executeRaw: mocks.executeRaw
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

import { refreshPipelineKpiMaterializedView } from '../pipelineKpiRefreshService';

describe('refreshPipelineKpiMaterializedView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeRawUnsafe.mockResolvedValue(0);
    mocks.executeRaw.mockResolvedValue(1);
  });

  it('refreshes materialized view and records success metadata', async () => {
    const result = await refreshPipelineKpiMaterializedView();

    expect(result.status).toBe('success');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mocks.executeRawUnsafe).toHaveBeenCalledWith('REFRESH MATERIALIZED VIEW "pipeline_kpi_metrics_mv"');
    expect(mocks.executeRaw).toHaveBeenCalled();
    expect(mocks.loggerInfo).toHaveBeenCalled();
  });

  it('records failure metadata and rethrows when refresh fails', async () => {
    const refreshError = new Error('refresh exploded');
    mocks.executeRawUnsafe.mockRejectedValueOnce(refreshError);

    await expect(refreshPipelineKpiMaterializedView()).rejects.toThrow('refresh exploded');
    expect(mocks.executeRaw).toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});
