import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';
import useSocket from '@/hooks/useSocket';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Button
} from '@/components/ui/button';
import {
  Switch
} from '@/components/ui/switch';
import {
  Label
} from '@/components/ui/label';
import {
  Input
} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Badge
} from '@/components/ui/badge';
import {
  Separator
} from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Database,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Cloud,
  HardDrive,
  Settings,
  Plus,
  Shield,
  ShieldCheck,
  Calendar,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
  AlertCircle,
  Upload
} from 'lucide-react';
import { FileUpload } from '@/components/ui/file-upload';

interface BackupConfig {
  enabled: boolean;
  schedules: BackupSchedule[];
  retention_days: number;
  storage_locations: string[];
  google_drive: {
    enabled: boolean;
    folder_id: string | null;
    credentials: any;
  };
  encryption: {
    enabled: boolean;
    key: string | null;
  };
}

interface BackupSchedule {
  id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  day_of_week?: number;
  day_of_month?: number;
  enabled: boolean;
  storage_locations: string[];
}

interface BackupRecord {
  id: string;
  filename: string;
  type: 'manual' | 'scheduled';
  description: string;
  size: number;
  created_at: string;
  status: 'creating' | 'completed' | 'failed' | 'uploading' | 'uploaded';
  storage_locations: string[];
  checksum: string;
  error_message?: string;
  metadata: {
    database_size: number;
    table_count: number;
    row_count: number;
    compression_ratio?: number;
    encryption_enabled: boolean;
  };
}

interface BackupStats {
  total_backups: number;
  total_size: number;
  local_backups: number;
  cloud_backups: number;
  oldest_backup: string | null;
  newest_backup: string | null;
  storage_usage: {
    local: number;
    google_drive: number;
  };
}

export default function BackupManagement() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { branding } = useBranding();
  const [activeTab, setActiveTab] = useState('overview');

  const [manualBackupDescription, setManualBackupDescription] = useState('');
  const [manualBackupLocations, setManualBackupLocations] = useState(['local']);

  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupRecord | null>(null);
  const [restoreStep, setRestoreStep] = useState<'preflight' | 'warning' | 'confirmation' | 'progress'>('preflight');
  const [confirmationText, setConfirmationText] = useState('');
  const [restoreProgress, setRestoreProgress] = useState<{
    status: string;
    message: string;
    percent?: number;
  } | null>(null);
  const [preflightChecks, setPreflightChecks] = useState<{
    success: boolean;
    checks: Array<{
      name: string;
      status: 'passed' | 'failed' | 'warning';
      message: string;
      critical: boolean;
    }>;
    canProceed: boolean;
  } | null>(null);
  const currentRestoreIdRef = useRef<string | null>(null);


  const { onMessage } = useSocket('/ws');

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BackupSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    frequency: 'daily' as 'daily' | 'weekly' | 'monthly',
    time: '02:00',
    day_of_week: 0,
    day_of_month: 1,
    storage_locations: ['local'],
    enabled: true
  });

  const [settingsForm, setSettingsForm] = useState({
    retention_days: 30,
    default_storage_locations: ['local'],
    google_drive: {
      enabled: false,
      folder_id: null as string | null,
      credentials: null as any
    },
    encryption: {
      enabled: false,
      key: null as string | null
    },
    notifications: {
      enabled: false,
      email: '',
      on_success: true,
      on_failure: true
    },
    cleanup: {
      enabled: true,
      time: '03:00'
    }
  });

  const [oauthForm, setOauthForm] = useState({
    client_id: '',
    client_secret: '',
    redirect_uri: `${window.location.origin}${window.location.pathname}${window.location.search ? window.location.search : '?tab=backup'}`
  });
  const [showOauthForm, setShowOauthForm] = useState(false);


  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<'file' | 'url'>('file');
  const [uploadForm, setUploadForm] = useState({
    description: '',
    storage_locations: ['local'],
    file: null as File | null,
    url: ''
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);


  const [logsPage, setLogsPage] = useState(0);
  const [logsPageSize, setLogsPageSize] = useState(50);

  const { data: config, isLoading: isLoadingConfig } = useQuery<BackupConfig>({
    queryKey: ['/api/admin/backup/config'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/backup/config');
      if (!res.ok) throw new Error('Failed to fetch backup configuration');
      return res.json();
    }
  });

  const { data: backups, isLoading: isLoadingBackups } = useQuery<BackupRecord[]>({
    queryKey: ['/api/admin/backup/list'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/backup/list');
      if (!res.ok) throw new Error('Failed to fetch backups');
      return res.json();
    }
  });

  const { data: stats, isLoading: isLoadingStats } = useQuery<BackupStats>({
    queryKey: ['/api/admin/backup/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/backup/stats');
      if (!res.ok) throw new Error('Failed to fetch backup statistics');
      return res.json();
    }
  });

  const { data: oauthConfig, isLoading: isLoadingOAuth } = useQuery({
    queryKey: ['/api/admin/backup/google-drive/oauth-config'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/backup/google-drive/oauth-config');
      if (!res.ok) throw new Error('Failed to fetch OAuth configuration');
      return res.json();
    }
  });

  const { data: backupLogs } = useQuery<{
    logs: Array<{
      id: string;
      scheduleId: string;
      backupId: string | null;
      status: string;
      timestamp: string;
      errorMessage: string | null;
      metadata: any;
      createdAt: string;
    }>;
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['/api/admin/backup/logs', logsPage, logsPageSize],
    queryFn: async () => {
      const offset = logsPage * logsPageSize;
      const res = await apiRequest('GET', `/api/admin/backup/logs?limit=${logsPageSize}&offset=${offset}`);
      if (!res.ok) throw new Error('Failed to fetch backup logs');
      return res.json();
    },
    refetchInterval: 60000 // Refetch every minute
  });


  const lastCleanup = backupLogs?.logs
    ?.filter((log: any) => {
      const eventType = log.metadata?.event_type;
      return eventType === 'cleanup' || eventType === 'cleanup_completed' || eventType === 'cleanup_failed';
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const { data: toolsStatus } = useQuery({
    queryKey: ['/api/admin/backup/tools'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/backup/tools');
      if (!res.ok) throw new Error('Failed to fetch tools status');
      return res.json();
    }
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/backup/create', {
        description: manualBackupDescription || t('admin.backup.default_description', 'Manual backup'),
        storage_locations: manualBackupLocations
      });
      if (!res.ok) throw new Error('Failed to create backup');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.backup.messages.backup_started', 'Backup creation started successfully')
      });
      setManualBackupDescription('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/stats'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const res = await apiRequest('DELETE', `/api/admin/backup/${backupId}`);
      if (!res.ok) throw new Error('Failed to delete backup');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.backup.messages.backup_deleted', 'Backup deleted successfully')
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/stats'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const cleanupBackupsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/backup/cleanup');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.details || 'Failed to cleanup old backups');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('common.success', 'Success'),
        description: `${data.message}${data.errors?.length > 0 ? ` (${data.errors.length} errors)` : ''}`,
        variant: data.errors?.length > 0 ? 'destructive' : 'default',
        duration: 8000
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/logs'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const verifyBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const res = await apiRequest('POST', `/api/admin/backup/verify/${backupId}`);
      if (!res.ok) throw new Error('Failed to verify backup');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.valid ? t('admin.backup.messages.backup_valid', 'Backup Valid') : t('admin.backup.messages.backup_invalid', 'Backup Invalid'),
        description: data.message,
        variant: data.valid ? 'default' : 'destructive'
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const verifyDeepBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const res = await apiRequest('POST', `/api/admin/backup/verify-deep/${backupId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.details || 'Failed to perform deep verification');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const timingInfo = data.timings
        ? ` (${(data.timings.total_ms / 1000).toFixed(1)}s)`
        : '';

      let description = data.message;
      if (data.details) {
        description += `\n\nTables: ${data.details.table_count}, Key tables found: ${data.details.key_tables_found}`;
        if (data.details.row_counts) {
          const counts = Object.entries(data.details.row_counts)
            .map(([table, count]) => `${table}: ${count}`)
            .join(', ');
          description += `\nRow counts: ${counts}`;
        }
      }

      toast({
        title: data.valid
          ? t('admin.backup.messages.deep_verify_success', 'Deep Verification Passed') + timingInfo
          : t('admin.backup.messages.deep_verify_failed', 'Deep Verification Failed') + timingInfo,
        description,
        variant: data.valid ? 'default' : 'destructive',
        duration: 10000
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
        duration: 8000
      });
    }
  });

  const uploadBackupMutation = useMutation({
    mutationFn: async ({ file, description, storage_locations }: {
      file: File;
      description: string;
      storage_locations: string[]
    }) => {
      const formData = new FormData();
      formData.append('backup', file);
      formData.append('description', description);
      formData.append('storage_locations', JSON.stringify(storage_locations));


      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percentComplete);
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
              reject(new Error(errorResponse.error || 'Upload failed'));
            } catch (e) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));

        xhr.open('POST', '/api/admin/backup/upload');
        xhr.send(formData);
      });
    },
    onMutate: () => {
      setIsUploading(true);
      setUploadProgress(0);
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.backup.messages.backup_uploaded', 'Backup uploaded successfully')
      });
      setUploadDialogOpen(false);
      resetUploadForm();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/stats'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    },
    onSettled: () => {
      setIsUploading(false);
      setUploadProgress(0);
    }
  });

  const uploadBackupFromUrlMutation = useMutation({
    mutationFn: async ({ url, description, storage_locations }: {
      url: string;
      description: string;
      storage_locations: string[]
    }) => {
      const res = await apiRequest('POST', '/api/admin/backup/upload-from-url', {
        url,
        description,
        storage_locations
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload backup from URL');
      }
      return res.json();
    },
    onMutate: () => {
      setIsUploading(true);
      setUploadProgress(0);
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.backup.messages.backup_uploaded', 'Backup uploaded successfully')
      });
      setUploadDialogOpen(false);
      resetUploadForm();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/stats'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    },
    onSettled: () => {
      setIsUploading(false);
      setUploadProgress(0);
    }
  });


  useEffect(() => {
    const unsubscribe = onMessage('backup:restore:progress', (event: any) => {
      const { restoreId, status, message, percent } = event.data;


      if (restoreId === currentRestoreIdRef.current) {
        setRestoreProgress({ status, message, percent });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onMessage]);

  const restoreBackupMutation = useMutation({
    mutationFn: async ({ backupId, confirmationText }: { backupId: string; confirmationText: string }) => {
      setRestoreProgress({ status: 'started', message: t('admin.backup.restore.preparing', 'Preparing restoration...'), percent: 0 });

      const res = await apiRequest('POST', `/api/admin/backup/restore/${backupId}`, {
        confirmationText
      });
      if (!res.ok) throw new Error('Failed to restore backup');
      const data = await res.json();


      if (data.restoreId) {
        currentRestoreIdRef.current = data.restoreId;
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.success) {

        if (!restoreProgress || restoreProgress.status !== 'completed') {
          setRestoreProgress({ status: 'completed', message: data.message, percent: 100 });
        }

        toast({
          title: t('admin.backup.messages.restore_successful', 'Restore Successful'),
          description: data.message
        });

        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/list'] });
          queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/stats'] });
          setRestoreDialogOpen(false);
          resetRestoreDialog();
          currentRestoreIdRef.current = null;
        }, 3000);
      } else {
        setRestoreProgress({ status: 'failed', message: data.message, percent: 0 });
        toast({
          title: t('admin.backup.messages.restore_failed', 'Restore Failed'),
          description: data.message,
          variant: 'destructive'
        });
      }
    },
    onError: (error: any) => {
      setRestoreProgress({ status: 'failed', message: error.message, percent: 0 });
      toast({
        title: t('admin.backup.messages.restore_error', 'Restore Error'),
        description: error.message,
        variant: 'destructive'
      });
      currentRestoreIdRef.current = null;
    }
  });

  const preflightChecksMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const res = await apiRequest('GET', `/api/admin/backup/restore-preflight/${backupId}`);
      if (!res.ok) throw new Error('Failed to perform preflight checks');
      return await res.json();
    },
    onSuccess: (data) => {
      setPreflightChecks(data);
    },
    onError: (error: any) => {
      toast({
        title: t('admin.backup.messages.preflight_error', 'Preflight Check Failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const openRestoreDialog = (backup: BackupRecord) => {
    setSelectedBackupForRestore(backup);
    setRestoreDialogOpen(true);
    setRestoreStep('preflight');
    setConfirmationText('');
    setRestoreProgress(null);
    setPreflightChecks(null);


    preflightChecksMutation.mutate(backup.id);
  };

  const resetRestoreDialog = () => {
    setSelectedBackupForRestore(null);
    setRestoreStep('preflight');
    setConfirmationText('');
    setRestoreProgress(null);
    setPreflightChecks(null);
  };

  const handleRestoreConfirm = () => {
    if (!selectedBackupForRestore) return;

    setRestoreStep('progress');
    restoreBackupMutation.mutate({
      backupId: selectedBackupForRestore.id,
      confirmationText
    });
  };

  const isRestoreDisabled = (backup: BackupRecord): boolean => {
    return backup.status === 'creating' || backup.status === 'failed' || backup.status === 'uploading';
  };




  const isRestoreToolAvailable = (backup: BackupRecord): boolean => {
    const filename = backup.filename.toLowerCase();

    if (filename.endsWith('.sql')) {
      return toolsStatus?.psql?.available || false;
    }

    if (filename.endsWith('.backup') || filename.endsWith('.dump') || filename.endsWith('.bak')) {
      return toolsStatus?.pg_restore?.available || false;
    }

    return toolsStatus?.psql?.available && toolsStatus?.pg_restore?.available;
  };


  const getRestoreToolRequirement = (backup: BackupRecord): string => {
    const filename = backup.filename.toLowerCase();
    if (filename.endsWith('.sql')) {
      return t('admin.backup.actions.psql_required', 'PostgreSQL psql tool required for SQL format backups');
    }
    if (filename.endsWith('.backup') || filename.endsWith('.dump') || filename.endsWith('.bak')) {
      return t('admin.backup.actions.pg_restore_required', 'PostgreSQL pg_restore tool required for custom format backups');
    }
    return t('admin.backup.actions.tools_required', 'PostgreSQL tools required (pg_dump, psql)');
  };

  const getRequiredConfirmationText = (): string => {
    return selectedBackupForRestore?.filename || 'RESTORE';
  };

  const resetUploadForm = () => {
    setUploadForm({
      description: '',
      storage_locations: ['local'],
      file: null,
      url: ''
    });
    setUploadProgress(0);
    setIsUploading(false);
    setUploadMethod('file');
    setUrlValidationError(null);
  };

  const validateUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        setUrlValidationError(t('admin.backup.upload.invalid_protocol', 'Only HTTP and HTTPS protocols are supported'));
        return false;
      }

      const allowedExtensions = ['.sql', '.backup', '.dump', '.bak'];
      const pathname = urlObj.pathname.toLowerCase();
      const hasValidExtension = allowedExtensions.some(ext => pathname.endsWith(ext));

      if (!hasValidExtension) {
        setUrlValidationError(t('admin.backup.upload.invalid_extension', 'URL must point to a valid backup file (.sql, .backup, .dump, .bak)'));
        return false;
      }

      setUrlValidationError(null);
      return true;
    } catch (e) {
      setUrlValidationError(t('admin.backup.upload.invalid_url', 'Please enter a valid URL'));
      return false;
    }
  };

  const validateUrlAccessibility = async (url: string): Promise<boolean> => {
    setIsValidatingUrl(true);
    setUrlValidationError(null);

    try {
      const res = await apiRequest('POST', '/api/admin/backup/validate-url', { url });
      const data = await res.json();

      if (!res.ok || !data.accessible) {
        setUrlValidationError(data.error || t('admin.backup.upload.url_not_accessible', 'URL is not accessible'));
        return false;
      }

      if (data.contentLength && data.contentLength > 3000 * 1024 * 1024) {
        setUrlValidationError(t('admin.backup.upload.file_too_large', 'File size exceeds 3000MB limit'));
        return false;
      }

      return true;
    } catch (error) {
      setUrlValidationError(t('admin.backup.upload.validation_failed', 'Failed to validate URL'));
      return false;
    } finally {
      setIsValidatingUrl(false);
    }
  };

  const handleUploadSubmit = async () => {
    if (uploadMethod === 'file') {
      if (!uploadForm.file) {
        toast({
          title: t('common.error', 'Error'),
          description: t('admin.backup.upload.no_file_selected', 'Please select a backup file to upload'),
          variant: 'destructive'
        });
        return;
      }

      uploadBackupMutation.mutate({
        file: uploadForm.file,
        description: uploadForm.description || `Uploaded backup: ${uploadForm.file.name}`,
        storage_locations: uploadForm.storage_locations
      });
    } else {
      if (!uploadForm.url.trim()) {
        toast({
          title: t('common.error', 'Error'),
          description: t('admin.backup.upload.no_url_provided', 'Please enter a backup file URL'),
          variant: 'destructive'
        });
        return;
      }

      if (!validateUrl(uploadForm.url)) {
        return;
      }

      const isAccessible = await validateUrlAccessibility(uploadForm.url);
      if (!isAccessible) {
        return;
      }

      const urlObj = new URL(uploadForm.url);
      const filename = urlObj.pathname.split('/').pop() || 'backup';

      uploadBackupFromUrlMutation.mutate({
        url: uploadForm.url,
        description: uploadForm.description || `Uploaded backup from URL: ${filename}`,
        storage_locations: uploadForm.storage_locations
      });
    }
  };

  const handleFileSelected = (file: File) => {
    setUploadForm(prev => ({ ...prev, file }));
  };

  const handleUrlChange = (url: string) => {
    setUploadForm(prev => ({ ...prev, url }));
    if (url.trim()) {
      validateUrl(url);
    } else {
      setUrlValidationError(null);
    }
  };

  const saveScheduleMutation = useMutation({
    mutationFn: async (schedule: any) => {
      const updatedConfig = {
        ...config,
        schedules: editingSchedule
          ? config?.schedules?.map(s => s.id === editingSchedule.id ? { ...schedule, id: editingSchedule.id } : s) || []
          : [...(config?.schedules || []), { ...schedule, id: crypto.randomUUID() }]
      };

      const res = await apiRequest('POST', '/api/admin/backup/config', updatedConfig);
      if (!res.ok) throw new Error('Failed to save schedule');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: editingSchedule ? t('admin.backup.messages.schedule_updated', 'Schedule updated successfully') : t('admin.backup.messages.schedule_created', 'Schedule created successfully')
      });
      setScheduleDialogOpen(false);
      resetScheduleForm();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/config'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const updatedConfig = {
        ...config,
        schedules: config?.schedules?.filter(s => s.id !== scheduleId) || []
      };

      const res = await apiRequest('POST', '/api/admin/backup/config', updatedConfig);
      if (!res.ok) throw new Error('Failed to delete schedule');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.backup.messages.schedule_deleted', 'Schedule deleted successfully')
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/config'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: async ({ scheduleId, enabled }: { scheduleId: string; enabled: boolean }) => {
      const updatedConfig = {
        ...config,
        schedules: config?.schedules?.map(s =>
          s.id === scheduleId ? { ...s, enabled } : s
        ) || []
      };

      const res = await apiRequest('POST', '/api/admin/backup/config', updatedConfig);
      if (!res.ok) throw new Error('Failed to update schedule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/config'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: any) => {
      const res = await apiRequest('POST', '/api/admin/backup/config', settings);
      if (!res.ok) throw new Error('Failed to save settings');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('admin.backup.messages.settings_saved', 'Settings saved successfully')
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/config'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testGoogleDriveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/backup/google-drive/test');
      if (!res.ok) throw new Error('Failed to test Google Drive connection');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? t('admin.backup.messages.connection_successful', 'Connection Successful') : t('admin.backup.messages.connection_failed', 'Connection Failed'),
        description: data.message,
        variant: data.success ? 'default' : 'destructive'
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveOAuthMutation = useMutation({
    mutationFn: async (oauthData: { client_id: string; client_secret: string; redirect_uri: string }) => {
      const res = await apiRequest('POST', '/api/admin/backup/google-drive/oauth-config', oauthData);
      if (!res.ok) throw new Error('Failed to save OAuth configuration');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: data.message
        });
        setShowOauthForm(false);
        queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/google-drive/oauth-config'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/config'] });
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: data.message,
          variant: 'destructive'
        });
      }
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const clearOAuthMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/admin/backup/google-drive/oauth-config');
      if (!res.ok) throw new Error('Failed to clear OAuth configuration');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: data.message
        });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/google-drive/oauth-config'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/backup/config'] });
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: data.message,
          variant: 'destructive'
        });
      }
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const validateOAuthMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/backup/google-drive/oauth-validate');
      if (!res.ok) throw new Error('Failed to validate OAuth configuration');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.valid ? t('admin.backup.messages.validation_successful', 'Validation Successful') : t('admin.backup.messages.validation_failed', 'Validation Failed'),
        description: data.message,
        variant: data.valid ? 'default' : 'destructive'
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const openScheduleDialog = (schedule?: BackupSchedule) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setScheduleForm({
        name: schedule.id,
        frequency: schedule.frequency,
        time: schedule.time,
        day_of_week: schedule.day_of_week || 0,
        day_of_month: schedule.day_of_month || 1,
        storage_locations: schedule.storage_locations,
        enabled: schedule.enabled
      });
    } else {
      setEditingSchedule(null);
      resetScheduleForm();
    }
    setScheduleDialogOpen(true);
  };

  const resetScheduleForm = () => {
    setScheduleForm({
      name: '',
      frequency: 'daily',
      time: '02:00',
      day_of_week: 0,
      day_of_month: 1,
      storage_locations: ['local'],
      enabled: true
    });
  };

  const handleScheduleSubmit = () => {
    if (!scheduleForm.name.trim()) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('admin.backup.validation.schedule_name_required', 'Schedule name is required'),
        variant: 'destructive'
      });
      return;
    }

    const schedule = {
      ...scheduleForm,
      id: scheduleForm.name.toLowerCase().replace(/\s+/g, '-')
    };

    saveScheduleMutation.mutate(schedule);
  };

  const calculateNextRun = (schedule: BackupSchedule): Date => {
    const now = new Date();
    const [hours, minutes] = schedule.time.split(':').map(Number);

    let nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);

    switch (schedule.frequency) {
      case 'daily':
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;

      case 'weekly':
        const targetDay = schedule.day_of_week || 0;
        const currentDay = nextRun.getDay();
        let daysUntilTarget = targetDay - currentDay;

        if (daysUntilTarget <= 0 || (daysUntilTarget === 0 && nextRun <= now)) {
          daysUntilTarget += 7;
        }

        nextRun.setDate(nextRun.getDate() + daysUntilTarget);
        break;

      case 'monthly':
        const targetDate = schedule.day_of_month || 1;
        nextRun.setDate(targetDate);

        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        break;
    }

    return nextRun;
  };

  const getDayName = (dayIndex: number): string => {
    const days = [
      t('admin.backup.days.sunday', 'Sunday'),
      t('admin.backup.days.monday', 'Monday'),
      t('admin.backup.days.tuesday', 'Tuesday'),
      t('admin.backup.days.wednesday', 'Wednesday'),
      t('admin.backup.days.thursday', 'Thursday'),
      t('admin.backup.days.friday', 'Friday'),
      t('admin.backup.days.saturday', 'Saturday')
    ];
    return days[dayIndex] || t('admin.backup.days.sunday', 'Sunday');
  };

  const handleOAuthSubmit = () => {
    if (!oauthForm.client_id.trim() || !oauthForm.client_secret.trim()) {
      toast({
        title: t('common.validation_error', 'Validation Error'),
        description: t('admin.backup.validation.oauth_credentials_required', 'Client ID and Client Secret are required'),
        variant: 'destructive'
      });
      return;
    }

    saveOAuthMutation.mutate(oauthForm);
  };

  const resetOAuthForm = () => {
    setOauthForm({
      client_id: '',
      client_secret: '',
      redirect_uri: 'http://localhost:3000/admin/settings?tab=backup'
    });
    setShowOauthForm(false);
  };

  React.useEffect(() => {
    if (config) {
      setSettingsForm({
        retention_days: config.retention_days || 30,
        default_storage_locations: config.storage_locations || ['local'],
        google_drive: config.google_drive || {
          enabled: false,
          folder_id: null,
          credentials: null
        },
        encryption: config.encryption || {
          enabled: false,
          key: null
        },
        notifications: {
          enabled: false,
          email: '',
          on_success: true,
          on_failure: true
        },
        cleanup: {
          enabled: true,
          time: '03:00'
        }
      });
    }
  }, [config]);

  React.useEffect(() => {
    if (oauthConfig && oauthConfig.configured) {
      setOauthForm({
        client_id: oauthConfig.client_id || '',
        client_secret: '',
        redirect_uri: oauthConfig.redirect_uri || 'http://localhost:3000/admin/settings?tab=backup'
      });
    }
  }, [oauthConfig]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('common.file_size.bytes', 'Bytes')}`;
    const k = 1024;
    const sizes = [
      t('common.file_size.bytes', 'Bytes'),
      t('common.file_size.kb', 'KB'),
      t('common.file_size.mb', 'MB'),
      t('common.file_size.gb', 'GB'),
      t('common.file_size.tb', 'TB')
    ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      creating: { variant: 'secondary' as const, icon: Loader2, text: t('admin.backup.status.creating', 'Creating') },
      completed: { variant: 'default' as const, icon: CheckCircle, text: t('admin.backup.status.completed', 'Completed') },
      failed: { variant: 'destructive' as const, icon: XCircle, text: t('admin.backup.status.failed', 'Failed') },
      uploading: { variant: 'secondary' as const, icon: Cloud, text: t('admin.backup.status.uploading', 'Uploading') },
      uploaded: { variant: 'default' as const, icon: Cloud, text: t('admin.backup.status.uploaded', 'Uploaded') }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.completed;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  if (isLoadingConfig || isLoadingBackups || isLoadingStats || isLoadingOAuth) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>{t('admin.backup.loading', 'Loading backup system...')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">{t('admin.backup.tabs.overview', 'Overview')}</TabsTrigger>
          <TabsTrigger value="backups">{t('admin.backup.tabs.backups', 'Backups')}</TabsTrigger>
          <TabsTrigger value="schedules">{t('admin.backup.tabs.schedules', 'Schedules')}</TabsTrigger>
          <TabsTrigger value="settings">{t('admin.backup.tabs.settings', 'Settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.backup.stats.total_backups', 'Total Backups')}</p>
                    <p className="text-2xl font-bold">{stats?.total_backups || 0}</p>
                  </div>
                  <Database className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.backup.stats.total_size', 'Total Size')}</p>
                    <p className="text-2xl font-bold">{formatFileSize(stats?.total_size || 0)}</p>
                  </div>
                  <HardDrive className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.backup.stats.local_backups', 'Local Backups')}</p>
                    <p className="text-2xl font-bold">{stats?.local_backups || 0}</p>
                  </div>
                  <HardDrive className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.backup.stats.cloud_backups', 'Cloud Backups')}</p>
                    <p className="text-2xl font-bold">{stats?.cloud_backups || 0}</p>
                  </div>
                  <Cloud className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tools Status Panel */}
          {toolsStatus && (
            <>
              {(!toolsStatus.pg_dump?.available || !toolsStatus.psql?.available) && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-destructive mb-1">
                        {t('admin.backup.tools.critical_missing', 'Critical PostgreSQL Tools Missing')}
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        {t('admin.backup.tools.install_required', 'Some backup and restore operations require PostgreSQL client tools to be installed on the server.')}
                      </p>
                      {!toolsStatus.pg_dump?.available && (
                        <p className="text-sm text-destructive">
                          • pg_dump: {toolsStatus.pg_dump?.error || 'Not available'}
                        </p>
                      )}
                      {!toolsStatus.psql?.available && (
                        <p className="text-sm text-destructive">
                          • psql: {toolsStatus.psql?.error || 'Not available'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {t('admin.backup.tools.title', 'PostgreSQL Tools Status')}
                  </CardTitle>
                  <CardDescription>
                    {t('admin.backup.tools.description', 'Required tools for backup and restore operations')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* pg_dump */}
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {toolsStatus.pg_dump?.available ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                        <div>
                          <p className="font-medium">pg_dump</p>
                          <p className="text-sm text-muted-foreground">
                            {t('admin.backup.tools.pg_dump_desc', 'Required for creating backups')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {toolsStatus.pg_dump?.available ? (
                          <Badge variant="default">{toolsStatus.pg_dump.version}</Badge>
                        ) : (
                          <Badge variant="destructive">{t('admin.backup.tools.unavailable', 'Unavailable')}</Badge>
                        )}
                      </div>
                    </div>

                    {/* psql */}
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {toolsStatus.psql?.available ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                        <div>
                          <p className="font-medium">psql</p>
                          <p className="text-sm text-muted-foreground">
                            {t('admin.backup.tools.psql_desc', 'Required for restoring SQL backups')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {toolsStatus.psql?.available ? (
                          <Badge variant="default">{toolsStatus.psql.version}</Badge>
                        ) : (
                          <Badge variant="destructive">{t('admin.backup.tools.unavailable', 'Unavailable')}</Badge>
                        )}
                      </div>
                    </div>

                    {/* pg_restore */}
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {toolsStatus.pg_restore?.available ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          (() => {

                            const hasCustomFormatBackups = backups?.some(b => {
                              const fname = b.filename.toLowerCase();
                              return fname.endsWith('.backup') || fname.endsWith('.dump') || fname.endsWith('.bak');
                            });
                            return hasCustomFormatBackups ? (
                              <XCircle className="h-5 w-5 text-destructive" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-yellow-500" />
                            );
                          })()
                        )}
                        <div>
                          <p className="font-medium">pg_restore</p>
                          <p className="text-sm text-muted-foreground">
                            {(() => {
                              const hasCustomFormatBackups = backups?.some(b => {
                                const fname = b.filename.toLowerCase();
                                return fname.endsWith('.backup') || fname.endsWith('.dump') || fname.endsWith('.bak');
                              });
                              return hasCustomFormatBackups
                                ? t('admin.backup.tools.pg_restore_desc_required', 'Required for restoring custom format backups (.backup, .dump, .bak)')
                                : t('admin.backup.tools.pg_restore_desc_optional', 'Optional - only needed for custom format backups (.backup, .dump, .bak)');
                            })()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {toolsStatus.pg_restore?.available ? (
                          <Badge variant="default">{toolsStatus.pg_restore.version}</Badge>
                        ) : (
                          (() => {
                            const hasCustomFormatBackups = backups?.some(b => {
                              const fname = b.filename.toLowerCase();
                              return fname.endsWith('.backup') || fname.endsWith('.dump') || fname.endsWith('.bak');
                            });
                            return hasCustomFormatBackups ? (
                              <Badge variant="destructive">{t('admin.backup.tools.required', 'Required')}</Badge>
                            ) : (
                              <Badge variant="secondary">{t('admin.backup.tools.optional', 'Optional')}</Badge>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.backup.quick_actions.title', 'Quick Actions')}</CardTitle>
              <CardDescription>
                {t('admin.backup.quick_actions.description', 'Create manual backups and manage your backup system')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="manual-description">{t('admin.backup.quick_actions.backup_description', 'Backup Description')}</Label>
                  <Input
                    id="manual-description"
                    placeholder={t('admin.backup.quick_actions.backup_description_placeholder', 'Enter backup description...')}
                    value={manualBackupDescription}
                    onChange={(e) => setManualBackupDescription(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label>{t('admin.backup.quick_actions.storage_locations', 'Storage Locations')}</Label>
                  <Select
                    value={manualBackupLocations[0]}
                    onValueChange={(value) => setManualBackupLocations([value])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">{t('admin.backup.storage.local', 'Local Storage')}</SelectItem>
                      <SelectItem value="google_drive" disabled={!config?.google_drive?.enabled}>
                        {t('admin.backup.storage.google_drive', 'Google Drive')} {!config?.google_drive?.enabled && t('admin.backup.storage.not_connected', '(Not Connected)')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => createBackupMutation.mutate()}
                    disabled={createBackupMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {createBackupMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    {t('admin.backup.actions.create_backup', 'Create Backup')}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium">{t('admin.backup.cleanup.title', 'Backup Cleanup')}</h4>
                    {lastCleanup && (
                      <Badge variant={lastCleanup.status === 'success' ? 'success' : 'destructive'} className="text-xs">
                        {lastCleanup.status === 'success'
                          ? t('admin.backup.cleanup.last_success', 'Last: ') + new Date(lastCleanup.timestamp).toLocaleDateString()
                          : t('admin.backup.cleanup.last_failed', 'Last failed')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('admin.backup.cleanup.description', `Remove backups older than ${config?.retention_days || 30} days`)}
                  </p>
                </div>
                <Button
                  onClick={() => cleanupBackupsMutation.mutate()}
                  disabled={cleanupBackupsMutation.isPending}
                  variant="outline"
                  size="sm"
                >
                  {cleanupBackupsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  {t('admin.backup.actions.cleanup_now', 'Cleanup Now')}
                </Button>
              </div>

              <Separator />

              {/* Backup Logs Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{t('admin.backup.logs.title', 'Activity Logs')}</h4>
                  <div className="text-xs text-muted-foreground">
                    {backupLogs && `${t('admin.backup.logs.showing', 'Showing')} ${backupLogs.logs.length} ${t('admin.backup.logs.of', 'of')} ${backupLogs.total}`}
                  </div>
                </div>

                {backupLogs && backupLogs.logs.length > 0 ? (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('admin.backup.logs.timestamp', 'Timestamp')}</TableHead>
                            <TableHead>{t('admin.backup.logs.schedule', 'Schedule')}</TableHead>
                            <TableHead>{t('admin.backup.logs.status', 'Status')}</TableHead>
                            <TableHead>{t('admin.backup.logs.details', 'Details')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {backupLogs.logs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm">
                                {formatDate(log.timestamp)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {log.scheduleId === 'manual' ? (
                                  <Badge variant="outline" className="text-xs">
                                    {t('admin.backup.logs.manual', 'Manual')}
                                  </Badge>
                                ) : log.scheduleId === 'restore' ? (
                                  <Badge variant="outline" className="text-xs">
                                    {t('admin.backup.logs.restore', 'Restore')}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    {log.scheduleId}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    log.status === 'success' ? 'default' :
                                    log.status === 'failed' ? 'destructive' :
                                    log.status === 'in_progress' ? 'secondary' :
                                    'outline'
                                  }
                                  className="text-xs"
                                >
                                  {log.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {log.errorMessage ? (
                                  <span className="text-destructive">{log.errorMessage}</span>
                                ) : log.metadata?.event_type ? (
                                  <span className="text-muted-foreground">{log.metadata.event_type}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination Controls */}
                    {backupLogs.total > logsPageSize && (
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          {t('admin.backup.logs.page', 'Page')} {logsPage + 1} {t('admin.backup.logs.of', 'of')} {Math.ceil(backupLogs.total / logsPageSize)}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogsPage(Math.max(0, logsPage - 1))}
                            disabled={logsPage === 0}
                          >
                            {t('admin.backup.logs.previous', 'Previous')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLogsPage(logsPage + 1)}
                            disabled={(logsPage + 1) * logsPageSize >= backupLogs.total}
                          >
                            {t('admin.backup.logs.next', 'Next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('admin.backup.logs.no_logs', 'No activity logs available')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold">{t('admin.backup.history.title', 'Backup History')}</h2>
              <p className="text-muted-foreground">{t('admin.backup.history.description', 'View and manage all database backups')}</p>
            </div>
            <Button
              onClick={() => setUploadDialogOpen(true)}
              className="flex items-center gap-2"
              disabled={isUploading}
            >
              <Upload className="h-4 w-4" />
              {t('admin.backup.actions.upload_backup', 'Upload Backup')}
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              {backups && backups.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.backup.table.filename', 'Filename')}</TableHead>
                      <TableHead>{t('admin.backup.table.type', 'Type')}</TableHead>
                      <TableHead>{t('admin.backup.table.size', 'Size')}</TableHead>
                      <TableHead>{t('admin.backup.table.status', 'Status')}</TableHead>
                      <TableHead>{t('admin.backup.table.storage', 'Storage')}</TableHead>
                      <TableHead>{t('admin.backup.table.created', 'Created')}</TableHead>
                      <TableHead>{t('admin.backup.table.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((backup) => (
                      <TableRow key={backup.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{backup.filename}</div>
                            <div className="text-sm text-muted-foreground">
                              {backup.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={backup.type === 'manual' ? 'default' : 'secondary'}>
                            {backup.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatFileSize(backup.size)}</TableCell>
                        <TableCell>{getStatusBadge(backup.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {backup.storage_locations.includes('local') && (
                              <Badge variant="outline" className="text-xs">
                                <HardDrive className="h-3 w-3 mr-1" />
                                {t('admin.backup.storage.local', 'Local')}
                              </Badge>
                            )}
                            {backup.storage_locations.includes('google_drive') && (
                              <Badge variant="outline" className="text-xs">
                                <Cloud className="h-3 w-3 mr-1" />
                                {t('admin.backup.storage.drive', 'Drive')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(backup.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(`/api/admin/backup/download/${backup.id}`, '_blank')}
                              disabled={backup.status !== 'completed' && backup.status !== 'uploaded'}
                              title={t('admin.backup.actions.download_backup', 'Download backup')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verifyBackupMutation.mutate(backup.id)}
                              disabled={
                                verifyBackupMutation.isPending ||
                                backup.status !== 'completed' ||
                                (backup.filename.toLowerCase().endsWith('.backup') || backup.filename.toLowerCase().endsWith('.dump') || backup.filename.toLowerCase().endsWith('.bak') ? !isRestoreToolAvailable(backup) : false)
                              }
                              title={
                                backup.filename.toLowerCase().endsWith('.backup') || backup.filename.toLowerCase().endsWith('.dump') || backup.filename.toLowerCase().endsWith('.bak')
                                  ? !isRestoreToolAvailable(backup)
                                    ? getRestoreToolRequirement(backup)
                                    : t('admin.backup.actions.verify_backup', 'Verify backup integrity')
                                  : t('admin.backup.actions.verify_backup', 'Verify backup integrity')
                              }
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verifyDeepBackupMutation.mutate(backup.id)}
                              disabled={verifyDeepBackupMutation.isPending || backup.status !== 'completed' || !isRestoreToolAvailable(backup)}
                              title={!isRestoreToolAvailable(backup)
                                ? getRestoreToolRequirement(backup)
                                : t('admin.backup.actions.verify_deep_backup', 'Deep verify - test actual restore to temporary database')}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              {verifyDeepBackupMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRestoreDialog(backup)}
                              disabled={isRestoreDisabled(backup) || restoreBackupMutation.isPending || !isRestoreToolAvailable(backup)}
                              title={!isRestoreToolAvailable(backup)
                                ? getRestoreToolRequirement(backup)
                                : t('admin.backup.actions.restore_backup', 'Restore database from this backup')}
                              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline" title={t('admin.backup.actions.delete_backup', 'Delete backup')}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('admin.backup.dialogs.delete_backup_title', 'Delete Backup')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('admin.backup.dialogs.delete_backup_description', 'Are you sure you want to delete this backup? This action cannot be undone.')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteBackupMutation.mutate(backup.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {t('common.delete', 'Delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t('admin.backup.empty.title', 'No Backups Found')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('admin.backup.empty.description', 'Create your first backup to get started')}
                  </p>
                  <Button onClick={() => setActiveTab('overview')}>
                    {t('admin.backup.actions.create_backup', 'Create Backup')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">{t('admin.backup.schedules.title', 'Backup Schedules')}</h2>
              <p className="text-muted-foreground">{t('admin.backup.schedules.description', 'Configure automated backup schedules')}</p>
            </div>
            <Button onClick={() => openScheduleDialog()} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t('admin.backup.schedules.new_schedule', 'New Schedule')}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.backup.schedules.active_title', 'Active Schedules')}</CardTitle>
              <CardDescription>
                {t('admin.backup.schedules.active_description', 'Manage your automated backup schedules')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {config?.schedules && config.schedules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.backup.schedules.table.name', 'Schedule Name')}</TableHead>
                      <TableHead>{t('admin.backup.schedules.table.frequency', 'Frequency')}</TableHead>
                      <TableHead>{t('admin.backup.schedules.table.time', 'Time')}</TableHead>
                      <TableHead>{t('admin.backup.schedules.table.next_run', 'Next Run')}</TableHead>
                      <TableHead>{t('admin.backup.schedules.table.storage', 'Storage')}</TableHead>
                      <TableHead>{t('admin.backup.schedules.table.status', 'Status')}</TableHead>
                      <TableHead>{t('admin.backup.schedules.table.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {config.schedules.map((schedule) => {
                      const nextRun = calculateNextRun(schedule);
                      return (
                        <TableRow key={schedule.id}>
                          <TableCell className="font-medium">{schedule.id}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="capitalize">{schedule.frequency}</span>
                              {schedule.frequency === 'weekly' && (
                                <span className="text-xs text-muted-foreground">
                                  {getDayName(schedule.day_of_week || 0)}
                                </span>
                              )}
                              {schedule.frequency === 'monthly' && (
                                <span className="text-xs text-muted-foreground">
                                  Day {schedule.day_of_month || 1}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{schedule.time}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{nextRun.toLocaleDateString()}</span>
                              <span className="text-xs text-muted-foreground">
                                {nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {schedule.storage_locations.includes('local') && (
                                <Badge variant="outline" className="text-xs">
                                  <HardDrive className="h-3 w-3 mr-1" />
                                  Local
                                </Badge>
                              )}
                              {schedule.storage_locations.includes('google_drive') && (
                                <Badge variant="outline" className="text-xs">
                                  <Cloud className="h-3 w-3 mr-1" />
                                  Drive
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={schedule.enabled ? 'success' : 'secondary'}>
                              {schedule.enabled ? t('admin.backup.schedules.status.enabled', 'Enabled') : t('admin.backup.schedules.status.disabled', 'Disabled')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openScheduleDialog(schedule)}
                                title={t('admin.backup.actions.edit_schedule', 'Edit schedule')}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleScheduleMutation.mutate({
                                  scheduleId: schedule.id,
                                  enabled: !schedule.enabled
                                })}
                                title={schedule.enabled ? t('admin.backup.actions.disable_schedule', 'Disable schedule') : t('admin.backup.actions.enable_schedule', 'Enable schedule')}
                              >
                                {schedule.enabled ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline" title={t('admin.backup.actions.delete_schedule', 'Delete schedule')}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t('admin.backup.dialogs.delete_schedule_title', 'Delete Schedule')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('admin.backup.dialogs.delete_schedule_description', 'Are you sure you want to delete this backup schedule? This action cannot be undone.')}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {t('common.delete', 'Delete')}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t('admin.backup.schedules.empty.title', 'No Schedules Configured')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('admin.backup.schedules.empty.description', 'Create your first automated backup schedule to get started')}
                  </p>
                  <Button onClick={() => openScheduleDialog()}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('admin.backup.schedules.actions.create', 'Create Schedule')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.backup.settings.general_title', 'General Settings')}</CardTitle>
              <CardDescription>
                {t('admin.backup.settings.general_description', 'Configure global backup system preferences')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="retention-days">{t('admin.backup.settings.retention_label', 'Backup Retention Period (days)')}</Label>
                  <Input
                    id="retention-days"
                    type="number"
                    min="1"
                    max="365"
                    value={settingsForm.retention_days}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      retention_days: parseInt(e.target.value) || 30
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('admin.backup.settings.retention_help', 'Backups older than this will be automatically deleted')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.backup.settings.default_storage_locations', 'Default Storage Locations')}</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="default-local"
                        checked={settingsForm.default_storage_locations.includes('local')}
                        onChange={(e) => {
                          const locations = e.target.checked
                            ? [...settingsForm.default_storage_locations, 'local']
                            : settingsForm.default_storage_locations.filter(l => l !== 'local');
                          setSettingsForm({ ...settingsForm, default_storage_locations: locations });
                        }}
                      />
                      <Label htmlFor="default-local" className="text-sm">{t('admin.backup.storage.local', 'Local Storage')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="default-drive"
                        checked={settingsForm.default_storage_locations.includes('google_drive')}
                        onChange={(e) => {
                          const locations = e.target.checked
                            ? [...settingsForm.default_storage_locations, 'google_drive']
                            : settingsForm.default_storage_locations.filter(l => l !== 'google_drive');
                          setSettingsForm({ ...settingsForm, default_storage_locations: locations });
                        }}
                        disabled={!settingsForm.google_drive.enabled}
                      />
                      <Label htmlFor="default-drive" className="text-sm">
                        {t('admin.backup.storage.google_drive', 'Google Drive')} {!settingsForm.google_drive.enabled && t('admin.backup.storage.not_connected', '(Not Connected)')}
                      </Label>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('admin.backup.settings.default_storage_help', 'Default storage locations for new backups')}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Automatic Cleanup</h4>
                    <p className="text-sm text-muted-foreground">
                      Automatically delete old backups based on retention period
                    </p>
                  </div>
                  <Switch
                    checked={settingsForm.cleanup.enabled}
                    onCheckedChange={(checked) => setSettingsForm({
                      ...settingsForm,
                      cleanup: { ...settingsForm.cleanup, enabled: checked }
                    })}
                  />
                </div>

                {settingsForm.cleanup.enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="cleanup-time">Cleanup Time</Label>
                    <Input
                      id="cleanup-time"
                      type="time"
                      value={settingsForm.cleanup.time}
                      onChange={(e) => setSettingsForm({
                        ...settingsForm,
                        cleanup: { ...settingsForm.cleanup, time: e.target.value }
                      })}
                      className="w-32"
                    />
                    <p className="text-xs text-muted-foreground">
                      Daily time when cleanup will run
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.backup.google_drive.title', 'Google Drive Integration')}</CardTitle>
              <CardDescription>
                {t('admin.backup.google_drive.description', 'Configure OAuth 2.0 credentials and cloud storage backup options')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t('admin.backup.oauth.configuration_title', 'OAuth 2.0 Configuration')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('admin.backup.oauth.configuration_description', 'Configure Google OAuth credentials for Drive access')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {oauthConfig?.configured ? (
                      <Badge variant="success">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {t('admin.backup.oauth.configured_status', 'Configured')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <XCircle className="h-3 w-3 mr-1" />
                        {t('admin.backup.oauth.not_configured_status', 'Not Configured')}
                      </Badge>
                    )}
                  </div>
                </div>

                {oauthConfig?.configured && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-medium text-green-800 mb-2">{t('admin.backup.oauth.credentials_configured', 'OAuth Credentials Configured')}</h4>
                        <div className="text-sm text-green-700 space-y-1">
                          <p><strong>{t('admin.backup.oauth.client_id', 'Client ID')}:</strong> {oauthConfig.client_id}</p>
                          <p><strong>{t('admin.backup.oauth.redirect_uri', 'Redirect URI')}:</strong> {oauthConfig.redirect_uri}</p>
                          <p><strong>{t('admin.backup.oauth.source', 'Source')}:</strong> {oauthConfig.source === 'ui' ? t('admin.backup.oauth.admin_interface', 'Admin Interface') : t('admin.backup.oauth.environment_variables', 'Environment Variables')}</p>
                          {oauthConfig.configured_at && oauthConfig.configured_at !== 'Environment Variables' && (
                            <p><strong>{t('admin.backup.oauth.configured', 'Configured')}:</strong> {new Date(oauthConfig.configured_at).toLocaleString()}</p>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => validateOAuthMutation.mutate()}
                            disabled={validateOAuthMutation.isPending}
                          >
                            {validateOAuthMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Shield className="h-4 w-4 mr-2" />
                            )}
                            {t('admin.backup.oauth.validate_credentials', 'Validate Credentials')}
                          </Button>
                          {oauthConfig.source === 'ui' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowOauthForm(true)}
                            >
                              <Settings className="h-4 w-4 mr-2" />
                              {t('admin.backup.oauth.update_credentials', 'Update Credentials')}
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('admin.backup.oauth.clear_credentials', 'Clear Credentials')}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('admin.backup.dialogs.clear_oauth_title', 'Clear OAuth Credentials')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('admin.backup.dialogs.clear_oauth_description', 'This will remove all stored Google OAuth credentials and disable Google Drive integration. You will need to reconfigure credentials to use Google Drive backups.')}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => clearOAuthMutation.mutate()}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t('admin.backup.oauth.clear_credentials', 'Clear Credentials')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!oauthConfig?.configured && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-medium text-blue-800 mb-2">{t('admin.backup.oauth.setup_required', 'OAuth Setup Required')}</h4>
                        <p className="text-sm text-blue-700 mb-3">
                          {t('admin.backup.oauth.setup_description', 'To enable Google Drive backups, you need to configure OAuth 2.0 credentials from Google Cloud Console.')}
                        </p>
                        <div className="text-sm text-blue-700 mb-3">
                          <p className="font-medium mb-1">{t('admin.backup.oauth.setup_instructions', 'Setup Instructions')}:</p>
                          <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li>{t('admin.backup.oauth.step_1', 'Go to')} <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">{t('admin.backup.oauth.google_cloud_console', 'Google Cloud Console')}</a></li>
                            <li>{t('admin.backup.oauth.step_2', 'Create a new project or select existing one')}</li>
                            <li>{t('admin.backup.oauth.step_3', 'Enable the Google Drive API')}</li>
                            <li>{t('admin.backup.oauth.step_4', 'Create OAuth 2.0 credentials (Web application)')}</li>
                            <li>{t('admin.backup.oauth.step_5', 'Add your redirect URI to authorized redirect URIs')}</li>
                            <li>{t('admin.backup.oauth.step_6', 'Copy the Client ID and Client Secret')}</li>
                          </ol>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setShowOauthForm(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t('admin.backup.oauth.configure_credentials', 'Configure OAuth Credentials')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {showOauthForm && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{t('admin.backup.oauth.credentials_form_title', 'OAuth 2.0 Credentials')}</h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={resetOAuthForm}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="client-id">{t('admin.backup.oauth.client_id_label', 'Google Client ID')}</Label>
                          <Input
                            id="client-id"
                            value={oauthForm.client_id}
                            onChange={(e) => setOauthForm({ ...oauthForm, client_id: e.target.value })}
                            placeholder={t('admin.backup.oauth.client_id_placeholder', 'Enter your Google OAuth Client ID')}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('admin.backup.oauth.client_id_help', 'The Client ID from your Google Cloud Console OAuth credentials')}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="client-secret">{t('admin.backup.oauth.client_secret_label', 'Google Client Secret')}</Label>
                          <Input
                            id="client-secret"
                            type="password"
                            value={oauthForm.client_secret}
                            onChange={(e) => setOauthForm({ ...oauthForm, client_secret: e.target.value })}
                            placeholder={t('admin.backup.oauth.client_secret_placeholder', 'Enter your Google OAuth Client Secret')}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('admin.backup.oauth.client_secret_help', 'The Client Secret from your Google Cloud Console OAuth credentials')}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="redirect-uri">{t('admin.backup.oauth.redirect_uri_label', 'Redirect URI')}</Label>
                          <Input
                            id="redirect-uri"
                            value={oauthForm.redirect_uri}
                            onChange={(e) => setOauthForm({ ...oauthForm, redirect_uri: e.target.value })}
                            placeholder="http://localhost:3000/admin/settings?tab=backup"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('admin.backup.oauth.redirect_uri_help', 'This URI must be added to your Google OAuth authorized redirect URIs')}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={handleOAuthSubmit}
                          disabled={saveOAuthMutation.isPending || !oauthForm.client_id.trim() || !oauthForm.client_secret.trim()}
                        >
                          {saveOAuthMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {t('admin.backup.oauth.save_credentials', 'Save Credentials')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={resetOAuthForm}
                        >
                          {t('common.cancel', 'Cancel')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{t('admin.backup.google_drive.enable_title', 'Enable Google Drive Backups')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('admin.backup.google_drive.enable_description', 'Store backups in Google Drive for cloud redundancy')}
                  </p>
                </div>
                <Switch
                  checked={settingsForm.google_drive.enabled}
                  onCheckedChange={(checked) => setSettingsForm({
                    ...settingsForm,
                    google_drive: { ...settingsForm.google_drive, enabled: checked }
                  })}
                  disabled={!oauthConfig?.configured}
                />
              </div>

              {settingsForm.google_drive.enabled && oauthConfig?.configured && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Cloud className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-blue-800 mb-2">{t('admin.backup.google_drive.connection_title', 'Google Drive Connection')}</h4>
                        <p className="text-sm text-blue-700 mb-3">
                          {t('admin.backup.google_drive.connection_description', `Authorize ${branding.appName} to access your Google Drive for backup storage.`, { appName: branding.appName })}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open('/api/admin/backup/google-drive/auth-url', '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {t('admin.backup.google_drive.connect_drive', 'Connect Google Drive')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => testGoogleDriveMutation.mutate()}
                            disabled={testGoogleDriveMutation.isPending}
                          >
                            {testGoogleDriveMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Shield className="h-4 w-4 mr-2" />
                            )}
                            {t('admin.backup.google_drive.test_connection', 'Test Connection')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {settingsForm.google_drive.credentials && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <h4 className="font-medium text-green-800">{t('admin.backup.google_drive.connected_title', 'Google Drive Connected')}</h4>
                          <p className="text-sm text-green-700">
                            {t('admin.backup.google_drive.connected_description', 'Your Google Drive account is connected and ready for backups.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {settingsForm.google_drive.enabled && !oauthConfig?.configured && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-yellow-800">{t('admin.backup.google_drive.oauth_required_title', 'OAuth Configuration Required')}</h4>
                      <p className="text-sm text-yellow-700">
                        {t('admin.backup.google_drive.oauth_required_description', 'Please configure OAuth 2.0 credentials above before enabling Google Drive backups.')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => {
                if (config) {
                  setSettingsForm({
                    retention_days: config.retention_days || 30,
                    default_storage_locations: config.storage_locations || ['local'],
                    google_drive: config.google_drive || {
                      enabled: false,
                      folder_id: null,
                      credentials: null
                    },
                    encryption: config.encryption || {
                      enabled: false,
                      key: null
                    },
                    notifications: {
                      enabled: false,
                      email: '',
                      on_success: true,
                      on_failure: true
                    },
                    cleanup: {
                      enabled: true,
                      time: '03:00'
                    }
                  });
                }
              }}
            >
              {t('admin.backup.actions.reset_defaults', 'Reset to Defaults')}
            </Button>
            <Button
              onClick={() => {
                const updatedConfig = {
                  ...config,
                  retention_days: settingsForm.retention_days,
                  storage_locations: settingsForm.default_storage_locations,
                  google_drive: settingsForm.google_drive,
                  encryption: settingsForm.encryption
                };
                saveSettingsMutation.mutate(updatedConfig);
              }}
              disabled={saveSettingsMutation.isPending}
            >
              {saveSettingsMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('admin.backup.actions.save_settings', 'Save Settings')}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={restoreDialogOpen} onOpenChange={(open) => {
        if (!open && !restoreBackupMutation.isPending) {
          setRestoreDialogOpen(false);
          resetRestoreDialog();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              {t('admin.backup.restore.title', 'Database Restoration')}
            </DialogTitle>
            <DialogDescription>
              {restoreStep === 'preflight' && t('admin.backup.restore.preflight_step', 'Running system checks before restore')}
              {restoreStep === 'warning' && t('admin.backup.restore.warning_step', 'Review the backup details and understand the implications')}
              {restoreStep === 'confirmation' && t('admin.backup.restore.confirmation_step', 'Confirm your intention to restore the database')}
              {restoreStep === 'progress' && t('admin.backup.restore.progress_step', 'Database restoration in progress')}
            </DialogDescription>
          </DialogHeader>

          {selectedBackupForRestore && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t('admin.backup.restore.backup_info', 'Backup Information')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium">{t('admin.backup.restore.filename', 'Filename')}:</span>
                      <div className="text-muted-foreground">{selectedBackupForRestore.filename}</div>
                    </div>
                    <div>
                      <span className="font-medium">{t('admin.backup.restore.created', 'Created')}:</span>
                      <div className="text-muted-foreground">{formatDate(selectedBackupForRestore.created_at)}</div>
                    </div>
                    <div>
                      <span className="font-medium">{t('admin.backup.restore.size', 'Size')}:</span>
                      <div className="text-muted-foreground">{formatFileSize(selectedBackupForRestore.size)}</div>
                    </div>
                    <div>
                      <span className="font-medium">{t('admin.backup.restore.type', 'Type')}:</span>
                      <div className="text-muted-foreground capitalize">{selectedBackupForRestore.type}</div>
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">{t('admin.backup.restore.description', 'Description')}:</span>
                    <div className="text-muted-foreground">{selectedBackupForRestore.description}</div>
                  </div>
                  <div>
                    <span className="font-medium">{t('admin.backup.restore.storage', 'Storage')}:</span>
                    <div className="flex gap-1 mt-1">
                      {selectedBackupForRestore.storage_locations.includes('local') && (
                        <Badge variant="outline" className="text-xs">
                          <HardDrive className="h-3 w-3 mr-1" />
                          {t('admin.backup.storage.local', 'Local')}
                        </Badge>
                      )}
                      {selectedBackupForRestore.storage_locations.includes('google_drive') && (
                        <Badge variant="outline" className="text-xs">
                          <Cloud className="h-3 w-3 mr-1" />
                          {t('admin.backup.storage.google_drive', 'Google Drive')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {restoreStep === 'preflight' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="w-full">
                        <h4 className="font-medium text-blue-800 mb-3">{t('admin.backup.restore.preflight_title', 'System Readiness Checks')}</h4>

                        {preflightChecksMutation.isPending && (
                          <div className="flex items-center gap-2 text-sm text-blue-700">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('admin.backup.restore.preflight_running', 'Running preflight checks...')}
                          </div>
                        )}

                        {preflightChecks && (
                          <div className="space-y-2">
                            {preflightChecks.checks.map((check, index) => (
                              <div key={index} className="flex items-start gap-2 text-sm">
                                {check.status === 'passed' && (
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                                )}
                                {check.status === 'failed' && (
                                  <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                                )}
                                {check.status === 'warning' && (
                                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                )}
                                <div className="flex-1">
                                  <div className={`font-medium ${
                                    check.status === 'passed' ? 'text-green-800' :
                                    check.status === 'failed' ? 'text-red-800' :
                                    'text-yellow-800'
                                  }`}>
                                    {check.name}
                                  </div>
                                  <div className={`text-xs ${
                                    check.status === 'passed' ? 'text-green-700' :
                                    check.status === 'failed' ? 'text-red-700' :
                                    'text-yellow-700'
                                  }`}>
                                    {check.message}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {preflightChecks && !preflightChecks.canProceed && (
                          <div className="mt-4 bg-red-50 border border-red-200 rounded p-3">
                            <p className="text-sm text-red-800 font-medium">
                              {t('admin.backup.restore.preflight_failed', 'Critical checks failed. Please resolve the issues before proceeding.')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {restoreStep === 'warning' && (
                <div className="space-y-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2">
                        <h4 className="font-medium text-orange-800">{t('admin.backup.restore.warning_title', 'Critical Warning')}</h4>
                        <div className="text-sm text-orange-700 space-y-1">
                          <p>• <strong>{t('admin.backup.restore.warning_replace', 'This action will completely replace your current database')}</strong></p>
                          <p>• {t('admin.backup.restore.warning_data_lost', 'All current data will be permanently lost')}</p>
                          <p>• {t('admin.backup.restore.warning_disconnect', 'All users will be disconnected during the restoration')}</p>
                          <p>• {t('admin.backup.restore.warning_undone', 'The restoration process cannot be undone')}</p>
                          <p>• {t('admin.backup.restore.warning_backup', 'Make sure you have a recent backup of the current state if needed')}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2">
                        <h4 className="font-medium text-blue-800">{t('admin.backup.restore.process_title', 'Restoration Process')}</h4>
                        <div className="text-sm text-blue-700 space-y-1">
                          <p>1. {t('admin.backup.restore.process_download', 'Backup file will be downloaded if stored in cloud')}</p>
                          <p>2. {t('admin.backup.restore.process_verify', 'Backup integrity will be verified')}</p>
                          <p>3. {t('admin.backup.restore.process_clean', 'Current database will be cleaned')}</p>
                          <p>4. {t('admin.backup.restore.process_restore', 'Backup data will be restored')}</p>
                          <p>5. {t('admin.backup.restore.process_ready', 'System will be ready for use')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {restoreStep === 'confirmation' && (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-red-800 mb-2">{t('admin.backup.restore.confirmation_title', 'Final Confirmation Required')}</h4>
                        <p className="text-sm text-red-700 mb-3">
                          {t('admin.backup.restore.confirmation_text', 'To proceed with the database restoration, please type the backup filename exactly as shown below:')}
                        </p>
                        <div className="bg-card border rounded px-3 py-2 font-mono text-sm">
                          {getRequiredConfirmationText()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmation-input">{t('admin.backup.restore.confirmation_label', 'Confirmation Text')}</Label>
                    <Input
                      id="confirmation-input"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      placeholder={t('admin.backup.restore.confirmation_placeholder', 'Type "{filename}" to confirm', { filename: getRequiredConfirmationText() })}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.backup.restore.confirmation_help', 'This confirmation ensures you understand the consequences of this action.')}
                    </p>
                  </div>
                </div>
              )}

              {restoreStep === 'progress' && (
                <div className="space-y-4">
                  {restoreProgress?.status !== 'completed' && restoreProgress?.status !== 'failed' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0" />
                          <div className="flex-1">
                            <h4 className="font-medium text-blue-800">{t('admin.backup.restore.progress_title', 'Restoration in Progress')}</h4>
                            <p className="text-sm text-blue-700">
                              {restoreProgress?.message || t('admin.backup.restore.progress_processing', 'Processing...')}
                            </p>
                          </div>
                          {restoreProgress?.percent !== undefined && (
                            <div className="text-sm font-medium text-blue-800">
                              {restoreProgress.percent}%
                            </div>
                          )}
                        </div>
                        {restoreProgress?.percent !== undefined && (
                          <div className="w-full bg-blue-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${restoreProgress.percent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {restoreProgress?.status === 'completed' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-green-800">{t('admin.backup.restore.completed_title', 'Restoration Completed')}</h4>
                          <p className="text-sm text-green-700">
                            {restoreProgress?.message || t('admin.backup.restore.completed_message', 'Database has been successfully restored. The dialog will close automatically.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {restoreProgress?.status === 'failed' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-red-800">{t('admin.backup.restore.failed_title', 'Restoration Failed')}</h4>
                          <p className="text-sm text-red-700">
                            {restoreProgress?.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {restoreStep === 'preflight' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRestoreDialogOpen(false);
                    resetRestoreDialog();
                  }}
                >
                  {t('admin.backup.restore.cancel', 'Cancel')}
                </Button>
                <Button
                  onClick={() => setRestoreStep('warning')}
                  disabled={!preflightChecks || !preflightChecks.canProceed || preflightChecksMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {preflightChecksMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('admin.backup.restore.continue', 'Continue')}
                </Button>
              </>
            )}

            {restoreStep === 'warning' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setRestoreStep('preflight')}
                >
                  {t('admin.backup.restore.back', 'Back')}
                </Button>
                <Button
                  onClick={() => setRestoreStep('confirmation')}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {t('admin.backup.restore.understand_continue', 'I Understand, Continue')}
                </Button>
              </>
            )}

            {restoreStep === 'confirmation' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setRestoreStep('warning')}
                >
                  {t('admin.backup.restore.back', 'Back')}
                </Button>
                <Button
                  onClick={handleRestoreConfirm}
                  disabled={confirmationText !== getRequiredConfirmationText()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {t('admin.backup.restore.restore_database', 'Restore Database')}
                </Button>
              </>
            )}

            {restoreStep === 'progress' && (
              <Button
                variant="outline"
                onClick={() => {
                  setRestoreDialogOpen(false);
                  resetRestoreDialog();
                }}
                disabled={restoreBackupMutation.isPending && restoreProgress?.status !== 'failed'}
              >
                {restoreProgress?.status === 'completed' || restoreProgress?.status === 'failed' ? t('admin.backup.restore.close', 'Close') : t('common.cancel', 'Cancel')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setScheduleDialogOpen(false);
          setEditingSchedule(null);
          resetScheduleForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? t('admin.backup.schedule_dialog.edit_title', 'Edit Backup Schedule') : t('admin.backup.schedule_dialog.create_title', 'Create Backup Schedule')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.backup.schedule_dialog.description', 'Configure automated backup schedule settings')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">{t('admin.backup.schedule_dialog.name_label', 'Schedule Name')}</Label>
              <Input
                id="schedule-name"
                value={scheduleForm.name}
                onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                placeholder={t('admin.backup.schedule_dialog.name_placeholder', 'e.g., Daily Backup, Weekly Archive')}
              />
              <p className="text-xs text-muted-foreground">
                {t('admin.backup.schedule_dialog.name_help', 'A descriptive name for this backup schedule')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backup.schedule_dialog.frequency_label', 'Backup Frequency')}</Label>
              <Select
                value={scheduleForm.frequency}
                onValueChange={(value: 'daily' | 'weekly' | 'monthly') =>
                  setScheduleForm({ ...scheduleForm, frequency: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t('admin.backup.schedule_dialog.frequency_daily', 'Daily')}</SelectItem>
                  <SelectItem value="weekly">{t('admin.backup.schedule_dialog.frequency_weekly', 'Weekly')}</SelectItem>
                  <SelectItem value="monthly">{t('admin.backup.schedule_dialog.frequency_monthly', 'Monthly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-time">{t('admin.backup.schedule_dialog.time_label', 'Backup Time')}</Label>
              <Input
                id="schedule-time"
                type="time"
                value={scheduleForm.time}
                onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('admin.backup.schedule_dialog.time_help', 'Time when the backup will be executed (24-hour format)')}
              </p>
            </div>

            {scheduleForm.frequency === 'weekly' && (
              <div className="space-y-2">
                <Label>{t('admin.backup.schedule_dialog.day_of_week', 'Day of Week')}</Label>
                <Select
                  value={scheduleForm.day_of_week.toString()}
                  onValueChange={(value) =>
                    setScheduleForm({ ...scheduleForm, day_of_week: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('admin.backup.days.sunday', 'Sunday')}</SelectItem>
                    <SelectItem value="1">{t('admin.backup.days.monday', 'Monday')}</SelectItem>
                    <SelectItem value="2">{t('admin.backup.days.tuesday', 'Tuesday')}</SelectItem>
                    <SelectItem value="3">{t('admin.backup.days.wednesday', 'Wednesday')}</SelectItem>
                    <SelectItem value="4">{t('admin.backup.days.thursday', 'Thursday')}</SelectItem>
                    <SelectItem value="5">{t('admin.backup.days.friday', 'Friday')}</SelectItem>
                    <SelectItem value="6">{t('admin.backup.days.saturday', 'Saturday')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {scheduleForm.frequency === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="day-of-month">{t('admin.backup.schedule_dialog.day_of_month', 'Day of Month')}</Label>
                <Input
                  id="day-of-month"
                  type="number"
                  min="1"
                  max="31"
                  value={scheduleForm.day_of_month}
                  onChange={(e) => setScheduleForm({
                    ...scheduleForm,
                    day_of_month: parseInt(e.target.value) || 1
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('admin.backup.schedule_dialog.day_of_month_help', 'Day of the month when backup will be executed (1-31)')}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('admin.backup.schedule_dialog.storage_label', 'Storage Locations')}</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="schedule-local"
                    checked={scheduleForm.storage_locations.includes('local')}
                    onChange={(e) => {
                      const locations = e.target.checked
                        ? [...scheduleForm.storage_locations, 'local']
                        : scheduleForm.storage_locations.filter(l => l !== 'local');
                      setScheduleForm({ ...scheduleForm, storage_locations: locations });
                    }}
                  />
                  <Label htmlFor="schedule-local" className="text-sm">{t('admin.backup.storage.local', 'Local Storage')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="schedule-drive"
                    checked={scheduleForm.storage_locations.includes('google_drive')}
                    onChange={(e) => {
                      const locations = e.target.checked
                        ? [...scheduleForm.storage_locations, 'google_drive']
                        : scheduleForm.storage_locations.filter(l => l !== 'google_drive');
                      setScheduleForm({ ...scheduleForm, storage_locations: locations });
                    }}
                    disabled={!config?.google_drive?.enabled}
                  />
                  <Label htmlFor="schedule-drive" className="text-sm">
                    {t('admin.backup.storage.google_drive', 'Google Drive')} {!config?.google_drive?.enabled && t('admin.backup.storage.not_connected', '(Not Connected)')}
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('admin.backup.schedule_dialog.storage_help', 'Where to store the backup files')}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">{t('admin.backup.schedule_dialog.enable_title', 'Enable Schedule')}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('admin.backup.schedule_dialog.enable_help', 'Start this schedule immediately after creation')}
                </p>
              </div>
              <Switch
                checked={scheduleForm.enabled}
                onCheckedChange={(checked) => setScheduleForm({ ...scheduleForm, enabled: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setScheduleDialogOpen(false);
                setEditingSchedule(null);
                resetScheduleForm();
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleScheduleSubmit}
              disabled={saveScheduleMutation.isPending || !scheduleForm.name.trim() || scheduleForm.storage_locations.length === 0}
            >
              {saveScheduleMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingSchedule ? t('admin.backup.schedule_dialog.update_button', 'Update Schedule') : t('admin.backup.schedule_dialog.create_button', 'Create Schedule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Backup Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('admin.backup.upload.title', 'Upload Database Backup')}</DialogTitle>
            <DialogDescription>
              {t('admin.backup.upload.description', 'Upload an external database backup file to add it to your backup collection. Supported formats: .sql, .backup, .dump, .bak')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Tabs value={uploadMethod} onValueChange={(value) => setUploadMethod(value as 'file' | 'url')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file" disabled={isUploading}>
                  {t('admin.backup.upload.local_file', 'Local File')}
                </TabsTrigger>
                <TabsTrigger value="url" disabled={isUploading}>
                  {t('admin.backup.upload.from_url', 'From URL')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="space-y-2 mt-4">
                <Label>{t('admin.backup.upload.file_label', 'Backup File')}</Label>
                <FileUpload
                  onFileSelected={handleFileSelected}
                  fileType=".sql,.backup,.dump,.bak"
                  maxSize={3000} // 3000MB limit
                  className="w-full"
                  showProgress={isUploading}
                  progress={uploadProgress}
                />
                <p className="text-xs text-muted-foreground">
                  {t('admin.backup.upload.file_help', 'Maximum file size: 3000MB. Supported formats: .sql, .backup, .dump, .bak')}
                </p>
              </TabsContent>

              <TabsContent value="url" className="space-y-2 mt-4">
                <Label htmlFor="backup-url">{t('admin.backup.upload.url_label', 'Backup File URL')}</Label>
                <Input
                  id="backup-url"
                  type="url"
                  placeholder="https://example.com/backup.sql"
                  value={uploadForm.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  disabled={isUploading || isValidatingUrl}
                  className={urlValidationError ? 'border-red-500' : ''}
                />
                {urlValidationError && (
                  <div className="flex items-start gap-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{urlValidationError}</span>
                  </div>
                )}
                {isValidatingUrl && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('admin.backup.upload.validating_url', 'Validating URL...')}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('admin.backup.upload.url_help', 'Enter the direct URL to a backup file. The file will be downloaded and validated before upload.')}
                </p>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="upload-description">{t('admin.backup.upload.description_label', 'Description (Optional)')}</Label>
              <Input
                id="upload-description"
                placeholder={t('admin.backup.upload.description_placeholder', 'Enter a description for this backup...')}
                value={uploadForm.description}
                onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.backup.upload.storage_label', 'Storage Locations')}</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="upload-local"
                    checked={uploadForm.storage_locations.includes('local')}
                    onChange={(e) => {
                      const locations = e.target.checked
                        ? [...uploadForm.storage_locations, 'local']
                        : uploadForm.storage_locations.filter(l => l !== 'local');
                      setUploadForm(prev => ({ ...prev, storage_locations: locations }));
                    }}
                    disabled={isUploading}
                  />
                  <Label htmlFor="upload-local" className="text-sm">{t('admin.backup.storage.local', 'Local Storage')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="upload-drive"
                    checked={uploadForm.storage_locations.includes('google_drive')}
                    onChange={(e) => {
                      const locations = e.target.checked
                        ? [...uploadForm.storage_locations, 'google_drive']
                        : uploadForm.storage_locations.filter(l => l !== 'google_drive');
                      setUploadForm(prev => ({ ...prev, storage_locations: locations }));
                    }}
                    disabled={!config?.google_drive?.enabled || isUploading}
                  />
                  <Label htmlFor="upload-drive" className="text-sm">
                    {t('admin.backup.storage.google_drive', 'Google Drive')} {!config?.google_drive?.enabled && t('admin.backup.storage.not_connected', '(Not Connected)')}
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('admin.backup.upload.storage_help', 'Choose where to store the uploaded backup')}
              </p>
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('admin.backup.upload.uploading', 'Uploading...')}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
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
                setUploadDialogOpen(false);
                resetUploadForm();
              }}
              disabled={isUploading || isValidatingUrl}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleUploadSubmit}
              disabled={
                uploadForm.storage_locations.length === 0 ||
                isUploading ||
                isValidatingUrl ||
                (uploadMethod === 'file' && !uploadForm.file) ||
                (uploadMethod === 'url' && (!uploadForm.url.trim() || !!urlValidationError))
              }
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadMethod === 'url'
                    ? t('admin.backup.upload.downloading', 'Downloading & Uploading...')
                    : t('admin.backup.upload.uploading', 'Uploading...')
                  }
                </>
              ) : isValidatingUrl ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('admin.backup.upload.validating', 'Validating...')}
                </>
              ) : (
                <>
                  {uploadMethod === 'url' ? (
                    <Download className="mr-2 h-4 w-4" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploadMethod === 'url'
                    ? t('admin.backup.upload.download_upload_button', 'Download & Upload')
                    : t('admin.backup.upload.upload_button', 'Upload Backup')
                  }
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
