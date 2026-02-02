import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useParticipantProfilePicture } from "@/hooks/use-participant-profile-pictures";

interface GroupParticipantAvatarProps {
  participantJid: string;
  participantName?: string;
  connectionId?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  avatarUrl?: string | null;
  enableAutoFetch?: boolean;
}

export function GroupParticipantAvatar({
  participantJid,
  participantName,
  connectionId,
  size = "sm",
  className,
  avatarUrl,
  enableAutoFetch = true
}: GroupParticipantAvatarProps) {

  if (!participantJid) {
    return (
      <Avatar className={cn("h-6 w-6 text-xs", className)}>
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
          ??
        </AvatarFallback>
      </Avatar>
    );
  }

  const { profilePictureUrl: fetchedAvatarUrl } = useParticipantProfilePicture(
    enableAutoFetch && !avatarUrl ? connectionId : undefined,
    enableAutoFetch && !avatarUrl ? participantJid : undefined
  );


  const finalAvatarUrl = avatarUrl || fetchedAvatarUrl || "";

  const getParticipantInitials = (name?: string, jid?: string) => {
    if (name && name.trim()) {
      return name
        .split(" ")
        .map(part => part[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
    }

    if (jid && jid.includes('@')) {
      const phoneNumber = jid.split('@')[0];
      return phoneNumber.substring(0, 2);
    }

    return "??";
  };

  const sizeClasses = {
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base"
  };

  const displayName = participantName || (participantJid && participantJid.includes('@') ? participantJid.split('@')[0] : 'Unknown');

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage src={finalAvatarUrl} alt={displayName} />
      <AvatarFallback className="bg-green-100 text-green-700 text-xs">
        {getParticipantInitials(participantName, participantJid)}
      </AvatarFallback>
    </Avatar>
  );
}
