/**
 * Observability Module - P5
 *
 * Event tracking, metrics collection, and monitoring
 */

export {
  recordEvent,
  startTimer,
  getEvents,
  getMetricsSummary,
  clearEvents,
  getRecentEventsSummary,
} from './service';

export type {
  ObservabilityEvent,
  EventType,
  EventStatus,
  MetricsSummary,
  EventFilter,
} from './types';
