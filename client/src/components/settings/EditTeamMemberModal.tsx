import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface TeamMember {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
}

interface EditTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  teamMember: TeamMember | null;
}

export function EditTeamMemberModal({ isOpen, onClose, onSuccess, teamMember }: EditTeamMemberModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('agent');
  const { toast } = useToast();


  useEffect(() => {
    if (teamMember && isOpen) {
      setFullName(teamMember.fullName);
      setEmail(teamMember.email);
      setPassword(''); // Always clear password field for security
      setShowPassword(false);
      setRole(teamMember.role);
    }
  }, [teamMember, isOpen]);

  const updateTeamMemberMutation = useMutation({
    mutationFn: async (data: {
      fullName: string;
      email: string;
      role: string;
      password?: string;
    }) => {
      const res = await apiRequest('PATCH', `/api/team/members/${teamMember?.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      const passwordUpdated = password.trim().length > 0;
      toast({
        title: 'Team Member Updated',
        description: `${fullName} has been updated successfully${passwordUpdated ? ' (including password)' : ''}. Permissions are managed through Settings > Roles & Permissions.`,
      });


      setPassword('');
      setShowPassword(false);

      onClose();

      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
      queryClient.invalidateQueries({ queryKey: ['userPermissions'] });

      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to update team member: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a full name',
        variant: 'destructive',
      });
      return;
    }

    if (!email.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }


    if (password.trim() && password.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters long',
        variant: 'destructive',
      });
      return;
    }


    const updateData: {
      fullName: string;
      email: string;
      role: string;
      password?: string;
    } = {
      fullName,
      email,
      role
    };

    if (password.trim()) {
      updateData.password = password;
    }

    updateTeamMemberMutation.mutate(updateData);
  };

  if (!teamMember) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Team Member</DialogTitle>
          <DialogDescription>
            Update team member information. Permissions are managed centrally through Settings {'>'} Roles & Permissions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-fullName">Full Name</Label>
            <Input
              id="edit-fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email Address</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-password">Password</Label>
            <div className="relative">
              <Input
                id="edit-password"
                type={showPassword ? "text" : "password"}
                placeholder="Leave blank to keep current password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Optional: Enter a new password or leave blank to keep the current password. Minimum 6 characters if provided.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="edit-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Agents inherit limited permissions by default. Customize permissions in Settings → Roles & Permissions.
            </p>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="brand"
              disabled={updateTeamMemberMutation.isPending}
              className="btn-brand-primary"
            >
              {updateTeamMemberMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Team Member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
