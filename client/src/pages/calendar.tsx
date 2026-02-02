import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CategorySelectItems, COLOR_CATEGORY_MAP, getColorCategoryMap } from '@/components/calendar/CategorySelectItems';
import { GoogleCalendarOAuthStatus } from '@/components/flow-builder/GoogleCalendarOAuthStatus';
import { ZohoCalendarOAuthStatus } from '@/components/flow-builder/ZohoCalendarOAuthStatus';
import { CalendlyCalendarOAuthStatus } from '@/components/flow-builder/CalendlyCalendarOAuthStatus';
import { useGoogleCalendarAuth } from '@/hooks/useGoogleCalendarAuth';
import { useZohoCalendarAuth } from '@/hooks/useZohoCalendarAuth';
import { useCalendlyCalendarAuth } from '@/hooks/useCalendlyCalendarAuth';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Loader2, Calendar as CalendarIcon, X, UserPlus, Clock, MapPin,
  ChevronLeft, ChevronRight, Search, Settings, PlusCircle, Check,
  ChevronDown, Pencil, Trash, Menu, X as XIcon
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { format, addDays, subDays, parse, parseISO, formatISO, addHours, getDay, isSameMonth, startOfWeek, eachDayOfInterval, addWeeks, subWeeks, getDaysInMonth, isToday, endOfWeek, isSameDay, addMonths, subMonths } from 'date-fns';

interface Appointment {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  htmlLink?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  colorId?: string;
}

interface TimeSlot {
  date: string;
  slots: string[];
}

interface EventFormData {
  summary: string;
  description: string;
  location: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string[];
  attendeeInput: string;
  colorId?: string;
}

interface EventCategory {
  id: string;
  name: string;
  count: number;
  color: string;
  selected: boolean;
}

interface Schedule {
  id: string;
  name: string;
  selected: boolean;
  color?: string;
}

const EVENT_COLORS: Record<string, string> = {
  "1": "bg-blue-500",
  "2": "bg-green-500",
  "3": "bg-purple-500",
  "4": "bg-red-500",
  "5": "bg-yellow-500",
  "6": "bg-orange-500",
  "7": "bg-pink-500",
  "8": "bg-indigo-500",
  "9": "bg-teal-500",
  "10": "bg-lime-500",
  "11": "bg-amber-500",
  "default": "bg-gray-500"
};

const SCHEDULE_COLORS: Record<string, string> = {
  "blue": "bg-blue-500",
  "green": "bg-green-500",
  "purple": "bg-purple-500",
  "red": "bg-red-500",
  "yellow": "bg-yellow-500",
  "orange": "bg-orange-500",
  "pink": "bg-pink-500",
  "indigo": "bg-indigo-500",
  "teal": "bg-teal-500",
  "lime": "bg-lime-500",
  "amber": "bg-amber-500"
};


export default function Calendar() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isConnected: isGoogleCalendarConnected, status: googleStatus, statusError: googleError } = useGoogleCalendarAuth();
  const { isConnected: isZohoCalendarConnected, status: zohoStatus, statusError: zohoError } = useZohoCalendarAuth();
  const { isConnected: isCalendlyCalendarConnected, status: calendlyStatus, statusError: calendlyError } = useCalendlyCalendarAuth();




  const [selectedProvider, setSelectedProvider] = useState<'google' | 'zoho' | 'calendly'>('google');


  const [calendarFilter, setCalendarFilter] = useState<'all' | 'google' | 'zoho' | 'calendly'>('all');

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Appointment | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
  const [isEditScheduleModalOpen, setIsEditScheduleModalOpen] = useState(false);
  const [isDeleteScheduleAlertOpen, setIsDeleteScheduleAlertOpen] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState("");
  const [newScheduleColor, setNewScheduleColor] = useState("blue");
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedAppointmentDuration, setSelectedAppointmentDuration] = useState("60");
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([
    { id: '1', name: t('calendar.schedule.work', 'Work'), selected: true, color: 'blue' },
    { id: '2', name: t('calendar.schedule.personal', 'Personal'), selected: true, color: 'green' },
    { id: '3', name: t('calendar.schedule.family', 'Family'), selected: true, color: 'red' },
    { id: '4', name: t('calendar.schedule.health', 'Health'), selected: true, color: 'purple' },
    { id: '5', name: t('calendar.schedule.projects', 'Projects'), selected: true, color: 'amber' }
  ]);
  const [categories, setCategories] = useState<EventCategory[]>([]);


  
  const [eventForm, setEventForm] = useState<EventFormData>({
    summary: '',
    description: '',
    location: '',
    startDateTime: formatISO(new Date()),
    endDateTime: formatISO(addHours(new Date(), 1)),
    attendees: [],
    attendeeInput: '',
    colorId: '1'
  });
  
  const dateRange = useMemo(() => {
    let startDate, endDate;
    
    if (viewMode === 'month') {
      const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      startDate = startOfWeek(firstDayOfMonth);
      endDate = endOfWeek(lastDayOfMonth);
    } else if (viewMode === 'week') {
      startDate = startOfWeek(currentDate);
      endDate = endOfWeek(currentDate);
    } else {
      startDate = currentDate;
      endDate = currentDate;
    }
    
    return {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd')
    };
  }, [currentDate, viewMode]);
  
  const formattedSelectedDate = format(selectedDate, 'yyyy-MM-dd');


  const {
    data: googleCalendarEvents,
    isLoading: isLoadingGoogleEvents,
    refetch: refetchGoogleEvents
  } = useQuery<{success: boolean, items: Appointment[]}>({
    queryKey: ['/api/google/calendar/events', dateRange.start, dateRange.end],
    queryFn: async () => {
      const timeMin = `${dateRange.start}T00:00:00Z`;
      const timeMax = `${dateRange.end}T23:59:59Z`;
      const response = await apiRequest('GET',
        `/api/google/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=100`
      );
      return response.json();
    },
    enabled: isGoogleCalendarConnected && (calendarFilter === 'all' || calendarFilter === 'google')
  });


  const {
    data: zohoCalendarEvents,
    isLoading: isLoadingZohoEvents,
    refetch: refetchZohoEvents
  } = useQuery<{success: boolean, items: Appointment[]}>({
    queryKey: ['/api/zoho/calendar/events', dateRange.start, dateRange.end],
    queryFn: async () => {
      const timeMin = `${dateRange.start}T00:00:00Z`;
      const timeMax = `${dateRange.end}T23:59:59Z`;
      const response = await apiRequest('GET',
        `/api/zoho/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=100`
      );
      return response.json();
    },
    enabled: isZohoCalendarConnected && (calendarFilter === 'all' || calendarFilter === 'zoho')
  });


  const {
    data: calendlyCalendarEvents,
    isLoading: isLoadingCalendlyEvents,
    refetch: refetchCalendlyEvents
  } = useQuery<{success: boolean, events: Appointment[]}>({
    queryKey: ['/api/calendly/events', dateRange.start, dateRange.end],
    queryFn: async () => {
      const timeMin = `${dateRange.start}T00:00:00Z`;
      const timeMax = `${dateRange.end}T23:59:59Z`;
      const response = await apiRequest('GET',
        `/api/calendly/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=100`
      );
      return response.json();
    },
    enabled: isCalendlyCalendarConnected && (calendarFilter === 'all' || calendarFilter === 'calendly')
  });


  const calendarEvents = useMemo(() => {
    type AppointmentWithProvider = Appointment & { provider: 'google' | 'zoho' | 'calendly' };

    const googleEvents: AppointmentWithProvider[] = (googleCalendarEvents?.success && googleCalendarEvents?.items) ?
      googleCalendarEvents.items.map(event => ({ ...event, provider: 'google' as const })) : [];

    const zohoEvents: AppointmentWithProvider[] = (zohoCalendarEvents?.success && zohoCalendarEvents?.items) ?
      zohoCalendarEvents.items.map(event => ({ ...event, provider: 'zoho' as const })) : [];

    const calendlyEvents: AppointmentWithProvider[] = (calendlyCalendarEvents?.success && calendlyCalendarEvents?.events) ?
      calendlyCalendarEvents.events.map(event => ({ ...event, provider: 'calendly' as const })) : [];

    let combinedEvents: AppointmentWithProvider[] = [];

    if (calendarFilter === 'all') {
      combinedEvents = [...googleEvents, ...zohoEvents, ...calendlyEvents];
    } else if (calendarFilter === 'google') {
      combinedEvents = googleEvents;
    } else if (calendarFilter === 'zoho') {
      combinedEvents = zohoEvents;
    } else if (calendarFilter === 'calendly') {
      combinedEvents = calendlyEvents;
    }


    return combinedEvents.sort((a, b) => {
      const aTime = new Date(a.start?.dateTime || 0).getTime();
      const bTime = new Date(b.start?.dateTime || 0).getTime();
      return aTime - bTime;
    });
  }, [googleCalendarEvents, zohoCalendarEvents, calendlyCalendarEvents, calendarFilter]);

  const isLoadingEvents = isLoadingGoogleEvents || isLoadingZohoEvents || isLoadingCalendlyEvents;
  const isEventsError = false; // We'll handle errors per provider

  const refetchEvents = () => {
    if (calendarFilter === 'all' || calendarFilter === 'google') {
      refetchGoogleEvents();
    }
    if (calendarFilter === 'all' || calendarFilter === 'zoho') {
      refetchZohoEvents();
    }
    if (calendarFilter === 'all' || calendarFilter === 'calendly') {
      refetchCalendlyEvents();
    }
  };


  const detectEventProvider = (event: any): 'google' | 'zoho' | 'calendly' => {
    if (event?.provider) {
      return event.provider;
    }





    if (event?.id) {
      if (event.originalEvent?.uri && event.originalEvent.uri.includes('calendly.com')) {

        return 'calendly';
      } else if (event.id.includes('@zoho.com') || event.id.length > 30) {

        return 'zoho';
      } else {

        return 'google';
      }
    }


    if (event?.viewEventURL && event.viewEventURL.includes('zoho.com')) {

      return 'zoho';
    }


    if (event?.htmlLink && event.htmlLink.includes('google.com')) {

      return 'google';
    }



    return 'google';
  };
  
  useEffect(() => {
    if (calendarEvents && calendarEvents.length > 0) {
      const colorGroups: Record<string, {count: number, name: string, color: string}> = {};

      calendarEvents.forEach(event => {
        const colorId = event.colorId || 'default';
        const category = COLOR_CATEGORY_MAP[colorId] || COLOR_CATEGORY_MAP['default'];
        const categoryName = category.name;
        const colorClass = category.color;
        
        if (!colorGroups[colorId]) {
          colorGroups[colorId] = {
            count: 0,
            name: categoryName,
            color: colorClass
          };
        }
        
        colorGroups[colorId].count++;
      });
      
      const newCategories = Object.entries(colorGroups).map(([id, data]) => ({
        id,
        name: data.name,
        color: data.color,
        count: data.count,
        selected: true
      }));
      
      setCategories(newCategories);
    }
  }, [calendarEvents]);
  
  const { data: calendarStatus } = useQuery<{connected: boolean, message: string}>({
    queryKey: [`/api/${selectedProvider}/calendar/status`, selectedProvider],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/${selectedProvider}/calendar/status`);
      return response.json();
    }
  });
  
  const {
    data: availabilityData,
    isLoading: isLoadingAvailability,
    refetch: refetchAvailability
  } = useQuery<{success: boolean, timeSlots: TimeSlot[]}>({
    queryKey: [`/api/${selectedProvider}/calendar/availability`, formattedSelectedDate, selectedAppointmentDuration, selectedProvider],
    queryFn: async () => {
      const response = await apiRequest('GET',
        `/api/${selectedProvider}/calendar/availability?date=${formattedSelectedDate}&duration=${selectedAppointmentDuration}`
      );
      return response.json();
    },
    enabled: false
  });
  
  const createEventMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/${selectedProvider}/calendar/events`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('calendar.event_created', 'Event Created'),
        description: t('calendar.appointment_created_success', 'Your appointment has been successfully created'),
      });
      setIsCreateModalOpen(false);
      setIsAvailabilityModalOpen(false);

      queryClient.invalidateQueries({ queryKey: [`/api/${selectedProvider}/calendar/events`] });

      refetchEvents();
      resetEventForm();
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('calendar.event_create_failed', 'Failed to create event: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    }
  });
  
  const updateEventMutation = useMutation({
    mutationFn: async (data: {eventId: string, eventData: any, provider: 'google' | 'zoho' | 'calendly'}) => {



      if (data.provider === 'calendly') {
        throw new Error('Calendly events cannot be edited. Please use your Calendly dashboard to make changes.');
      }

      const response = await apiRequest('PATCH', `/api/${data.provider}/calendar/events/${data.eventId}`, data.eventData);
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: t('calendar.event_updated', 'Event Updated'),
        description: t('calendar.appointment_updated_success', 'Your appointment has been successfully updated'),
      });
      setIsEditModalOpen(false);

      queryClient.invalidateQueries({ queryKey: [`/api/${variables.provider}/calendar/events`] });
      refetchEvents();
      setSelectedEvent(null);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('calendar.event_update_failed', 'Failed to update event: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    }
  });
  
  const deleteEventMutation = useMutation({
    mutationFn: async (data: {eventId: string, provider: 'google' | 'zoho' | 'calendly'}) => {



      if (data.provider === 'calendly') {
        const response = await apiRequest('DELETE', `/api/calendly/events/${data.eventId}`);
        if (response.ok) {
          return { success: true };
        }
        throw new Error('Failed to cancel Calendly event');
      }

      const response = await apiRequest('DELETE', `/api/${data.provider}/calendar/events/${data.eventId}`);
      if (response.ok) {
        return { success: true };
      }
      throw new Error('Failed to delete event');
    },
    onSuccess: (_, variables) => {
      toast({
        title: t('calendar.event_canceled', 'Event Canceled'),
        description: t('calendar.appointment_canceled_success', 'Your appointment has been successfully canceled'),
      });
      setIsDeleteAlertOpen(false);

      queryClient.invalidateQueries({ queryKey: [`/api/${variables.provider}/calendar/events`] });
      refetchEvents();
      setSelectedEvent(null);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('calendar.event_cancel_failed', 'Failed to cancel event: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    }
  });
  
  const resetEventForm = () => {
    setEventForm({
      summary: '',
      description: '',
      location: '',
      startDateTime: formatISO(selectedDate || new Date()),
      endDateTime: formatISO(addHours(selectedDate || new Date(), 1)),
      attendees: [],
      attendeeInput: '',
      colorId: '1'
    });
    setSelectedTimeSlot(null);
  };
  
  useEffect(() => {
    if (selectedEvent && isEditModalOpen) {
      setEventForm({
        summary: selectedEvent.summary || '',
        description: selectedEvent.description || '',
        location: selectedEvent.location || '',
        startDateTime: selectedEvent.start.dateTime,
        endDateTime: selectedEvent.end.dateTime,
        attendees: selectedEvent.attendees ? selectedEvent.attendees.map(attendee => attendee.email) : [],
        attendeeInput: '',
        colorId: selectedEvent.colorId || '1'
      });
    }
  }, [selectedEvent, isEditModalOpen]);
  
  useEffect(() => {
    if (availabilityData?.success && availabilityData.timeSlots) {
      setTimeSlots(availabilityData.timeSlots);
    }
  }, [availabilityData]);
  

  useEffect(() => {
    const checkScreenSize = () => {

      if (window.innerWidth < 640 && viewMode === 'week') {
        setViewMode('day');
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [viewMode]);
  
  const handleScheduleAppointment = () => {
    const isConnected = selectedProvider === 'google' ? isGoogleCalendarConnected :
                       selectedProvider === 'zoho' ? isZohoCalendarConnected : isCalendlyCalendarConnected;
    const providerName = selectedProvider === 'google' ? t('calendar.google_calendar', 'Google Calendar') :
                        selectedProvider === 'zoho' ? t('calendar.zoho_calendar', 'Zoho Calendar') : t('calendar.calendly_calendar', 'Calendly');

    if (!isConnected) {
      toast({
        title: t('calendar.not_connected', `${providerName} Not Connected`),
        description: t('calendar.connect_first', `Please connect your ${providerName} above first`),
        variant: 'destructive'
      });
      return;
    }


    if (selectedProvider === 'calendly') {
      toast({
        title: t('calendar.calendly_readonly', 'Calendly is Read-Only'),
        description: t('calendar.calendly_readonly_desc', 'You can view and cancel Calendly events, but cannot create new ones. Please use your Calendly dashboard to create events.'),
        variant: "destructive",
      });
      return;
    }
    resetEventForm();
    setIsCreateModalOpen(true);
  };
  
  const handleCheckAvailability = () => {
    const isConnected = selectedProvider === 'google' ? isGoogleCalendarConnected :
                       selectedProvider === 'zoho' ? isZohoCalendarConnected : isCalendlyCalendarConnected;
    const providerName = selectedProvider === 'google' ? t('calendar.google_calendar', 'Google Calendar') :
                        selectedProvider === 'zoho' ? t('calendar.zoho_calendar', 'Zoho Calendar') : t('calendar.calendly_calendar', 'Calendly');

    if (!isConnected) {
      toast({
        title: t('calendar.not_connected', `${providerName} Not Connected`),
        description: t('calendar.connect_first', `Please connect your ${providerName} above first`),
        variant: "destructive",
      });
      return;
    }
    setIsAvailabilityModalOpen(true);
    refetchAvailability();
  };
  
  const handleAddAttendee = () => {
    if (eventForm.attendeeInput.trim() && !eventForm.attendees.includes(eventForm.attendeeInput.trim())) {
      setEventForm({
        ...eventForm,
        attendees: [...eventForm.attendees, eventForm.attendeeInput.trim()],
        attendeeInput: ''
      });
    }
  };
  
  const handleRemoveAttendee = (email: string) => {
    setEventForm({
      ...eventForm,
      attendees: eventForm.attendees.filter(a => a !== email)
    });
  };
  
  const formatTimeDisplay = (dateTimeString: string) => {
    try {
      const date = parseISO(dateTimeString);
      return format(date, 'MMM d, yyyy h:mm a');
    } catch (e) {
      return dateTimeString;
    }
  };
  
  const handleCreateFromTimeSlot = (timeSlot: string) => {
    setSelectedTimeSlot(timeSlot);
    
    const [hours, minutes] = timeSlot.match(/(\d+):(\d+)/)?.slice(1, 3).map(Number) || [0, 0];
    const isPM = timeSlot.toLowerCase().includes('pm');
    const hour24 = isPM && hours !== 12 ? hours + 12 : (!isPM && hours === 12 ? 0 : hours);
    
    const startDate = new Date(selectedDate || new Date());
    startDate.setHours(hour24, minutes, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + Number(selectedAppointmentDuration));
    
    setEventForm({
      ...eventForm,
      startDateTime: formatISO(startDate),
      endDateTime: formatISO(endDate)
    });
    
    setIsAvailabilityModalOpen(false);
    setIsCreateModalOpen(true);
  };
  
  const handleCreateEvent = () => {
    if (!eventForm.summary || !eventForm.startDateTime || !eventForm.endDateTime) {
      toast({
        title: t('common.missing_information', 'Missing Information'),
        description: t('common.fill_required_fields', 'Please fill in all required fields'),
        variant: "destructive",
      });
      return;
    }
    
    const eventData = {
      summary: eventForm.summary,
      description: eventForm.description,
      location: eventForm.location,
      startDateTime: eventForm.startDateTime,
      endDateTime: eventForm.endDateTime,
      attendees: eventForm.attendees,
      colorId: eventForm.colorId
    };
    
    createEventMutation.mutate(eventData);
  };
  
  const handleUpdateEvent = () => {
    if (!selectedEvent || !eventForm.summary || !eventForm.startDateTime || !eventForm.endDateTime) {
      toast({
        title: t('common.missing_information', 'Missing Information'),
        description: t('common.fill_required_fields', 'Please fill in all required fields'),
        variant: "destructive",
      });
      return;
    }


    const eventProvider = detectEventProvider(selectedEvent);


    const eventData = {
      summary: eventForm.summary,
      description: eventForm.description,
      location: eventForm.location,
      startDateTime: eventForm.startDateTime,
      endDateTime: eventForm.endDateTime,
      attendees: eventForm.attendees.map(email => ({ email })),
      colorId: eventForm.colorId
    };

    updateEventMutation.mutate({
      eventId: selectedEvent.id,
      eventData,
      provider: eventProvider
    });
  };
  
  const handleDeleteEvent = () => {
    if (selectedEvent?.id) {

      const eventProvider = detectEventProvider(selectedEvent);


      deleteEventMutation.mutate({
        eventId: selectedEvent.id,
        provider: eventProvider
      });
    }
  };
  
  const handleAddSchedule = () => {
    if (!newScheduleName.trim()) {
      toast({
        title: t('common.missing_information', 'Missing Information'),
        description: t('calendar.enter_schedule_name', 'Please enter a schedule name'),
        variant: "destructive",
      });
      return;
    }
    
    const newId = (Math.max(...schedules.map(s => parseInt(s.id)), 0) + 1).toString();
    
    setSchedules(prev => [
      ...prev,
      { id: newId, name: newScheduleName.trim(), selected: true, color: newScheduleColor }
    ]);
    
    setNewScheduleName("");
    setNewScheduleColor("blue");
    setIsAddScheduleModalOpen(false);
    
    toast({
      title: t('calendar.schedule_added', 'Schedule Added'),
      description: t('calendar.schedule_added_success', 'New schedule "{{name}}" has been added', { name: newScheduleName.trim() }),
    });
  };
  
  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };
  
  const goToPrevious = () => {
    if (viewMode === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subDays(currentDate, 1));
    }
  };
  
  const goToNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  };
  
  const toggleSchedule = (id: string) => {
    setSchedules(schedules.map(schedule => 
      schedule.id === id ? { ...schedule, selected: !schedule.selected } : schedule
    ));
  };
  
  const toggleCategory = (id: string) => {
    setCategories(categories.map(category => 
      category.id === id ? { ...category, selected: !category.selected } : category
    ));
  };
  
  const handleEditSchedule = () => {
    if (!selectedSchedule || !newScheduleName.trim()) {
      toast({
        title: t('common.missing_information', 'Missing Information'),
        description: t('calendar.enter_schedule_name', 'Please enter a schedule name'),
        variant: "destructive",
      });
      return;
    }
    
    setSchedules(prev => prev.map(schedule => 
      schedule.id === selectedSchedule.id 
        ? { ...schedule, name: newScheduleName.trim(), color: newScheduleColor }
        : schedule
    ));
    
    setNewScheduleName("");
    setNewScheduleColor("blue");
    setIsEditScheduleModalOpen(false);
    setSelectedSchedule(null);
    
    toast({
      title: t('calendar.schedule_updated', 'Schedule Updated'),
      description: t('calendar.schedule_updated_success', 'Schedule "{{name}}" has been updated', { name: newScheduleName.trim() }),
    });
  };
  
  const handleDeleteSchedule = () => {
    if (!selectedSchedule) return;
    
    setSchedules(prev => prev.filter(schedule => schedule.id !== selectedSchedule.id));
    
    setIsDeleteScheduleAlertOpen(false);
    setSelectedSchedule(null);
    
    toast({
      title: t('calendar.schedule_deleted', 'Schedule Deleted'),
      description: t('calendar.schedule_deleted_success', 'Schedule "{{name}}" has been deleted', { name: selectedSchedule.name }),
    });
  };
  
  const calendarData = useMemo(() => {
    if (viewMode === 'month') {
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const startDay = getDay(startDate);
      const start = subDays(startDate, startDay);
      const days = eachDayOfInterval({
        start,
        end: addDays(start, 41)
      });
      
      const weeks = [];
      for (let i = 0; i < 6; i++) {
        weeks.push(days.slice(i * 7, (i + 1) * 7));
      }
      
      return weeks;
    } else if (viewMode === 'week') {
      const startOfCurrentWeek = startOfWeek(currentDate);
      return eachDayOfInterval({
        start: startOfCurrentWeek,
        end: addDays(startOfCurrentWeek, 6)
      });
    } else {
      return [currentDate];
    }
  }, [currentDate, viewMode]);
  
  const filteredEvents = useMemo(() => {
    if (!calendarEvents || calendarEvents.length === 0) return [];
    
    const selectedCategoryIds = categories
      .filter(category => category.selected)
      .map(category => category.id);
    
    const selectedScheduleIds = schedules
      .filter(schedule => schedule.selected)
      .map(schedule => schedule.id);
    
    let filteredByCategories = calendarEvents;
    
    if (selectedCategoryIds.length !== categories.length) {
      filteredByCategories = calendarEvents.filter((event: any) => {
        if (!event.colorId) return true;
        
        return selectedCategoryIds.includes(event.colorId);
      });
    }
    
    if (selectedScheduleIds.length > 0 && selectedScheduleIds.length !== schedules.length) {
      
      return filteredByCategories.filter((event: any) => {
        for (const scheduleId of selectedScheduleIds) {
          const schedule = schedules.find(s => s.id === scheduleId);
          if (!schedule) continue;
          
          const summary = (event.summary || '').toLowerCase();
          const description = (event.description || '').toLowerCase();
          const scheduleName = schedule.name.toLowerCase();
          
          if (summary.includes(scheduleName) || description.includes(scheduleName)) {
            return true;
          }
        }
        
        return false;
      });
    }
    
    return filteredByCategories;
  }, [calendarEvents, categories, schedules]);
  

  const eventsByDate = useMemo(() => {
    if (!filteredEvents.length) return new Map();

    const eventMap = new Map();

    filteredEvents.forEach(event => {

      if (!event.start || !event.start.dateTime) {
        return; // Skip events without valid start dates
      }

      try {
        const startDate = new Date(event.start.dateTime);

        if (isNaN(startDate.getTime())) {
          return; // Skip events with invalid dates
        }

        const eventDate = format(startDate, 'yyyy-MM-dd');
        if (!eventMap.has(eventDate)) {
          eventMap.set(eventDate, []);
        }
        eventMap.get(eventDate).push(event);
      } catch (error) {

        return;
      }
    });

    return eventMap;
  }, [filteredEvents]);
  

  const getEventTimestamps = (event: Appointment): { start: number; end: number } | null => {
    if (!event.start?.dateTime || !event.end?.dateTime) {
      return null;
    }
    
    try {
      const start = parseISO(event.start.dateTime);
      const end = parseISO(event.end.dateTime);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return null;
      }
      
      return {
        start: start.getTime(),
        end: end.getTime()
      };
    } catch {
      return null;
    }
  };
  

  const eventsOverlap = (event1: Appointment, event2: Appointment): boolean => {
    const times1 = getEventTimestamps(event1);
    const times2 = getEventTimestamps(event2);
    
    if (!times1 || !times2) return false;
    
    return (times1.start < times2.end && times1.end > times2.start);
  };
  

  const detectOverlaps = (events: Appointment[]): Appointment[][] => {
    if (events.length === 0) return [];
    

    const validEvents = events.filter(event => getEventTimestamps(event) !== null);
    
    if (validEvents.length === 0) return [];
    
    const overlapGroups: Appointment[][] = [];
    const visited = new Set<string>();
    

    validEvents.forEach((event) => {
      if (visited.has(event.id)) return;
      
      const group: Appointment[] = [];
      const queue: Appointment[] = [event];
      visited.add(event.id);
      

      while (queue.length > 0) {
        const currentEvent = queue.shift()!;
        group.push(currentEvent);
        

        validEvents.forEach((otherEvent) => {
          if (visited.has(otherEvent.id)) return;
          
          if (eventsOverlap(currentEvent, otherEvent)) {
            visited.add(otherEvent.id);
            queue.push(otherEvent);
          }
        });
      }
      
      if (group.length > 0) {
        overlapGroups.push(group);
      }
    });
    
    return overlapGroups;
  };
  

  const calculateEventColumns = (overlapGroup: Appointment[]): Map<string, { column: number; totalColumns: number }> => {
    const columnMap = new Map<string, { column: number; totalColumns: number }>();
    
    if (overlapGroup.length === 0) return columnMap;
    

    const validEvents = overlapGroup.filter(event => getEventTimestamps(event) !== null);
    
    if (validEvents.length === 0) return columnMap;
    

    const sortedEvents = [...validEvents].sort((a, b) => {
      const aTimes = getEventTimestamps(a);
      const bTimes = getEventTimestamps(b);
      if (!aTimes || !bTimes) return 0;
      return aTimes.start - bTimes.start;
    });
    

    const columns: Array<{ endTime: number }> = [];
    
    sortedEvents.forEach((event) => {
      const times = getEventTimestamps(event);
      if (!times) return;
      
      const eventStart = times.start;
      const eventEnd = times.end;
      

      let assignedColumn = -1;
      for (let i = 0; i < columns.length; i++) {
        if (columns[i].endTime <= eventStart) {
          assignedColumn = i;
          break;
        }
      }
      

      if (assignedColumn === -1) {
        assignedColumn = columns.length;
        columns.push({ endTime: eventEnd });
      } else {
        columns[assignedColumn].endTime = Math.max(columns[assignedColumn].endTime, eventEnd);
      }
      
      columnMap.set(event.id, {
        column: assignedColumn,
        totalColumns: columns.length
      });
    });
    

    const totalColumns = columns.length;
    columnMap.forEach((value) => {
      value.totalColumns = totalColumns;
    });
    
    return columnMap;
  };
  

  const calculateEventHeight = (startDateTime: string, endDateTime: string, hourSlotHeight: number = 60): number => {
    if (!startDateTime || !endDateTime) return 20; // Default minimum height
    
    try {
      const start = parseISO(startDateTime);
      const end = parseISO(endDateTime);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return 20; // Default minimum height
      }
      
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      const height = (durationMinutes / 60) * hourSlotHeight;
      return Math.max(height, 20); // Minimum height of 20px
    } catch {
      return 20; // Default minimum height
    }
  };
  

  const calculateEventTopPosition = (dateTime: string, hourSlotHour: number, hourSlotHeight: number = 60): number => {
    if (!dateTime) return 0;
    
    try {
      const eventDate = parseISO(dateTime);
      
      if (isNaN(eventDate.getTime())) {
        return 0;
      }
      
      const eventHour = eventDate.getHours();
      const eventMinutes = eventDate.getMinutes();
      

      if (eventHour < hourSlotHour) {
        return 0;
      }
      

      const minutesOffset = eventMinutes;
      const topOffset = (minutesOffset / 60) * hourSlotHeight;
      return topOffset;
    } catch {
      return 0;
    }
  };
  
  const getEventsForDay = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const events = eventsByDate.get(dateKey) || [];

    return events.filter((event: Appointment) => getEventTimestamps(event) !== null);
  };
  
  const renderMonthCell = (day: Date) => {
    const dayEvents = getEventsForDay(day);
    const isCurrentMonth = isSameMonth(day, currentDate);
    const isSelectedDay = isSameDay(day, selectedDate);
    const displayDay = format(day, 'd');
    
    return (
      <div 
        key={day.toString()} 
        className={`border border-border min-h-[80px] md:min-h-[100px] lg:min-h-[120px] p-1 transition-colors ${
          isToday(day) ? 'bg-primary/10 dark:bg-primary/20' : 
          !isCurrentMonth ? 'bg-muted/30 text-muted-foreground/70' : 
          isSelectedDay ? 'bg-primary/20 dark:bg-primary/30' : ''
        }`}
        onClick={() => setSelectedDate(day)}
      >
        <div className="flex justify-between items-start">
          <span className={`text-sm font-medium ${isToday(day) ? 'text-primary dark:text-primary/90 w-6 h-6 rounded-full bg-primary/30 dark:bg-primary/40 flex items-center justify-center' : ''}`}>
            {displayDay}
          </span>
        </div>
        <div className="mt-1 space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
          {dayEvents.slice(0, 5).map((event: any, idx: number) => (
            <div
              key={event.id || idx}
              className={`text-xs px-1 py-0.5 rounded truncate ${EVENT_COLORS[event.colorId || 'default']} text-white flex items-center space-x-1`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEvent(event);
                setIsEditModalOpen(true);
              }}
            >
              {/* Provider indicator */}
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  event.provider === 'google' ? 'bg-primary/30 dark:bg-primary/40' :
                  event.provider === 'zoho' ? 'bg-orange-200' :
                  event.provider === 'calendly' ? 'bg-purple-200' : 'bg-gray-200'
                }`}
                title={event.provider === 'google' ? t('calendar.google_calendar', 'Google Calendar') :
                       event.provider === 'zoho' ? t('calendar.zoho_calendar', 'Zoho Calendar') :
                       event.provider === 'calendly' ? t('calendar.calendly_calendar', 'Calendly') : t('nav.calendar', 'Calendar')}
              />
              <span className="truncate">
                {format(parseISO(event.start.dateTime), 'h:mm a')} {event.summary}
              </span>
            </div>
          ))}
          {dayEvents.length > 5 && (
            <div className="text-xs text-muted-foreground pl-1">
              +{dayEvents.length - 5} {t('calendar.more', 'more')}
            </div>
          )}
        </div>
      </div>
    );
  };
  

  const parseHourSlot = (hourSlot: string): number => {
    const [hourStr, period] = hourSlot.split(' ');
    let hour = parseInt(hourStr);
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return hour;
  };


  const getEventHour = (dateTime: string): number => {
    return parseISO(dateTime).getHours();
  };


  const getEventMinutes = (dateTime: string): number => {
    return parseISO(dateTime).getMinutes();
  };

  const renderWeekDayCell = (day: Date, hourSlots: string[]) => {
    const dayEvents = getEventsForDay(day);
    

    const overlapGroups = detectOverlaps(dayEvents);
    const eventColumnMap = new Map<string, { column: number; totalColumns: number }>();
    
    overlapGroups.forEach((group) => {
      const columnMap = calculateEventColumns(group);
      columnMap.forEach((value, key) => {
        eventColumnMap.set(key, value);
      });
    });
    

    const renderedEvents = new Set<string>();
    
    return (
      <div className="flex-1 flex flex-col min-h-[800px]">
        <div className={`text-center py-2 font-medium ${isToday(day) ? 'bg-primary/20 dark:bg-primary/30' : 'bg-muted/30'}`}>
          <div>{format(day, 'EEE')}</div>
          <div className={`text-lg ${isToday(day) ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
        </div>
        <div className="flex-1 flex flex-col border-l overflow-visible">
          {hourSlots.map((hour) => {

            const slotHour = parseHourSlot(hour);
            const hourSlotHeight = 60;
            

            const eventsForThisHour = dayEvents.filter((event: Appointment) => {
              if (renderedEvents.has(event.id)) return false;
              
              const eventStart = parseISO(event.start.dateTime);
              const eventEnd = parseISO(event.end.dateTime);
              const eventStartHour = eventStart.getHours();
              const eventEndHour = eventEnd.getHours();
              

              if (eventStartHour === slotHour) {
                renderedEvents.add(event.id);
                return true;
              }
              

              if (eventStartHour < slotHour && eventEndHour >= slotHour) {

                return false;
              }
              
              return false;
            });

            return (
              <div key={hour} className="border-b py-2 px-1 min-h-[60px] h-[60px] relative overflow-visible">
                <div className="text-xs text-muted-foreground/70 absolute top-0 left-1">{hour}</div>
                {eventsForThisHour.map((event: any) => {
                  const eventStart = parseISO(event.start.dateTime);
                  const eventEnd = parseISO(event.end.dateTime);
                  const eventStartHour = eventStart.getHours();
                  const eventStartMinutes = eventStart.getMinutes();
                  

                  const eventHeight = calculateEventHeight(event.start.dateTime, event.end.dateTime, hourSlotHeight);
                  

                  const topOffset = calculateEventTopPosition(event.start.dateTime, slotHour, hourSlotHeight);
                  

                  const columnInfo = eventColumnMap.get(event.id) || { column: 0, totalColumns: 1 };
                  const { column: columnIndex, totalColumns } = columnInfo;
                  

                  const widthPercent = 100 / totalColumns;
                  const eventWidth = `calc(${widthPercent}% - 4px)`;
                  const leftOffset = `calc(4px + ${columnIndex * widthPercent}%)`;
                  

                  const zIndex = 1 + columnIndex;
                  
                  return (
                    <div
                      key={event.id}
                      className={`p-0.5 md:p-1 rounded-sm text-[10px] md:text-xs text-white ${EVENT_COLORS[event.colorId || 'default']} flex items-center space-x-1 whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer hover:z-20 hover:shadow-lg transition-shadow`}
                      style={{
                        top: `${topOffset}px`,
                        position: 'absolute',
                        width: eventWidth,
                        left: leftOffset,
                        height: `${eventHeight}px`,
                        zIndex: zIndex,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      onClick={() => {
                        setSelectedEvent(event);
                        setIsEditModalOpen(true);
                      }}
                    >
                      {/* Provider indicator */}
                      <div
                        className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full flex-shrink-0 ${
                          event.provider === 'google' ? 'bg-primary/30 dark:bg-primary/40' :
                          event.provider === 'zoho' ? 'bg-orange-200' :
                          event.provider === 'calendly' ? 'bg-purple-200' : 'bg-gray-200'
                        }`}
                        title={event.provider === 'google' ? t('calendar.google_calendar', 'Google Calendar') :
                               event.provider === 'zoho' ? t('calendar.zoho_calendar', 'Zoho Calendar') :
                               event.provider === 'calendly' ? t('calendar.calendly_calendar', 'Calendly') : t('nav.calendar', 'Calendar')}
                      />
                      <span className="truncate">
                        {format(parseISO(event.start.dateTime), 'h:mm a')} - {event.summary}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  const hourSlots = [
    '12 am', '1 am', '2 am', '3 am', '4 am', '5 am', '6 am', '7 am',
    '8 am', '9 am', '10 am', '11 am', '12 pm', 
    '1 pm', '2 pm', '3 pm', '4 pm', '5 pm', '6 pm', '7 pm', '8 pm', '9 pm', '10 pm', '11 pm'
  ];
  
  return (
    <div className="h-screen flex flex-col overflow-hidden font-poppins text-foreground bg-background">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-2 md:p-4 lg:p-6">
            {/* Calendar Provider Selection and Filtering */}
            <div className="sticky top-0 z-10 bg-background border-b border-border pb-4 mb-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                {/* Provider Selection for Creating Events */}
                <div className="flex items-center space-x-4">
                  <h2 className="text-lg font-semibold">{t('calendar.create_events_with', 'Create Events With:')}</h2>
                  <div className="flex space-x-2">
                    <Button
                      variant={selectedProvider === 'google' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedProvider('google')}
                      className="flex items-center space-x-2"
                    >
                      <span>{t('calendar.google_calendar', 'Google Calendar')}</span>
                      {isGoogleCalendarConnected && (
                        <div className="w-2 h-2 bg-green-500 dark:bg-green-600 rounded-full"></div>
                      )}
                    </Button>
                    <Button
                      variant={selectedProvider === 'zoho' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedProvider('zoho')}
                      className="flex items-center space-x-2"
                    >
                      <span>{t('calendar.zoho_calendar', 'Zoho Calendar')}</span>
                      {isZohoCalendarConnected && (
                        <div className="w-2 h-2 bg-green-500 dark:bg-green-600 rounded-full"></div>
                      )}
                    </Button>
                    <Button
                      variant={selectedProvider === 'calendly' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedProvider('calendly')}
                      className="flex items-center space-x-2"
                    >
                      <span>{t('calendar.calendly_calendar', 'Calendly')}</span>
                      {isCalendlyCalendarConnected && (
                        <div className="w-2 h-2 bg-green-500 dark:bg-green-600 rounded-full"></div>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Calendar View Filter */}
                <div className="flex items-center space-x-4">
                  <h3 className="text-sm font-medium text-foreground">{t('calendar.view', 'View:')}:</h3>
                  <div className="flex space-x-1 bg-muted rounded-lg p-1">
                    <Button
                      variant={calendarFilter === 'all' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCalendarFilter('all')}
                      className="text-xs px-3 py-1 h-7"
                    >
                      {t('calendar.all_calendars', 'All Calendars')}
                    </Button>
                    <Button
                      variant={calendarFilter === 'google' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCalendarFilter('google')}
                      className="text-xs px-3 py-1 h-7 flex items-center space-x-1"
                      disabled={!isGoogleCalendarConnected}
                    >
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>{t('calendar.google', 'Google')}</span>
                    </Button>
                    <Button
                      variant={calendarFilter === 'zoho' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCalendarFilter('zoho')}
                      className="text-xs px-3 py-1 h-7 flex items-center space-x-1"
                      disabled={!isZohoCalendarConnected}
                    >
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span>{t('calendar.zoho', 'Zoho')}</span>
                    </Button>
                    <Button
                      variant={calendarFilter === 'calendly' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCalendarFilter('calendly')}
                      className="text-xs px-3 py-1 h-7 flex items-center space-x-1"
                      disabled={!isCalendlyCalendarConnected}
                    >
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span>{t('calendar.calendly', 'Calendly')}</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Provider-specific OAuth Status */}
              {selectedProvider === 'google' && (
                <GoogleCalendarOAuthStatus
                  onAuthSuccess={() => {
                    window.location.reload();
                  }}
                />
              )}

              {selectedProvider === 'zoho' && (
                <ZohoCalendarOAuthStatus
                  onAuthSuccess={() => {
                    window.location.reload();
                  }}
                />
              )}

              {selectedProvider === 'calendly' && (
                <CalendlyCalendarOAuthStatus
                  onAuthSuccess={() => {
                    window.location.reload();
                  }}
                />
              )}
            </div>

            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
              <div className="border-b p-2 md:p-4 flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0 md:space-x-4">
                <div className="flex items-center space-x-2 w-full md:w-auto justify-between md:justify-start">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    >
                      {isSidebarOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                    <div className="text-xl ">{t('nav.calendar', 'Calendar')}</div>
                    <div className="text-sm text-muted-foreground">{t('calendar.personal_teams', 'Personal, Teams')}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToToday}
                  >
                    {t('calendar.today', 'Today')}
                  </Button>
                  <div className="flex">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={goToPrevious}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={goToNext}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-lg ">
                    {viewMode === 'month' && format(currentDate, 'MMMM yyyy')}
                    {viewMode === 'week' && `${t('calendar.week_of', 'Week of')} ${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`}
                    {viewMode === 'day' && format(currentDate, 'MMMM d, yyyy')}
                  </div>
                  <div className="ml-4 flex items-center space-x-2">
                    <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">{t('calendar.month', 'Month')}</SelectItem>
                        <SelectItem value="week">{t('calendar.week', 'Week')}</SelectItem>
                        <SelectItem value="day">{t('calendar.day', 'Day')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-1 h-full relative">
                {/* Mobile sidebar overlay */}
                {isSidebarOpen && (
                  <div 
                    className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
                    onClick={() => setIsSidebarOpen(false)}
                  />
                )}
                {/* Sidebar */}
                <div className={`
                  ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
                  lg:translate-x-0 
                  fixed lg:static 
                  top-0 left-0 
                  h-full lg:h-auto
                  w-[260px] 
                  bg-background 
                  border-r 
                  p-4 
                  z-50 lg:z-auto
                  transition-transform duration-300 ease-in-out
                  overflow-y-auto
                `}>
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">
                        {format(currentDate, 'MMMM yyyy')}
                      </span>
                      <div className="flex">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-7 text-center text-xs mb-1">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                        <div key={i} className="py-1">{day}</div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1 text-center text-sm">
                      {eachDayOfInterval({
                        start: startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)),
                        end: endOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0))
                      }).map(day => {
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isCurrent = isSameDay(day, selectedDate);
                        
                        return (
                          <button
                            key={day.toString()}
                            className={`h-7 w-7 flex items-center justify-center rounded-full ${
                              isCurrent ? 'bg-primary text-white' : 
                              isToday(day) ? 'bg-primary/20 dark:bg-primary/30 text-primary dark:text-primary/90' : 
                              !isCurrentMonth ? 'text-gray-400' : ''
                            }`}
                            onClick={() => setSelectedDate(day)}
                          >
                            {format(day, 'd')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-base ">{t('calendar.my_schedules', 'My Schedules')}</span>
                      <div className="flex">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => setIsAddScheduleModalOpen(true)}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {schedules.map(schedule => (
                        <div 
                          key={schedule.id} 
                          className="flex items-center justify-between group"
                        >
                          <div 
                            className="flex items-center cursor-pointer"
                            onClick={() => toggleSchedule(schedule.id)}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${schedule.selected ? SCHEDULE_COLORS[schedule.color || 'blue'] : 'border-2 border-gray-300'}`}>
                              {schedule.selected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <span className="ml-2 text-sm font-medium">{schedule.name}</span>
                          </div>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSchedule(schedule);
                                setIsEditScheduleModalOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSchedule(schedule);
                                setIsDeleteScheduleAlertOpen(true);
                              }}
                            >
                              <Trash className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-base ">{t('calendar.categories', 'Categories')}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      {categories.map(category => (
                        <div 
                          key={category.id} 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => toggleCategory(category.id)}
                        >
                          <div className="flex items-center">
                            <div className={`w-4 h-4 rounded-full ${category.color}`}></div>
                            <span className="ml-2 text-sm font-medium">{category.name}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs bg-gray-100 rounded-full px-2 py-0.5">{category.count}</span>
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${category.selected ? 'bg-indigo-600' : 'border-2 border-gray-300'}`}>
                              {category.selected && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto">
                  {viewMode === 'month' && (
                    <div>
                      <div className="grid grid-cols-7 text-center border-b py-2 bg-gray-50">
                        {[
                          t('calendar.sun', 'Sun'),
                          t('calendar.mon', 'Mon'),
                          t('calendar.tue', 'Tue'),
                          t('calendar.wed', 'Wed'),
                          t('calendar.thu', 'Thu'),
                          t('calendar.fri', 'Fri'),
                          t('calendar.sat', 'Sat')
                        ].map(day => (
                          <div key={day} className="text-sm font-medium text-gray-600">{day}</div>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-7 gap-0 md:gap-1">
                        {calendarData.flat().map(day => renderMonthCell(day))}
                      </div>
                    </div>
                  )}
                  
                  {viewMode === 'week' && (
                    <div className="flex h-full overflow-x-auto md:overflow-x-visible">
                      <div className="w-12 md:w-16 pt-10 bg-gray-50 border-r flex-shrink-0">
                        {hourSlots.map(hour => (
                          <div key={hour} className="h-[50px] md:h-[60px] border-b px-2 text-xs text-gray-500">
                            {hour}
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex-1 flex min-w-[100px] md:min-w-0 overflow-x-auto">
                        {(calendarData as Date[]).map((day) => renderWeekDayCell(day, hourSlots))}
                      </div>
                    </div>
                  )}
                  
                  {viewMode === 'day' && (
                    <div className="flex h-full">
                      <div className="w-12 md:w-16 pt-10 bg-gray-50 border-r flex-shrink-0">
                        {hourSlots.map(hour => (
                          <div key={hour} className="h-[50px] md:h-[60px] border-b px-2 text-xs text-gray-500">
                            {hour}
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex-1">
                        {renderWeekDayCell(currentDate, hourSlots)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="fixed bottom-8 right-8 flex space-x-2">
              <Button 
                variant="outline" 
                onClick={handleCheckAvailability}
                className="rounded-full shadow-sm"
              >
                <Clock className="h-4 w-4 mr-2" /> {t('calendar.check_availability', 'Check Availability')}
              </Button>
              <Button 
                onClick={handleScheduleAppointment}
                className="rounded-full shadow-sm text-green-600 btn-brand-primary"
              >
                <CalendarIcon className="h-4 w-4 mr-2 " /> {t('calendar.schedule_appointment', 'Schedule Appointment')}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-w-full h-full sm:h-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <span>{t('calendar.schedule_new_appointment', 'Schedule New Appointment')}</span>
              <div className="flex items-center space-x-1 text-sm font-normal">
                <span className="text-gray-500">via</span>
                <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded-md">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      selectedProvider === 'google' ? 'bg-primary' :
                      selectedProvider === 'zoho' ? 'bg-orange-500' : 'bg-purple-500'
                    }`}
                  />
                  <span className="text-xs font-medium">
                    {selectedProvider === 'google' ? t('calendar.google_calendar', 'Google Calendar') :
                     selectedProvider === 'zoho' ? t('calendar.zoho_calendar', 'Zoho Calendar') : t('calendar.calendly_calendar', 'Calendly')}
                  </span>
                </div>
              </div>
            </DialogTitle>
            <DialogDescription>
              {t('calendar.create_new_event', 'Create a new event on your calendar.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="summary" className="text-right">
                {t('calendar.title', 'Title')}*
              </Label>
              <Input
                id="summary"
                value={eventForm.summary}
                onChange={(e) => setEventForm({...eventForm, summary: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                {t('calendar.description', 'Description')}
              </Label>
              <Textarea
                id="description"
                value={eventForm.description}
                onChange={(e) => setEventForm({...eventForm, description: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="location" className="text-right">
                {t('calendar.location', 'Location')}
              </Label>
              <Input
                id="location"
                value={eventForm.location}
                onChange={(e) => setEventForm({...eventForm, location: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="colorId" className="text-right">
                {t('calendar.category', 'Category')}
              </Label>
              <Select 
                value={eventForm.colorId} 
                onValueChange={(value) => setEventForm({...eventForm, colorId: value})}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t('calendar.select_category', 'Select category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-primary mr-2"></div>
                      <span>{t('calendar.color.blue', 'Blue')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="2">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 dark:bg-green-600 mr-2"></div>
                      <span>{t('calendar.color.green', 'Green')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="3">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
                      <span>{t('calendar.color.purple', 'Purple')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                      <span>{t('calendar.color.red', 'Red')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="5">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                      <span>{t('calendar.color.yellow', 'Yellow')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="6">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
                      <span>{t('calendar.color.orange', 'Orange')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="7">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-cyan-500 mr-2"></div>
                      <span>{t('calendar.color.turquoise', 'Turquoise')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="8">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-muted mr-2"></div>
                      <span>{t('calendar.color.gray', 'Gray')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDateTime" className="text-right">
                {t('calendar.start_time', 'Start Time')}*
              </Label>
              <Input
                id="startDateTime"
                type="datetime-local"
                value={eventForm.startDateTime.slice(0, 16)}
                onChange={(e) => setEventForm({...eventForm, startDateTime: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endDateTime" className="text-right">
                {t('calendar.end_time', 'End Time')}*
              </Label>
              <Input
                id="endDateTime"
                type="datetime-local"
                value={eventForm.endDateTime.slice(0, 16)}
                onChange={(e) => setEventForm({...eventForm, endDateTime: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="attendees" className="text-right pt-2">
                {t('calendar.attendees', 'Attendees')}
              </Label>
              <div className="col-span-3 space-y-2">
                <div className="flex space-x-2">
                  <Input
                    id="attendees"
                    placeholder={t('calendar.enter_email_address', 'Enter email address')}
                    value={eventForm.attendeeInput}
                    onChange={(e) => setEventForm({...eventForm, attendeeInput: e.target.value})}
                    className="flex-1"
                  />
                  <Button type="button" className="btn-brand-primary" onClick={handleAddAttendee}>{t('common.add', 'Add')}</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {eventForm.attendees.map(email => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveAttendee(email)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="btn-brand-primary" onClick={() => setIsCreateModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button 
              type="button" 
              onClick={handleCreateEvent}
              disabled={createEventMutation.isPending}
            >
              {createEventMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('calendar.creating', 'Creating...')}
                </>
              ) : t('calendar.create_appointment', 'Create Appointment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-w-full h-full sm:h-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <span>{t('calendar.edit_appointment', 'Edit Appointment')}</span>
              {selectedEvent && (
                <div className="flex items-center space-x-1 text-sm font-normal">
                  <span className="text-gray-500">{t('calendar.from', 'from')}</span>
                  <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded-md">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        detectEventProvider(selectedEvent) === 'google' ? 'bg-primary' :
                        detectEventProvider(selectedEvent) === 'zoho' ? 'bg-orange-500' : 'bg-purple-500'
                      }`}
                    />
                    <span className="text-xs font-medium">
                      {detectEventProvider(selectedEvent) === 'google' ? t('calendar.google_calendar', 'Google Calendar') :
                       detectEventProvider(selectedEvent) === 'zoho' ? t('calendar.zoho_calendar', 'Zoho Calendar') : t('calendar.calendly_calendar', 'Calendly')}
                    </span>
                  </div>
                </div>
              )}
            </DialogTitle>
            <DialogDescription>
              {t('calendar.update_appointment_details', 'Update the details of your appointment.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-summary" className="text-right">
                {t('calendar.title', 'Title')}*
              </Label>
              <Input
                id="edit-summary"
                value={eventForm.summary}
                onChange={(e) => setEventForm({...eventForm, summary: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-description" className="text-right">
                {t('calendar.description', 'Description')}
              </Label>
              <Textarea
                id="edit-description"
                value={eventForm.description}
                onChange={(e) => setEventForm({...eventForm, description: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-location" className="text-right">
                {t('calendar.location', 'Location')}
              </Label>
              <Input
                id="edit-location"
                value={eventForm.location}
                onChange={(e) => setEventForm({...eventForm, location: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-colorId" className="text-right">
                {t('calendar.category', 'Category')}
              </Label>
              <Select 
                value={eventForm.colorId} 
                onValueChange={(value) => setEventForm({...eventForm, colorId: value})}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t('calendar.select_category', 'Select category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-primary mr-2"></div>
                      <span>{t('calendar.color.blue', 'Blue')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="2">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 dark:bg-green-600 mr-2"></div>
                      <span>{t('calendar.color.green', 'Green')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="3">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
                      <span>{t('calendar.color.purple', 'Purple')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                      <span>{t('calendar.color.red', 'Red')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="5">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                      <span>{t('calendar.color.yellow', 'Yellow')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="6">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
                      <span>{t('calendar.color.orange', 'Orange')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="7">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-cyan-500 mr-2"></div>
                      <span>{t('calendar.color.turquoise', 'Turquoise')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="8">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-muted mr-2"></div>
                      <span>{t('calendar.color.gray', 'Gray')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-startDateTime" className="text-right">
                {t('calendar.start_time', 'Start Time')}*
              </Label>
              <Input
                id="edit-startDateTime"
                type="datetime-local"
                value={eventForm.startDateTime.slice(0, 16)}
                onChange={(e) => setEventForm({...eventForm, startDateTime: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-endDateTime" className="text-right">
                {t('calendar.end_time', 'End Time')}*
              </Label>
              <Input
                id="edit-endDateTime"
                type="datetime-local"
                value={eventForm.endDateTime.slice(0, 16)}
                onChange={(e) => setEventForm({...eventForm, endDateTime: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-attendees" className="text-right pt-2">
                {t('calendar.attendees', 'Attendees')}
              </Label>
              <div className="col-span-3 space-y-2">
                <div className="flex space-x-2">
                  <Input
                    id="edit-attendees"
                    placeholder={t('calendar.enter_email_address', 'Enter email address')}
                    value={eventForm.attendeeInput}
                    onChange={(e) => setEventForm({...eventForm, attendeeInput: e.target.value})}
                    className="flex-1"
                  />
                  <Button type="button" className="btn-brand-primary" onClick={handleAddAttendee}>{t('common.add', 'Add')}</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {eventForm.attendees.map(email => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveAttendee(email)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button 
              type="button" 
              variant="destructive" 
              onClick={() => {
                setIsEditModalOpen(false);
                setIsDeleteAlertOpen(true);
              }}
            >
              {t('common.delete', 'Delete')}
            </Button>
            <div className="flex space-x-2">
              <Button type="button" variant="outline" className="btn-brand-primary" onClick={() => setIsEditModalOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button 
                type="button" 
                onClick={handleUpdateEvent}
                disabled={updateEventMutation.isPending}
              >
                {updateEventMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('calendar.updating', 'Updating...')}
                  </>
                ) : t('calendar.update_appointment', 'Update Appointment')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment? This action cannot be undone.
              {selectedEvent && (
                <div className="mt-2 space-y-2">
                  <div className="font-medium">
                    {selectedEvent.summary} on {formatTimeDisplay(selectedEvent.start.dateTime)}
                  </div>
                  <div className="flex items-center space-x-1 text-sm">
                    <span className="text-gray-500">from</span>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded-md">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          detectEventProvider(selectedEvent) === 'google' ? 'bg-primary' :
                          detectEventProvider(selectedEvent) === 'zoho' ? 'bg-orange-500' : 'bg-purple-500'
                        }`}
                      />
                      <span className="text-xs font-medium">
                        {detectEventProvider(selectedEvent) === 'google' ? t('calendar.google_calendar', 'Google Calendar') :
                         detectEventProvider(selectedEvent) === 'zoho' ? t('calendar.zoho_calendar', 'Zoho Calendar') : t('calendar.calendly_calendar', 'Calendly')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep It</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEvent}
              className="bg-red-600 focus:ring-red-600"
            >
              {deleteEventMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('calendar.canceling', 'Canceling...')}
                </>
              ) : t('calendar.yes_cancel_appointment', 'Yes, Cancel Appointment')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Dialog open={isAddScheduleModalOpen} onOpenChange={setIsAddScheduleModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Schedule</DialogTitle>
            <DialogDescription>
              Create a new schedule to organize your events.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scheduleName" className="text-right">
                {t('calendar.name', 'Name')}
              </Label>
              <Input
                id="scheduleName"
                placeholder={t('calendar.enter_schedule_name', 'Enter schedule name')}
                value={newScheduleName}
                onChange={(e) => setNewScheduleName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scheduleColor" className="text-right">
                {t('calendar.color', 'Color')}
              </Label>
              <Select 
                value={newScheduleColor} 
                onValueChange={setNewScheduleColor}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t('calendar.select_color', 'Select color')}>
                    {newScheduleColor && (
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${SCHEDULE_COLORS[newScheduleColor]} mr-2`}></div>
                        <span>{newScheduleColor.charAt(0).toUpperCase() + newScheduleColor.slice(1)}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHEDULE_COLORS).map(([name, colorClass]) => (
                    <SelectItem key={name} value={name}>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${colorClass} mr-2`}></div>
                        <span>{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="btn-brand-primary" onClick={() => setIsAddScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={handleAddSchedule}
            >
              Add Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isEditScheduleModalOpen} onOpenChange={setIsEditScheduleModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>
              Update your schedule details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editScheduleName" className="text-right">
                Name
              </Label>
              <Input
                id="editScheduleName"
                value={newScheduleName}
                onChange={(e) => setNewScheduleName(e.target.value)}
                className="col-span-3"
                placeholder="Work, Personal, etc."
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editScheduleColor" className="text-right">
                Color
              </Label>
              <Select 
                value={newScheduleColor} 
                onValueChange={setNewScheduleColor}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select color">
                    {newScheduleColor && (
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${SCHEDULE_COLORS[newScheduleColor]} mr-2`}></div>
                        <span>{newScheduleColor.charAt(0).toUpperCase() + newScheduleColor.slice(1)}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHEDULE_COLORS).map(([name, colorClass]) => (
                    <SelectItem key={name} value={name}>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${colorClass} mr-2`}></div>
                        <span>{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="btn-brand-primary" onClick={() => setIsEditScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button 
            variant="brand"
            className="btn-brand-primary"
            type="button" 
            onClick={handleEditSchedule}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteScheduleAlertOpen} onOpenChange={setIsDeleteScheduleAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot be undone.
              {selectedSchedule && (
                <div className="mt-2 font-medium flex items-center">
                  <div className={`w-3 h-3 rounded-full ${SCHEDULE_COLORS[selectedSchedule.color || 'blue']} mr-2`}></div>
                  {selectedSchedule.name}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteSchedule}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Dialog open={isAvailabilityModalOpen} onOpenChange={setIsAvailabilityModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Available Time Slots</DialogTitle>
            <DialogDescription>
              Select a time slot to create a new appointment.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-500">
                {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : ''}
              </div>
              <Select 
                value={selectedAppointmentDuration} 
                onValueChange={setSelectedAppointmentDuration}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('calendar.duration', 'Duration')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">{t('calendar.duration.15_minutes', '15 minutes')}</SelectItem>
                  <SelectItem value="30">{t('calendar.duration.30_minutes', '30 minutes')}</SelectItem>
                  <SelectItem value="60">{t('calendar.duration.60_minutes', '60 minutes')}</SelectItem>
                  <SelectItem value="90">{t('calendar.duration.90_minutes', '90 minutes')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {isLoadingAvailability ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                {timeSlots?.length > 0 && timeSlots[0].slots?.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {timeSlots[0].slots.map((slot, index) => (
                      <Button
                        key={index}
                        variant="brand"
                        className="text-center"
                        onClick={() => handleCreateFromTimeSlot(slot)}
                      >
                        {slot}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">
                      <i className="ri-time-line text-4xl"></i>
                    </div>
                    <p className="text-gray-500">
                      {t('calendar.no_available_slots', 'No available time slots found for the selected date and duration')}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsAvailabilityModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={() => refetchAvailability()}
              disabled={isLoadingAvailability}
            >
              {isLoadingAvailability ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('calendar.checking', 'Checking...')}
                </>
              ) : t('calendar.refresh_availability', 'Refresh Availability')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
