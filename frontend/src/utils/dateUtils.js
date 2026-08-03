/**
 * Helper to format ISO timestamps according to company's configured timezone.
 */

const TIMEZONE_MAP = {
  UTC: 'UTC',
  EST: 'America/New_York',
  PST: 'America/Los_Angeles',
  PKT: 'Asia/Karachi',
  GMT: 'Europe/London',
  CET: 'Europe/Paris',
  IST: 'Asia/Kolkata',
  JST: 'Asia/Tokyo',
  AEST: 'Australia/Sydney',
};

export const resolveIANATimezone = (tzName) => {
  if (!tzName) return 'UTC';
  const clean = tzName.trim().toUpperCase();
  return TIMEZONE_MAP[clean] || tzName;
};

export const getStoredCompanyTimezone = () => {
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.timezone) return parsed.timezone;
    }
  } catch {}
  return 'UTC';
};

export const formatTimestamp = (dateStr, tzName = 'UTC', options = {}) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);

    const timeZone = resolveIANATimezone(tzName || getStoredCompanyTimezone());
    const defaultOptions = {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone,
      ...options,
    };

    return new Intl.DateTimeFormat('en-GB', defaultOptions).format(d);
  } catch (err) {
    return String(dateStr);
  }
};

export const formatTimeOnly = (dateStr, tzName = 'UTC') => {
  return formatTimestamp(dateStr, tzName, {
    day: undefined,
    month: undefined,
    year: undefined,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

export const formatDateOnly = (dateStr, tzName = 'UTC') => {
  return formatTimestamp(dateStr, tzName, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: undefined,
    minute: undefined,
    second: undefined,
  });
};
