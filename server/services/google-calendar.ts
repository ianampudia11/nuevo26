import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { storage } from '../storage';
import { CalendarBooking } from '@shared/schema';
import type { CalendarAdvancedSettings } from '@shared/types/calendar-types';
import { isValidAdvancedSettings, getDayName } from '@shared/types/calendar-types';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];


const API_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_STATUS_CODES = [429, 500, 503];

class GoogleCalendarService {
  constructor() {
  }

  /**
   * Helper to wrap API calls with timeout and retry logic
   * Retries on 429, 500, 503 with exponential backoff
   */
  private async withRetry<T>(
    apiCall: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    try {

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`API call timed out after ${API_TIMEOUT_MS}ms`));
        }, API_TIMEOUT_MS);
      });


      const result = await Promise.race([apiCall(), timeoutPromise]);
      return result;
    } catch (error: any) {
      const statusCode = error?.response?.status || error?.code;
      const shouldRetry =
        retryCount < MAX_RETRIES &&
        (RETRY_STATUS_CODES.includes(statusCode) || error?.message?.includes('timeout'));

      if (shouldRetry) {

        const delayMs = Math.pow(2, retryCount) * 1000;
       

        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.withRetry(apiCall, retryCount + 1);
      }


      throw error;
    }
  }

  /**
   * Get Google OAuth credentials from super admin settings
   */
  private async getApplicationCredentials(): Promise<{
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } | null> {
    try {
      const credentials = await storage.getAppSetting('google_calendar_oauth');

      if (!credentials || !credentials.value) {
        console.error('Google Calendar OAuth not configured in admin settings');
        return null;
      }

      const config = credentials.value as any;
      if (!config.enabled || !config.client_id || !config.client_secret) {
        console.error('Google Calendar OAuth not properly configured or disabled');
        return null;
      }

      return {
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri: config.redirect_uri || `${process.env.BASE_URL || 'http://localhost:9000'}/api/google/calendar/callback`
      };
    } catch (error) {
      console.error('Error getting application Google credentials:', error);
      return null;
    }
  }

  /**
   * Create a Google OAuth2 client using application credentials
   */
  private async getOAuth2Client(): Promise<OAuth2Client | null> {
    const credentials = await this.getApplicationCredentials();

    if (!credentials) {
      return null;
    }

    return new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );
  }

  /**
   * Generate an authentication URL for Google Calendar
   */
  public async getAuthUrl(userId: number, companyId: number): Promise<string | null> {
    const oauth2Client = await this.getOAuth2Client();

    if (!oauth2Client) {
      return null;
    }

    const state = Buffer.from(JSON.stringify({ userId, companyId })).toString('base64');

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent'
    });
  }

  /**
   * Handle the OAuth callback and save tokens
   */
  public async handleAuthCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code as string;
    const stateParam = req.query.state as string;

    if (!code) {
      res.status(400).send('Authorization code not provided');
      return;
    }

    try {
      const stateData = JSON.parse(Buffer.from(stateParam, 'base64').toString());
      const userId = stateData.userId;
      const companyId = stateData.companyId;

      if (!userId || !companyId) {
        res.status(400).send('User ID or Company ID not found in state parameter');
        return;
      }

      const oauth2Client = await this.getOAuth2Client();

      if (!oauth2Client) {
        res.status(400).send('Google Calendar OAuth not configured in admin settings');
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);

      const googleTokens = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || undefined,
        id_token: tokens.id_token || undefined,
        token_type: tokens.token_type || undefined,
        expiry_date: tokens.expiry_date || undefined,
        scope: tokens.scope || undefined
      };

      await storage.saveGoogleTokens(userId, companyId, googleTokens);

      res.redirect('/settings?google_auth=success');
    } catch (error) {
      console.error('Error handling Google auth callback:', error);
      res.status(500).send('Failed to authenticate with Google');
    }
  }

  /**
   * Get an authorized Google Calendar client for a user
   */
  public async getCalendarClient(userId: number, companyId: number): Promise<calendar_v3.Calendar | null> {
    try {
      const tokens = await storage.getGoogleTokens(userId, companyId);

      if (!tokens) {
        console.error(`No Google tokens found for user ${userId} in company ${companyId}`);
        return null;
      }

      const oauth2Client = await this.getOAuth2Client();

      if (!oauth2Client) {
        console.error('Google Calendar OAuth not configured in admin settings');
        return null;
      }

      oauth2Client.setCredentials(tokens);

      if (tokens.expiry_date && tokens.expiry_date < Date.now() && tokens.refresh_token) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();

          const googleTokens = {
            access_token: credentials.access_token || '',
            refresh_token: credentials.refresh_token || undefined,
            id_token: credentials.id_token || undefined,
            token_type: credentials.token_type || undefined,
            expiry_date: credentials.expiry_date || undefined,
            scope: credentials.scope || undefined
          };

          await storage.saveGoogleTokens(userId, companyId, googleTokens);
          oauth2Client.setCredentials(credentials);
        } catch (refreshError) {
          console.error('Error refreshing token:', refreshError);
          return null;
        }
      }

      return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
      console.error('Error creating Google Calendar client:', error);
      return null;
    }
  }

  /**
   * Check if a time slot is available before booking
   * Uses Google Calendar freebusy.query API to detect conflicts
   * 
   * @param userId The user ID
   * @param companyId The company ID
   * @param startDateTime ISO string of the event start time
   * @param endDateTime ISO string of the event end time
   * @param bufferMinutes Buffer time to add before/after the event (default 0)
   * @returns Object with available flag and optional conflicting events
   */
  private async checkTimeSlotAvailability(
    userId: number,
    companyId: number,
    startDateTime: string,
    endDateTime: string,
    bufferMinutes: number = 0
  ): Promise<{ available: boolean, conflictingEvents?: any[], error?: string }> {
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        console.warn('Google Calendar Service: Calendar client not available for availability check');
        return {
          available: true, // Fail-open: if we can't check, allow creation
          error: 'Calendar client not available for availability check'
        };
      }


      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Google Calendar Service: Invalid date format in availability check', { startDateTime, endDateTime });
        return {
          available: false,
          error: 'Invalid date format provided'
        };
      }

      if (startDate >= endDate) {
        console.error('Google Calendar Service: Start time must be before end time', { startDateTime, endDateTime });
        return {
          available: false,
          error: 'Start time must be before end time'
        };
      }


      const queryStartDate = new Date(startDate);
      queryStartDate.setMinutes(queryStartDate.getMinutes() - bufferMinutes);
      const queryEndDate = new Date(endDate);
      queryEndDate.setMinutes(queryEndDate.getMinutes() + bufferMinutes);

      const requestedStart = queryStartDate.getTime();
      const requestedEnd = queryEndDate.getTime();

      const timeMin = queryStartDate.toISOString();
      const timeMax = queryEndDate.toISOString();


      const busyTimeSlotsResponse = await this.withRetry(() =>
        calendar.freebusy.query({
          requestBody: {
            timeMin: timeMin,
            timeMax: timeMax,
            items: [{ id: 'primary' }],
          },
        })
      );

      const busySlots = busyTimeSlotsResponse.data.calendars?.primary?.busy || [];


      const conflictingSlots = busySlots.filter((busySlot: any) => {
        if (!busySlot.start || !busySlot.end) {
          return false;
        }

        const busyStart = new Date(busySlot.start).getTime();
        const busyEnd = new Date(busySlot.end).getTime();



        return (requestedStart <= busyEnd && requestedEnd >= busyStart);
      });

      if (conflictingSlots.length > 0) {
        return { available: false, conflictingEvents: conflictingSlots };
      }

      return { available: true };
    } catch (error: any) {
      console.error('Google Calendar Service: Error checking time slot availability:', error.message);


      return {
        available: true,
        error: error.message || 'Failed to check availability'
      };
    }
  }

  /**
   * Check if the same user has booked the same slot within the last 2 minutes
   * This prevents duplicate bookings from AI retries or user double-clicks
   * @param userId The user ID
   * @param companyId The company ID
   * @param startDateTime Start datetime ISO string
   * @param endDateTime End datetime ISO string
   * @returns true if a recent booking exists, false otherwise
   */

  /**
   * Create a calendar event
   * Includes conflict detection to prevent double bookings
   * 
   * Buffer time is applied to prevent back-to-back bookings.
   * This allows for overrun/setup time between appointments and ensures proper spacing.
   * 
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventData Event data including start, end, summary, etc.
   * @param eventData.bufferMinutes Optional buffer minutes to respect when checking for conflicts
   *                                 Buffer is applied before and after the event to prevent adjacent bookings
   *                                 CRITICAL: This is the single source of truth for buffer configuration.
   *                                 Must match the bufferMinutes used in getAvailableTimeSlots for consistency.
   * @returns Success status with event ID and link, or error message
   */
  public async createCalendarEvent(
    userId: number,
    companyId: number,
    eventData: any
  ): Promise<{ success: boolean, eventId?: string, error?: string, eventLink?: string }> {

    const {
      summary,
      description,
      location,
      start,
      end,
      attendees = [],
      send_updates = true,
      organizer_email,
      time_zone,
      colorId
    } = eventData;

    const startDateTime = start?.dateTime;
    const endDateTime = end?.dateTime;


    const eventTimeZone = time_zone || start?.timeZone || end?.timeZone || 'UTC';
   

    if (!startDateTime || !endDateTime) {
      console.error('Google Calendar Service: Missing start or end time');
      return { success: false, error: 'Start and end times are required' };
    }


    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    
   

    const bufferMinutes = eventData.bufferMinutes || 0;
    

    const bookingStartWithBuffer = new Date(startDate);
    bookingStartWithBuffer.setMinutes(bookingStartWithBuffer.getMinutes() - bufferMinutes);
    const bookingEndWithBuffer = new Date(endDate);
    bookingEndWithBuffer.setMinutes(bookingEndWithBuffer.getMinutes() + bufferMinutes);
    
    const hasConflict = await storage.checkBookingConflict(
      userId,
      companyId,
      'google',
      bookingStartWithBuffer,
      bookingEndWithBuffer
    );
    
    if (hasConflict) {

      const conflictingBookings = await storage.getCalendarBookings(
        userId,
        companyId,
        'google',
        bookingStartWithBuffer,
        bookingEndWithBuffer
      );
      
      const conflictDetails = conflictingBookings.map(booking => 
        `Booking ${booking.id} (${booking.startDateTime.toISOString()} - ${booking.endDateTime.toISOString()}, eventId: ${booking.eventId})`
      ).join('; ');
      
      return {
        success: false,
        error: `Database conflict detected. Conflicting booking(s): ${conflictDetails}`
      };
    }


    const availabilityCheck = await this.checkTimeSlotAvailability(
      userId,
      companyId,
      startDateTime,
      endDateTime,
      bufferMinutes
    );

    if (!availabilityCheck.available) {
      const conflictDetails = availabilityCheck.conflictingEvents?.map((event: any) => 
        `Event (${event.start} - ${event.end})`
      ).join('; ') || 'Unknown conflict';
      
      return {
        success: false,
        error: `Google Calendar conflict detected. Conflicting event(s): ${conflictDetails}`
      };
    }

    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        console.error('Google Calendar Service: Calendar client not available');
        return { success: false, error: 'Google Calendar client not available' };
      }

      let processedAttendees: calendar_v3.Schema$EventAttendee[] | undefined;
      if (attendees && attendees.length > 0) {
        if (typeof attendees[0] === 'string') {
          processedAttendees = attendees.map((emailAddress: string) => ({ email: emailAddress }));
        } else {
          processedAttendees = attendees.map((attendee: any) => ({
            email: attendee.email,
            displayName: attendee.displayName || attendee.display_name
          }));
        }
      }

      const event: calendar_v3.Schema$Event = {
        summary,
        description,
        location,
        start: {
          dateTime: startDateTime,
          timeZone: eventTimeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone: eventTimeZone,
        },
        attendees: processedAttendees,
        organizer: organizer_email ? { email: organizer_email } : undefined,
        colorId: colorId || undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      const sendUpdatesParam = send_updates ? 'all' : 'none';

      const response = await this.withRetry(() =>
        calendar.events.insert({
          calendarId: 'primary',
          requestBody: event,
          sendUpdates: sendUpdatesParam,
        })
      );

      if (response.status === 200 && response.data.id) {

        const bookingResult = await storage.createCalendarBooking({
          userId,
          companyId,
          calendarType: 'google',
          startDateTime: startDate,
          endDateTime: endDate,
          eventId: response.data.id,
          eventLink: response.data.htmlLink || undefined
        });

        if (!bookingResult.success) {
          console.warn('Google Calendar Service: Failed to save booking record, but event was created:', {
            eventId: response.data.id,
            error: bookingResult.error
          });
        }

        const result: {
          success: boolean;
          eventId?: string;
          eventLink?: string;
        } = {
          success: true,
          eventId: response.data.id
        };

        if (response.data.htmlLink) {
          result.eventLink = response.data.htmlLink;

        }

        return result;
      } else {
        console.error('Google Calendar Service: Unexpected response status:', {
          status: response.status,
          data: response.data,
          startDateTime,
          endDateTime
        });
        return {
          success: false,
          error: `Failed to create event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Google Calendar Service: Error creating calendar event:', {
        error: error.message,
        stack: error.stack,
        userId,
        companyId,
        eventData
      });
      return {
        success: false,
        error: error.message || 'Failed to create calendar event'
      };
    }
  }

  /**
   * List calendar events for a specific time range
   * @param userId The user ID
   * @param companyId The company ID
   * @param timeMin Start time for the range
   * @param timeMax End time for the range
   * @param maxResults Maximum number of events to return
   * @param requesterEmail Optional email of the requester to filter events for privacy
   */
  public async listCalendarEvents(
    userId: number,
    companyId: number,
    timeMin: string,
    timeMax: string,
    maxResults: number = 10,
    requesterEmail?: string
  ): Promise<any> {
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        return { success: false, error: 'Google Calendar client not available' };
      }


      let startTime: string;
      let endTime: string;

      if (!timeMin || !timeMax) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        startTime = timeMin ? (typeof timeMin === 'string' ? timeMin : new Date(timeMin).toISOString()) : thirtyDaysAgo.toISOString();
        endTime = timeMax ? (typeof timeMax === 'string' ? timeMax : new Date(timeMax).toISOString()) : thirtyDaysLater.toISOString();

        console.warn('Google Calendar listCalendarEvents: Defaulting list range to ±30 days due to missing timeMin/timeMax');
      } else {
        startTime = typeof timeMin === 'string' ? timeMin : new Date(timeMin).toISOString();
        endTime = typeof timeMax === 'string' ? timeMax : new Date(timeMax).toISOString();
      }





      const response = await this.withRetry(() =>
        calendar.events.list({
          calendarId: 'primary',
          timeMin: startTime,
          timeMax: endTime,
          maxResults: maxResults,
          singleEvents: true,
          orderBy: 'startTime'
        })
      );

      let items = response.data.items || [];



      if (items.length > 0) {

        items.forEach((event: any, index: number) => {
          
        });
      }


      if (requesterEmail) {
        const beforeFilterCount = items.length;
        items = items.filter((event: any) => {

          if (event.organizer?.email?.toLowerCase() === requesterEmail.toLowerCase()) {
            return true;
          }


          if (event.attendees && Array.isArray(event.attendees)) {
            const isAttendee = event.attendees.some((attendee: any) =>
              attendee.email?.toLowerCase() === requesterEmail.toLowerCase()
            );
            if (isAttendee) {
              return true;
            }
          }


          return false;
        });

      }

      return {
        success: true,
        items: items,
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      console.error('Error listing calendar events:', error);
      return {
        success: false,
        error: error.message || 'Failed to list calendar events',
        items: []
      };
    }
  }

  /**
   * Delete (cancel) a calendar event
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventId The ID of the event to delete (optional if eventLink is provided)
   * @param sendUpdates Whether to send cancellation notifications to attendees
   * @param eventLink The event link URL (used to lookup eventId if eventId is not provided)
   */
  public async deleteCalendarEvent(
    userId: number,
    companyId: number,
    eventId?: string,
    sendUpdates: boolean = true,
    eventLink?: string
  ): Promise<{ success: boolean, error?: string }> {
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        return { success: false, error: 'Google Calendar client not available' };
      }


      let finalEventId: string | null = eventId || null;
      if (eventLink && !eventId) {

        const booking = await storage.getCalendarBookingByEventLink(userId, companyId, 'google', eventLink);
        if (booking && booking.eventId) {
          finalEventId = booking.eventId;
        } else {

          finalEventId = storage.extractEventIdFromLink(eventLink);
          if (!finalEventId) {
            return { success: false, error: 'Could not extract event ID from event link' };
          }
        }
      }


      if (!finalEventId) {
        return { success: false, error: 'Event ID is required to delete the event' };
      }



      const sendUpdatesParam = sendUpdates ? 'all' : 'none';

      const response = await this.withRetry(() =>
        calendar.events.delete({
          calendarId: 'primary',
          eventId: finalEventId,
          sendUpdates: sendUpdatesParam
        })
      );

      if (response.status === 204 || response.status === 200) {

        await storage.deleteCalendarBooking(userId, companyId, 'google', finalEventId);
        return { success: true };
      } else {
        return {
          success: false,
          error: `Failed to delete event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Error deleting calendar event:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete calendar event'
      };
    }
  }

  /**
   * Get a calendar booking by event link
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventLink The Google Calendar event link
   * @returns The calendar booking if found, null otherwise
   */
  public async getBookingByEventLink(userId: number, companyId: number, eventLink: string): Promise<CalendarBooking | null> {
    try {

      const booking = await storage.getCalendarBookingByEventLink(userId, companyId, 'google', eventLink);
      if (booking) {
        return booking;
      }


      const eventId = storage.extractEventIdFromLink(eventLink);
      if (!eventId) {
        return null;
      }

      return await storage.getCalendarBookingByEventId(userId, companyId, 'google', eventId);
    } catch (error: any) {
      console.error('Error getting booking by event link:', error);
      return null;
    }
  }

  /**
   * Update an existing calendar event
   * @param userId The user ID
   * @param eventId The ID of the event to update
   * @param eventData The updated event data
   */
  public async updateCalendarEvent(
    userId: number,
    companyId: number,
    eventId: string,
    eventData: any
  ): Promise<{ success: boolean, error?: string, eventId?: string, eventLink?: string }> {
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        return { success: false, error: 'Google Calendar client not available' };
      }


      const existingEventResponse = await this.withRetry(() =>
        calendar.events.get({
          calendarId: 'primary',
          eventId: eventId
        })
      );

      if (!existingEventResponse.data) {
        return { success: false, error: 'Event not found' };
      }

      const existingEvent = existingEventResponse.data;

      const { send_updates = true, time_zone, attendees, colorId, ...restEventData } = eventData;


      let processedAttendees: calendar_v3.Schema$EventAttendee[] | undefined;
      if (attendees && attendees.length > 0) {
        if (typeof attendees[0] === 'string') {
          processedAttendees = attendees.map((emailAddress: string) => ({ email: emailAddress }));
        } else {
          processedAttendees = attendees.map((attendee: any) => ({
            email: attendee.email,
            displayName: attendee.displayName || attendee.display_name
          }));
        }
      }


      const updatedEventData: any = {
        ...existingEvent,
        ...restEventData,
        summary: restEventData.summary !== undefined ? restEventData.summary : existingEvent.summary,
        description: restEventData.description !== undefined ? restEventData.description : existingEvent.description,
        location: restEventData.location !== undefined ? restEventData.location : existingEvent.location,
      };

      if (time_zone) {
        if (updatedEventData.start) {
          updatedEventData.start.timeZone = time_zone;
        }
        if (updatedEventData.end) {
          updatedEventData.end.timeZone = time_zone;
        }
      }

      if (processedAttendees) {
        updatedEventData.attendees = processedAttendees;
      }


      if (colorId !== undefined) {
        updatedEventData.colorId = colorId;
      }

      const sendUpdatesParam = send_updates ? 'all' : 'none';

      const response = await this.withRetry(() =>
        calendar.events.update({
          calendarId: 'primary',
          eventId: eventId,
          requestBody: updatedEventData,
          sendUpdates: sendUpdatesParam
        })
      );

      if (response.status === 200) {
        const result: {
          success: boolean,
          eventId?: string,
          eventLink?: string
        } = {
          success: true,
          eventId: response.data.id as string | undefined
        };

        if (response.data.htmlLink) {
          result.eventLink = response.data.htmlLink;
        }

        return result;
      } else {
        return {
          success: false,
          error: `Failed to update event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Error updating calendar event:', error);
      return {
        success: false,
        error: error.message || 'Failed to update calendar event'
      };
    }
  }

  /**
   * Helper function to convert local time to UTC ISO string
   * @param date Date string in YYYY-MM-DD format
   * @param hour Hour (0-23)
   * @param minute Minute (0-59)
   * @param timeZone IANA timezone identifier
   * @returns UTC ISO string representing that local time
   */
  private convertLocalTimeToUTC(date: string, hour: number, minute: number, timeZone: string): string {
    try {

      const dateTimeString = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
      

      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });



      const tempDate = new Date(dateTimeString + 'Z'); // Start with UTC assumption
      

      const parts = formatter.formatToParts(tempDate);
      const partsMap = parts.reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);

      const localYear = parseInt(partsMap.year || '0');
      const localMonth = parseInt(partsMap.month || '0');
      const localDay = parseInt(partsMap.day || '0');
      const localHour = parseInt(partsMap.hour || '0');
      const localMinute = parseInt(partsMap.minute || '0');


      const [year, month, day] = date.split('-').map(Number);
      const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
      const gotMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0, 0);
      const offsetMs = wantedMs - gotMs;

      const result = new Date(tempDate.getTime() + offsetMs);
      return result.toISOString();
    } catch (error) {
      console.error('[convertLocalTimeToUTC] Error converting timezone:', error);

      return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
    }
  }

  /**
   * Helper function to convert local date/time to UTC
   * @param date Date string in YYYY-MM-DD format
   * @param time Time string in HH:MM format (24-hour)
   * @param timeZone IANA timezone identifier
   * @returns Date object in UTC
   */
  private convertLocalToUTC(date: string, time: string, timeZone: string): Date {
    try {

      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = time.split(':').map(Number);








      let utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));


      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });


      const parts = formatter.formatToParts(utcGuess);
      const partsMap = parts.reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);

      const localYear = parseInt(partsMap.year || '0');
      const localMonth = parseInt(partsMap.month || '0');
      const localDay = parseInt(partsMap.day || '0');
      const localHour = parseInt(partsMap.hour || '0');
      const localMinute = parseInt(partsMap.minute || '0');




      const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
      const gotMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0, 0);
      const offsetMs = wantedMs - gotMs;


      const result = new Date(utcGuess.getTime() + offsetMs);


      const verifyParts = formatter.formatToParts(result);
      const verifyMap = verifyParts.reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);

      const verifyHour = parseInt(verifyMap.hour || '0');
      const verifyMinute = parseInt(verifyMap.minute || '0');


      if (verifyHour === hour && verifyMinute === minute) {
        return result;
      }


      console.warn(`[convertLocalToUTC] Verification mismatch: wanted ${hour}:${minute}, got ${verifyHour}:${verifyMinute}`);
      return result;

    } catch (error) {
      console.error('[convertLocalToUTC] Error converting timezone:', error);

      return new Date(`${date}T${time}:00Z`);
    }
  }

  /**
   * Find appointment by date and time
   * Useful for finding an appointment to cancel or update
   * @param userId The user ID
   * @param companyId The company ID
   * @param date The date of the appointment (YYYY-MM-DD)
   * @param time The time of the appointment (HH:MM in 24-hour format)
   * @param email Optional email of the requester to filter events for privacy
   * @param timeZone Optional timezone (defaults to UTC)
   */
  public async findAppointmentByDateTime(
    userId: number,
    companyId: number,
    date: string,
    time: string,
    email?: string,
    timeZone: string = 'UTC'
  ): Promise<{ success: boolean, eventId?: string, error?: string }> {
    try {



      const appointmentDateTime = this.convertLocalToUTC(date, time, timeZone);




      const timeMin = new Date(appointmentDateTime.getTime() - 30 * 60000).toISOString();
      const timeMax = new Date(appointmentDateTime.getTime() + 30 * 60000).toISOString();




      const events = await this.listCalendarEvents(userId, companyId, timeMin, timeMax, 10, email);

      if (!events.success) {

        return { success: false, error: events.error };
      }



      if (events.items.length === 0) {


        const [year, month, day] = date.split('-').map(Number);

        if (month !== day && month <= 12 && day <= 12) {

          const alternateDate = `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;


          const alternateDateTime = this.convertLocalToUTC(alternateDate, time, timeZone);
          const altTimeMin = new Date(alternateDateTime.getTime() - 30 * 60000).toISOString();
          const altTimeMax = new Date(alternateDateTime.getTime() + 30 * 60000).toISOString();



          const altEvents = await this.listCalendarEvents(userId, companyId, altTimeMin, altTimeMax, 10, email);

          if (altEvents.success && altEvents.items.length > 0) {




            altEvents.items.forEach((event: any, index: number) => {
              
            });


            if (email) {
              const emailLower = email.toLowerCase();
              for (const event of altEvents.items) {
                if (event.organizer?.email?.toLowerCase() === emailLower) {

                  return { success: true, eventId: event.id };
                }
                if (event.attendees && event.attendees.some((attendee: any) =>
                  attendee.email?.toLowerCase() === emailLower)) {

                  return { success: true, eventId: event.id };
                }
              }

            } else {

              return { success: true, eventId: altEvents.items[0].id };
            }
          }
        }

        return { success: false, error: 'No appointment found at specified date and time' };
      }



      events.items.forEach((event: any, index: number) => {
        
      });


      if (email) {
        const emailLower = email.toLowerCase();


        for (const event of events.items) {

          if (event.organizer?.email?.toLowerCase() === emailLower) {

            return { success: true, eventId: event.id };
          }

          if (event.attendees && event.attendees.some((attendee: any) =>
            attendee.email?.toLowerCase() === emailLower)) {

            return { success: true, eventId: event.id };
          }
        }


        return { success: false, error: `No appointment found for ${email} at specified date and time` };
      }



      return { success: true, eventId: events.items[0].id };

    } catch (error: any) {
      console.error('[findAppointmentByDateTime] Error finding appointment:', error);
      return {
        success: false,
        error: error.message || 'Failed to find appointment'
      };
    }
  }

  /**
   * Check the connection status of the Google Calendar integration
   */
  public async checkCalendarConnectionStatus(
    userId: number,
    companyId: number
  ): Promise<{ connected: boolean, message: string }> {
    try {
      const tokens = await storage.getGoogleTokens(userId, companyId);

      if (!tokens) {
        return {
          connected: false,
          message: 'Not connected to Google Calendar'
        };
      }

      const calendar = await this.getCalendarClient(userId, companyId);
      if (!calendar) {
        return {
          connected: false,
          message: 'Connection to Google Calendar failed'
        };
      }

      return {
        connected: true,
        message: 'Connected to Google Calendar'
      };
    } catch (error) {
      console.error('Error checking calendar connection:', error);
      return {
        connected: false,
        message: 'Error checking Google Calendar connection'
      };
    }
  }

  /**
   * Get available time slots from a user's calendar
   * Enhanced to work with both single date and date range
   * @param userId User ID
   * @param companyId Company ID
   * @param date Single date to check (YYYY-MM-DD)
   * @param durationMinutes Duration of each slot in minutes (also used as slot step)
   * @param startDate Start date for range (YYYY-MM-DD)
   * @param endDate End date for range (YYYY-MM-DD)
   * @param businessHoursStart Business hours start (hour, 0-23)
   * @param businessHoursEnd Business hours end (hour, 0-23)
   * @param timeZone Timezone for slot generation (e.g., 'Pakistan/Islamabad')
   * @param bufferMinutes Buffer time to add before/after busy slots
   * @param advancedSettings Advanced settings with day-specific hours and off-days
   */
  public async getAvailableTimeSlots(
    userId: number,
    companyId: number,
    date?: string,
    durationMinutes: number = 60,
    startDate?: string,
    endDate?: string,
    businessHoursStart: number = 9,
    businessHoursEnd: number = 18,
    timeZone: string = 'UTC',
    bufferMinutes: number = 0,
    advancedSettings?: CalendarAdvancedSettings
  ): Promise<{
    success: boolean,
    timeSlots?: Array<{
      date: string,
      slots: string[]
    }>,
    error?: string
  }> {


    try {

      const useAdvancedSettings = advancedSettings && isValidAdvancedSettings(advancedSettings);
      
      if (useAdvancedSettings) {


        const enabledDays = advancedSettings.weeklySchedule.filter(day => day.enabled && !advancedSettings.offDays.includes(day.dayIndex));
        if (enabledDays.length === 0) {
          console.warn('Google Calendar: All days are disabled in advanced settings, falling back to simple settings');

        }
      } else {
        if (advancedSettings) {
          console.warn('Google Calendar: Advanced settings provided but validation failed, falling back to simple settings');
        }

      }

      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        console.error('Google Calendar Service: Calendar client not available for availability check');
        return { success: false, error: 'Google Calendar client not available' };
      }


      let startDateTime: string;
      let endDateTime: string;
      let dateArray: string[] = [];

      if (date) {
        startDateTime = new Date(`${date}T00:00:00Z`).toISOString();
        endDateTime = new Date(`${date}T23:59:59Z`).toISOString();
        dateArray = [date];
      } else if (startDate && endDate) {
        startDateTime = new Date(`${startDate}T00:00:00Z`).toISOString();
        endDateTime = new Date(`${endDate}T23:59:59Z`).toISOString();

        dateArray = this.generateDateRange(startDate, endDate);
      } else {
        const today = new Date();
        const formattedToday = today.toISOString().split('T')[0];
        startDateTime = new Date(`${formattedToday}T00:00:00Z`).toISOString();
        endDateTime = new Date(`${formattedToday}T23:59:59Z`).toISOString();
        dateArray = [formattedToday];
      }



      const startDateTimeObj = new Date(startDateTime);
      const endDateTimeObj = new Date(endDateTime);
      


      const expandedStart = new Date(startDateTimeObj);
      expandedStart.setMinutes(expandedStart.getMinutes() - bufferMinutes);
      const expandedEnd = new Date(endDateTimeObj);
      expandedEnd.setMinutes(expandedEnd.getMinutes() + bufferMinutes);
      
      const existingBookings = await storage.getCalendarBookings(
        userId,
        companyId,
        'google',
        expandedStart,
        expandedEnd
      );





      const bookingBusySlots = existingBookings.map((booking) => {
        const bookingStart = new Date(booking.startDateTime);
        const bookingEnd = new Date(booking.endDateTime);
        
        bookingStart.setMinutes(bookingStart.getMinutes() - bufferMinutes);
        bookingEnd.setMinutes(bookingEnd.getMinutes() + bufferMinutes);
        
        return {
          start: bookingStart.toISOString(),
          end: bookingEnd.toISOString()
        };
      });




      const busyTimeSlotsResponse = await this.withRetry(() =>
        calendar.freebusy.query({
          requestBody: {
            timeMin: startDateTime,
            timeMax: endDateTime,
            timeZone: timeZone, // Specify timezone for proper interpretation
            items: [{ id: 'primary' }],
          },
        })
      );

      const busySlots = busyTimeSlotsResponse.data.calendars?.primary?.busy || [];


      const bufferedGoogleBusySlots = busySlots.map((busySlot: any) => {
        const busyStart = new Date(busySlot.start);
        const busyEnd = new Date(busySlot.end);

        busyStart.setMinutes(busyStart.getMinutes() - bufferMinutes);
        busyEnd.setMinutes(busyEnd.getMinutes() + bufferMinutes);

        return {
          start: busyStart.toISOString(),
          end: busyEnd.toISOString()
        };
      });



      const allBusySlots = this.deduplicateBusySlots([...bufferedGoogleBusySlots, ...bookingBusySlots]);


      allBusySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());







      const mergedBusySlots: Array<{start: string, end: string}> = [];
      let cursor: Date | null = null;

      for (const busySlot of allBusySlots) {
        const busyStart = new Date(busySlot.start);
        const busyEnd = new Date(busySlot.end);

        if (cursor === null) {

          mergedBusySlots.push({ start: busyStart.toISOString(), end: busyEnd.toISOString() });
          cursor = busyEnd;
        } else {



          if (busyStart.getTime() <= cursor.getTime()) {

            const lastSlot = mergedBusySlots[mergedBusySlots.length - 1];
            const lastEnd = new Date(lastSlot.end);
            if (busyEnd.getTime() > lastEnd.getTime()) {
              lastSlot.end = busyEnd.toISOString();
              cursor = busyEnd;
            }


          } else {

            mergedBusySlots.push({ start: busyStart.toISOString(), end: busyEnd.toISOString() });
            cursor = busyEnd;
          }
        }
      }

      const bufferedBusySlots = mergedBusySlots;

      const allAvailableSlots: Array<{date: string, slots: string[]}> = [];

      for (const currentDate of dateArray) {

        if (useAdvancedSettings && advancedSettings) {
          const dayOfWeek = new Date(currentDate).getDay(); // 0 = Sunday, 6 = Saturday
          if (advancedSettings.offDays.includes(dayOfWeek)) {

            continue;
          }
        }
        
        const availableSlots: string[] = [];
        

        let currentBusinessHoursStartHour: number;
        let currentBusinessHoursStartMinute: number;
        let currentBusinessHoursEndHour: number;
        let currentBusinessHoursEndMinute: number;
        
        if (useAdvancedSettings && advancedSettings) {
          const dayOfWeek = new Date(currentDate).getDay();
          const dayConfig = advancedSettings.weeklySchedule[dayOfWeek];
          
          if (!dayConfig || !dayConfig.enabled) {

            continue;
          }
          

          const [startHour, startMin] = dayConfig.startTime.split(':').map(Number);
          const [endHour, endMin] = dayConfig.endTime.split(':').map(Number);
          
          currentBusinessHoursStartHour = startHour;
          currentBusinessHoursStartMinute = startMin;
          currentBusinessHoursEndHour = endHour;
          currentBusinessHoursEndMinute = endMin;
          

        } else {
          currentBusinessHoursStartHour = businessHoursStart;
          currentBusinessHoursStartMinute = 0;
          currentBusinessHoursEndHour = businessHoursEnd;
          currentBusinessHoursEndMinute = 0;
        }
        


        const businessStartUTC = this.convertLocalTimeToUTC(
          currentDate, 
          currentBusinessHoursStartHour, 
          currentBusinessHoursStartMinute, 
          timeZone
        );
        const businessStart = new Date(businessStartUTC);
        
        const businessEndUTC = this.convertLocalTimeToUTC(
          currentDate, 
          currentBusinessHoursEndHour, 
          currentBusinessHoursEndMinute, 
          timeZone
        );
        const businessEnd = new Date(businessEndUTC);


        const dayBusySlots = bufferedBusySlots.filter((busySlot: any) => {
          const busyStart = new Date(busySlot.start);
          const busyEnd = new Date(busySlot.end);
          

          return busyStart.getTime() < businessEnd.getTime() && busyEnd.getTime() > businessStart.getTime();
        });


        dayBusySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());




        


        const slotIntervalMs = durationMinutes * 60 * 1000;
        const slotDurationMs = durationMinutes * 60 * 1000;
        

        let candidateSlotStart = new Date(businessStart);


        const nowUTC = new Date();
        const nowInTargetZone = new Date(nowUTC.toLocaleString('en-US', { timeZone }));

        while (candidateSlotStart.getTime() + slotDurationMs <= businessEnd.getTime()) {
          const candidateSlotEnd = new Date(candidateSlotStart.getTime() + slotDurationMs);





          




          



          const nowInUserTimeZone = new Date().toLocaleDateString('sv-SE', { timeZone });
          const isToday = nowInUserTimeZone === currentDate;
          
          if (isToday) {


             if (candidateSlotStart.getTime() < Date.now() + 5 * 60 * 1000) {
                candidateSlotStart = new Date(candidateSlotStart.getTime() + slotDurationMs);
                continue;
             }
          }
          




          const effectiveSlotStart = new Date(candidateSlotStart);
          effectiveSlotStart.setMinutes(effectiveSlotStart.getMinutes() - bufferMinutes);
          const effectiveSlotEnd = new Date(candidateSlotEnd);
          effectiveSlotEnd.setMinutes(effectiveSlotEnd.getMinutes() + bufferMinutes);
          



          const slotFitsInGap = !dayBusySlots.some((busySlot: any) => {
            const busyStart = new Date(busySlot.start);
            const busyEnd = new Date(busySlot.end);
            

            const clippedBusyStart = busyStart.getTime() < businessStart.getTime() ? businessStart : busyStart;
            const clippedBusyEnd = busyEnd.getTime() > businessEnd.getTime() ? businessEnd : busyEnd;
            





            const hasConflict = (
              effectiveSlotStart.getTime() <= clippedBusyEnd.getTime() && 
              effectiveSlotEnd.getTime() >= clippedBusyStart.getTime()
            );
            
            return hasConflict;
          });
          
          if (slotFitsInGap) {


            let formattedStart = candidateSlotStart.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
              timeZone: timeZone
            });
            


            formattedStart = formattedStart.trim().replace(/\s+/g, ' ').toUpperCase();
            

            const formatPattern = /^\d{2}:\d{2} (AM|PM)$/;
            if (!formatPattern.test(formattedStart)) {
              console.warn('Google Calendar: Unexpected time format produced:', {
                original: candidateSlotStart.toISOString(),
                formatted: formattedStart,
                timeZone
              });
            }
            
            availableSlots.push(formattedStart);
          }
          

          candidateSlotStart = new Date(candidateSlotStart.getTime() + slotIntervalMs);
        }

        allAvailableSlots.push({
          date: currentDate,
          slots: availableSlots
        });
      }

      return {
        success: true,
        timeSlots: allAvailableSlots
      };
    } catch (error: any) {
      console.error('Error getting available time slots:', error);
      return {
        success: false,
        error: error.message || 'Failed to get available time slots'
      };
    }
  }

  /**
   * Generate an array of dates between start and end dates (inclusive)
   */
  private generateDateRange(startDate: string, endDate: string): string[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateArray: string[] = [];

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const current = new Date(start);
    while (current <= end) {
      dateArray.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dateArray;
  }

  /**
   * Deduplicate busy slots that exist in both database and Google Calendar
   * Compares slots by start/end times with small tolerance for timezone rounding (±1 minute)
   * 
   * @param busySlots Array of busy slots with {start: string, end: string}
   * @returns Deduplicated array of busy slots
   */
  private deduplicateBusySlots(busySlots: Array<{start: string, end: string}>): Array<{start: string, end: string}> {
    if (busySlots.length === 0) {
      return [];
    }

    const deduplicated: Array<{start: string, end: string}> = [];
    const toleranceMs = 60 * 1000; // 1 minute tolerance for timezone rounding

    for (const slot of busySlots) {
      const slotStart = new Date(slot.start).getTime();
      const slotEnd = new Date(slot.end).getTime();


      const isDuplicate = deduplicated.some(existing => {
        const existingStart = new Date(existing.start).getTime();
        const existingEnd = new Date(existing.end).getTime();


        const startDiff = Math.abs(slotStart - existingStart);
        const endDiff = Math.abs(slotEnd - existingEnd);

        return startDiff <= toleranceMs && endDiff <= toleranceMs;
      });

      if (!isDuplicate) {
        deduplicated.push(slot);
      }
    }

    return deduplicated;
  }
}

const googleCalendarService = new GoogleCalendarService();
export default googleCalendarService;