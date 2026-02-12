/**
 * Calendar Types and Utilities
 * Shared types and helper functions for calendar scheduling functionality
 */

export interface DaySchedule {
    dayIndex: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    dayName: string;
    enabled: boolean;
    timeSlots: Array<{ start: string; end: string }>;
}

export interface CalendarAdvancedSettings {
    weeklySchedule: DaySchedule[];
    offDays: number[];
}

export const DAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
];

export const DEFAULT_WEEKLY_SCHEDULE: DaySchedule[] = [
    {
        dayIndex: 0,
        dayName: 'Sunday',
        enabled: false,
        timeSlots: []
    },
    {
        dayIndex: 1,
        dayName: 'Monday',
        enabled: true,
        timeSlots: [{ start: '09:00', end: '17:00' }]
    },
    {
        dayIndex: 2,
        dayName: 'Tuesday',
        enabled: true,
        timeSlots: [{ start: '09:00', end: '17:00' }]
    },
    {
        dayIndex: 3,
        dayName: 'Wednesday',
        enabled: true,
        timeSlots: [{ start: '09:00', end: '17:00' }]
    },
    {
        dayIndex: 4,
        dayName: 'Thursday',
        enabled: true,
        timeSlots: [{ start: '09:00', end: '17:00' }]
    },
    {
        dayIndex: 5,
        dayName: 'Friday',
        enabled: true,
        timeSlots: [{ start: '09:00', end: '17:00' }]
    },
    {
        dayIndex: 6,
        dayName: 'Saturday',
        enabled: false,
        timeSlots: []
    }
];

/**
 * Get day name from day index
 */
export function getDayName(dayIndex: number): string {
    return DAY_NAMES[dayIndex] || 'Unknown';
}

/**
 * Validate time format (HH:MM)
 */
export function isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
}

/**
 * Create a default weekly schedule from business hours
 */
export function createDefaultScheduleFromHours(startTime: string, endTime: string): DaySchedule[] {
    return DAY_NAMES.map((dayName, dayIndex) => {
        // Weekend days (0 = Sunday, 6 = Saturday) are disabled by default
        const isWeekend = dayIndex === 0 || dayIndex === 6;

        return {
            dayIndex,
            dayName,
            enabled: !isWeekend,
            timeSlots: isWeekend ? [] : [{ start: startTime, end: endTime }]
        };
    });
}

/**
 * Validate advanced calendar settings
 */
export function isValidAdvancedSettings(settings: any): settings is CalendarAdvancedSettings {
    if (!settings || typeof settings !== 'object') {
        return false;
    }

    // Validate weeklySchedule
    if (!Array.isArray(settings.weeklySchedule) || settings.weeklySchedule.length !== 7) {
        return false;
    }

    for (const day of settings.weeklySchedule) {
        if (typeof day.dayIndex !== 'number' ||
            typeof day.dayName !== 'string' ||
            typeof day.enabled !== 'boolean' ||
            !Array.isArray(day.timeSlots)) {
            return false;
        }

        for (const slot of day.timeSlots) {
            if (!isValidTimeFormat(slot.start) || !isValidTimeFormat(slot.end)) {
                return false;
            }
        }
    }

    // Validate offDays
    if (!Array.isArray(settings.offDays)) {
        return false;
    }

    for (const day of settings.offDays) {
        if (typeof day !== 'number' || day < 0 || day > 6) {
            return false;
        }
    }

    return true;
}
