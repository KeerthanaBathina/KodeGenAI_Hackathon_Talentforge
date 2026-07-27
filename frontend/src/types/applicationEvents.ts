/**
 * WebSocket Event Types for Application Prerequisites
 * 
 * Defines the structure of real-time events emitted by the backend
 * when stages or assessments are completed.
 */

export interface StageCompletedEvent {
  applicationId: string;
  stageId: string;
  stageType: 'technical' | 'coding' | 'behavioral' | 'hr' | 'aptitude' | 'panel' | 'final';
  completedAt: string;  // ISO 8601 date string
  completedBy: string;   // User ID
}

export interface AssessmentCompletedEvent {
  applicationId: string;
  assessmentId: string;
  score: number;
  completedAt: string;  // ISO 8601 date string
}

export type ApplicationEventName = 'stage:completed' | 'assessment:completed' | 'joined:application';

export interface ApplicationEventMap {
  'stage:completed': StageCompletedEvent;
  'assessment:completed': AssessmentCompletedEvent;
  'joined:application': { applicationId: string };
}
