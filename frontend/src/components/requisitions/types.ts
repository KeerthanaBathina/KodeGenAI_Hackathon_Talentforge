export interface ImportResultData {
  success: boolean;
  message: string;
  results: {
    totalRows: number;
    importedCount: number;
    invalidCount: number;
    duplicateCount: number;
    importedRequisitions: string[];
  };
  errorReportUrl?: string;
  processingTime?: number;
}
