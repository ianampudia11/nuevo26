import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal, UserX, UserMinus, Mail, AlertTriangle, Loader2, Edit } from "lucide-react";
import { InviteTeamMemberModal } from './InviteTeamMemberModal';
import { EditTeamMemberModal } from './EditTeamMemberModal';

interface User {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  permissions?: Record<string, boolean>;
}

interface TeamInvitation {
  id: number;
  email: string;
  role: string;
  status: string;
  token: string;
  createdAt: string;
  updatedAt: string;
}

interface TeamMembersListProps {
  maxUsers?: number;
}

export function TeamMembersList({ maxUsers }: TeamMembersListProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [selectedInvitationId, setSelectedInvitationId] = useState<number | null>(null);
  const [selectedTeamMember, setSelectedTeamMember] = useState<User | null>(null);
  const [selectedMemberToDelete, setSelectedMemberToDelete] = useState<User | null>(null);
  const [deleteType, setDeleteType] = useState<'invitation' | 'member'>('invitation');
  const { toast } = useToast();

  const { 
    data: teamMembers = [], 
    isLoading: isLoadingMembers 
  } = useQuery<User[]>({
    queryKey: ['/api/team/members'],
    refetchOnWindowFocus: false
  });
  
  const { 
    data: teamInvitations = [], 
    isLoading: isLoadingInvitations 
  } = useQuery<TeamInvitation[]>({
    queryKey: ['/api/team/invitations'],
    refetchOnWindowFocus: false
  });
  
  const { data: currentUser } = useQuery<User>({
    queryKey: ['/api/user'],
    refetchOnWindowFocus: false
  });
  
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      const res = await apiRequest('DELETE', `/api/team/invitations/${invitationId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Invitation Canceled',
        description: 'The team invitation has been canceled',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/team/invitations'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to cancel invitation: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      const res = await apiRequest('POST', `/api/team/invitations/${invitationId}/resend`);
      return await res.json();
    },
    onSuccess: (_, invitationId) => {
      const invitation = teamInvitations.find(inv => inv.id === invitationId);
      toast({
        title: 'Invitation Resent',
        description: invitation ? `Invitation has been resent to ${invitation.email}` : 'Invitation has been resent',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to resend invitation: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const deleteTeamMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const res = await apiRequest('DELETE', `/api/team/members/${memberId}`);
      return await res.json();
    },
    onSuccess: (_, memberId) => {
      const member = teamMembers.find(m => m.id === memberId);
      toast({
        title: 'Team Member Removed',
        description: member ? `${member.fullName} has been removed from your team` : 'Team member has been removed',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to remove team member: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  const handleDeleteInvitationClick = (invitationId: number) => {
    setSelectedInvitationId(invitationId);
    setDeleteType('invitation');
    setShowDeleteAlert(true);
  };

  const handleDeleteMemberClick = (member: User) => {
    setSelectedMemberToDelete(member);
    setDeleteType('member');
    setShowDeleteAlert(true);
  };

  const handleConfirmDelete = () => {
    if (deleteType === 'invitation' && selectedInvitationId) {
      cancelInvitationMutation.mutate(selectedInvitationId);
      setShowDeleteAlert(false);
      setSelectedInvitationId(null);
    } else if (deleteType === 'member' && selectedMemberToDelete) {
      deleteTeamMemberMutation.mutate(selectedMemberToDelete.id);
      setShowDeleteAlert(false);
      setSelectedMemberToDelete(null);
    }
  };
  
  const handleResendInvitation = (invitationId: number) => {
    resendInvitationMutation.mutate(invitationId);
  };

  const handleEditTeamMember = (member: User) => {
    setSelectedTeamMember(member);
    setShowEditModal(true);
  };
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  const getAvatarColorClass = (id: number) => {
    const colors = [
      'bg-primary-100 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
      'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
      'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
      'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
      'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
      'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400'
    ];
    return colors[id % colors.length];
  };
  
  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">
            Members ({teamMembers.length}{maxUsers !== undefined ? `/${maxUsers}` : ''})
          </h3>
          <Button className='btn-brand-primary' onClick={() => setShowInviteModal(true)}>
            <i className="ri-user-add-line mr-1  "></i> Add Team Member
          </Button>
        </div>
        
        {isLoadingMembers || isLoadingInvitations ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {teamMembers.map(member => (
                  <tr key={`member-${member.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 rounded-full ${getAvatarColorClass(member.id)} flex items-center justify-center text-sm font-medium`}>
                          {member.avatarUrl ? (
                            <img 
                              src={member.avatarUrl} 
                              alt={member.fullName} 
                              className="h-10 w-10 rounded-full" 
                            />
                          ) : (
                            getInitials(member.fullName)
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-foreground">
                            {member.fullName}
                          </div>
                          {currentUser?.id === member.id && (
                            <div className="text-xs text-muted-foreground">
                              You
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {member.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={member.role === 'admin' ? 'secondary' : 'default'} className="capitalize !bg-muted !text-muted-foreground">
                        {member.role === 'admin' ? 'Administrator' : 'Agent'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {currentUser?.id !== member.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditTeamMember(member)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Member
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteMemberClick(member)}>
                              <UserX className="h-4 w-4 mr-2 text-destructive" />
                              <span className="text-destructive">Remove Member</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
                
                {teamInvitations.filter(inv => inv.status === 'pending').map(invitation => (
                  <tr key={`invite-${invitation.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                          <i className="ri-user-line text-lg"></i>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-foreground">
                            Pending Invitation
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {invitation.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={invitation.role === 'admin' ? 'secondary' : 'default'} className="capitalize !bg-muted !text-muted-foreground">
                        {invitation.role === 'admin' ? 'Administrator' : 'Agent'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400">
                        Invited
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleResendInvitation(invitation.id)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Resend Invitation
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteInvitationClick(invitation.id)}>
                            <UserMinus className="h-4 w-4 mr-2 text-destructive" />
                            <span className="text-destructive">Cancel Invitation</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                
                {teamMembers.length === 0 && teamInvitations.filter(inv => inv.status === 'pending').length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      No team members found. Invite members to join your team.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      <InviteTeamMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />

      <EditTeamMemberModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedTeamMember(null);
        }}
        teamMember={selectedTeamMember}
      />
      
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <div className="flex items-center text-destructive">
                <AlertTriangle className="h-5 w-5 mr-2" />
                {deleteType === 'member' ? 'Remove Team Member' : 'Cancel Invitation'}
              </div>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === 'member' && selectedMemberToDelete ? (
                <>Are you sure you want to remove <strong>{selectedMemberToDelete.fullName}</strong> from your team? This action cannot be undone.</>
              ) : (
                'Are you sure you want to cancel this invitation? This action cannot be undone.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {(deleteType === 'member' ? deleteTeamMemberMutation.isPending : cancelInvitationMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {deleteType === 'member' ? 'Remove Member' : 'Cancel Invitation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}