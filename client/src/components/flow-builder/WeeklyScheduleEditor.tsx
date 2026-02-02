import React, { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { DaySchedule } from '@shared/types/calendar-types';
import { DAY_NAMES, isValidTimeFormat } from '@shared/types/calendar-types';

interface WeeklyScheduleEditorProps {
  /** Current weekly schedule */
  schedule: DaySchedule[];
  /** Array of disabled day indices */
  offDays: number[];
  /** Callback when schedule changes */
  onScheduleChange: (schedule: DaySchedule[]) => void;
  /** Callback when off-days change */
  onOffDaysChange: (offDays: number[]) => void;
  /** Disable all inputs */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Reusable Weekly Schedule Editor Component
 * Allows users to configure day-specific working hours and mark off-days
 */
export function WeeklyScheduleEditor({
  schedule,
  offDays,
  onScheduleChange,
  onOffDaysChange,
  disabled = false,
  className = ''
}: WeeklyScheduleEditorProps) {
  /**
   * Normalize schedule and offDays to ensure consistency
   * If a day is in offDays, its enabled flag should be false
   */
  useEffect(() => {
    let needsNormalization = false;
    const normalizedSchedule = schedule.map(day => {
      const isInOffDays = offDays.includes(day.dayIndex);
      if (isInOffDays && day.enabled) {
        needsNormalization = true;
        return { ...day, enabled: false };
      }
      return day;
    });

    if (needsNormalization) {
      onScheduleChange(normalizedSchedule);
    }
  }, [schedule, offDays, onScheduleChange]);

  /**
   * Toggle day enabled/disabled
   */
  const handleDayToggle = (dayIndex: number) => {
    if (disabled) return;
    
    const newOffDays = [...offDays];
    const dayIndexInOffDays = newOffDays.indexOf(dayIndex);
    
    if (dayIndexInOffDays >= 0) {

      newOffDays.splice(dayIndexInOffDays, 1);
    } else {

      newOffDays.push(dayIndex);
    }
    
    onOffDaysChange(newOffDays);
    

    const newSchedule = schedule.map(day => 
      day.dayIndex === dayIndex 
        ? { ...day, enabled: dayIndexInOffDays >= 0 }
        : day
    );
    onScheduleChange(newSchedule);
  };

  /**
   * Update time for a specific day
   */
  const handleTimeChange = (dayIndex: number, field: 'startTime' | 'endTime', value: string) => {
    if (disabled) return;
    
    const newSchedule = schedule.map(day => 
      day.dayIndex === dayIndex 
        ? { ...day, [field]: value }
        : day
    );
    onScheduleChange(newSchedule);
  };

  /**
   * Validate time format
   */
  const validateTime = (time: string): boolean => {
    return isValidTimeFormat(time);
  };

  /**
   * Get validation error message for a day's time range
   */
  const getTimeError = (startTime: string, endTime: string): string | null => {
    if (!validateTime(startTime) || !validateTime(endTime)) {
      return 'Invalid time format (use HH:MM)';
    }
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (endMinutes <= startMinutes) {
      return 'End time must be after start time';
    }
    
    return null;
  };

  /**
   * Quick action: Enable all weekdays (Mon-Fri)
   */
  const handleEnableWeekdays = () => {
    if (disabled) return;
    const weekdays = [1, 2, 3, 4, 5]; // Mon-Fri
    const newOffDays = offDays.filter(day => !weekdays.includes(day));
    onOffDaysChange(newOffDays);
    
    const newSchedule = schedule.map(day => ({
      ...day,
      enabled: weekdays.includes(day.dayIndex)
    }));
    onScheduleChange(newSchedule);
  };

  /**
   * Quick action: Enable all days
   */
  const handleEnableAll = () => {
    if (disabled) return;
    onOffDaysChange([]);
    
    const newSchedule = schedule.map(day => ({ ...day, enabled: true }));
    onScheduleChange(newSchedule);
  };

  /**
   * Quick action: Disable all days
   */
  const handleDisableAll = () => {
    if (disabled) return;
    onOffDaysChange([0, 1, 2, 3, 4, 5, 6]);
    
    const newSchedule = schedule.map(day => ({ ...day, enabled: false }));
    onScheduleChange(newSchedule);
  };

  /**
   * Quick action: Reset to default (Mon-Fri 9-5)
   */
  const handleResetToDefault = () => {
    if (disabled) return;
    const defaultSchedule: DaySchedule[] = DAY_NAMES.map((dayName, index) => ({
      dayName,
      dayIndex: index,
      enabled: index >= 1 && index <= 5, // Mon-Fri
      startTime: '09:00',
      endTime: '17:00'
    }));
    
    onScheduleChange(defaultSchedule);
    onOffDaysChange([0, 6]); // Sun, Sat
  };


  const allDaysDisabled = schedule.every(day => !day.enabled);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleEnableWeekdays}
          disabled={disabled}
          className="text-xs h-7"
        >
          All Weekdays
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleEnableAll}
          disabled={disabled}
          className="text-xs h-7"
        >
          All Days
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDisableAll}
          disabled={disabled}
          className="text-xs h-7"
        >
          Clear All
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleResetToDefault}
          disabled={disabled}
          className="text-xs h-7"
        >
          Reset to Default
        </Button>
      </div>

      {/* Warning if all days disabled */}
      {allDaysDisabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-800">
          ⚠️ All days are disabled. No appointment slots will be available.
        </div>
      )}

      {/* Schedule Table */}
      <div className="border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Day</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Start Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">End Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {schedule.map((day) => {
                const isOffDay = offDays.includes(day.dayIndex);
                const dayEnabled = day.enabled && !isOffDay;
                const timeError = dayEnabled ? getTimeError(day.startTime, day.endTime) : null;
                
                return (
                  <tr
                    key={day.dayIndex}
                    className={`transition-colors ${
                      dayEnabled 
                        ? 'bg-green-50 hover:bg-green-100' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Label className="text-xs font-medium text-gray-700">
                        {day.dayName}
                      </Label>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Switch
                        checked={dayEnabled}
                        onCheckedChange={() => handleDayToggle(day.dayIndex)}
                        disabled={disabled}
                        className="scale-75"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="time"
                        value={day.startTime}
                        onChange={(e) => handleTimeChange(day.dayIndex, 'startTime', e.target.value)}
                        disabled={disabled || !dayEnabled}
                        className={`text-xs h-7 ${
                          timeError ? 'border-red-500' : ''
                        }`}
                        aria-label={`${day.dayName} start time`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="time"
                        value={day.endTime}
                        onChange={(e) => handleTimeChange(day.dayIndex, 'endTime', e.target.value)}
                        disabled={disabled || !dayEnabled}
                        className={`text-xs h-7 ${
                          timeError ? 'border-red-500' : ''
                        }`}
                        aria-label={`${day.dayName} end time`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Validation Errors */}
      {schedule.some(day => {
        if (!day.enabled || offDays.includes(day.dayIndex)) return false;
        return getTimeError(day.startTime, day.endTime) !== null;
      }) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800">
          ⚠️ Some days have invalid time ranges. Please check start and end times.
        </div>
      )}
    </div>
  );
}

