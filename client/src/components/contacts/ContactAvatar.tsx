import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { Contact } from "@shared/schema";
import { useProfilePicture } from "@/hooks/use-profile-picture";
import { useTranslation } from "@/hooks/use-translation";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { cn, getInitials } from "@/lib/utils";

interface MinimalContact {
  id: number;
  name: string;
  avatarUrl?: string | null | undefined;
}

interface ContactAvatarProps {
  contact: MinimalContact;
  connectionId?: number;
  size?: "sm" | "md" | "lg";
  showRefreshButton?: boolean;
  className?: string;
}

export function ContactAvatar({
  contact,
  connectionId,
  size = "md",
  showRefreshButton = false,
  className
}: ContactAvatarProps) {
  const { updateProfilePicture, isUpdating } = useProfilePicture();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-lg"
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
  
  const handleRefreshProfilePicture = () => {
    if (!connectionId || isUpdating) return;
    
    updateProfilePicture({ 
      contactId: contact.id, 
      connectionId 
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
          src={contact.avatarUrl || ""} 
          alt={contact.name}
          onError={(e) => {
            if (contact.avatarUrl) {
              console.warn(`Failed to load avatar for contact ${contact.id} (${contact.name}):`, contact.avatarUrl);
            }
          }}
        />
        <AvatarFallback className="bg-primary-100 text-primary-700 font-medium">
          {getInitials(contact.name)}
        </AvatarFallback>
      </Avatar>

      {showRefreshButton && connectionId && (
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
                onClick={handleRefreshProfilePicture}
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
              <p>{t('contacts.avatar.refresh_tooltip', 'Refresh WhatsApp profile picture')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}