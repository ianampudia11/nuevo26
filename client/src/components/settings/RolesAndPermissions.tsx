import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Checkbox
} from "@/components/ui/checkbox";
import {
  Label
} from "@/components/ui/label";
import {
  Input
} from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, CheckCircle2, XCircle, Save, Loader2 } from "lucide-react";

interface RolePermission {
  id: number;
  companyId: number;
  role: 'admin' | 'agent';
  permissions: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}


const PERMISSION_GROUPS = {
  conversations: {
    title: 'Conversation Management',
    permissions: {
      view_all_conversations: 'View All Conversations',
      view_assigned_conversations: 'View Assigned Conversations',
      assign_conversations: 'Assign Conversations',
      manage_conversations: 'Manage Conversations'
    }
  },
  contacts: {
    title: 'Contact Management',
    permissions: {
      view_own_contacts: 'View Own Contacts',
      view_assigned_contacts: 'View Assigned Contacts',
      view_company_contacts: 'View Company Contacts',
      manage_contacts: 'Manage Contacts',
      view_contact_phone: 'View Contact Phone'
    }
  },
  campaigns: {
    title: 'Campaign Management',
    permissions: {
      view_campaigns: 'View Campaigns',
      create_campaigns: 'Create Campaigns',
      edit_campaigns: 'Edit Campaigns',
      delete_campaigns: 'Delete Campaigns',
      manage_templates: 'Manage Templates',
      manage_segments: 'Manage Segments',
      view_campaign_analytics: 'View Campaign Analytics',
      manage_whatsapp_accounts: 'Manage WhatsApp Accounts'
    }
  },
  pipeline: {
    title: 'Pipeline Management',
    permissions: {
      view_pipeline: 'View Pipeline',
      manage_pipeline: 'Manage Pipeline',
      create_deals: 'Create Deals',
      edit_deals: 'Edit Deals',
      delete_deals: 'Delete Deals',
      manage_pipeline_stages: 'Manage Pipeline Stages'
    }
  },
  channels: {
    title: 'Channel Management',
    permissions: {
      view_channels: 'View Channels',
      manage_channels: 'Manage Channels',
      configure_channels: 'Configure Channels'
    }
  },
  flows: {
    title: 'Flow Management',
    permissions: {
      view_flows: 'View Flows',
      manage_flows: 'Manage Flows'
    }
  },
  analytics: {
    title: 'Analytics',
    permissions: {
      view_analytics: 'View Analytics',
      view_detailed_analytics: 'View Detailed Analytics'
    }
  },
  team: {
    title: 'Team Management',
    permissions: {
      view_team: 'View Team',
      manage_team: 'Manage Team'
    }
  },
  settings: {
    title: 'Settings',
    permissions: {
      view_settings: 'View Settings',
      manage_settings: 'Manage Settings'
    }
  },
  calendar: {
    title: 'Calendar',
    permissions: {
      view_calendar: 'View Calendar',
      manage_calendar: 'Manage Calendar'
    }
  },
  tasks: {
    title: 'Task Management',
    permissions: {
      view_tasks: 'View Tasks',
      manage_tasks: 'Manage Tasks'
    }
  },
  pages: {
    title: 'Page Management',
    permissions: {
      view_pages: 'View Pages',
      manage_pages: 'Manage Pages'
    }
  },
  call_logs: {
    title: 'Call Logs Management',
    permissions: {
      view_call_logs: 'View Call Logs',
      manage_call_logs: 'Manage Call Logs',
      export_call_logs: 'Export Call Logs',
      delete_call_logs: 'Delete Call Logs'
    }
  }
};

export function RolesAndPermissions() {

  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [currentRole, setCurrentRole] = useState<'admin' | 'agent' | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const { t } = useTranslation();


  const getPermissionGroups = () => ({
    conversations: {
      title: t('roles.conversation_management', 'Conversation Management'),
      permissions: {
        view_all_conversations: t('roles.view_all_conversations', 'View All Conversations'),
        view_assigned_conversations: t('roles.view_assigned_conversations', 'View Assigned Conversations'),
        assign_conversations: t('roles.assign_conversations', 'Assign Conversations'),
        manage_conversations: t('roles.manage_conversations', 'Manage Conversations')
      }
    },
    contacts: {
      title: t('roles.contact_management', 'Contact Management'),
      permissions: {
        view_own_contacts: t('roles.view_own_contacts', 'View Own Contacts'),
        view_assigned_contacts: t('roles.view_assigned_contacts', 'View Assigned Contacts'),
        view_company_contacts: t('roles.view_company_contacts', 'View Company Contacts'),
        manage_contacts: t('roles.manage_contacts', 'Manage Contacts'),
        view_contact_phone: t('roles.view_contact_phone', 'View Contact Phone')
      }
    },
    campaigns: {
      title: t('roles.campaign_management', 'Campaign Management'),
      permissions: {
        view_campaigns: t('roles.view_campaigns', 'View Campaigns'),
        create_campaigns: t('roles.create_campaigns', 'Create Campaigns'),
        edit_campaigns: t('roles.edit_campaigns', 'Edit Campaigns'),
        delete_campaigns: t('roles.delete_campaigns', 'Delete Campaigns'),
        manage_templates: t('roles.manage_templates', 'Manage Templates'),
        manage_segments: t('roles.manage_segments', 'Manage Segments'),
        view_campaign_analytics: t('roles.view_campaign_analytics', 'View Campaign Analytics'),
        manage_whatsapp_accounts: t('roles.manage_whatsapp_accounts', 'Manage WhatsApp Accounts')
      }
    },
    pipeline: {
      title: t('roles.pipeline_management', 'Pipeline Management'),
      permissions: {
        view_pipeline: t('roles.view_pipeline', 'View Pipeline'),
        manage_pipeline: t('roles.manage_pipeline', 'Manage Pipeline'),
        create_deals: t('roles.create_deals', 'Create Deals'),
        edit_deals: t('roles.edit_deals', 'Edit Deals'),
        delete_deals: t('roles.delete_deals', 'Delete Deals'),
        manage_pipeline_stages: t('roles.manage_pipeline_stages', 'Manage Pipeline Stages')
      }
    },
    channels: {
      title: t('roles.channel_management', 'Channel Management'),
      permissions: {
        view_channels: t('roles.view_channels', 'View Channels'),
        manage_channels: t('roles.manage_channels', 'Manage Channels'),
        configure_channels: t('roles.configure_channels', 'Configure Channels')
      }
    },
    flows: {
      title: t('roles.flow_management', 'Flow Management'),
      permissions: {
        view_flows: t('roles.view_flows', 'View Flows'),
        manage_flows: t('roles.manage_flows', 'Manage Flows')
      }
    },
    analytics: {
      title: t('roles.analytics', 'Analytics'),
      permissions: {
        view_analytics: t('roles.view_analytics', 'View Analytics'),
        view_detailed_analytics: t('roles.view_detailed_analytics', 'View Detailed Analytics')
      }
    },
    team: {
      title: t('roles.team_management', 'Team Management'),
      permissions: {
        view_team: t('roles.view_team', 'View Team'),
        manage_team: t('roles.manage_team', 'Manage Team')
      }
    },
    settings: {
      title: t('roles.settings', 'Settings'),
      permissions: {
        view_settings: t('roles.view_settings', 'View Settings'),
        manage_settings: t('roles.manage_settings', 'Manage Settings')
      }
    },
    calendar: {
      title: t('roles.calendar', 'Calendar'),
      permissions: {
        view_calendar: t('roles.view_calendar', 'View Calendar'),
        manage_calendar: t('roles.manage_calendar', 'Manage Calendar')
      }
    },
    tasks: {
      title: t('roles.task_management', 'Task Management'),
      permissions: {
        view_tasks: t('roles.view_tasks', 'View Tasks'),
        manage_tasks: t('roles.manage_tasks', 'Manage Tasks')
      }
    },
    pages: {
      title: t('roles.page_management', 'Page Management'),
      permissions: {
        view_pages: t('roles.view_pages', 'View Pages'),
        manage_pages: t('roles.manage_pages', 'Manage Pages')
      }
    },
    call_logs: {
      title: t('roles.call_logs_management', 'Call Logs Management'),
      permissions: {
        view_call_logs: t('roles.view_call_logs', 'View Call Logs'),
        manage_call_logs: t('roles.manage_call_logs', 'Manage Call Logs'),
        export_call_logs: t('roles.export_call_logs', 'Export Call Logs'),
        delete_call_logs: t('roles.delete_call_logs', 'Delete Call Logs')
      }
    }
  });

  const { data: rolePermissions = [], isLoading, refetch } = useQuery<RolePermission[]>({
    queryKey: ['/api/role-permissions'],
    refetchOnWindowFocus: false
  });


  const updateRolePermissionsMutation = useMutation({
    mutationFn: async (data: { role: 'admin' | 'agent'; permissions: Record<string, boolean> }) => {
      const res = await apiRequest('PUT', `/api/role-permissions/${data.role}`, {
        permissions: data.permissions
      });
      return await res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: t('roles.permissions_updated', 'Permissions Updated'),
        description: variables.role === 'admin'
          ? t('roles.admin_permissions_updated', 'Administrator permissions have been updated successfully.')
          : t('roles.agent_permissions_updated', 'Agent permissions have been updated successfully.'),
      });
      setShowEditRoleModal(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['userPermissions'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: t('roles.update_failed', 'Failed to update permissions: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const handleEditRole = (role: 'admin' | 'agent') => {
    const roleData = rolePermissions.find(rp => rp.role === role);
    setCurrentRole(role);
    setEditingPermissions(roleData?.permissions || {});
    setShowEditRoleModal(true);
  };

  const handleSavePermissions = () => {
    if (!currentRole) return;

    updateRolePermissionsMutation.mutate({
      role: currentRole,
      permissions: editingPermissions
    });
  };

  const togglePermission = (permission: string, value: boolean) => {
    setEditingPermissions(prev => ({
      ...prev,
      [permission]: value
    }));
  };

  const getRoleData = (role: 'admin' | 'agent') => {
    return rolePermissions.find(rp => rp.role === role);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          {t('roles.roles_permissions', 'Roles & Permissions')}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Administrator Role */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-lg">{t('roles.administrator', 'Administrator')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('roles.administrator_desc', 'Full access to all features and settings')}</p>
              </div>
              <Button variant="outline" onClick={() => handleEditRole('admin')}>
                {t('roles.edit_permissions', 'Edit Permissions')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {Object.entries(getPermissionGroups()).map(([groupKey, group]) => {
                const adminData = getRoleData('admin');
                const hasAnyPermission = Object.keys(group.permissions).some(
                  permission => adminData?.permissions[permission]
                );

                return (
                  <div
                    key={`admin-${groupKey}`}
                    className={`flex items-center p-3 rounded-md border ${hasAnyPermission ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}
                  >
                    {hasAnyPermission ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mr-2" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2" />
                    )}
                    <span className={`text-sm ${hasAnyPermission ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'}`}>
                      {group.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Agent Role */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-lg">{t('roles.agent', 'Agent')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('roles.agent_desc', 'Limited access to core features')}</p>
              </div>
              <Button variant="outline" onClick={() => handleEditRole('agent')}>
                {t('roles.edit_permissions', 'Edit Permissions')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {Object.entries(getPermissionGroups()).map(([groupKey, group]) => {
                const agentData = getRoleData('agent');
                const hasAnyPermission = Object.keys(group.permissions).some(
                  permission => agentData?.permissions[permission]
                );

                return (
                  <div
                    key={`agent-${groupKey}`}
                    className={`flex items-center p-3 rounded-md border ${hasAnyPermission ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}
                  >
                    {hasAnyPermission ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mr-2" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2" />
                    )}
                    <span className={`text-sm ${hasAnyPermission ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'}`}>
                      {group.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showEditRoleModal} onOpenChange={setShowEditRoleModal}>
        <DialogContent className="sm:max-w-[900px] lg:max-w-[1000px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {currentRole === 'admin'
                ? t('roles.edit_admin_permissions', 'Edit Administrator Permissions')
                : t('roles.edit_agent_permissions', 'Edit Agent Permissions')
              }
            </DialogTitle>
            <DialogDescription>
              {currentRole === 'admin'
                ? t('roles.configure_admin_permissions', 'Configure permissions for the Administrator role. Changes will apply to all users with this role.')
                : t('roles.configure_agent_permissions', 'Configure permissions for the Agent role. Changes will apply to all users with this role.')
              }
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Tabs defaultValue={Object.keys(getPermissionGroups())[0]} className="w-full">
              <div className="space-y-2">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1 h-auto">
                  {Object.entries(getPermissionGroups()).slice(0, 5).map(([groupKey, group]) => (
                    <TabsTrigger key={groupKey} value={groupKey} className="text-xs sm:text-sm px-2 sm:px-3 py-2 whitespace-nowrap">
                      {group.title.split(' ')[0]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1 h-auto">
                  {Object.entries(getPermissionGroups()).slice(5).map(([groupKey, group]) => (
                    <TabsTrigger key={groupKey} value={groupKey} className="text-xs sm:text-sm px-2 sm:px-3 py-2 whitespace-nowrap">
                      {group.title.split(' ')[0]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {Object.entries(getPermissionGroups()).map(([groupKey, group]) => (
                <TabsContent key={groupKey} value={groupKey} className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{group.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(group.permissions).map(([permission, label]) => (
                          <div key={permission} className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-${permission}`}
                              checked={editingPermissions[permission] || false}
                              onCheckedChange={(checked) => togglePermission(permission, !!checked)}
                            />
                            <Label
                              htmlFor={`edit-${permission}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowEditRoleModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={updateRolePermissionsMutation.isPending}
              className="btn-brand-primary"
            >
              {updateRolePermissionsMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Save className="mr-2 h-4 w-4" />
              {t('roles.save_permissions', 'Save Permissions')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}