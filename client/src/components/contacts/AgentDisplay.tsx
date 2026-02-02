import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserX } from 'lucide-react';

interface Agent {
  id: number;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  username: string;
}

interface AgentDisplayProps {
  assignedAgent: Agent | null;
  isLoading?: boolean;
  conversationId?: number;
  assignedAt?: string;
  variant?: 'full' | 'compact';
}

export default function AgentDisplay({
  assignedAgent,
  isLoading = false,
  conversationId,
  assignedAt,
  variant = 'full'
}: AgentDisplayProps) {
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-400';
      case 'agent':
        return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400';
      case 'manager':
        return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-3 p-4 bg-muted rounded-lg">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading agent information...</span>
      </div>
    );
  }

  if (!assignedAgent) {
    return (
      <div className="flex items-center space-x-3 p-4 bg-muted rounded-lg">
        <div className="flex items-center justify-center w-10 h-10 bg-muted rounded-full">
          <UserX className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">No agent assigned</p>
          <p className="text-xs text-muted-foreground">This contact has not been assigned to any agent yet</p>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center space-x-2">
        <Avatar className="w-6 h-6">
          <AvatarImage src={assignedAgent.avatarUrl} />
          <AvatarFallback className="text-xs">
            {getInitials(assignedAgent.fullName)}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium text-foreground">{assignedAgent.fullName}</span>
        <Badge variant="secondary" className={`text-xs ${getRoleBadgeColor(assignedAgent.role)}`}>
          {assignedAgent.role}
        </Badge>
      </div>
    );
  }

  return (
    <div className="p-4 bg-card border border-border rounded-lg">
      <div className="flex items-start space-x-3">
        <Avatar className="w-12 h-12">
          <AvatarImage src={assignedAgent.avatarUrl} />
          <AvatarFallback className="text-sm font-medium">
            {getInitials(assignedAgent.fullName)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className="text-sm font-semibold text-foreground truncate">
              {assignedAgent.fullName}
            </h4>
            <Badge variant="secondary" className={`text-xs ${getRoleBadgeColor(assignedAgent.role)}`}>
              {assignedAgent.role}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground mb-2">{assignedAgent.email}</p>
          
          {assignedAt && (
            <div className="text-xs text-muted-foreground">
              <span>Assigned on {formatDate(assignedAt)}</span>
              {conversationId && (
                <span className="ml-2">• Conversation #{conversationId}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
