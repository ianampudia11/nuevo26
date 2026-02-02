import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useGroupProfilePicture } from "@/hooks/use-group-profile-picture";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn, getInitials } from "@/lib/utils";

interface GroupAvatarProps {
  groupName: string;
  groupJid?: string;
  connectionId?: number;
  conversationId?: number;
  size?: "sm" | "md" | "lg";
  showRefreshButton?: boolean;
  className?: string;
  groupAvatarUrl?: string | null;
  groupMetadata?: any;
}

export function GroupAvatar({
  groupName,
  groupJid,
  connectionId,
  conversationId,
  size = "md",
  showRefreshButton = false,
  className,
  groupAvatarUrl,
  groupMetadata
}: GroupAvatarProps) {
  const { updateGroupProfilePicture, isUpdating } = useGroupProfilePicture();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);


  const avatarUrl = groupAvatarUrl || groupMetadata?.profilePictureUrl;
  
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-lg"
  };

  const iconSizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-8 w-8"
  };

  const refreshButtonSizeClasses = {
    sm: "h-5 w-5",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  };

  const refreshIconSizeClasses = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-4 w-4"
  };
  
  const handleRefreshGroupPicture = () => {
    if (!connectionId || !conversationId || isUpdating) return;

    updateGroupProfilePicture({
      conversationId: conversationId,
      connectionId: connectionId
    });
  };
  
  return (
    <div
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Avatar className={cn(sizeClasses[size], className)}>
        <AvatarImage 
          src={avatarUrl || ""} 
          alt={groupName}
          onError={(e) => {
            if (avatarUrl) {
              console.warn(`Failed to load group avatar:`, avatarUrl);
            }
          }}
        />
        <AvatarFallback className="bg-blue-100 text-blue-700">
          {groupName ? getInitials(groupName) : (
            <Users className={iconSizeClasses[size]} />
          )}
        </AvatarFallback>
      </Avatar>

      {showRefreshButton && connectionId && conversationId && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute bottom-0 right-0 rounded-full bg-background shadow-md border border-border hover:bg-accent hover:text-accent-foreground transition-all duration-200 ease-in-out",
                  refreshButtonSizeClasses[size],
                  isHovered || isUpdating ? "opacity-100 scale-100" : "opacity-0 scale-95"
                )}
                onClick={handleRefreshGroupPicture}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className={cn("animate-spin", refreshIconSizeClasses[size])} />
                ) : (
                  <RefreshCw className={refreshIconSizeClasses[size]} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('groups.avatar.refresh_tooltip', 'Refresh group profile picture')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
