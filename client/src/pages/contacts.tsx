import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import Pagination from '@/components/contacts/Pagination';
import EditContactModal from '@/components/contacts/EditContactModal';
import { ContactExportModal } from '@/components/contacts/ContactExportModal';
import { CreateSegmentFromContactsModal } from '@/components/contacts/CreateSegmentFromContactsModal';
import { AddToExistingSegmentModal } from '@/components/contacts/AddToExistingSegmentModal';
import { WhatsAppScrapingModal } from '@/components/contacts/WhatsAppScrapingModal';
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO, formatISO, addHours } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload } from '@/components/ui/file-upload';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Upload, Download, AlertCircle, CheckCircle, X, Trash2, Search, Filter, MoreHorizontal, Phone, Mail, MapPin, Calendar, FileText, Archive, Users, Eye, Edit, Clock, Flag, User, CheckSquare, Square, AlertTriangle, ChevronDown, SortAsc, SortDesc, Smartphone, UserPlus } from 'lucide-react';
import AgentDisplay from '@/components/contacts/AgentDisplay';
import { AuditLogTimeline } from '@/components/contacts/AuditLogTimeline';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { useGoogleCalendarAuth } from '@/hooks/useGoogleCalendarAuth';
import { useZohoCalendarAuth } from '@/hooks/useZohoCalendarAuth';
import { useCalendlyCalendarAuth } from '@/hooks/useCalendlyCalendarAuth';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { CallTypeSelectionModal } from '@/components/conversations/CallTypeSelectionModal';
import { CallScreenModal } from '@/components/conversations/CallScreenModal';
import { requestMicrophoneAccess, checkMicrophonePermission, stopMicrophoneStream } from '@/utils/microphone-permissions';
import { usePermissions } from '@/hooks/usePermissions';


function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';


  let normalized = phone.replace(/[^\d+]/g, '');


  if (normalized && !normalized.startsWith('+')) {

    normalized = normalized.replace(/^0+/, '');
    if (normalized.length > 10) {
      normalized = '+' + normalized;
    }
  }

  return normalized;
}

function isWhatsAppGroupChatId(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) {
    return false;
  }


  const numericOnly = phoneNumber.replace(/[^0-9]/g, '');



  return numericOnly.length >= 15 && numericOnly.startsWith('120');
}

function isValidInternationalPhoneNumber(phone: string): boolean {
  const numericOnly = phone.replace(/[^0-9]/g, '');


  if (numericOnly.length < 7 || numericOnly.length > 14) {
    return false;
  }


  const validCountryCodePatterns = [

    /^1[2-9]\d{9}$/,

    /^44[1-9]\d{8,9}$/,

    /^49[1-9]\d{8,10}$/,

    /^33[1-9]\d{8}$/,

    /^39[0-9]\d{6,10}$/,

    /^34[6-9]\d{8}$/,

    /^31[1-9]\d{8}$/,

    /^32[1-9]\d{7,8}$/,

    /^41[1-9]\d{8}$/,

    /^43[1-9]\d{6,10}$/,

    /^61[2-9]\d{8}$/,

    /^81[1-9]\d{8,9}$/,

    /^82[1-9]\d{7,8}$/,

    /^86[1-9]\d{9,10}$/,

    /^91[6-9]\d{9}$/,

    /^55[1-9]\d{8,9}$/,

    /^52[1-9]\d{9}$/,

    /^54[1-9]\d{8,9}$/,

    /^57[1-9]\d{7,9}$/,

    /^27[1-9]\d{8}$/,

    /^234[7-9]\d{9}$/,

    /^254[7]\d{8}$/,

    /^255[6-9]\d{8}$/,

    /^20[1-9]\d{8,9}$/,

    /^7[3-9]\d{9}$/,

    /^90[5]\d{9}$/,

    /^966[5]\d{8}$/,

    /^971[5]\d{8}$/,

    /^92[3]\d{9}$/,

    /^880[1]\d{8,9}$/,

    /^62[8]\d{8,10}$/,

    /^60[1]\d{7,8}$/,

    /^66[6-9]\d{8}$/,

    /^63[9]\d{9}$/,

    /^84[3-9]\d{8}$/,

    /^65[6-9]\d{7}$/,
  ];

  return validCountryCodePatterns.some(pattern => pattern.test(numericOnly));
}

function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  if (!phone) {
    return { isValid: true }; // Phone is optional
  }


  if (phone.startsWith('LID-')) {
    return {
      isValid: false,
      error: 'LID format phone numbers are not allowed'
    };
  }


  const numericOnly = phone.replace(/[^0-9]/g, '');
  if (numericOnly.length > 14) {
    return {
      isValid: false,
      error: 'Phone number is too long (maximum 14 digits allowed)'
    };
  }

  if (numericOnly.length < 7) {
    return {
      isValid: false,
      error: 'Phone number is too short (minimum 7 digits required)'
    };
  }


  const normalized = normalizePhoneNumber(phone);


  if (isWhatsAppGroupChatId(normalized)) {
    return {
      isValid: false,
      error: 'WhatsApp group chat IDs are not allowed as contact phone numbers'
    };
  }





  return { isValid: true };
}

function checkForDuplicatePhone(phone: string, existingContacts: Contact[]): { isDuplicate: boolean; existingContact?: Contact } {
  if (!phone) {
    return { isDuplicate: false };
  }

  const normalizedPhone = normalizePhoneNumber(phone);

  const existingContact = existingContacts.find(contact => {
    if (!contact.phone) return false;
    return normalizePhoneNumber(contact.phone) === normalizedPhone;
  });

  return {
    isDuplicate: !!existingContact,
    existingContact
  };
}

interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  tags?: string[] | null;
  isActive?: boolean | null;
  identifier?: string | null;
  identifierType?: string | null;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
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

export default function Contacts() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { canViewContactPhone } = usePermissions();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();


  const { isConnected: isGoogleCalendarConnected } = useGoogleCalendarAuth();
  const { isConnected: isZohoCalendarConnected } = useZohoCalendarAuth();
  const { isConnected: isCalendlyCalendarConnected } = useCalendlyCalendarAuth();

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [itemsPerPage] = useState(500);
  const [deleteContactId, setDeleteContactId] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedContactForDetail, setSelectedContactForDetail] = useState<Contact | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts');


  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    identifierType: '',
    identifier: '',
    notes: '',
    tags: '',
    avatarFile: null as File | null,
    avatarPreview: '' as string
  });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);


  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'zoho' | 'calendly'>('google');
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

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    successful: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<'skip' | 'update' | 'create'>('skip');
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);


  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);


  const [isCreateSegmentModalOpen, setIsCreateSegmentModalOpen] = useState(false);
  const [isAddToSegmentModalOpen, setIsAddToSegmentModalOpen] = useState(false);


  const [isWhatsAppScrapingModalOpen, setIsWhatsAppScrapingModalOpen] = useState(false);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [contactDetailTab, setContactDetailTab] = useState('dossier');
  const [archivedFilter, setArchivedFilter] = useState('active'); // 'all', 'active', 'archived'
  const [dateFilter, setDateFilter] = useState('all');


  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [contactToArchive, setContactToArchive] = useState<number | null>(null);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);
  const [bulkArchiveAction, setBulkArchiveAction] = useState<'archive' | 'unarchive'>('archive');


  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');
  const [taskSortBy, setTaskSortBy] = useState('dueDate');
  const [taskSortOrder, setTaskSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'not_started',
    dueDate: '',
    assignedTo: '',
    category: '',
    tags: [] as string[]
  });


  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDocumentUploadModalOpen, setIsDocumentUploadModalOpen] = useState(false);
  const [downloadingDocuments, setDownloadingDocuments] = useState<Set<string>>(new Set());
  const [documentUploadForm, setDocumentUploadForm] = useState({
    category: 'general',
    customCategory: '',
    description: '',
    file: null as File | null
  });


  const [isCallTypeModalOpen, setIsCallTypeModalOpen] = useState(false);
  const [selectedContactForCall, setSelectedContactForCall] = useState<Contact | null>(null);
  const [isCallScreenOpen, setIsCallScreenOpen] = useState(false);
  const [activeCallData, setActiveCallData] = useState<{
    callId: string;
    contactName: string;
    contactPhone: string;
    contactAvatar?: string;
    conferenceName?: string;
    channelId?: number;
    callType?: 'direct' | 'ai-powered';
  } | null>(null);


  const handleDocumentUpload = async (file: File, category: string) => {
    if (!selectedContactForDetail) return;

    setIsUploadingDocument(true);
    setUploadProgress(0);

    try {

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      await uploadDocumentMutation.mutateAsync({
        contactId: selectedContactForDetail.id,
        file,
        category: category
      });

      clearInterval(progressInterval);
      setUploadProgress(100);


      setTimeout(() => {
        setUploadProgress(0);
        setIsUploadingDocument(false);
      }, 1000);
    } catch (error) {
      setIsUploadingDocument(false);
      setUploadProgress(0);
    }
  };


  const handleUnifiedDocumentUpload = async () => {
    if (!selectedContactForDetail || !documentUploadForm.file) return;

    setIsUploadingDocument(true);
    setUploadProgress(0);

    try {

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const finalCategory = documentUploadForm.category === 'custom'
        ? documentUploadForm.customCategory
        : documentUploadForm.category;

      await uploadDocumentMutation.mutateAsync({
        contactId: selectedContactForDetail.id,
        file: documentUploadForm.file,
        category: finalCategory,
        description: documentUploadForm.description
      });

      clearInterval(progressInterval);
      setUploadProgress(100);


      setTimeout(() => {
        setUploadProgress(0);
        setIsUploadingDocument(false);
        setIsDocumentUploadModalOpen(false);
        setDocumentUploadForm({
          category: 'general',
          customCategory: '',
          description: '',
          file: null
        });
      }, 1000);
    } catch (error) {
      setIsUploadingDocument(false);
      setUploadProgress(0);
    }
  };


  const getDownloadFilename = (fileDoc: any) => {
    let filename = fileDoc.originalName || 'download';


    if (!filename.includes('.')) {
      const urlParts = fileDoc.fileUrl?.split('.');
      if (urlParts && urlParts.length > 1) {
        const extension = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
        filename += `.${extension}`;
      }
    }

    return filename;
  };


  const handleDocumentDownload = async (fileDoc: any) => {
    if (!selectedContactForDetail) return;

    const documentId = fileDoc.id.toString();
    const filename = getDownloadFilename(fileDoc);


    setDownloadingDocuments(prev => new Set(prev).add(documentId));

    try {

      try {
        const response = await fetch(fileDoc.fileUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();


        const blobUrl = window.URL.createObjectURL(blob);


        const link = window.document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';


        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);


        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 100);

        toast({
          title: "Download started",
          description: `Downloading ${filename}`,
        });
      } catch (fetchError) {

        console.warn('Fetch download failed, trying fallback method:', fetchError);

        const link = window.document.createElement('a');
        link.href = fileDoc.fileUrl;
        link.download = filename;
        link.target = '_blank';
        link.style.display = 'none';

        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);

        toast({
          title: "Download started",
          description: `Downloading ${filename}`,
        });
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download the document. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {

      setTimeout(() => {
        setDownloadingDocuments(prev => {
          const newSet = new Set(prev);
          newSet.delete(documentId);
          return newSet;
        });
      }, 1000);
    }
  };

  const handleDocumentDelete = async (documentId: string) => {
    if (!selectedContactForDetail) return;

    try {
      await deleteDocumentMutation.mutateAsync({
        contactId: selectedContactForDetail.id,
        documentId
      });
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };


  const handleAvatarUpload = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File too large",
        description: "Avatar must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPG, PNG)",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setAddContactForm(prev => ({
        ...prev,
        avatarFile: file,
        avatarPreview: e.target?.result as string
      }));
    };
    reader.readAsDataURL(file);
  };







  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  


  const { data: availableTags = [], refetch: refetchTags } = useQuery({
    queryKey: ['/api/contacts/tags'],
    queryFn: async () => {
      const response = await fetch('/api/contacts/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: contactDocuments = [], refetch: refetchDocuments } = useQuery({
    queryKey: ['/api/contacts/documents', selectedContactForDetail?.id],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return [];
      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id
  });


  const { data: assignedAgentData, isLoading: isLoadingAssignedAgent } = useQuery({
    queryKey: ['/api/contacts/assigned-agent', selectedContactForDetail?.id],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return null;
      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/assigned-agent`);
      if (!response.ok) {
        throw new Error('Failed to fetch assigned agent');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const { data: contactInteractions = [], refetch: refetchInteractions } = useQuery({
    queryKey: ['/api/contacts/interactions', selectedContactForDetail?.id],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return [];
      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/interactions`);
      if (!response.ok) {
        throw new Error('Failed to fetch interactions');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id
  });






  const { data: auditLogsData, isLoading: isLoadingAuditLogs } = useQuery({
    queryKey: ['/api/contacts/audit-logs', selectedContactForDetail?.id],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return { logs: [], total: 0 };
      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/audit-logs?limit=100`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id
  });


  const { data: contactTasks = [], isLoading: isLoadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ['/api/contacts/tasks', selectedContactForDetail?.id, taskStatusFilter, taskPriorityFilter, taskSearchTerm],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return [];
      const params = new URLSearchParams();
      if (taskStatusFilter !== 'all') params.append('status', taskStatusFilter);
      if (taskPriorityFilter !== 'all') params.append('priority', taskPriorityFilter);
      if (taskSearchTerm) params.append('search', taskSearchTerm);

      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/tasks?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id
  });

  const contactActivity = auditLogsData?.logs || [];


  const { data: channelConnections = [] } = useChannelConnections();


  const archiveContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await apiRequest('POST', `/api/contacts/${contactId}/archive`);
      if (!response.ok) {
        throw new Error('Failed to archive contact');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/archived-count'] });
      toast({
        title: "Contact Archived",
        description: "The contact has been successfully archived.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Archive Failed",
        description: error.message || "Failed to archive contact",
        variant: "destructive",
      });
    }
  });


  const initiateContactCallMutation = useMutation({
    mutationFn: async ({ contactId, callType }: { contactId: number; callType: 'direct' | 'ai-powered' }) => {
      const response = await apiRequest('POST', `/api/contacts/${contactId}/initiate-call`, { callType });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to initiate call');
      }
      return response.json();
    },
    onMutate: () => {

    },
    onSuccess: (data) => {
      toast({
        title: "Call Initiated",
        description: "Connecting you to the contact...",
      });
      

      setActiveCallData({
        callId: data.callId,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactAvatar: data.contactAvatar,
        conferenceName: data.conferenceName,
        channelId: data.channelId,
        callType: data.callType || data.metadata?.callType || 'direct'
      });
      setIsCallScreenOpen(true);
      

      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Call Failed",
        description: error.message || "Failed to initiate call. Please try again.",
        variant: "destructive",
      });
    }
  });

  const unarchiveContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}/archive`);
      if (!response.ok) {
        throw new Error('Failed to unarchive contact');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/archived-count'] });
      toast({
        title: "Contact Unarchived",
        description: "The contact has been successfully unarchived.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unarchive Failed",
        description: error.message || "Failed to unarchive contact",
        variant: "destructive",
      });
    }
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async ({ contactIds, archive }: { contactIds: number[]; archive: boolean }) => {
      const promises = contactIds.map(id =>
        apiRequest(archive ? 'POST' : 'DELETE', `/api/contacts/${id}/archive`)
      );
      const responses = await Promise.all(promises);

      const failedRequests = responses.filter(response => !response.ok);
      if (failedRequests.length > 0) {
        throw new Error(`Failed to ${archive ? 'archive' : 'unarchive'} ${failedRequests.length} contact(s)`);
      }

      return responses;
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: `Contacts ${archive ? 'archived' : 'unarchived'} successfully`,
        description: `${selectedContacts.size} contact(s) have been ${archive ? 'archived' : 'unarchived'}.`,
      });
      setSelectedContacts(new Set());
    },
    onError: (error, { archive }) => {
      toast({
        title: `Failed to ${archive ? 'archive' : 'unarchive'} contacts`,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['/api/contacts', currentPage, debouncedSearch, channelFilter, tagsFilter, archivedFilter, dateFilter, itemsPerPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());

      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }

      if (channelFilter && channelFilter !== 'all') {
        params.append('channel', channelFilter);
      }

      if (tagsFilter.length > 0) {
        params.append('tags', tagsFilter.join(','));
      }


      if (archivedFilter === 'archived') {
        params.append('includeArchived', 'true');
        params.append('archivedOnly', 'true');
      } else if (archivedFilter === 'all') {
        params.append('includeArchived', 'true');
      }


      if (dateFilter && dateFilter !== 'all') {
        params.append('dateRange', dateFilter);
      }

      const response = await fetch(`/api/contacts?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }

      return response.json();
    },
    refetchOnWindowFocus: false
  });
  

  const rawContacts: Contact[] = Array.isArray(data?.contacts) ? data.contacts : [];



  const filteredContacts = rawContacts.filter(contact => {




    if (contact.phone && isWhatsAppGroupChatId(contact.phone)) {

      return false;
    }

    if (contact.identifier && isWhatsAppGroupChatId(contact.identifier)) {

      return false;
    }


    if (contact.phone) {
      const phoneValidation = validatePhoneNumber(contact.phone);
      if (!phoneValidation.isValid) {

        return false;
      }
    }







    if (contact.identifier) {
      const looksLikePhone = /^[\d+]/.test(contact.identifier);
      if (looksLikePhone) {
        const identifierValidation = validatePhoneNumber(contact.identifier);
        if (!identifierValidation.isValid) {

          return false;
        }
      } else {

      }
    }


    return true;
  });


  const deduplicatedContacts = filteredContacts.reduce((acc: Contact[], contact) => {
    if (!contact.phone) {


      acc.push(contact);
      return acc;
    }

    const normalizedPhone = normalizePhoneNumber(contact.phone);
    const existingIndex = acc.findIndex(existing =>
      existing.phone && normalizePhoneNumber(existing.phone) === normalizedPhone
    );

    if (existingIndex === -1) {


      acc.push(contact);
    } else {

      const existing = acc[existingIndex];
      if (new Date(contact.createdAt) > new Date(existing.createdAt)) {
        
        acc[existingIndex] = contact;
      } else {
        
      }
    }

    return acc;
  }, []);



  const contacts: Contact[] = deduplicatedContacts;
  const totalContacts = data?.total || 0;
  const totalPages = Math.ceil(totalContacts / itemsPerPage);


  const { data: archivedCountData } = useQuery({
    queryKey: ['/api/contacts/archived-count'],
    queryFn: async () => {

      const response = await fetch('/api/contacts?includeArchived=true&limit=1000');
      if (!response.ok) {
        throw new Error('Failed to fetch contacts for archive count');
      }
      const data = await response.json();

      const archivedCount = (data.contacts || []).filter((contact: any) => contact.isArchived).length;
      return archivedCount;
    },
    refetchOnWindowFocus: false
  });

  const archivedContactsCount = archivedCountData || 0;


  
  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete contact');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Contact deleted",
        description: "The contact has been successfully deleted.",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });


  const addContactMutation = useMutation({
    mutationFn: async (contactData: any) => {
      const response = await apiRequest('POST', '/api/contacts', contactData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create contact');
      }

      const newContact = await response.json();


      if (addContactForm.avatarFile) {
        const formData = new FormData();
        formData.append('avatar', addContactForm.avatarFile);

        const avatarResponse = await apiRequest('POST', `/api/contacts/${newContact.id}/avatar`, formData);

        if (avatarResponse.ok) {
          const avatarData = await avatarResponse.json();
          newContact.avatarUrl = avatarData.avatarUrl;
        }
      }

      return newContact;
    },
    onMutate: () => {
      setIsSubmittingContact(true);
    },
    onSuccess: () => {
      toast({
        title: t('contacts.add.success_title', 'Contact created'),
        description: t('contacts.add.success_description', 'The contact has been successfully created.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
      setIsAddContactDialogOpen(false);
      resetAddContactForm();
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.add.error_title', 'Creation failed'),
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmittingContact(false);
    }
  });


  const importContactsMutation = useMutation({
    mutationFn: async ({ file, duplicateHandling }: { file: File; duplicateHandling: string }) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      formData.append('duplicateHandling', duplicateHandling);


      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setImportProgress(percentComplete);
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error('Invalid response format'));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || 'Import failed'));
            } catch (e) {
              reject(new Error(`Import failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during import'));

        xhr.open('POST', '/api/contacts/import');
        xhr.send(formData);
      });
    },
    onMutate: () => {
      setIsImporting(true);
      setImportProgress(0);
      setImportResults(null);
    },
    onSuccess: (data: any) => {
      setImportResults(data);
      toast({
        title: t('contacts.import.success_title', 'Import completed'),
        description: t('contacts.import.success_description', 'Successfully imported {{count}} contacts', { count: data.successful }),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.import.error_title', 'Import failed'),
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsImporting(false);
      setImportProgress(0);
    }
  });


  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ contactId, file, category, description }: { contactId: number; file: File; category: string; description?: string }) => {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('category', category);
      if (description) {
        formData.append('description', description);
      }

      const response = await apiRequest('POST', `/api/contacts/${contactId}/documents`, formData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document uploaded",
        description: "The document has been successfully uploaded.",
      });
      refetchDocuments();
      setIsUploadingDocument(false);
      setUploadProgress(0);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setIsUploadingDocument(false);
      setUploadProgress(0);
    }
  });


  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ contactId, documentId }: { contactId: number; documentId: string }) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}/documents/${documentId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "The document has been successfully deleted.",
      });
      refetchDocuments();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });





  const bulkDeleteContactsMutation = useMutation({
    mutationFn: async (contactIds: number[]) => {
      const response = await apiRequest('DELETE', '/api/contacts/bulk', { contactIds });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete contacts');
      }

      return response.json();
    },
    onMutate: () => {
      setIsBulkDeleting(true);
    },
    onSuccess: (data: any) => {
      const { successful, failed, total } = data;

      if (successful.length > 0) {
        toast({
          title: t('contacts.bulk_delete.success_title', 'Contacts deleted'),
          description: t('contacts.bulk_delete.success_description', 'Successfully deleted {{count}} of {{total}} contacts', {
            count: successful.length,
            total
          }),
        });
      }

      if (failed.length > 0) {
        toast({
          title: t('contacts.bulk_delete.partial_failure_title', 'Some deletions failed'),
          description: t('contacts.bulk_delete.partial_failure_description', '{{count}} contacts could not be deleted', {
            count: failed.length
          }),
          variant: 'destructive',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
      setSelectedContacts(new Set());
      setIsBulkDeleteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.bulk_delete.error_title', 'Bulk delete failed'),
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsBulkDeleting(false);
    }
  });


  const resetAddContactForm = () => {
    setAddContactForm({
      name: '',
      email: '',
      phone: '',
      company: '',
      identifierType: '',
      identifier: '',
      notes: '',
      tags: '',
      avatarFile: null,
      avatarPreview: ''
    });
  };

  const resetImportForm = () => {
    setImportFile(null);
    setImportProgress(0);
    setImportResults(null);
    setCsvPreview([]);
    setShowPreview(false);
    setDuplicateHandling('skip');
  };

  const handleAddContactSubmit = () => {
    if (!addContactForm.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.add.name_required', 'Contact name is required'),
        variant: 'destructive'
      });
      return;
    }


    if (addContactForm.phone) {
      const phoneValidation = validatePhoneNumber(addContactForm.phone);
      if (!phoneValidation.isValid) {
        toast({
          title: t('common.error', 'Error'),
          description: phoneValidation.error,
          variant: 'destructive'
        });
        return;
      }


      const duplicateCheck = checkForDuplicatePhone(addContactForm.phone, contacts || []);
      if (duplicateCheck.isDuplicate) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.add.duplicate_phone', 'A contact with this phone number already exists: {{name}}', {
            name: duplicateCheck.existingContact?.name
          }),
          variant: 'destructive'
        });
        return;
      }
    }

    const tagsArray = addContactForm.tags
      ? addContactForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];


    const normalizedPhone = addContactForm.phone ? normalizePhoneNumber(addContactForm.phone) : '';

    addContactMutation.mutate({
      ...addContactForm,
      phone: normalizedPhone,
      tags: tagsArray
    });
  };

  const handleFileSelected = (file: File) => {
    setImportFile(file);

    parseCsvPreview(file);
  };

  const parseCsvPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0]?.split(',').map(h => h.trim());
      const preview = lines.slice(1, 6).map((line, index) => {
        const values = line.split(',').map(v => v.trim());
        const obj: any = {};
        headers?.forEach((header, index) => {
          obj[header] = values[index] || '';
        });


        const warnings: string[] = [];
        if (obj.phone) {
          const phoneValidation = validatePhoneNumber(obj.phone);
          if (!phoneValidation.isValid) {
            warnings.push(phoneValidation.error || 'Invalid phone number');
          }

          const duplicateCheck = checkForDuplicatePhone(obj.phone, contacts || []);
          if (duplicateCheck.isDuplicate) {
            warnings.push(`Duplicate phone number (existing contact: ${duplicateCheck.existingContact?.name})`);
          }
        }

        obj._warnings = warnings;
        obj._rowNumber = index + 2; // +2 because we skip header and arrays are 0-indexed
        return obj;
      });
      setCsvPreview(preview);
      setShowPreview(true);
    };
    reader.readAsText(file);
  };

  const downloadCsvTemplate = () => {
    const headers = ['name', 'email', 'phone', 'company', 'identifierType', 'identifier', 'notes', 'tags'];
    const exampleData = [
      'Abid,admin@pointer.pk,+923059002132,Pointer Software,whatsapp,+923059020132,Sales lead,"lead,customer"',
      'Niamat,niamat@pointer.pk,+923000052443,Pointer Software,messenger,niamat.shakran,Marketing contact,"prospect,vip"'
    ];

    const csvContent = [headers.join(','), ...exampleData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportSubmit = () => {
    if (!importFile) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.import.no_file_selected', 'Please select a CSV file to import'),
        variant: 'destructive'
      });
      return;
    }

    importContactsMutation.mutate({
      file: importFile,
      duplicateHandling
    });
  };


  const handleSelectContact = (contactId: number, checked: boolean) => {
    const newSelected = new Set(selectedContacts);

    const numericId = typeof contactId === 'string' ? parseInt(contactId, 10) : contactId;

    if (isNaN(numericId)) {
      console.error('Invalid contact ID detected:', contactId);
      return;
    }

    if (checked) {
      newSelected.add(numericId);
    } else {
      newSelected.delete(numericId);
    }

    setSelectedContacts(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {

      const allContactIds = new Set(contacts.map(contact => {
        const id = typeof contact.id === 'string' ? parseInt(contact.id, 10) : contact.id;
        return id;
      }).filter(id => !isNaN(id)));

      setSelectedContacts(allContactIds);
    } else {
      setSelectedContacts(new Set());
    }
  };

  const handleClearSelection = () => {
    setSelectedContacts(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedContacts.size === 0) return;
    setIsBulkDeleteDialogOpen(true);
  };

  const handleSegmentCreated = (segment: any) => {
    toast({
      title: t('common.success', 'Success'),
      description: t('segments.create.success_redirect', 'Segment "{{name}}" created successfully. You can now use it in campaigns.', {
        name: segment.name
      })
    });


    setSelectedContacts(new Set());



  };

  const handleContactsAddedToSegment = (segmentName: string, contactCount: number) => {
    toast({
      title: t('common.success', 'Success'),
      description: t('segments.add_to_existing.success', 'Added {{count}} contact(s) to segment "{{name}}"', {
        count: contactCount.toString(),
        name: segmentName
      })
    });
    setSelectedContacts(new Set());
    queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
  };

  const confirmBulkDelete = () => {
    const contactIds = Array.from(selectedContacts);


    const validContactIds = contactIds
      .map(id => {
        const numId = typeof id === 'string' ? parseInt(id, 10) : Number(id);
        return isNaN(numId) ? null : numId;
      })
      .filter(id => id !== null) as number[];

    if (validContactIds.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: 'No valid contact IDs selected for deletion',
        variant: 'destructive'
      });
      return;
    }

    bulkDeleteContactsMutation.mutate(validContactIds);
  };
  
  const handleDeleteContact = (id: number) => {
    setDeleteContactId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsEditModalOpen(true);
  };

  const handleEditModalClose = () => {
    setIsEditModalOpen(false);
    setSelectedContact(null);
  };
  
  const confirmDelete = () => {
    if (deleteContactId) {
      deleteContactMutation.mutate(deleteContactId);
    }
    setIsDeleteDialogOpen(false);
  };
  
  const formatLastContact = (date: string) => {
    if (!date) return 'Never';
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };


  const handleArchiveContact = (contactId: number) => {
    setContactToArchive(contactId);
    setIsArchiveDialogOpen(true);
  };

  const handleConfirmArchive = () => {
    if (contactToArchive) {
      archiveContactMutation.mutate(contactToArchive);
      setIsArchiveDialogOpen(false);
      setContactToArchive(null);
    }
  };

  const handleBulkArchiveConfirm = (action: 'archive' | 'unarchive') => {
    setBulkArchiveAction(action);
    setIsBulkArchiveDialogOpen(true);
  };

  const handleConfirmBulkArchive = () => {
    const contactIds = Array.from(selectedContacts);
    bulkArchiveMutation.mutate({
      contactIds,
      archive: bulkArchiveAction === 'archive'
    });
    setIsBulkArchiveDialogOpen(false);
  };


  const createTaskMutation = useMutation({
    mutationFn: async ({ contactId, taskData }: { contactId: number; taskData: any }) => {
      const response = await apiRequest('POST', `/api/contacts/${contactId}/tasks`, taskData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create task');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Task created",
        description: "The task has been successfully created.",
      });
      refetchTasks();
      setIsCreateTaskModalOpen(false);
      setTaskForm({
        title: '',
        description: '',
        priority: 'medium',
        status: 'not_started',
        dueDate: '',
        assignedTo: '',
        category: '',
        tags: []
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ contactId, taskId, taskData }: { contactId: number; taskId: number; taskData: any }) => {
      const response = await apiRequest('PATCH', `/api/contacts/${contactId}/tasks/${taskId}`, taskData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update task');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Task updated",
        description: "The task has been successfully updated.",
      });
      refetchTasks();
      setIsEditTaskModalOpen(false);
      setSelectedTask(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async ({ contactId, taskId }: { contactId: number; taskId: number }) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}/tasks/${taskId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete task');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Task deleted",
        description: "The task has been successfully deleted.",
      });
      refetchTasks();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const bulkUpdateTasksMutation = useMutation({
    mutationFn: async ({ contactId, taskIds, updates }: { contactId: number; taskIds: number[]; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/contacts/${contactId}/tasks/bulk`, { taskIds, updates });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update tasks');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Tasks updated",
        description: "The selected tasks have been successfully updated.",
      });
      refetchTasks();
      setSelectedTasks(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });


  const createEventMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/${selectedProvider}/calendar/events`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Appointment Created",
        description: "Your appointment has been successfully created",
      });
      setIsAppointmentModalOpen(false);
      resetEventForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Appointment",
        description: error.message || "Failed to create appointment",
        variant: "destructive",
      });
    }
  });


  const resetEventForm = () => {
    setEventForm({
      summary: '',
      description: '',
      location: '',
      startDateTime: formatISO(new Date()),
      endDateTime: formatISO(addHours(new Date(), 1)),
      attendees: [],
      attendeeInput: '',
      colorId: '1'
    });
  };

  const handleAddAttendee = () => {
    if (eventForm.attendeeInput && eventForm.attendeeInput.includes('@')) {
      setEventForm({
        ...eventForm,
        attendees: [...eventForm.attendees, eventForm.attendeeInput],
        attendeeInput: ''
      });
    }
  };

  const handleRemoveAttendee = (email: string) => {
    setEventForm({
      ...eventForm,
      attendees: eventForm.attendees.filter(attendee => attendee !== email)
    });
  };

  const handleScheduleAppointment = (contact: Contact) => {

    const isConnected = selectedProvider === 'google' ? isGoogleCalendarConnected :
                       selectedProvider === 'zoho' ? isZohoCalendarConnected : isCalendlyCalendarConnected;
    const providerName = selectedProvider === 'google' ? 'Google Calendar' :
                        selectedProvider === 'zoho' ? 'Zoho Calendar' : 'Calendly';

    if (!isConnected) {
      toast({
        title: `${providerName} Not Connected`,
        description: `Please connect your ${providerName} first to schedule appointments`,
        variant: "destructive",
      });
      return;
    }


    setEventForm({
      summary: `Meeting with ${contact.name}`,
      description: `Appointment with ${contact.name}${contact.company ? ` from ${contact.company}` : ''}`,
      location: '',
      startDateTime: formatISO(new Date()),
      endDateTime: formatISO(addHours(new Date(), 1)),
      attendees: contact.email ? [contact.email] : [],
      attendeeInput: '',
      colorId: '1'
    });
    setIsAppointmentModalOpen(true);
  };

  const handleCreateEvent = () => {
    if (!eventForm.summary || !eventForm.startDateTime || !eventForm.endDateTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
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

  const handleChannelClick = (contact: Contact) => {
    if (!contact.id || !contact.identifierType) return;

    localStorage.setItem('selectedContactId', contact.id.toString());
    localStorage.setItem('selectedChannelType', contact.identifierType);

    setLocation('/');

    toast({
      title: t('contacts.redirecting_to_inbox', 'Redirecting to inbox'),
      description: t('contacts.opening_conversation_with', 'Opening conversation with {{name}}', { name: contact.name }),
    });
  };
  
  const handleMessageClick = (contact: Contact) => {
    handleChannelClick(contact);
  };


  const handleCallClick = async (contact: Contact) => {

    if (!contact.phone) {
      toast({
        title: "No Phone Number",
        description: "This contact doesn't have a phone number to call.",
        variant: "destructive",
      });
      return;
    }


    const twilioVoiceConnections = channelConnections.filter(
      conn => conn.channelType === 'twilio_voice' && conn.status === 'active'
    );

    if (twilioVoiceConnections.length === 0) {
      toast({
        title: "No Voice Connection",
        description: "No active Twilio Voice connection found. Please configure a voice connection first.",
        variant: "destructive",
      });
      return;
    }


    if ((contact as any).isArchived) {
      toast({
        title: "Contact Archived",
        description: "Cannot call archived contacts. Please unarchive the contact first.",
        variant: "destructive",
      });
      return;
    }

    const connection = twilioVoiceConnections[0];
    setSelectedContactForCall(contact);


    if ((connection.connectionData as any)?.callMode === 'ai-powered') {
      setIsCallTypeModalOpen(true);
    } else {

      try {
        const permissionStatus = await checkMicrophonePermission();
        
        if (permissionStatus !== 'granted') {

          const result = await requestMicrophoneAccess();
          if (result.success && result.stream) {

            stopMicrophoneStream(result.stream);
          }
        }
        

        initiateContactCallMutation.mutate({
          contactId: contact.id,
          callType: 'direct'
        });
      } catch (error: any) {
        console.error('[Contacts] Microphone permission error:', error);
        

        let errorMsg = 'Failed to access microphone. Please check your browser settings and try again.';
        if (error.name === 'NotAllowedError') {
          errorMsg = 'Microphone permission denied. Please allow access in your browser settings and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMsg = 'No microphone found. Please connect a microphone and try again.';
        } else if (error.name === 'NotReadableError') {
          errorMsg = 'Microphone is being used by another application. Please close other apps and try again.';
        }
        
        toast({
          title: "Microphone Access Required",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }
    }
  };


  const handleCallTypeSelected = (callType: 'direct' | 'ai-powered') => {
    setIsCallTypeModalOpen(false);
    
    if (selectedContactForCall) {
      initiateContactCallMutation.mutate({
        contactId: selectedContactForCall.id,
        callType
      });
    }
  };


  const activeFiltersCount = [
    channelFilter !== 'all' ? 1 : 0,
    archivedFilter !== 'active' ? 1 : 0,
    dateFilter !== 'all' ? 1 : 0,
    tagsFilter.length
  ].reduce((a, b) => a + b, 0);
  
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Contacts List */}
          <div className="w-96 bg-card border-r border-border flex flex-col">
            {/* Navigation Tabs */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex space-x-6">
                <button
                  onClick={() => {
                    setActiveTab('all');
                    setArchivedFilter('all');
                    setCurrentPage(1);
                  }}
                  className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                    activeTab === 'all'
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground/90'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setActiveTab('contacts');
                    setArchivedFilter('active');
                    setCurrentPage(1);
                  }}
                  className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                    activeTab === 'contacts'
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground/90'
                  }`}
                >
                  Contacts <span className="ml-1 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{totalContacts}</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('archives');
                    setArchivedFilter('archived');
                    setCurrentPage(1);
                  }}
                  className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                    activeTab === 'archives'
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground/90'
                  }`}
                >
                  <Archive className="h-4 w-4 inline mr-1" />
                  Archives <span className="ml-1 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{archivedContactsCount}</span>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-4 py-3 border-b border-border flex justify-end space-x-2">
              <Button
                onClick={() => setIsAddContactDialogOpen(true)}
                size="sm"
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setIsImportDialogOpen(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setIsExportModalOpen(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setIsWhatsAppScrapingModalOpen(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1 bg-green-500/10 dark:bg-green-500/20 border-green-500/30 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-500/20 dark:hover:bg-green-500/30"
                title="Scrape WhatsApp Contacts"
              >
                <Smartphone className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setIsFilterDialogOpen(true)}
                variant="outline"
                size="sm"
                className={`flex items-center gap-1 relative ${
                  activeFiltersCount > 0
                    ? 'bg-primary/10 dark:bg-primary/20 border-primary/30 text-primary dark:text-primary/90'
                    : ''
                }`}
                title={`Filters${activeFiltersCount > 0 ? ` (${activeFiltersCount} active)` : ''}`}
              >
                <Filter className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-medium">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </div>

            {/* Bulk Actions Toolbar */}
            {selectedContacts.size > 0 && (
              <div className="mx-2 sm:mx-4 mb-3 p-2 bg-primary/10 dark:bg-primary/20 border border-primary/30 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-primary dark:text-primary/90 whitespace-nowrap">
                    {selectedContacts.size} <span className="hidden xs:inline">selected</span>
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCreateSegmentModalOpen(true)}
                      className="text-xs h-8 px-2 sm:px-3"
                    >
                      <Users className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Segment</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddToSegmentModalOpen(true)}
                      className="text-xs h-8 px-2 sm:px-3"
                    >
                      <UserPlus className="h-3 w-3 sm:mr-1" />
                      <span className="hidden md:inline">Add to Segment</span>
                    </Button>
                    {archivedFilter !== 'archived' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkArchiveConfirm('archive')}
                        disabled={bulkArchiveMutation.isPending}
                        className="text-xs h-8 px-2 sm:px-3"
                      >
                        {bulkArchiveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3 sm:mr-1" />}
                        <span className="hidden sm:inline">Archive</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkArchiveConfirm('unarchive')}
                        disabled={bulkArchiveMutation.isPending}
                        className="text-xs h-8 px-2 sm:px-3"
                      >
                        {bulkArchiveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3 sm:mr-1" />}
                        <span className="hidden sm:inline">Unarchive</span>
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="text-xs h-8 px-2 sm:px-3"
                    >
                      {isBulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Search Bar */}
            <div className="px-4 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <input
                  type="search"
                  placeholder="Search contacts..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Select All Checkbox */}
            {contacts.length > 0 && (
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedContacts.size === contacts.length && contacts.length > 0}
                      onCheckedChange={handleSelectAll}
                      className="h-4 w-4"
                    />
                    <label
                      htmlFor="select-all"
                      className="text-sm font-medium text-foreground cursor-pointer select-none"
                    >
                      Select All ({contacts.length})
                    </label>
                  </div>
                  {selectedContacts.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSelection}
                      className="text-xs text-muted-foreground hover:text-foreground h-auto py-1 px-2"
                    >
                      Clear Selection
                    </Button>
                  )}
                </div>
              </div>
            )}





            {/* Contacts List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="flex items-center space-x-3 p-3">
                        <div className="h-10 w-10 bg-muted animate-pulse rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-muted animate-pulse rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-muted animate-pulse rounded w-1/2"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No contacts found</h3>
                  <p className="text-muted-foreground text-sm">
                    {searchTerm ? 'Try adjusting your search' : 'Add your first contact to get started'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {contacts.map((contact) => {
                    const contactId = typeof contact.id === 'string' ? parseInt(contact.id, 10) : contact.id;
                    const isSelected = selectedContacts.has(contactId);
                    const isDetailSelected = selectedContactForDetail?.id === contact.id;
                    
                    return (
                      <div
                        key={contact.id}
                        className={`p-4 hover:bg-accent cursor-pointer transition-colors ${
                          isDetailSelected ? 'bg-primary/10 dark:bg-primary/20 border-r-2 border-primary' : ''
                        } ${isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''} ${
                          (contact as any).isArchived ? 'opacity-60 bg-muted/30' : ''
                        }`}
                        onClick={() => setSelectedContactForDetail(contact)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 relative">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectContact(contactId, checked as boolean)}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute -top-1 -left-1 z-10"
                            />
                            <ContactAvatar
                              contact={contact}
                              size="md"
                              showRefreshButton={false}
                              className="ml-4"
                            />
                            <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-background ${
                              contact.isActive ? 'bg-green-500 dark:bg-green-600' : 'bg-muted'
                            }`}></span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <h3 className={`text-sm font-medium truncate ${
                                (contact as any).isArchived ? 'text-muted-foreground' : 'text-foreground'
                              }`}>
                                {contact.name}
                              </h3>
                              {(contact as any).isArchived && (
                                <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                                  Archived
                                </Badge>
                              )}
                            </div>
                            
                            <div className="mt-1 flex items-center space-x-2">
                              <div className="flex items-center space-x-1">
                                {contact.identifierType === 'whatsapp' && (
                                  <i className="ri-whatsapp-line text-green-500 dark:text-green-400 text-xs"></i>
                                )}
                                {contact.identifierType === 'messenger' && (
                                  <i className="ri-messenger-line text-blue-500 dark:text-blue-400 text-xs"></i>
                                )}
                                {contact.identifierType === 'instagram' && (
                                  <i className="ri-instagram-line text-pink-500 dark:text-pink-400 text-xs"></i>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {canViewContactPhone()
                                    ? (contact.phone || contact.email || 'No contact info')
                                    : (contact.phone ? '—' : (contact.email || 'No contact info'))}
                                </span>
                              </div>
                            </div>
                            
                            {contact.company && (
                              <p className="mt-1 text-xs text-muted-foreground truncate">
                                {contact.company}
                              </p>
                            )}
                            
                            {contact.tags && contact.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {contact.tags.slice(0, 2).map((tag, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs px-1.5 py-0.5 !bg-muted !text-muted-foreground">
                                    {tag}
                                  </Badge>
                                ))}
                                {contact.tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                                    +{contact.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}
                            
                            {/* Action Buttons */}
                            <div className="mt-3 flex items-center gap-2">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMessageClick(contact);
                                }}
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1 h-7 px-2 text-xs"
                              >
                                <i className="ri-message-3-line h-3 w-3" />
                                Message
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCallClick(contact);
                                }}
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1 h-7 px-2 text-xs"
                                disabled={initiateContactCallMutation.isPending || !contact.phone || !canViewContactPhone()}
                              >
                                {initiateContactCallMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Phone className="h-3 w-3" />
                                )}
                                Call
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-border">
                  <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Contact Details */}
          <div className="flex-1 bg-background overflow-y-auto">
            {selectedContactForDetail ? (
              <div className="h-full">
                {/* Contact Header */}
                <div className="px-6 py-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <ContactAvatar
                        contact={selectedContactForDetail}
                        size="lg"
                        showRefreshButton={false}
                      />
                      <div>
                        <div className="flex items-center space-x-2">
                          <h1 className="text-xl font-semibold text-foreground">{selectedContactForDetail.name}</h1>
                          {(selectedContactForDetail as any).isArchived && (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground">
                              <Archive className="h-3 w-3 mr-1" />
                              Archived
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 mt-1">
                          <Button
                            onClick={() => handleMessageClick(selectedContactForDetail)}
                            size="sm"
                            className="flex items-center gap-2 !bg-primary !text-primary-foreground hover:!bg-primary/90"
                          >
                            <i className="ri-message-3-line h-4 w-4" />
                            Message
                          </Button>
                          <Button
                            onClick={() => handleCallClick(selectedContactForDetail)}
                            size="sm"
                            className="flex items-center gap-2"
                            disabled={initiateContactCallMutation.isPending || !selectedContactForDetail.phone || !canViewContactPhone()}
                          >
                            {initiateContactCallMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Phone className="h-4 w-4" />
                            )}
                            Call
                          </Button>
                          <Button
                            onClick={() => handleScheduleAppointment(selectedContactForDetail)}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2"
                          >
                            <Calendar className="h-4 w-4" />
                            Schedule Appointment
                          </Button>

                          {(selectedContactForDetail as any).isArchived ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => unarchiveContactMutation.mutate(selectedContactForDetail.id)}
                              disabled={unarchiveContactMutation.isPending}
                            >
                              {unarchiveContactMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                              Unarchive
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => handleArchiveContact(selectedContactForDetail.id)}
                              disabled={archiveContactMutation.isPending}
                            >
                              {archiveContactMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                              Archive
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditContact(selectedContactForDetail)}
                      >
                        <i className="ri-edit-line h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteContact(selectedContactForDetail.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Contact Details */}
                <div className="p-6 space-y-6">


                  {/* Contact Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-foreground">Contact</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex items-center space-x-3">
                        <Phone className="h-4 w-4 text-muted-foreground/70" />
                        <div>
                          <Label className="text-sm font-medium text-foreground">Phone</Label>
                          <p className="text-sm text-foreground">
                            {canViewContactPhone()
                              ? (selectedContactForDetail.phone || '—')
                              : '—'}
                          </p>
                        </div>
                      </div>
                      {selectedContactForDetail.email && (
                        <div className="flex items-center space-x-3">
                          <Mail className="h-4 w-4 text-muted-foreground/70" />
                          <div>
                            <Label className="text-sm font-medium text-foreground">Email</Label>
                            <p className="text-sm text-foreground">{selectedContactForDetail.email}</p>
                          </div>
                        </div>
                      )}
                      {selectedContactForDetail.company && (
                        <div className="flex items-center space-x-3">
                          <MapPin className="h-4 w-4 text-muted-foreground/70" />
                          <div>
                            <Label className="text-sm font-medium text-foreground">Company</Label>
                            <p className="text-sm text-foreground">{selectedContactForDetail.company}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Assigned Agent */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-foreground">Agents</h3>
                    <AgentDisplay
                      assignedAgent={assignedAgentData?.assignedAgent || null}
                      isLoading={isLoadingAssignedAgent}
                      conversationId={assignedAgentData?.conversationId}
                      assignedAt={assignedAgentData?.assignedAt}
                      variant="full"
                    />
                  </div>
                 

                  {/* Navigation Tabs */}
                  <div className="border-t border-border pt-6">
                    <div className="flex space-x-8 border-b border-border">
                      <button 
                        onClick={() => setContactDetailTab('dossier')}
                        className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                          contactDetailTab === 'dossier'
                            ? 'text-primary border-primary'
                            : 'text-muted-foreground border-transparent hover:text-foreground/90'
                        }`}
                      >
                        File
                      </button>
                      <button
                        onClick={() => setContactDetailTab('historique')}
                        className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                          contactDetailTab === 'historique'
                            ? 'text-primary border-primary'
                            : 'text-muted-foreground border-transparent hover:text-foreground/90'
                        }`}
                      >
                        History
                      </button>

                      <button
                        onClick={() => setContactDetailTab('tasks')}
                        className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                          contactDetailTab === 'tasks'
                            ? 'text-primary border-primary'
                            : 'text-muted-foreground border-transparent hover:text-foreground/90'
                        }`}
                      >
                        Tasks
                      </button>


                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="space-y-4">
                    {contactDetailTab === 'dossier' && (
                      <div className="space-y-6">
                        {/* Unified Document Upload */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-6 border-2 border-dashed border-border rounded-lg hover:border-border/80 transition-colors bg-muted/30">
                            <div className="flex items-center space-x-4">
                              <div className="p-3 bg-primary/10 dark:bg-primary/20 rounded-full">
                                <FileText className="h-6 w-6 text-primary" />
                              </div>
                              <div>
                                <h4 className="text-lg font-medium text-foreground">Upload Document</h4>
                                <p className="text-sm text-muted-foreground">Add documents with category and description</p>
                              </div>
                            </div>
                            <Button
                              variant="default"
                              size="lg"
                              disabled={isUploadingDocument}
                              onClick={() => setIsDocumentUploadModalOpen(true)}
                              className="px-6"
                            >
                              <Upload className="h-5 w-5 mr-2" />
                              {isUploadingDocument ? 'Uploading...' : 'Upload Document'}
                            </Button>
                          </div>
                        </div>

                        {/* Uploaded Documents */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-foreground">Uploaded Documents</h4>
                            <span className="text-xs text-muted-foreground">{contactDocuments.length} files</span>
                          </div>

                          {contactDocuments.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <FileText className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                              <p className="text-sm">No documents uploaded yet</p>
                            </div>
                          ) : (
                            contactDocuments.map((document: any) => {
                              const getCategoryColor = (category: string) => {
                                switch (category) {
                                  case 'identity': return 'bg-primary/10 dark:bg-primary/20 text-primary';
                                  case 'address_proof': return 'bg-green-500/10 dark:bg-green-500/20 text-green-600 dark:text-green-500';
                                  case 'income': return 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-500';
                                  case 'general': return 'bg-muted text-muted-foreground';
                                  default: return 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-500'; // For custom categories
                                }
                              };

                              const getCategoryLabel = (category: string) => {
                                switch (category) {
                                  case 'identity': return 'Identity Document';
                                  case 'address_proof': return 'Address Proof';
                                  case 'income': return 'Income Verification';
                                  case 'general': return 'General';
                                  default: return category.charAt(0).toUpperCase() + category.slice(1); // Capitalize custom categories
                                }
                              };

                              const formatFileSize = (bytes: number) => {
                                if (bytes < 1024) return bytes + ' bytes';
                                if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                                return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                              };

                              return (
                                <Card key={document.id} className="p-4">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-start space-x-3 flex-1">
                                      <div className={`p-2 rounded ${getCategoryColor(document.category)}`}>
                                        <FileText className="h-4 w-4" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center space-x-2 mb-1">
                                          <p className="text-sm font-medium text-foreground truncate">{document.originalName}</p>
                                          <Badge variant="secondary" className={`${getCategoryColor(document.category)} text-xs shrink-0`}>
                                            {getCategoryLabel(document.category)}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-1">
                                          {formatDistanceToNow(new Date(document.createdAt), { addSuffix: true })} • {formatFileSize(document.fileSize)}
                                        </p>
                                        {document.description && (
                                          <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 mt-2">
                                            {document.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(document.fileUrl, '_blank')}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDocumentDownload(document)}
                                        disabled={downloadingDocuments.has(document.id.toString())}
                                        title={`Download ${document.originalName}`}
                                      >
                                        {downloadingDocuments.has(document.id.toString()) ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Download className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive/80"
                                        onClick={() => handleDocumentDelete(document.id.toString())}
                                        disabled={deleteDocumentMutation.isPending}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </Card>
                              );
                            })
                          )}
                        </div>


                      </div>
                    )}

                    {contactDetailTab === 'historique' && (
                      <div className="space-y-6">
                        {/* Filter Options */}
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-foreground">Activity Timeline</h4>
                          <div className="flex items-center space-x-2">
                            <Select defaultValue="all">
                              <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Activities</SelectItem>
                                <SelectItem value="messages">Messages</SelectItem>
                                <SelectItem value="calls">Calls</SelectItem>
                                <SelectItem value="meetings">Meetings</SelectItem>
                                <SelectItem value="documents">Documents</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Timeline */}
                        <AuditLogTimeline
                          logs={contactActivity}
                          isLoading={isLoadingAuditLogs}
                        />
                      </div>
                    )}

                    {contactDetailTab === 'tasks' && (
                      <div className="space-y-6">
                        {/* Tasks Header */}
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium text-foreground">Task Management</h4>
                            <p className="text-xs text-muted-foreground mt-1">Track and manage tasks for this contact</p>
                          </div>
                          <Button
                            size="sm"
                            className="flex items-center gap-2"
                            onClick={() => setIsCreateTaskModalOpen(true)}
                          >
                            <Plus className="h-4 w-4" />
                            New Task
                          </Button>
                        </div>

                        {/* Task Filters and Search */}
                        <div className="flex items-center justify-between space-x-4">
                          <div className="flex items-center space-x-2 flex-1">
                            <div className="relative flex-1 max-w-sm">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                              <input
                                type="search"
                                placeholder="Search tasks..."
                                className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                value={taskSearchTerm}
                                onChange={(e) => setTaskSearchTerm(e.target.value)}
                              />
                            </div>
                            <Select value={taskStatusFilter} onValueChange={setTaskStatusFilter}>
                              <SelectTrigger className="w-32 h-9">
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="not_started">Not Started</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={taskPriorityFilter} onValueChange={setTaskPriorityFilter}>
                              <SelectTrigger className="w-32 h-9">
                                <SelectValue placeholder="Priority" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Priority</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTaskSortOrder(taskSortOrder === 'asc' ? 'desc' : 'asc');
                              }}
                              className="flex items-center gap-1"
                            >
                              {taskSortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                              Sort
                            </Button>
                          </div>
                        </div>

                        {/* Bulk Actions */}
                        {selectedTasks.size > 0 && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-blue-800 dark:text-blue-400">
                                {selectedTasks.size} task{selectedTasks.size > 1 ? 's' : ''} selected
                              </span>
                              <div className="flex items-center gap-2">
                                <Select
                                  onValueChange={(value) => {
                                    if (value && selectedContactForDetail) {
                                      bulkUpdateTasksMutation.mutate({
                                        contactId: selectedContactForDetail.id,
                                        taskIds: Array.from(selectedTasks),
                                        updates: { status: value }
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-32 h-8 text-xs">
                                    <SelectValue placeholder="Update Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="not_started">Not Started</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedTasks(new Set())}
                                  className="text-xs"
                                >
                                  Clear
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Task List */}
                        <div className="space-y-3">
                          {isLoadingTasks ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : contactTasks.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <CheckSquare className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                              <p className="text-sm">No tasks found</p>
                              <p className="text-xs text-muted-foreground mt-1">Create a new task to get started</p>
                            </div>
                          ) : (
                            (() => {

                              const sortedTasks = [...contactTasks].sort((a, b) => {
                                let aValue, bValue;
                                switch (taskSortBy) {
                                  case 'dueDate':
                                    aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                                    bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                                    break;
                                  case 'priority':
                                    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
                                    aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
                                    bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
                                    break;
                                  case 'status':
                                    aValue = a.status;
                                    bValue = b.status;
                                    break;
                                  default:
                                    aValue = new Date(a.createdAt).getTime();
                                    bValue = new Date(b.createdAt).getTime();
                                }

                                if (taskSortOrder === 'asc') {
                                  return aValue > bValue ? 1 : -1;
                                } else {
                                  return aValue < bValue ? 1 : -1;
                                }
                              });

                              return sortedTasks.map((task: any) => {
                                const isSelected = selectedTasks.has(task.id);
                                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';
                                const isDueToday = task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString();

                                const getPriorityColor = (priority: string) => {
                                  switch (priority) {
                                    case 'urgent': return 'bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30';
                                    case 'high': return 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30';
                                    case 'medium': return 'bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
                                    case 'low': return 'bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30';
                                    default: return 'bg-muted text-foreground/90 border-border';
                                  }
                                };

                                const getStatusColor = (status: string) => {
                                  switch (status) {
                                    case 'completed': return 'bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400';
                                    case 'in_progress': return 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/90';
                                    case 'cancelled': return 'bg-muted text-foreground/90';
                                    default: return 'bg-muted text-muted-foreground';
                                  }
                                };

                                const getStatusIcon = (status: string) => {
                                  switch (status) {
                                    case 'completed': return <CheckSquare className="h-4 w-4 text-green-600 dark:text-green-400" />;
                                    case 'in_progress': return <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
                                    case 'cancelled': return <X className="h-4 w-4 text-muted-foreground" />;
                                    default: return <Square className="h-4 w-4 text-muted-foreground/70" />;
                                  }
                                };

                                return (
                                  <Card key={task.id} className={`p-4 transition-colors ${
                                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900' : ''
                                  } ${isOverdue ? 'border-l-4 border-l-red-500 dark:border-l-red-400' : ''}`}>
                                    <div className="flex items-start space-x-3">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          const newSelected = new Set(selectedTasks);
                                          if (checked) {
                                            newSelected.add(task.id);
                                          } else {
                                            newSelected.delete(task.id);
                                          }
                                          setSelectedTasks(newSelected);
                                        }}
                                        className="mt-1"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <div className="flex items-center space-x-2">
                                              {getStatusIcon(task.status)}
                                              <h5 className="text-sm font-medium text-foreground truncate">
                                                {task.title}
                                              </h5>
                                              {isOverdue && (
                                                <Badge variant="destructive" className="text-xs">
                                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                                  Overdue
                                                </Badge>
                                              )}
                                              {isDueToday && !isOverdue && (
                                                <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 text-xs">
                                                  Due Today
                                                </Badge>
                                              )}
                                            </div>
                                            {task.description && (
                                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                {task.description}
                                              </p>
                                            )}
                                            <div className="flex items-center space-x-4 mt-2">
                                              <Badge variant="outline" className={`text-xs ${getPriorityColor(task.priority)}`}>
                                                <Flag className="h-3 w-3 mr-1" />
                                                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                                              </Badge>
                                              <Badge variant="secondary" className={`${getStatusColor(task.status)} text-xs`}>
                                                {task.status.replace('_', ' ').charAt(0).toUpperCase() + task.status.replace('_', ' ').slice(1)}
                                              </Badge>
                                              {task.dueDate && (
                                                <span className="text-xs text-muted-foreground flex items-center">
                                                  <Calendar className="h-3 w-3 mr-1" />
                                                  {new Date(task.dueDate).toLocaleDateString()}
                                                </span>
                                              )}
                                              {task.assignedTo && (
                                                <span className="text-xs text-muted-foreground flex items-center">
                                                  <User className="h-3 w-3 mr-1" />
                                                  {task.assignedTo}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex items-center space-x-1 ml-2">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                setSelectedTask(task);
                                                setTaskForm({
                                                  title: task.title,
                                                  description: task.description || '',
                                                  priority: task.priority,
                                                  status: task.status,
                                                  dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
                                                  assignedTo: task.assignedTo || '',
                                                  category: task.category || '',
                                                  tags: task.tags || []
                                                });
                                                setIsEditTaskModalOpen(true);
                                              }}
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                if (selectedContactForDetail && window.confirm('Are you sure you want to delete this task?')) {
                                                  deleteTaskMutation.mutate({
                                                    contactId: selectedContactForDetail.id,
                                                    taskId: task.id
                                                  });
                                                }
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </Card>
                                );
                              });
                            })()
                          )}
                        </div>

                        {/* Task Statistics */}
                        {contactTasks.length > 0 && (
                          <Card className="p-4 bg-muted border-border">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Task Summary</p>
                                <div className="flex items-center space-x-6 mt-2">
                                  <div className="text-center">
                                    <p className="text-lg font-bold text-foreground">{contactTasks.length}</p>
                                    <p className="text-xs text-muted-foreground">Total</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                      {contactTasks.filter((t: any) => t.status === 'completed').length}
                                    </p>
                                    <p className="text-xs text-green-600 dark:text-green-400">Completed</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                      {contactTasks.filter((t: any) => t.status === 'in_progress').length}
                                    </p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400">In Progress</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-lg font-bold text-red-600 dark:text-red-400">
                                      {contactTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed').length}
                                    </p>
                                    <p className="text-xs text-red-600 dark:text-red-400">Overdue</p>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground">
                                  Completion Rate
                                </div>
                                <div className="text-2xl font-bold text-foreground">
                                  {contactTasks.length > 0
                                    ? Math.round((contactTasks.filter((t: any) => t.status === 'completed').length / contactTasks.length) * 100)
                                    : 0}%
                                </div>
                              </div>
                            </div>
                          </Card>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Select a contact</h3>
                  <p className="text-muted-foreground">Choose a contact from the list to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contacts.delete_contact', 'Delete Contact')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('contacts.delete_warning', 'This will permanently delete this contact and all associated conversations, messages, and notes. This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('contacts.bulk_delete.title', 'Delete {{count}} Contacts', { count: selectedContacts.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('contacts.bulk_delete.warning', 'This will permanently delete these contacts and all associated conversations, messages, and notes. This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.bulk_delete.deleting', 'Deleting...')}
                </>
              ) : (
                t('contacts.bulk_delete.confirm', 'Delete {{count}} Contacts', { count: selectedContacts.size })
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <EditContactModal
        contact={selectedContact}
        isOpen={isEditModalOpen}
        onClose={handleEditModalClose}
      />

      {/* Add New Contact Dialog */}
      <Dialog open={isAddContactDialogOpen} onOpenChange={setIsAddContactDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('contacts.add.title', 'Add New Contact')}</DialogTitle>
            <DialogDescription>
              {t('contacts.add.description', 'Create a new contact with the information below.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            {/* Contact Avatar Upload Section */}
            <div className="flex flex-col items-center space-y-3 p-4 border-2 border-dashed border-border rounded-lg hover:border-input transition-colors">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {addContactForm.avatarPreview ? (
                  <img
                    src={addContactForm.avatarPreview}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <i className="ri-user-line text-2xl text-muted-foreground"></i>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t('contacts.add.avatar_upload', 'Upload contact photo')}</p>
                <p className="text-xs text-muted-foreground">{t('contacts.add.avatar_optional', 'Optional - JPG, PNG up to 5MB')}</p>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSubmittingContact}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleAvatarUpload(file);
                    };
                    input.click();
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('contacts.add.choose_photo', 'Choose Photo')}
                </Button>
                {addContactForm.avatarPreview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSubmittingContact}
                    onClick={() => setAddContactForm(prev => ({ ...prev, avatarFile: null, avatarPreview: '' }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-name">{t('contacts.add.name_label', 'Name')} *</Label>
                <Input
                  id="add-name"
                  value={addContactForm.name}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('contacts.add.name_placeholder', 'Enter contact name')}
                  disabled={isSubmittingContact}
                  className="focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-email">{t('contacts.add.email_label', 'Email')}</Label>
                <div className="relative">
                  <Input
                    id="add-email"
                    type="email"
                    value={addContactForm.email}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder={t('contacts.add.email_placeholder', 'Enter email address')}
                    disabled={isSubmittingContact}
                    className="focus:ring-2 focus:ring-primary-500"
                  />
                  {addContactForm.email && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      {addContactForm.email.includes('@') && addContactForm.email.includes('.') ? (
                        <i className="ri-check-line text-green-500 dark:text-green-400"></i>
                      ) : (
                        <i className="ri-error-warning-line text-orange-500 dark:text-orange-400"></i>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-phone">{t('contacts.add.phone_label', 'Phone')}</Label>
                <div className="relative">
                  <Input
                    id="add-phone"
                    type="tel"
                    value={addContactForm.phone}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder={t('contacts.add.phone_placeholder', '+1234567890')}
                    disabled={isSubmittingContact}
                    className={`pl-10 focus:ring-2 focus:ring-primary-500 ${
                      addContactForm.phone && !validatePhoneNumber(addContactForm.phone).isValid
                        ? 'border-red-500 focus:border-red-500'
                        : addContactForm.phone && checkForDuplicatePhone(addContactForm.phone, contacts || []).isDuplicate
                        ? 'border-yellow-500 focus:border-yellow-500'
                        : ''
                    }`}
                  />
                  <i className="ri-phone-line absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"></i>
                  {addContactForm.phone && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      {validatePhoneNumber(addContactForm.phone).isValid ? (
                        <i className="ri-check-line text-green-500"></i>
                      ) : (
                        <i className="ri-error-warning-line text-red-500"></i>
                      )}
                    </div>
                  )}
                </div>
                {addContactForm.phone && (
                  <div className="text-xs">
                    {(() => {
                      const phoneValidation = validatePhoneNumber(addContactForm.phone);
                      if (!phoneValidation.isValid) {
                        return (
                          <div className="flex items-center text-red-600">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {phoneValidation.error}
                          </div>
                        );
                      }

                      const duplicateCheck = checkForDuplicatePhone(addContactForm.phone, contacts || []);
                      if (duplicateCheck.isDuplicate) {
                        return (
                          <div className="flex items-center text-yellow-600">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Duplicate phone number (existing contact: {duplicateCheck.existingContact?.name})
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Valid phone number
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-company">{t('contacts.add.company_label', 'Company')}</Label>
                <Input
                  id="add-company"
                  value={addContactForm.company}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, company: e.target.value }))}
                  placeholder={t('contacts.add.company_placeholder', 'Enter company name')}
                  disabled={isSubmittingContact}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-channel">{t('contacts.add.channel_label', 'Channel')}</Label>
                <Select
                  value={addContactForm.identifierType}
                  onValueChange={(value) => setAddContactForm(prev => ({ ...prev, identifierType: value }))}
                  disabled={isSubmittingContact}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('contacts.add.select_channel_placeholder', 'Select channel')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp_official">{t('contacts.add.channel.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                    <SelectItem value="whatsapp_unofficial">{t('contacts.add.channel.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                    <SelectItem value="messenger">{t('contacts.add.channel.messenger', 'Facebook Messenger')}</SelectItem>
                    <SelectItem value="instagram">{t('contacts.add.channel.instagram', 'Instagram')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-identifier">{t('contacts.add.channel_identifier_label', 'Channel Identifier')}</Label>
                <Input
                  id="add-identifier"
                  value={addContactForm.identifier}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, identifier: e.target.value }))}
                  placeholder={t('contacts.add.channel_identifier_placeholder', 'Phone number or ID')}
                  disabled={isSubmittingContact}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-tags">{t('contacts.add.tags_label', 'Tags')}</Label>
              <div className="relative">
                <Input
                  id="add-tags"
                  value={addContactForm.tags}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder={t('contacts.add.tags_placeholder', 'Type tags separated by commas...')}
                  disabled={isSubmittingContact}
                  className="focus:ring-2 focus:ring-primary-500"
                />
                <i className="ri-price-tag-3-line absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"></i>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {['lead', 'customer', 'prospect', 'vip', 'partner'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const currentTags = addContactForm.tags ? addContactForm.tags.split(',').map(t => t.trim()) : [];
                      if (!currentTags.includes(tag)) {
                        const newTags = [...currentTags, tag].join(', ');
                        setAddContactForm(prev => ({ ...prev, tags: newTags }));
                      }
                    }}
                    className="px-2 py-1 text-xs bg-muted hover:bg-accent text-foreground rounded-full transition-colors"
                    disabled={isSubmittingContact}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-notes">{t('contacts.add.notes_label', 'Notes')}</Label>
              <Textarea
                id="add-notes"
                value={addContactForm.notes}
                onChange={(e) => setAddContactForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('contacts.add.notes_placeholder', 'Additional notes about this contact...')}
                rows={3}
                disabled={isSubmittingContact}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddContactDialogOpen(false);
                resetAddContactForm();
              }}
              disabled={isSubmittingContact}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleAddContactSubmit}
              disabled={isSubmittingContact}
            >
              {isSubmittingContact ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.add.creating', 'Creating...')}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('contacts.add.create_button', 'Create Contact')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('contacts.import.title', 'Import Contacts from CSV')}</DialogTitle>
            <DialogDescription>
              {t('contacts.import.description', 'Upload a CSV file to import multiple contacts at once. Download the template to see the required format.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={downloadCsvTemplate}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {t('contacts.import.download_template', 'Download Template')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t('contacts.import.file_label', 'CSV File')}</Label>
              <FileUpload
                onFileSelected={handleFileSelected}
                fileType=".csv"
                maxSize={10} // 10MB limit
                className="w-full"
                showProgress={isImporting}
                progress={importProgress}
              />
              <p className="text-xs text-muted-foreground">
                {t('contacts.import.file_help', 'Maximum file size: 10MB. Only CSV files are supported.')}
              </p>
            </div>

            {showPreview && csvPreview.length > 0 && (
              <div className="space-y-2">
                <Label>{t('contacts.import.preview_label', 'Preview (first 5 rows)')}</Label>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {Object.keys(csvPreview[0] || {}).filter(header => !header.startsWith('_')).map((header) => (
                          <th key={header} className="px-3 py-2 text-left font-medium">
                            {header}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-left font-medium">Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, index) => (
                        <tr key={index} className={`border-t ${row._warnings?.length > 0 ? 'bg-red-50' : ''}`}>
                          {Object.entries(row).filter(([key]) => !key.startsWith('_')).map(([, value], cellIndex) => (
                            <td key={cellIndex} className="px-3 py-2">
                              {value as string}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {row._warnings?.length > 0 ? (
                              <div className="space-y-1">
                                {row._warnings.map((warning: string, wIndex: number) => (
                                  <div key={wIndex} className="flex items-center text-red-600 text-xs">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    {warning}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center text-green-600 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Valid
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvPreview.some(row => row._warnings?.length > 0) && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <div className="flex items-center">
                      <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                      <span className="text-sm text-yellow-800">
                        Some rows have validation issues. These contacts may be skipped or cause errors during import.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('contacts.import.duplicate_handling_label', 'Duplicate Handling')}</Label>
              <Select
                value={duplicateHandling}
                onValueChange={(value: 'skip' | 'update' | 'create') => setDuplicateHandling(value)}
                disabled={isImporting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t('contacts.import.duplicate.skip', 'Skip duplicates')}</SelectItem>
                  <SelectItem value="update">{t('contacts.import.duplicate.update', 'Update existing')}</SelectItem>
                  <SelectItem value="create">{t('contacts.import.duplicate.create', 'Create new')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('contacts.import.duplicate_help', 'How to handle contacts with duplicate email addresses')}
              </p>
            </div>

            {isImporting && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('contacts.import.importing', 'Importing...')}</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {importResults && (
              <div className="space-y-2">
                <Label>{t('contacts.import.results_label', 'Import Results')}</Label>
                <div className="p-4 border rounded-md bg-muted">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>{t('contacts.import.successful', 'Successfully imported: {{count}}', { count: importResults?.successful || 0 })}</span>
                  </div>
                  {(importResults?.failed || 0) > 0 && (
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>{t('contacts.import.failed', 'Failed to import: {{count}}', { count: importResults?.failed || 0 })}</span>
                    </div>
                  )}
                  {(importResults?.errors?.length || 0) > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-foreground mb-1">{t('contacts.import.errors', 'Errors:')}</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {importResults?.errors?.slice(0, 5).map((error, index) => (
                          <li key={index}>• {error}</li>
                        ))}
                        {(importResults?.errors?.length || 0) > 5 && (
                          <li>• {t('contacts.import.more_errors', 'And {{count}} more errors...', { count: (importResults?.errors?.length || 0) - 5 })}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                resetImportForm();
              }}
              disabled={isImporting}
            >
              {importResults ? t('common.close', 'Close') : t('common.cancel', 'Cancel')}
            </Button>
            {!importResults && (
              <Button
                onClick={handleImportSubmit}
                disabled={!importFile || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('contacts.import.importing', 'Importing...')}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('contacts.import.import_button', 'Import Contacts')}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Export Modal */}
      <ContactExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentFilters={{
          search: debouncedSearch,
          channel: channelFilter
        }}
      />

      {/* Create Segment Modal */}
      <CreateSegmentFromContactsModal
        isOpen={isCreateSegmentModalOpen}
        onClose={() => setIsCreateSegmentModalOpen(false)}
        selectedContactIds={Array.from(selectedContacts)}
        onSegmentCreated={handleSegmentCreated}
      />

      {/* Add to Existing Segment Modal */}
      <AddToExistingSegmentModal
        isOpen={isAddToSegmentModalOpen}
        onClose={() => setIsAddToSegmentModalOpen(false)}
        selectedContactIds={Array.from(selectedContacts)}
        onContactsAdded={handleContactsAddedToSegment}
      />

      {/* WhatsApp Scraping Modal */}
      <WhatsAppScrapingModal
        isOpen={isWhatsAppScrapingModalOpen}
        onClose={() => setIsWhatsAppScrapingModalOpen(false)}
      />

      {/* Filter Dialog */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Contacts
            </DialogTitle>
            <DialogDescription>
              Apply filters to narrow down your contact list
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Channel Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">Channel</Label>
              <Select value={channelFilter} onValueChange={(value) => {
                setChannelFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="whatsapp_official">WhatsApp Official</SelectItem>
                  <SelectItem value="whatsapp_unofficial">WhatsApp Unofficial</SelectItem>
                  <SelectItem value="messenger">Facebook Messenger</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Archived Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">Archived Status</Label>
              <Select value={archivedFilter} onValueChange={(value) => {
                setArchivedFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Active contacts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="archived">Archived only</SelectItem>
                  <SelectItem value="all">All contacts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">Period</Label>
              <Select value={dateFilter} onValueChange={(value) => {
                setDateFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="All periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All periods</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7days">Last 7 days</SelectItem>
                  <SelectItem value="last30days">Last 30 days</SelectItem>
                  <SelectItem value="last90days">Last 90 days</SelectItem>
                  <SelectItem value="thismonth">This month</SelectItem>
                  <SelectItem value="lastmonth">Last month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">Tags</Label>
              <Select
                value=""
                onValueChange={(value) => {
                  if (value && !tagsFilter.includes(value)) {
                    setTagsFilter(prev => [...prev, value]);
                    setCurrentPage(1);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Add a tag" />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map((tag: string) => (
                    <SelectItem
                      key={tag}
                      value={tag}
                      disabled={tagsFilter.includes(tag)}
                    >
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Selected Tags */}
              {tagsFilter.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tagsFilter.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-xs px-2 py-0.5 flex items-center gap-1 !bg-muted !text-muted-foreground"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          setTagsFilter(prev => prev.filter(t => t !== tag));
                          setCurrentPage(1);
                        }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTagsFilter([]);
                      setCurrentPage(1);
                    }}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </div>

          </div>

          <DialogFooter className="flex gap-2">
            <Button
              onClick={() => {
                setChannelFilter('all');
                setArchivedFilter('active');
                setDateFilter('all');
                setTagsFilter([]);
                setCurrentPage(1);
              }}
              variant="outline"
            >
              Reset All
            </Button>
            <Button
              onClick={() => setIsFilterDialogOpen(false)}
              className="!bg-primary !text-primary-foreground hover:!bg-primary/90"
            >
              Apply Filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Document Upload Modal */}
      <Dialog open={isDocumentUploadModalOpen} onOpenChange={setIsDocumentUploadModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Add a document with category and description for {selectedContactForDetail?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Upload */}
            <div>
              <Label htmlFor="document-file" className="text-sm font-medium">
                Document File
              </Label>
              <div className="mt-1">
                <input
                  id="document-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {

                      if (file.size > 10 * 1024 * 1024) {
                        toast({
                          title: "File too large",
                          description: "Document must be less than 10MB",
                          variant: "destructive",
                        });
                        return;
                      }
                      setDocumentUploadForm(prev => ({ ...prev, file }));
                    }
                  }}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/20 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/30"
                />
              </div>
              {documentUploadForm.file && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Selected: {documentUploadForm.file.name} ({(documentUploadForm.file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* Category Selector */}
            <div>
              <Label htmlFor="document-category" className="text-sm font-medium">
                Category
              </Label>
              <Select
                value={documentUploadForm.category}
                onValueChange={(value) => setDocumentUploadForm(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="identity">Identity Document</SelectItem>
                  <SelectItem value="address_proof">Address Proof</SelectItem>
                  <SelectItem value="income">Income Verification</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="custom">Custom Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Category Input */}
            {documentUploadForm.category === 'custom' && (
              <div>
                <Label htmlFor="custom-category" className="text-sm font-medium">
                  Custom Category Name
                </Label>
                <Input
                  id="custom-category"
                  value={documentUploadForm.customCategory}
                  onChange={(e) => setDocumentUploadForm(prev => ({ ...prev, customCategory: e.target.value }))}
                  placeholder="Enter custom category name"
                  className="mt-1"
                />
              </div>
            )}

            {/* Description Field */}
            <div>
              <Label htmlFor="document-description" className="text-sm font-medium">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="document-description"
                value={documentUploadForm.description}
                onChange={(e) => setDocumentUploadForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Add notes or description about this document..."
                className="mt-1"
                rows={3}
              />
            </div>

            {/* Upload Progress */}
            {isUploadingDocument && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDocumentUploadModalOpen(false);
                setDocumentUploadForm({
                  category: 'general',
                  customCategory: '',
                  description: '',
                  file: null
                });
              }}
              disabled={isUploadingDocument}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnifiedDocumentUpload}
              disabled={!documentUploadForm.file || isUploadingDocument || (documentUploadForm.category === 'custom' && !documentUploadForm.customCategory.trim())}
            >
              {isUploadingDocument ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this contact? Archived contacts will be hidden from the main list but can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveContactMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchive}
              disabled={archiveContactMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {archiveContactMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Archiving...
                </>
              ) : (
                'Archive Contact'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Archive Confirmation Dialog */}
      <AlertDialog open={isBulkArchiveDialogOpen} onOpenChange={setIsBulkArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkArchiveAction === 'archive' ? 'Archive' : 'Unarchive'} {selectedContacts.size} Contacts
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkArchiveAction === 'archive'
                ? `Are you sure you want to archive ${selectedContacts.size} contacts? They will be hidden from the main list but can be restored later.`
                : `Are you sure you want to unarchive ${selectedContacts.size} contacts? They will be restored to the main list.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkArchiveMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkArchive}
              disabled={bulkArchiveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {bulkArchiveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {bulkArchiveAction === 'archive' ? 'Archiving...' : 'Unarchiving...'}
                </>
              ) : (
                `${bulkArchiveAction === 'archive' ? 'Archive' : 'Unarchive'} Contacts`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Task Modal */}
      <Dialog open={isCreateTaskModalOpen} onOpenChange={setIsCreateTaskModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Create a new task for {selectedContactForDetail?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={taskForm.title}
                onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter task title"
              />
            </div>

            <div>
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={taskForm.description}
                onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter task description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-priority">Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-status">Status</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-due-date">Due Date</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="task-assigned-to">Assigned To</Label>
                <Input
                  id="task-assigned-to"
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, assignedTo: e.target.value }))}
                  placeholder="Enter assignee name"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="task-category">Category</Label>
              <Input
                id="task-category"
                value={taskForm.category}
                onChange={(e) => setTaskForm(prev => ({ ...prev, category: e.target.value }))}
                placeholder="Enter task category"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateTaskModalOpen(false)}
              disabled={createTaskMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!taskForm.title.trim()) {
                  toast({
                    title: "Missing required field",
                    description: "Please enter a task title",
                    variant: "destructive",
                  });
                  return;
                }

                if (selectedContactForDetail) {
                  createTaskMutation.mutate({
                    contactId: selectedContactForDetail.id,
                    taskData: {
                      title: taskForm.title,
                      description: taskForm.description,
                      priority: taskForm.priority,
                      status: taskForm.status,
                      dueDate: taskForm.dueDate || null,
                      assignedTo: taskForm.assignedTo || null,
                      category: taskForm.category || null,
                      tags: taskForm.tags
                    }
                  });
                }
              }}
              disabled={createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Modal */}
      <Dialog open={isEditTaskModalOpen} onOpenChange={setIsEditTaskModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update task details for {selectedContactForDetail?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-task-title">Title *</Label>
              <Input
                id="edit-task-title"
                value={taskForm.title}
                onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter task title"
              />
            </div>

            <div>
              <Label htmlFor="edit-task-description">Description</Label>
              <Textarea
                id="edit-task-description"
                value={taskForm.description}
                onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter task description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-task-priority">Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-task-status">Status</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-task-due-date">Due Date</Label>
                <Input
                  id="edit-task-due-date"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-task-assigned-to">Assigned To</Label>
                <Input
                  id="edit-task-assigned-to"
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, assignedTo: e.target.value }))}
                  placeholder="Enter assignee name"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-task-category">Category</Label>
              <Input
                id="edit-task-category"
                value={taskForm.category}
                onChange={(e) => setTaskForm(prev => ({ ...prev, category: e.target.value }))}
                placeholder="Enter task category"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditTaskModalOpen(false);
                setSelectedTask(null);
              }}
              disabled={updateTaskMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!taskForm.title.trim()) {
                  toast({
                    title: "Missing required field",
                    description: "Please enter a task title",
                    variant: "destructive",
                  });
                  return;
                }

                if (selectedContactForDetail && selectedTask) {
                  updateTaskMutation.mutate({
                    contactId: selectedContactForDetail.id,
                    taskId: selectedTask.id,
                    taskData: {
                      title: taskForm.title,
                      description: taskForm.description,
                      priority: taskForm.priority,
                      status: taskForm.status,
                      dueDate: taskForm.dueDate || null,
                      assignedTo: taskForm.assignedTo || null,
                      category: taskForm.category || null,
                      tags: taskForm.tags
                    }
                  });
                }
              }}
              disabled={updateTaskMutation.isPending}
            >
              {updateTaskMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Task'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment Booking Modal */}
      <Dialog open={isAppointmentModalOpen} onOpenChange={setIsAppointmentModalOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[9999] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogContent className="sm:max-w-[600px] fixed left-[50%] top-[50%] z-[9999] translate-x-[-50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <span>Schedule New Appointment</span>
              <div className="flex items-center space-x-1 text-sm font-normal">
                <span className="text-muted-foreground">via</span>
                <div className="flex items-center space-x-1 px-2 py-1 bg-muted rounded-md">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      selectedProvider === 'google' ? 'bg-blue-500' :
                      selectedProvider === 'zoho' ? 'bg-orange-500' : 'bg-purple-500'
                    }`}
                  />
                  <span className="text-xs font-medium">
                    {selectedProvider === 'google' ? 'Google Calendar' :
                     selectedProvider === 'zoho' ? 'Zoho Calendar' : 'Calendly'}
                  </span>
                </div>
              </div>
            </DialogTitle>
            <DialogDescription>
              Create a new appointment on your calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="mb-4">
            <Label className="text-sm font-medium">Calendar Provider</Label>
            <Select value={selectedProvider} onValueChange={(value: 'google' | 'zoho' | 'calendly') => setSelectedProvider(value)}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                    Google Calendar
                    {isGoogleCalendarConnected && <span className="ml-2 text-green-600 text-xs">✓ Connected</span>}
                  </div>
                </SelectItem>
                <SelectItem value="zoho">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-orange-500 mr-2"></div>
                    Zoho Calendar
                    {isZohoCalendarConnected && <span className="ml-2 text-green-600 text-xs">✓ Connected</span>}
                  </div>
                </SelectItem>
                <SelectItem value="calendly">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                    Calendly
                    {isCalendlyCalendarConnected && <span className="ml-2 text-green-600 text-xs">✓ Connected</span>}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="summary" className="text-right">
                Title*
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
                Description
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
                Location
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
                Category
              </Label>
              <Select
                value={eventForm.colorId}
                onValueChange={(value) => setEventForm({...eventForm, colorId: value})}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                      <span>Blue</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="2">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                      <span>Green</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="3">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
                      <span>Purple</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                      <span>Red</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="5">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                      <span>Yellow</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="6">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
                      <span>Orange</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="7">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-cyan-500 mr-2"></div>
                      <span>Turquoise</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="8">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-muted-foreground mr-2"></div>
                      <span>Gray</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDateTime" className="text-right">
                Start Time*
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
                End Time*
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
                Attendees
              </Label>
              <div className="col-span-3 space-y-2">
                <div className="flex space-x-2">
                  <Input
                    id="attendees"
                    placeholder="Enter email address"
                    value={eventForm.attendeeInput}
                    onChange={(e) => setEventForm({...eventForm, attendeeInput: e.target.value})}
                    className="flex-1"
                  />
                  <Button type="button" className="btn-brand-primary" onClick={handleAddAttendee}>Add</Button>
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
            <Button type="button" variant="outline" className="btn-brand-primary" onClick={() => setIsAppointmentModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateEvent}
              disabled={createEventMutation.isPending}
            >
              {createEventMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : 'Create Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Call Type Selection Modal */}
      <CallTypeSelectionModal
        isOpen={isCallTypeModalOpen}
        onClose={() => setIsCallTypeModalOpen(false)}
        onSelectCallType={handleCallTypeSelected}
      />

      {/* Call Screen Modal */}
      <CallScreenModal
        isOpen={isCallScreenOpen}
        onClose={() => setIsCallScreenOpen(false)}
        callId={activeCallData?.callId || ''}
        contactName={activeCallData?.contactName || ''}
        contactPhone={activeCallData?.contactPhone || ''}
        contactAvatar={activeCallData?.contactAvatar}
        conferenceName={activeCallData?.conferenceName}
        channelId={activeCallData?.channelId || channelConnections.find(conn => conn.channelType === 'twilio_voice' && conn.status === 'active')?.id}
        callType={activeCallData?.callType}
      />
    </div>
  );
}
