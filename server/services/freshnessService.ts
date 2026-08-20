import { config } from '../config.ts';

export interface FreshnessInfo {
  status: 'FRESH' | 'AGING' | 'STALE';
  label: string;
  last_verified_at: string;
  hours_since_verification: number;
  is_stale: boolean;
}

export function calculateFreshness(timestampStr: string): FreshnessInfo {
  const verifiedDate = new Date(timestampStr || Date.now());
  const now = new Date();
  const diffMs = now.getTime() - verifiedDate.getTime();
  const hours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

  const { freshHours, agingHours } = config.freshness;

  if (hours < freshHours) {
    let label = 'Availability updated today';
    if (hours === 0) {
      const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      label = minutes <= 5 ? 'Availability updated just now' : `Availability updated ${minutes} mins ago`;
    } else if (hours === 1) {
      label = 'Availability updated 1 hour ago';
    } else {
      label = `Availability updated ${hours} hours ago`;
    }

    return {
      status: 'FRESH',
      label,
      last_verified_at: timestampStr,
      hours_since_verification: hours,
      is_stale: false,
    };
  }

  if (hours < agingHours) {
    const days = Math.floor(hours / 24);
    const label = days === 1 ? 'Availability updated yesterday' : `Availability updated ${days} days ago`;
    return {
      status: 'AGING',
      label,
      last_verified_at: timestampStr,
      hours_since_verification: hours,
      is_stale: false,
    };
  }

  return {
    status: 'STALE',
    label: 'Availability may require confirmation',
    last_verified_at: timestampStr,
    hours_since_verification: hours,
    is_stale: true,
  };
}
