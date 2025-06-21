import { format, formatInTimeZone } from 'date-fns-tz';
import { parseISO } from 'date-fns';

// Pakistan Standard Time timezone
export const PAKISTAN_TIMEZONE = 'Asia/Karachi';

/**
 * Format a date in Pakistan Standard Time
 * @param date Date to format (Date object or ISO string)
 * @param formatStr Format string (date-fns format)
 * @returns Formatted date string in Pakistan Standard Time
 */
export const formatPakistanDate = (
  date: Date | string,
  formatStr: string = 'dd-MM-yyyy'
): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(dateObj, PAKISTAN_TIMEZONE, formatStr);
};

/**
 * Format a date and time in Pakistan Standard Time
 * @param date Date to format (Date object or ISO string)
 * @param formatStr Format string (date-fns format)
 * @returns Formatted date and time string in Pakistan Standard Time
 */
export const formatPakistanDateTime = (
  date: Date | string,
  formatStr: string = 'dd-MM-yyyy HH:mm:ss'
): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(dateObj, PAKISTAN_TIMEZONE, formatStr);
};

/**
 * Get the current date in Pakistan Standard Time
 * @param formatStr Format string (date-fns format)
 * @returns Current date string in Pakistan Standard Time
 */
export const getCurrentPakistanDate = (
  formatStr: string = 'dd-MM-yyyy'
): string => {
  return formatInTimeZone(new Date(), PAKISTAN_TIMEZONE, formatStr);
};

/**
 * Get the current date and time in Pakistan Standard Time
 * @param formatStr Format string (date-fns format)
 * @returns Current date and time string in Pakistan Standard Time
 */
export const getCurrentPakistanDateTime = (
  formatStr: string = 'dd-MM-yyyy HH:mm:ss'
): string => {
  return formatInTimeZone(new Date(), PAKISTAN_TIMEZONE, formatStr);
};

/**
 * Convert a date to Pakistan Standard Time and return as ISO string
 * @param date Date to convert (Date object or ISO string)
 * @returns ISO string in Pakistan Standard Time
 */
export const toPakistanISOString = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(dateObj, PAKISTAN_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
};

/**
 * Get start and end of day in Pakistan Standard Time
 * @param date Date to get start and end of day for (Date object or ISO string)
 * @returns Object with start and end of day as ISO strings
 */
export const getPakistanDayRange = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const startOfDay = formatInTimeZone(dateObj, PAKISTAN_TIMEZONE, "yyyy-MM-dd'T'00:00:00.000'Z'");
  const endOfDay = formatInTimeZone(dateObj, PAKISTAN_TIMEZONE, "yyyy-MM-dd'T'23:59:59.999'Z'");
  
  return {
    startOfDay: parseISO(startOfDay),
    endOfDay: parseISO(endOfDay)
  };
};

/**
 * Format a date for display in a user-friendly format
 * @param date Date to format (Date object or ISO string)
 * @returns Formatted date string in Pakistan Standard Time
 */
export const formatPakistanDateForDisplay = (date: Date | string): string => {
  return formatPakistanDate(date, 'dd-MM-yyyy');
};

/**
 * Format a date and time for display in a user-friendly format
 * @param date Date to format (Date object or ISO string)
 * @returns Formatted date and time string in Pakistan Standard Time
 */
export const formatPakistanDateTimeForDisplay = (date: Date | string): string => {
  return formatPakistanDateTime(date, 'dd-MM-yyyy HH:mm:ss');
};

/**
 * Format currency in Pakistani Rupees
 * @param amount Amount to format
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number): string => {
  return `₨ ${amount.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};