import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, UserMinus, UserPlus, Users } from 'lucide-react';
import React, { useState } from 'react';

interface Agent {
  id: number;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  username: string;
}

interface AgentAssignmentProps {
  conversationId: number;
  currentAssignedUserId?: number | null;
  onAssignmentChange?: (agentId: number | null) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'button' | 'badge' | 'compact';
}

export default function AgentAssignment({
  conversationId,
  currentAssignedUserId,
  onAssignmentChange,
  variant = 'button'
}: AgentAssignmentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { canAssignConversations } = usePermissions();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading: isLoadingAgents, error: agentsError } = useQuery<Agent[]>({
    queryKey: ['/api/agents'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/agents');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(t('agents.fetch_failed', `Failed to fetch agents: ${response.status} ${errorText}`));
      }
      const data = await response.json();
      return data;
    },
    retry: 1,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const assignMutation = useMutation({
    mutationFn: async (agentId: number | null) => {
      if (agentId) {
        const response = await apiRequest('POST', `/api/conversations/${conversationId}/assign`, {
          agentId
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || t('agents.assign_failed', 'Failed to assign conversation'));
        }
        return response.json();
      } else {
        const response = await apiRequest('DELETE', `/api/conversations/${conversationId}/assign`);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || t('agents.unassign_failed', 'Failed to unassign conversation'));
        }
        return response.json();
      }
    },
    onSuccess: (_, agentId) => {
      const agentName = agentId ? agents.find(a => a.id === agentId)?.fullName : null;

      toast({
        title: agentId ? t('agents.assigned_title', 'Conversation Assigned') : t('agents.unassigned_title', 'Conversation Unassigned'),
        description: agentId
          ? t('agents.assigned_description', `Conversation assigned to ${agentName}`, { agentName })
          : t('agents.unassigned_description', 'Conversation has been unassigned'),
      });

      onAssignmentChange?.(agentId);

      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });

      setIsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: t('agents.assignment_failed_title', 'Assignment Failed'),
        description: error.message || t('agents.assignment_failed_description', 'Failed to update assignment'),
        variant: 'destructive',
      });
    }
  });

  if (!canAssignConversations()) {
    return null;
  }

  const assignedAgent = agents.find(agent => agent.id === currentAssignedUserId);

  const handleAssign = (agentId: number | null) => {
    assignMutation.mutate(agentId);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (variant === 'badge') {
    if (assignedAgent) {
      return (
        <div className="agent-assignment-dropdown">
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent cursor-pointer transition-colors"
            >
              <Avatar className="w-4 h-4 mr-1">
                <AvatarImage src={assignedAgent.avatarUrl} />
                <AvatarFallback className="text-xs">
                  {getInitials(assignedAgent.fullName)}
                </AvatarFallback>
              </Avatar>
              {assignedAgent.fullName}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t('agents.reassign_conversation', 'Reassign Conversation')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isLoadingAgents ? (
              <DropdownMenuItem disabled>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('agents.loading_agents', 'Loading agents...')}
              </DropdownMenuItem>
            ) : agentsError ? (
              <DropdownMenuItem disabled>
                <Users className="w-4 h-4 mr-2" />
                {t('agents.error_loading_agents', 'Error loading agents')}
              </DropdownMenuItem>
            ) : agents.length === 0 ? (
              <DropdownMenuItem disabled>
                <Users className="w-4 h-4 mr-2" />
                {t('agents.no_agents_available', 'No agents available')}
              </DropdownMenuItem>
            ) : (
              <>
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => handleAssign(agent.id)}
                    disabled={assignMutation.isPending}
                    className="flex items-center"
                  >
                    <Avatar className="w-6 h-6 mr-2">
                      <AvatarImage src={agent.avatarUrl} />
                      <AvatarFallback className="text-xs">
                        {getInitials(agent.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-medium">{agent.fullName}</div>
                      <div className="text-xs text-gray-500">{agent.role}</div>
                    </div>
                    {agent.id === currentAssignedUserId && (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleAssign(null)}
                  disabled={assignMutation.isPending}
                  className="text-red-600"
                >
                  <UserMinus className="w-4 h-4 mr-2" />
                  {t('agents.unassign', 'Unassign')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    } else {
      return (
        <div className="agent-assignment-dropdown">
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-border bg-background text-foreground hover:bg-accent cursor-pointer transition-colors"
            >
              <UserPlus className="w-3 h-3 mr-1" />
              {t('agents.unassigned', 'Unassigned')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t('agents.assign_conversation', 'Assign Conversation')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isLoadingAgents ? (
              <DropdownMenuItem disabled>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('agents.loading_agents', 'Loading agents...')}
              </DropdownMenuItem>
            ) : agentsError ? (
              <DropdownMenuItem disabled>
                <Users className="w-4 h-4 mr-2" />
                {t('agents.error_loading_agents', 'Error loading agents')}
              </DropdownMenuItem>
            ) : agents.length === 0 ? (
              <DropdownMenuItem disabled>
                <Users className="w-4 h-4 mr-2" />
                {t('agents.no_agents_available', 'No agents available')}
              </DropdownMenuItem>
            ) : (
              agents.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => handleAssign(agent.id)}
                  disabled={assignMutation.isPending}
                  className="flex items-center"
                >
                  <Avatar className="w-6 h-6 mr-2">
                    <AvatarImage src={agent.avatarUrl} />
                    <AvatarFallback className="text-xs">
                      {getInitials(agent.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-medium">{agent.fullName}</div>
                    <div className="text-xs text-gray-500">{agent.role}</div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
  }

  return (
    <div className="agent-assignment-dropdown">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={assignedAgent ? "secondary" : "outline"}
          disabled={assignMutation.isPending}
          className="flex items-center gap-2"
        >
          {assignMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : assignedAgent ? (
            <>
              <Avatar className="w-5 h-5">
                <AvatarImage src={assignedAgent.avatarUrl} />
                <AvatarFallback className="text-xs">
                  {getInitials(assignedAgent.fullName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline">{assignedAgent.fullName}</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('agents.assign', 'Assign')}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {assignedAgent ? t('agents.reassign_conversation', 'Reassign Conversation') : t('agents.assign_conversation', 'Assign Conversation')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoadingAgents ? (
          <DropdownMenuItem disabled>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t('agents.loading_agents', 'Loading agents...')}
          </DropdownMenuItem>
        ) : agentsError ? (
          <DropdownMenuItem disabled>
            <Users className="w-4 h-4 mr-2" />
            {t('agents.error_loading_agents', 'Error loading agents')}
          </DropdownMenuItem>
        ) : agents.length === 0 ? (
          <DropdownMenuItem disabled>
            <Users className="w-4 h-4 mr-2" />
            {t('agents.no_agents_available', 'No agents available')}
          </DropdownMenuItem>
        ) : (
          <>
            {agents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                onClick={() => handleAssign(agent.id)}
                disabled={assignMutation.isPending}
                className="flex items-center"
              >
                <Avatar className="w-6 h-6 mr-2">
                  <AvatarImage src={agent.avatarUrl} />
                  <AvatarFallback className="text-xs">
                    {getInitials(agent.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-medium">{agent.fullName}</div>
                  <div className="text-xs text-gray-500">{agent.role}</div>
                </div>
                {agent.id === currentAssignedUserId && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
              </DropdownMenuItem>
            ))}
            {assignedAgent && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleAssign(null)}
                  disabled={assignMutation.isPending}
                  className="text-red-600"
                >
                  <UserMinus className="w-4 h-4 mr-2" />
                  {t('agents.unassign', 'Unassign')}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
