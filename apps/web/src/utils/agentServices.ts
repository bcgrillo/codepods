/**
 * Virtual agent "services" that are not real container services but are
 * represented as a service segment in the URL so they can be deep-linked,
 * share the active-service state, and restore correctly on reload.
 */

export const CONSOLE_SERVICE_ID = '__console__';
export const SETTINGS_SERVICE_ID = '__settings__';
export const ACTIVITY_LOG_SERVICE_ID = '__activity-log__';
export const CONTAINER_LOG_SERVICE_ID = '__container-log__';

/** Map a virtual service id to its URL slug (real services fall through). */
export function serviceIdToUrlSegment(serviceId: string): string {
  switch (serviceId) {
    case CONSOLE_SERVICE_ID:
      return 'console';
    case SETTINGS_SERVICE_ID:
      return 'settings';
    case ACTIVITY_LOG_SERVICE_ID:
      return 'logs';
    case CONTAINER_LOG_SERVICE_ID:
      return 'container-logs';
    default:
      return serviceId;
  }
}

/** Map a URL slug back to its virtual service id (real services fall through). */
export function urlSegmentToServiceId(segment: string): string {
  switch (segment) {
    case 'console':
      return CONSOLE_SERVICE_ID;
    case 'settings':
      return SETTINGS_SERVICE_ID;
    case 'logs':
      return ACTIVITY_LOG_SERVICE_ID;
    case 'container-logs':
      return CONTAINER_LOG_SERVICE_ID;
    default:
      return segment;
  }
}
