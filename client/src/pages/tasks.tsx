import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from '@/hooks/usePermissions';
import { useBranding } from '@/contexts/branding-context';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Search, Filter, MoreHorizontal, CheckSquare, Square, AlertTriangle, ChevronDown, SortAsc, SortDesc, Calendar as CalendarIcon, User, Flag, Clock, Trash2, Edit, X, Grid3x3, List, FolderPlus, Pencil } from 'lucide-react';

interface Task {
  id: number;
  contactId: number;
  companyId: number;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'not_started' | 'in_progress' | 'completed' | 'cancelled';
  dueDate: string | null;
  completedAt: string | null;
  assignedTo: string | null;
  category: string | null;
  tags: string[] | null;
  backgroundColor: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface TaskCategory {
  id: number;
  companyId: number;
  name: string;
  color: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskFormData {
  contactId: number | null;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'not_started' | 'in_progress' | 'completed' | 'cancelled';
  dueDate: string;
  assignedTo: string | null;
  category: string;
  tags: string[];
  backgroundColor: string;
}

export default function TasksPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { branding } = useBranding();


  const canManageTasks = hasPermission(PERMISSIONS.MANAGE_TASKS);


  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [contactFilter, setContactFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(9);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [isMobile, setIsMobile] = useState(false);


  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768; // md breakpoint
      setIsMobile(mobile);
      if (mobile) {
        setViewMode('grid');
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);


  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTaskDetailsDialog, setShowTaskDetailsDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<TaskCategory | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [contactPage, setContactPage] = useState(1);
  const [allLoadedContacts, setAllLoadedContacts] = useState<Contact[]>([]);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);


  const [formData, setFormData] = useState<TaskFormData>({
    contactId: null,
    title: '',
    description: '',
    priority: 'medium',
    status: 'not_started',
    dueDate: '',
    assignedTo: '',
    category: '',
    tags: [],
    backgroundColor: '#ffffff'
  });


  const { data: tasksData, isLoading: isLoadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ['tasks', page, limit, statusFilter, priorityFilter, assigneeFilter, contactFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });

      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (assigneeFilter && assigneeFilter !== 'all') params.append('assignedTo', assigneeFilter);
      if (contactFilter) params.append('contactId', contactFilter.toString());
      if (searchTerm) params.append('search', searchTerm);

      const res = await apiRequest('GET', `/api/tasks?${params.toString()}`);
      return res.json();
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0
  });

  const tasks = tasksData?.tasks || [];
  const totalTasks = tasksData?.total || 0;
  const totalPages = Math.ceil(totalTasks / limit);


  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      const data = await res.json();
      return data;
    }
  });


  const { data: categories = [] } = useQuery<TaskCategory[]>({
    queryKey: ['taskCategories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/task-categories');
      return res.json();
    }
  });


  const { data: allContactsData } = useQuery({
    queryKey: ['all-contacts-for-display'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/contacts?limit=10000');
      return res.json();
    },
    staleTime: 5 * 60 * 1000 // 5 minutes
  });


  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['contacts-for-tasks', contactPage, contactSearchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: contactPage.toString(),
        limit: '100'
      });
      if (contactSearchTerm) {
        params.append('search', contactSearchTerm);
      }
      const res = await apiRequest('GET', `/api/contacts?${params.toString()}`);
      return res.json();
    },
    refetchOnMount: 'always'
  });


  useEffect(() => {
    if (contactsData?.contacts) {
      if (contactPage === 1) {
        setAllLoadedContacts(contactsData.contacts);

        if (!contactSearchTerm) {
          setAllContacts(contactsData.contacts);
        }
      } else {
        setAllLoadedContacts(prev => {
          const newContacts = contactsData.contacts.filter(
            (newContact: Contact) => !prev.some(c => c.id === newContact.id)
          );
          return [...prev, ...newContacts];
        });
      }
    }
  }, [contactsData, contactPage, contactSearchTerm]);


  const contacts = allLoadedContacts.length > 0 ? allLoadedContacts : allContacts;
  

  const displayContacts = allContactsData?.contacts || contacts;


  const createTaskMutation = useMutation({
    mutationFn: async (data: Partial<TaskFormData>) => {
      const res = await apiRequest('POST', '/api/tasks', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: t('tasks.createSuccess', 'Task created successfully'),
        variant: 'default'
      });
      setShowCreateModal(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: t('tasks.createError', 'Failed to create task'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TaskFormData> }) => {
      const res = await apiRequest('PATCH', `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: t('tasks.updateSuccess', 'Task updated successfully'),
        variant: 'default'
      });
      setShowEditModal(false);
      setSelectedTask(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: t('tasks.updateError', 'Failed to update task'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const deleteTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/tasks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: t('tasks.deleteSuccess', 'Task deleted successfully'),
        variant: 'default'
      });
      setShowDeleteDialog(false);
      setSelectedTask(null);
    },
    onError: (error: any) => {
      toast({
        title: t('tasks.deleteError', 'Failed to delete task'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ taskIds, updates }: { taskIds: number[]; updates: Partial<TaskFormData> }) => {
      const res = await apiRequest('PATCH', '/api/tasks/bulk', { taskIds, updates });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: t('tasks.bulkUpdateSuccess', 'Tasks updated successfully'),
        variant: 'default'
      });
      setSelectedTasks(new Set());
      setShowBulkActions(false);
    },
    onError: (error: any) => {
      toast({
        title: t('tasks.bulkUpdateError', 'Failed to update tasks'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('POST', '/api/task-categories', { name });
      return res.json();
    },
    onSuccess: (newCategory) => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      setFormData({ ...formData, category: newCategory.name });
      setNewCategoryName('');
      setShowNewCategoryInput(false);
      toast({
        title: t('tasks.categoryCreated', 'Category created successfully'),
        variant: 'default'
      });
    },
    onError: (error: any) => {
      toast({
        title: t('tasks.categoryCreateError', 'Failed to create category'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      toast({
        title: t('tasks.categoryNameRequired', 'Category name is required'),
        variant: 'destructive'
      });
      return;
    }
    createCategoryMutation.mutate(newCategoryName.trim());
  };


  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest('PATCH', `/api/task-categories/${id}`, { name });
      return res.json();
    },
    onSuccess: (updatedCategory) => {
      queryClient.invalidateQueries({ queryKey: ['taskCategories'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });


      if (formData.category === editingCategory?.name) {
        setFormData({ ...formData, category: updatedCategory.name });
      }

      setEditingCategory(null);
      setEditCategoryName('');
      toast({
        title: t('tasks.categoryUpdated', 'Category updated successfully'),
        variant: 'default'
      });
    },
    onError: (error: any) => {
      toast({
        title: t('tasks.categoryUpdateError', 'Failed to update category'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleUpdateCategory = () => {
    if (!editCategoryName.trim()) {
      toast({
        title: t('tasks.categoryNameRequired', 'Category name is required'),
        variant: 'destructive'
      });
      return;
    }
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, name: editCategoryName.trim() });
    }
  };

  const handleEditCategoryClick = (category: TaskCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCategory(category);
    setEditCategoryName(category.name);
  };

  const resetForm = () => {
    setFormData({
      contactId: null,
      title: '',
      description: '',
      priority: 'medium',
      status: 'not_started',
      dueDate: '',
      assignedTo: '',
      category: '',
      tags: [],
      backgroundColor: '#ffffff'
    });

    setContactSearchTerm('');
    setContactPage(1);
    setAllLoadedContacts([]);
    setContactPopoverOpen(false);
    setAllContacts([]);
  };

  const handleCreateTask = () => {
    if (!formData.title.trim()) {
      toast({
        title: t('tasks.titleRequired', 'Title is required'),
        variant: 'destructive'
      });
      return;
    }

    if (!formData.contactId) {
      toast({
        title: t('tasks.contactRequired', 'Contact is required'),
        variant: 'destructive'
      });
      return;
    }

    if (!formData.dueDate) {
      toast({
        title: t('tasks.dueDateRequired', 'Due date is required'),
        variant: 'destructive'
      });
      return;
    }


    const dataToSubmit = {
      ...formData,
      assignedTo: formData.assignedTo === 'unassigned' ? null : formData.assignedTo
    };

    createTaskMutation.mutate(dataToSubmit);
  };

  const handleEditTask = () => {
    if (!selectedTask) return;

    if (!formData.title.trim()) {
      toast({
        title: t('tasks.titleRequired', 'Title is required'),
        variant: 'destructive'
      });
      return;
    }

    if (!formData.dueDate) {
      toast({
        title: t('tasks.dueDateRequired', 'Due date is required'),
        variant: 'destructive'
      });
      return;
    }


    const dataToSubmit = {
      ...formData,
      assignedTo: formData.assignedTo === 'unassigned' ? null : formData.assignedTo
    };

    updateTaskMutation.mutate({
      id: selectedTask.id,
      data: dataToSubmit
    });
  };

  const handleDeleteTask = () => {
    if (!selectedTask) return;
    deleteTaskMutation.mutate(selectedTask.id);
  };

  const openEditModal = (task: Task) => {
    setSelectedTask(task);
    setFormData({
      contactId: task.contactId,
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? format(parseISO(task.dueDate), 'yyyy-MM-dd') : '',
      assignedTo: task.assignedTo || 'unassigned',
      category: task.category || '',
      tags: task.tags || [],
      backgroundColor: task.backgroundColor || '#ffffff'
    });
    setShowEditModal(true);
  };

  const openDeleteDialog = (task: Task) => {
    setSelectedTask(task);
    setShowDeleteDialog(true);
  };

  const openTaskDetailsDialog = (task: Task) => {
    setSelectedTask(task);
    setShowTaskDetailsDialog(true);
  };


  const toggleTaskSelection = (taskId: number) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const toggleSelectAll = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set());
      setShowBulkActions(false);
    } else {
      setSelectedTasks(new Set(tasks.map((t: Task) => t.id)));
      setShowBulkActions(true);
    }
  };

  const handleBulkStatusUpdate = (status: string) => {
    const taskIds = Array.from(selectedTasks);
    bulkUpdateMutation.mutate({
      taskIds,
      updates: { status: status as any }
    });
  };

  const handleBulkPriorityUpdate = (priority: string) => {
    const taskIds = Array.from(selectedTasks);
    bulkUpdateMutation.mutate({
      taskIds,
      updates: { priority: priority as any }
    });
  };

  const handleBulkAssigneeUpdate = (assignee: string) => {
    const taskIds = Array.from(selectedTasks);
    const assignedTo = assignee === 'unassigned' ? null : assignee;
    bulkUpdateMutation.mutate({
      taskIds,
      updates: { assignedTo }
    });
  };


  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'high': return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 border-orange-200 dark:border-orange-800';
      case 'medium': return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      case 'low': return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800';
      case 'in_progress': return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'not_started': return 'bg-muted text-muted-foreground border-border';
      case 'cancelled': return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'not_started': return t('tasks.status.notStarted', 'Not Started');
      case 'in_progress': return t('tasks.status.inProgress', 'In Progress');
      case 'completed': return t('tasks.status.completed', 'Completed');
      case 'cancelled': return t('tasks.status.cancelled', 'Cancelled');
      default: return status;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low': return t('tasks.priority.low', 'Low');
      case 'medium': return t('tasks.priority.medium', 'Medium');
      case 'high': return t('tasks.priority.high', 'High');
      case 'urgent': return t('tasks.priority.urgent', 'Urgent');
      default: return priority;
    }
  };

  const getContactName = (contactId: number) => {

    const allDisplayContacts = allContactsData?.contacts || [];
    const contact = allDisplayContacts.find((c: Contact) => c.id === contactId) ||
                    contacts.find((c: Contact) => c.id === contactId);
    return contact?.name || t('tasks.unknownContact', 'Unknown Contact');
  };

  const getAssigneeName = (assignedTo: string | null) => {
    if (!assignedTo) return t('tasks.unassigned', 'Unassigned');
    const member = teamMembers.find((m: any) => m.email === assignedTo);
    return member?.fullName || assignedTo;
  };

  const getAssigneeProfileImage = (assignedTo: string | null) => {
    if (!assignedTo) return null;
    const member = teamMembers.find((m: any) => m.email === assignedTo);
    return member?.avatarUrl || null;
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    {t('tasks.title', 'Tasks')}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('tasks.subtitle', 'Manage and track all your tasks')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* View Toggle - Hidden on mobile */}
                  <div className="hidden md:flex items-center border border-border rounded-lg p-1 bg-card">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="flex items-center gap-2 h-8 px-3"
                      style={viewMode === 'grid' ? { backgroundColor: branding.primaryColor, color: 'white' } : {}}
                    >
                      <Grid3x3 className="h-4 w-4" />
                      {t('tasks.grid', 'Grid')}
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="flex items-center gap-2 h-8 px-3"
                      style={viewMode === 'list' ? { backgroundColor: branding.primaryColor, color: 'white' } : {}}
                    >
                      <List className="h-4 w-4" />
                      {t('tasks.list', 'List')}
                    </Button>
                  </div>
                  {canManageTasks && (
                    <Button
                      onClick={() => {
                        resetForm();
                        setShowCreateModal(true);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      {t('tasks.createTask', 'Create Task')}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Filters */}
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Search */}
                  <div className="lg:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                      <Input
                        type="text"
                        placeholder={t('tasks.searchPlaceholder', 'Search tasks, contacts...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('tasks.filterByStatus', 'Status')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('tasks.allStatuses', 'All Statuses')}</SelectItem>
                        <SelectItem value="not_started">{t('tasks.status.notStarted', 'Not Started')}</SelectItem>
                        <SelectItem value="in_progress">{t('tasks.status.inProgress', 'In Progress')}</SelectItem>
                        <SelectItem value="completed">{t('tasks.status.completed', 'Completed')}</SelectItem>
                        <SelectItem value="cancelled">{t('tasks.status.cancelled', 'Cancelled')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Priority Filter */}
                  <div>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('tasks.filterByPriority', 'Priority')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('tasks.allPriorities', 'All Priorities')}</SelectItem>
                        <SelectItem value="low">{t('tasks.priority.low', 'Low')}</SelectItem>
                        <SelectItem value="medium">{t('tasks.priority.medium', 'Medium')}</SelectItem>
                        <SelectItem value="high">{t('tasks.priority.high', 'High')}</SelectItem>
                        <SelectItem value="urgent">{t('tasks.priority.urgent', 'Urgent')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assignee Filter */}
                  <div>
                    <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('tasks.filterByAssignee', 'Assignee')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('tasks.allAssignees', 'All Assignees')}</SelectItem>
                        {Array.isArray(teamMembers) && teamMembers.length > 0 ? (
                          teamMembers.map((member: any) => (
                            <SelectItem key={member.id} value={member.email}>
                              {member.fullName}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-members" disabled>
                            {t('tasks.noTeamMembers', 'No team members found')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bulk Actions Bar */}
            {showBulkActions && canManageTasks && (
              <Card className="mb-4 border-primary/30 bg-primary/10 dark:bg-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-primary dark:text-primary/90">
                        {selectedTasks.size} {t('tasks.selected', 'selected')}
                      </span>
                      <div className="flex items-center gap-2">
                        <Select onValueChange={handleBulkStatusUpdate}>
                          <SelectTrigger className="w-[180px] bg-background">
                            <SelectValue placeholder={t('tasks.updateStatus', 'Update Status')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_started">{t('tasks.status.notStarted', 'Not Started')}</SelectItem>
                            <SelectItem value="in_progress">{t('tasks.status.inProgress', 'In Progress')}</SelectItem>
                            <SelectItem value="completed">{t('tasks.status.completed', 'Completed')}</SelectItem>
                            <SelectItem value="cancelled">{t('tasks.status.cancelled', 'Cancelled')}</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select onValueChange={handleBulkPriorityUpdate}>
                          <SelectTrigger className="w-[180px] bg-background">
                            <SelectValue placeholder={t('tasks.updatePriority', 'Update Priority')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">{t('tasks.priority.low', 'Low')}</SelectItem>
                            <SelectItem value="medium">{t('tasks.priority.medium', 'Medium')}</SelectItem>
                            <SelectItem value="high">{t('tasks.priority.high', 'High')}</SelectItem>
                            <SelectItem value="urgent">{t('tasks.priority.urgent', 'Urgent')}</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select onValueChange={handleBulkAssigneeUpdate}>
                          <SelectTrigger className="w-[180px] bg-background">
                            <SelectValue placeholder={t('tasks.assignTo', 'Assign To')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">{t('tasks.unassigned', 'Unassigned')}</SelectItem>
                            {Array.isArray(teamMembers) && teamMembers.length > 0 && (
                              teamMembers.map((member: any) => (
                                <SelectItem key={member.id} value={member.email}>
                                  {member.fullName}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTasks(new Set());
                        setShowBulkActions(false);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tasks Table */}
            <Card>
              <CardContent className="p-0">
                {isLoadingTasks ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground/70" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">
                      {t('tasks.noTasks', 'No tasks found')}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('tasks.noTasksDescription', 'Get started by creating a new task.')}
                    </p>
                    {canManageTasks && (
                      <div className="mt-6">
                        <Button onClick={() => {
                          resetForm();
                          setShowCreateModal(true);
                        }}>
                          <Plus className="h-4 w-4 mr-2" />
                          {t('tasks.createTask', 'Create Task')}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {viewMode === 'list' ? (
                      <div className="overflow-x-auto">
                        <Table className="table-fixed min-w-full">
                        <TableHeader>
                          <TableRow>
                            {canManageTasks && (
                              <TableHead className="w-2 px-1">
                                <Checkbox
                                  checked={selectedTasks.size === tasks.length && tasks.length > 0}
                                  onCheckedChange={toggleSelectAll}
                                />
                              </TableHead>
                            )}
                            <TableHead className="w-20">{t('tasks.title', 'Title')}</TableHead>
                            <TableHead className="w-16">{t('tasks.contact', 'Contact')}</TableHead>
                            <TableHead className="w-8">{t('tasks.status', 'Status')}</TableHead>
                            <TableHead className="w-8">{t('tasks.priority', 'Priority')}</TableHead>
                            <TableHead className="w-8">{t('tasks.assignedTo', 'Assigned To')}</TableHead>
                            <TableHead className="w-8">{t('tasks.dueDate', 'Due Date')}</TableHead>
                            <TableHead className="w-[10px] text-center">{t('tasks.actions', 'Actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tasks.map((task: Task) => (
                          <TableRow 
                            key={task.id} 
                            className="hover:bg-accent"
                            style={{ backgroundColor: task.backgroundColor || 'transparent' }}
                          >
                            {canManageTasks && (
                              <TableCell className="px-1">
                                <Checkbox
                                  checked={selectedTasks.has(task.id)}
                                  onCheckedChange={() => toggleTaskSelection(task.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell className="max-w-40 pl-1">
                              <div className="min-w-0">
                                <button
                                  onClick={() => openTaskDetailsDialog(task)}
                                  className="font-medium text-foreground truncate text-sm hover:text-primary hover:underline text-left w-full"
                                  title={task.title}
                                >
                                  {task.title.replace(/\b\w/g, l => l.toUpperCase())}
                                </button>
                                {task.description && (
                                  <div className="text-xs text-muted-foreground truncate" title={task.description}>
                                    {task.description}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-24 px-1">
                                <button
                                onClick={() => setLocation(`/contacts?id=${task.contactId}`)}
                                className="flex items-center gap-1 text-primary hover:text-primary/90 hover:underline min-w-0"
                              >
                                {(() => {
                                  const contact = displayContacts.find((c: Contact) => c.id === task.contactId);
                                  return contact?.avatarUrl ? (
                                    <img
                                      src={contact.avatarUrl}
                                      alt={contact.name}
                                      className="h-5 w-5 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                                      {contact?.name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                  );
                                })()}
                                <span className="truncate text-xs font-bold text-muted-foreground" title={getContactName(task.contactId)}>
                                  {getContactName(task.contactId).replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="px-1">
                              <Badge className={`${getStatusColor(task.status)} text-xs`}>
                                {getStatusLabel(task.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-1">
                              <Badge className={`${getPriorityColor(task.priority)} text-xs`}>
                                <Flag className="h-2 w-2 mr-0.5" />
                                {getPriorityLabel(task.priority)}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-1">
                              <div className="flex items-center gap-1">
                                {(() => {
                                  const profileImage = getAssigneeProfileImage(task.assignedTo);
                                  const assigneeName = getAssigneeName(task.assignedTo);
                                  
                                  if (profileImage) {
                                    return (
                                      <img
                                        src={profileImage}
                                        alt={assigneeName}
                                        className="h-5 w-5 rounded-full object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                      />
                                    );
                                  }
                                  

                                  if (task.assignedTo && assigneeName !== 'Unassigned') {
                                    const initials = assigneeName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                                    return (
                                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                                        {initials}
                                      </div>
                                    );
                                  }
                                  
                                  return <User className="h-5 w-5 text-muted-foreground/70" />;
                                })()}
                                <span className="text-xs text-foreground/90">
                                  {getAssigneeName(task.assignedTo)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="px-1">
                              {task.dueDate ? (
                                <div className="flex items-center gap-1">
                                  <CalendarIcon className="h-3 w-3 text-muted-foreground/70" />
                                  <span className="text-xs text-foreground/90">
                                    {format(parseISO(task.dueDate), 'MMM dd, yyyy')}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/70">-</span>
                              )}
                            </TableCell>
                            <TableCell className="px-1">
                              {canManageTasks && (
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditModal(task)}
                                    className="h-6 w-6 p-0"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openDeleteDialog(task)}
                                    className="h-6 w-6 p-0"
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                      </div>
                    ) : (
                      /* Grid View */
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                        {tasks.map((task: Task) => (
                          <Card 
                            key={task.id} 
                            className="hover:shadow-lg transition-shadow overflow-hidden"
                            style={{ backgroundColor: task.backgroundColor || undefined }}
                          >
                            <CardContent className="p-4">
                              {/* Card Header */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  {canManageTasks && (
                                    <Checkbox
                                      checked={selectedTasks.has(task.id)}
                                      onCheckedChange={() => toggleTaskSelection(task.id)}
                                      className="mb-2"
                                    />
                                  )}
                                  <button
                                    onClick={() => openTaskDetailsDialog(task)}
                                    className="font-semibold text-foreground mb-1 truncate text-xs md:text-base hover:text-primary hover:underline text-left w-full block"
                                    title={task.title}
                                  >
                                    {(() => {
                                      const titleCaseTitle = task.title.replace(/\b\w/g, l => l.toUpperCase());
                                      return titleCaseTitle.length > 20 ? `${titleCaseTitle.substring(0, 20)}...` : titleCaseTitle;
                                    })()}
                                  </button>
                                  {task.description && (
                                    <p className="text-xs md:text-sm text-muted-foreground line-clamp-1 mb-3 overflow-hidden" title={task.description}>
                                      {task.description.length > 30 ? `${task.description.substring(0, 30)}...` : task.description}
                                    </p>
                                  )}
                                </div>
                                {canManageTasks && (
                                  <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditModal(task)}
                                      className="h-5 w-5 md:h-6 md:w-6 p-0"
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openDeleteDialog(task)}
                                      className="h-5 w-5 md:h-6 md:w-6 p-0"
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Status and Priority */}
                              <div className="flex items-center gap-1 md:gap-2 mb-3">
                                <Badge className={`${getStatusColor(task.status)} text-xs`}>
                                  {getStatusLabel(task.status)}
                                </Badge>
                                <Badge className={`${getPriorityColor(task.priority)} text-xs`}>
                                  <Flag className="h-2 w-2 md:h-3 md:w-3 mr-0.5 md:mr-1" />
                                  {getPriorityLabel(task.priority)}
                                </Badge>
                              </div>

                              {/* Contact */}
                              <div className="flex items-center gap-2 mb-2">
                                {(() => {
                                  const contact = displayContacts.find((c: Contact) => c.id === task.contactId);
                                  return contact?.avatarUrl ? (
                                    <img
                                      src={contact.avatarUrl}
                                      alt={contact.name}
                                      className="h-5 w-5 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                                      {contact?.name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                  );
                                })()}
                                <button
                                  onClick={() => setLocation(`/contacts?id=${task.contactId}`)}
                                  className="text-xs md:text-sm text-muted-foreground hover:text-primary/90 hover:underline truncate font-bold"
                                  title={getContactName(task.contactId)}
                                >
                                  {(() => {
                                    const contactName = getContactName(task.contactId);
                                    const titleCaseName = contactName.replace(/\b\w/g, (l: string) => l.toUpperCase());
                                    return titleCaseName.length > 15 ? `${titleCaseName.substring(0, 15)}...` : titleCaseName;
                                  })()}
                                </button>
                              </div>

                              {/* Assignee */}
                              <div className="flex items-center gap-2 mb-2">
                                {(() => {
                                  const profileImage = getAssigneeProfileImage(task.assignedTo);
                                  const assigneeName = getAssigneeName(task.assignedTo);
                                  
                                  if (profileImage) {
                                    return (
                                      <img
                                        src={profileImage}
                                        alt={assigneeName}
                                        className="h-5 w-5 md:h-6 md:w-6 rounded-full object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                      />
                                    );
                                  }
                                  

                                  if (task.assignedTo && assigneeName !== 'Unassigned') {
                                    const initials = assigneeName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                                    return (
                                      <div className="h-5 w-5 md:h-6 md:w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                                        {initials}
                                      </div>
                                    );
                                  }
                                  
                                  return <User className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground/70" />;
                                })()}
                                <span className="text-xs md:text-sm text-foreground/90 truncate" title={getAssigneeName(task.assignedTo)}>
                                  {(() => {
                                    const assigneeName = getAssigneeName(task.assignedTo);
                                    return assigneeName.length > 12 ? `${assigneeName.substring(0, 12)}...` : assigneeName;
                                  })()}
                                </span>
                              </div>

                              {/* Due Date */}
                              {task.dueDate && (
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground/70" />
                                  <span className="text-xs md:text-sm text-foreground/90">
                                    {format(parseISO(task.dueDate), 'MMM dd, yyyy')}
                                  </span>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="border-t px-4 py-3 flex items-center justify-between">
                        <div className="text-sm text-foreground/90">
                          {t('tasks.showing', 'Showing')} {(page - 1) * limit + 1} {t('tasks.to', 'to')}{' '}
                          {Math.min(page * limit, totalTasks)} {t('tasks.of', 'of')} {totalTasks} {t('tasks.tasks', 'tasks')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page - 1)}
                            disabled={page === 1}
                          >
                            {t('tasks.previous', 'Previous')}
                          </Button>
                          <span className="text-sm text-foreground/90">
                            {t('tasks.page', 'Page')} {page} {t('tasks.of', 'of')} {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page + 1)}
                            disabled={page === totalPages}
                          >
                            {t('tasks.next', 'Next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create Task Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('tasks.createTask', 'Create Task')}</DialogTitle>
            <DialogDescription>
              {t('tasks.createTaskDescription', 'Create a new task and assign it to a contact.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Contact Selection with Search and Infinite Scroll */}
            <div>
              <Label htmlFor="contact">{t('tasks.contact', 'Contact')} *</Label>
              <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    {formData.contactId
                      ? (allContacts.find((c: Contact) => c.id === formData.contactId)?.name ||
                         contacts.find((c: Contact) => c.id === formData.contactId)?.name ||
                         t('tasks.selectContact', 'Select a contact'))
                      : t('tasks.selectContact', 'Select a contact')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <div className="flex flex-col max-h-96">
                    {/* Search Input */}
                    <div className="p-3 border-b sticky top-0 bg-background">
                      <Input
                        placeholder={t('tasks.searchContact', 'Search by name, phone, email...')}
                        value={contactSearchTerm}
                        onChange={(e) => {
                          setContactSearchTerm(e.target.value);
                          setContactPage(1);
                          setAllLoadedContacts([]);
                        }}
                        className="h-8"
                        autoFocus
                      />
                    </div>

                    {/* Contacts List with Infinite Scroll */}
                    <div
                      className="overflow-y-auto flex-1"
                      onScroll={(e) => {
                        const element = e.currentTarget;
                        if (
                          element.scrollHeight - element.scrollTop <= element.clientHeight + 50 &&
                          !isLoadingContacts &&
                          contactsData?.contacts?.length === 100
                        ) {
                          setContactPage(prev => prev + 1);
                        }
                      }}
                    >
                      {isLoadingContacts && contactPage === 1 ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : contacts.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                          {t('tasks.noContactsFound', 'No contacts found')}
                        </div>
                      ) : (
                        contacts.map((contact: Contact) => (
                          <div
                            key={contact.id}
                            onClick={() => {

                              if (!allContacts.some(c => c.id === contact.id)) {
                                setAllContacts(prev => [...prev, contact]);
                              }
                              setFormData({ ...formData, contactId: contact.id });
                              setContactPopoverOpen(false);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-accent border-b last:border-b-0 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            {contact.avatarUrl ? (
                              <img
                                src={contact.avatarUrl}
                                alt={contact.name}
                                className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
                                {contact.name?.charAt(0).toUpperCase() || '?'}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{contact.name}</div>
                              {contact.phone && (
                                <div className="text-xs text-muted-foreground truncate">{contact.phone}</div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      {isLoadingContacts && contactPage > 1 && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="title">{t('tasks.title', 'Title')} *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('tasks.titlePlaceholder', 'Enter task title')}
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">{t('tasks.description', 'Description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('tasks.descriptionPlaceholder', 'Enter task description')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Priority */}
              <div>
                <Label htmlFor="priority">{t('tasks.priority', 'Priority')}</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('tasks.priority.low', 'Low')}</SelectItem>
                    <SelectItem value="medium">{t('tasks.priority.medium', 'Medium')}</SelectItem>
                    <SelectItem value="high">{t('tasks.priority.high', 'High')}</SelectItem>
                    <SelectItem value="urgent">{t('tasks.priority.urgent', 'Urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div>
                <Label htmlFor="status">{t('tasks.status', 'Status')}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">{t('tasks.status.notStarted', 'Not Started')}</SelectItem>
                    <SelectItem value="in_progress">{t('tasks.status.inProgress', 'In Progress')}</SelectItem>
                    <SelectItem value="completed">{t('tasks.status.completed', 'Completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('tasks.status.cancelled', 'Cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Due Date */}
              <div>
                <Label htmlFor="dueDate">{t('tasks.dueDate', 'Due Date')} <span className="text-destructive">*</span></Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  required
                />
              </div>

              {/* Assigned To */}
              <div>
                <Label htmlFor="assignedTo">{t('tasks.assignedTo', 'Assigned To')}</Label>
                <Select
                  value={formData.assignedTo || 'unassigned'}
                  onValueChange={(value) => setFormData({ ...formData, assignedTo: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('tasks.selectAssignee', 'Select assignee')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t('tasks.unassigned', 'Unassigned')}</SelectItem>
                    {teamMembers.map((member: any) => (
                      <SelectItem key={member.id} value={member.email}>
                        {member.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">{t('tasks.category', 'Category')}</Label>
              {editingCategory ? (
                <div className="flex gap-2">
                  <Input
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                    placeholder={t('tasks.enterCategoryName', 'Enter category name')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUpdateCategory();
                      } else if (e.key === 'Escape') {
                        setEditingCategory(null);
                        setEditCategoryName('');
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleUpdateCategory}
                    disabled={updateCategoryMutation.isPending}
                  >
                    {updateCategoryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('common.save', 'Save')
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingCategory(null);
                      setEditCategoryName('');
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              ) : showNewCategoryInput ? (
                <div className="flex gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={t('tasks.enterCategoryName', 'Enter category name')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateCategory();
                      } else if (e.key === 'Escape') {
                        setShowNewCategoryInput(false);
                        setNewCategoryName('');
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateCategory}
                    disabled={createCategoryMutation.isPending}
                  >
                    {createCategoryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('common.add', 'Add')
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              ) : (
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {formData.category || t('tasks.selectCategory', 'Select category')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="flex flex-col">
                      <button
                        onClick={() => {
                          setFormData({ ...formData, category: '' });
                          setCategoryPopoverOpen(false);
                        }}
                        className="px-4 py-2 text-left hover:bg-accent text-sm"
                        type="button"
                      >
                        {t('tasks.noCategory', 'No Category')}
                      </button>
                      {categories.map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center justify-between px-4 py-2 hover:bg-accent group"
                        >
                          <button
                            onClick={() => {
                              setFormData({ ...formData, category: category.name });
                              setCategoryPopoverOpen(false);
                            }}
                            className="flex-1 text-left text-sm"
                            type="button"
                          >
                            {category.name}
                          </button>
                          <button
                            onClick={(e) => handleEditCategoryClick(category, e)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
                            type="button"
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setShowNewCategoryInput(true)}
                        className="px-4 py-2 text-left hover:bg-accent text-sm text-primary font-medium flex items-center gap-2"
                        type="button"
                      >
                        <FolderPlus className="h-4 w-4" />
                        {t('tasks.createNewCategory', 'Create New Category')}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Background Color */}
            <div>
              <Label htmlFor="backgroundColor">{t('tasks.backgroundColor', 'Background Color')}</Label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="color"
                  id="backgroundColor"
                  value={formData.backgroundColor}
                  onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                  className="w-12 h-10 rounded border border-input cursor-pointer"
                />
                <div className="flex-1">
                  <Input
                    value={formData.backgroundColor}
                    onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    placeholder="#ffffff"
                    className="font-mono text-sm"
                  />
                </div>
                <div 
                  className="w-10 h-10 rounded border border-input"
                  style={{ backgroundColor: formData.backgroundColor }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('tasks.backgroundColorHelp', 'Choose a background color for this task')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleCreateTask} disabled={createTaskMutation.isPending}>
              {createTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('tasks.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('tasks.editTask', 'Edit Task')}</DialogTitle>
            <DialogDescription>
              {t('tasks.editTaskDescription', 'Update task details.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Contact Selection (Read-only in edit mode) */}
            <div>
              <Label htmlFor="contact">{t('tasks.contact', 'Contact')}</Label>
              <Input
                value={selectedTask ? getContactName(selectedTask.contactId) : ''}
                disabled
                className="bg-muted/30"
              />
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="title">{t('tasks.title', 'Title')} *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('tasks.titlePlaceholder', 'Enter task title')}
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">{t('tasks.description', 'Description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('tasks.descriptionPlaceholder', 'Enter task description')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Priority */}
              <div>
                <Label htmlFor="priority">{t('tasks.priority', 'Priority')}</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('tasks.priority.low', 'Low')}</SelectItem>
                    <SelectItem value="medium">{t('tasks.priority.medium', 'Medium')}</SelectItem>
                    <SelectItem value="high">{t('tasks.priority.high', 'High')}</SelectItem>
                    <SelectItem value="urgent">{t('tasks.priority.urgent', 'Urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div>
                <Label htmlFor="status">{t('tasks.status', 'Status')}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">{t('tasks.status.notStarted', 'Not Started')}</SelectItem>
                    <SelectItem value="in_progress">{t('tasks.status.inProgress', 'In Progress')}</SelectItem>
                    <SelectItem value="completed">{t('tasks.status.completed', 'Completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('tasks.status.cancelled', 'Cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Due Date */}
              <div>
                <Label htmlFor="dueDate">{t('tasks.dueDate', 'Due Date')} <span className="text-destructive">*</span></Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  required
                />
              </div>

              {/* Assigned To */}
              <div>
                <Label htmlFor="assignedTo">{t('tasks.assignedTo', 'Assigned To')}</Label>
                <Select
                  value={formData.assignedTo || 'unassigned'}
                  onValueChange={(value) => setFormData({ ...formData, assignedTo: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('tasks.selectAssignee', 'Select assignee')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t('tasks.unassigned', 'Unassigned')}</SelectItem>
                    {teamMembers.map((member: any) => (
                      <SelectItem key={member.id} value={member.email}>
                        {member.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">{t('tasks.category', 'Category')}</Label>
              {editingCategory ? (
                <div className="flex gap-2">
                  <Input
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                    placeholder={t('tasks.enterCategoryName', 'Enter category name')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUpdateCategory();
                      } else if (e.key === 'Escape') {
                        setEditingCategory(null);
                        setEditCategoryName('');
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleUpdateCategory}
                    disabled={updateCategoryMutation.isPending}
                  >
                    {updateCategoryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('common.save', 'Save')
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingCategory(null);
                      setEditCategoryName('');
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              ) : showNewCategoryInput ? (
                <div className="flex gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={t('tasks.enterCategoryName', 'Enter category name')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateCategory();
                      } else if (e.key === 'Escape') {
                        setShowNewCategoryInput(false);
                        setNewCategoryName('');
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateCategory}
                    disabled={createCategoryMutation.isPending}
                  >
                    {createCategoryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('common.add', 'Add')
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              ) : (
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {formData.category || t('tasks.selectCategory', 'Select category')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="flex flex-col">
                      <button
                        onClick={() => {
                          setFormData({ ...formData, category: '' });
                          setCategoryPopoverOpen(false);
                        }}
                        className="px-4 py-2 text-left hover:bg-accent text-sm"
                        type="button"
                      >
                        {t('tasks.noCategory', 'No Category')}
                      </button>
                      {categories.map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center justify-between px-4 py-2 hover:bg-accent group"
                        >
                          <button
                            onClick={() => {
                              setFormData({ ...formData, category: category.name });
                              setCategoryPopoverOpen(false);
                            }}
                            className="flex-1 text-left text-sm"
                            type="button"
                          >
                            {category.name}
                          </button>
                          <button
                            onClick={(e) => handleEditCategoryClick(category, e)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
                            type="button"
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setShowNewCategoryInput(true)}
                        className="px-4 py-2 text-left hover:bg-accent text-sm text-primary font-medium flex items-center gap-2"
                        type="button"
                      >
                        <FolderPlus className="h-4 w-4" />
                        {t('tasks.createNewCategory', 'Create New Category')}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Background Color */}
            <div>
              <Label htmlFor="editBackgroundColor">{t('tasks.backgroundColor', 'Background Color')}</Label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="color"
                  id="editBackgroundColor"
                  value={formData.backgroundColor}
                  onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                  className="w-12 h-10 rounded border border-input cursor-pointer"
                />
                <div className="flex-1">
                  <Input
                    value={formData.backgroundColor}
                    onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    placeholder="#ffffff"
                    className="font-mono text-sm"
                  />
                </div>
                <div 
                  className="w-10 h-10 rounded border border-input"
                  style={{ backgroundColor: formData.backgroundColor }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('tasks.backgroundColorHelp', 'Choose a background color for this task')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleEditTask} disabled={updateTaskMutation.isPending}>
              {updateTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('tasks.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tasks.deleteTask', 'Delete Task')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('tasks.deleteTaskConfirmation', 'Are you sure you want to delete this task? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteTaskMutation.isPending}
            >
              {deleteTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Details Dialog */}
      <Dialog open={showTaskDetailsDialog} onOpenChange={setShowTaskDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              {selectedTask?.title}
            </DialogTitle>
            <DialogDescription>
              {t('tasks.taskDetails', 'View task details and information')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-6">
              {/* Task Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('tasks.status', 'Status')}</Label>
                  <div className="mt-1">
                    <Badge className={`${getStatusColor(selectedTask.status)} text-xs`}>
                      {getStatusLabel(selectedTask.status)}
                    </Badge>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('tasks.priority', 'Priority')}</Label>
                  <div className="mt-1">
                    <Badge className={`${getPriorityColor(selectedTask.priority)} text-xs`}>
                      <Flag className="h-3 w-3 mr-1" />
                      {getPriorityLabel(selectedTask.priority)}
                    </Badge>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('tasks.assignedTo', 'Assigned To')}</Label>
                  <div className="mt-1 text-sm text-foreground">
                    {selectedTask.assignedTo || t('tasks.unassigned', 'Unassigned')}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('tasks.dueDate', 'Due Date')}</Label>
                  <div className="mt-1 text-sm text-foreground">
                    {selectedTask.dueDate ? format(parseISO(selectedTask.dueDate), 'MMM dd, yyyy') : t('tasks.noDueDate', 'No due date')}
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('tasks.description', 'Description')}</Label>
                  <div className="mt-1 p-3 bg-muted/30 rounded-md">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTask.description}</p>
                  </div>
                </div>
              )}

              {/* Contact Information */}
              <div>
                <Label className="text-sm font-medium text-foreground">{t('tasks.contact', 'Contact')}</Label>
                <div className="mt-1">
                  {(() => {
                    const contact = displayContacts.find((c: Contact) => c.id === selectedTask.contactId);
                    return (
                      <button
                        onClick={() => setLocation(`/contacts?id=${selectedTask.contactId}`)}
                        className="flex items-center gap-2 text-primary hover:text-primary/90 hover:underline"
                      >
                        {contact?.avatarUrl ? (
                          <img
                            src={contact.avatarUrl}
                            alt={contact.name}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                            {contact?.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                        <span className="text-sm">{getContactName(selectedTask.contactId)}</span>
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* Category and Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedTask.category && (
                  <div>
                    <Label className="text-sm font-medium text-foreground">{t('tasks.category', 'Category')}</Label>
                    <div className="mt-1">
                      <Badge variant="outline" className="text-xs">
                        {selectedTask.category}
                      </Badge>
                    </div>
                  </div>
                )}
                
                {selectedTask.tags && selectedTask.tags.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium text-foreground">{t('tasks.tags', 'Tags')}</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedTask.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('tasks.createdAt', 'Created')}</Label>
                  <div className="mt-1">
                    {format(parseISO(selectedTask.createdAt), 'MMM dd, yyyy HH:mm')}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-foreground">{t('tasks.updatedAt', 'Last Updated')}</Label>
                  <div className="mt-1">
                    {format(parseISO(selectedTask.updatedAt), 'MMM dd, yyyy HH:mm')}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDetailsDialog(false)}>
              {t('common.close', 'Close')}
            </Button>
            {canManageTasks && (
              <Button onClick={() => {
                setShowTaskDetailsDialog(false);
                openEditModal(selectedTask!);
              }}>
                <Edit className="h-4 w-4 mr-2" />
                {t('common.edit', 'Edit')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

