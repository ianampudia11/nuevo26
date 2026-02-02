import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { useProfilePicture } from '@/hooks/use-profile-picture';
import { Loader2, Upload, X } from 'lucide-react';

interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  avatarUrl: string | null;
  tags: string[] | null;
  isActive: boolean | null;
  identifier: string | null;
  identifierType: string | null;
  source: string | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  companyId: number | null;
}

interface EditContactDialogProps {
  contact: Contact | null;
  conversation?: any;
  isOpen: boolean;
  onClose: () => void;
  onContactUpdated?: (updatedContact: Contact) => void;
}

export default function EditContactDialog({
  contact,
  conversation,
  isOpen,
  onClose,
  onContactUpdated
}: EditContactDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    identifierType: '',
    identifier: '',
    notes: '',
    tags: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { updateProfilePicture, isUpdating: isUpdatingProfilePicture } = useProfilePicture();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (contact) {
      const initialData = {
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        identifierType: contact.identifierType || '',
        identifier: contact.identifier || '',
        notes: contact.notes || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : ''
      };
      setFormData(initialData);
      setHasUnsavedChanges(false);
      setProfilePictureFile(null);
      setProfilePicturePreview(null);
    }
  }, [contact]);

  useEffect(() => {
    if (contact) {
      const currentData = {
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        identifierType: contact.identifierType || '',
        identifier: contact.identifier || '',
        notes: contact.notes || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : ''
      };

      const hasChanges = JSON.stringify(formData) !== JSON.stringify(currentData) ||
                        profilePictureFile !== null;
      setHasUnsavedChanges(hasChanges);
    }
  }, [formData, contact, profilePictureFile]);

  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!contact?.id) throw new Error(t('contacts.edit_dialog.contact_id_missing', 'Contact ID is missing'));

      const response = await apiRequest('PATCH', `/api/contacts/${contact.id}`, data);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('contacts.edit_dialog.update_failed', 'Failed to update contact'));
      }

      return response.json();
    },
    onSuccess: (updatedContact) => {
      toast({
        title: t('contacts.edit_dialog.success_title', 'Contact updated'),
        description: t('contacts.edit_dialog.success_description', 'The contact has been successfully updated.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contact?.id}`] });

      if (onContactUpdated) {
        onContactUpdated(updatedContact);
      }

      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.edit_dialog.error_title', 'Update failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    e.target.value = '';

    if (!file) {
      return;
    }

    setIsProcessingImage(true);

    try {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type.toLowerCase())) {
        setIsProcessingImage(false);
        toast({
          title: t('contacts.edit_dialog.invalid_file_type', 'Invalid file type'),
          description: t('contacts.edit_dialog.invalid_file_type_desc', 'Please select a valid image file (JPEG, PNG, GIF, or WebP).'),
          variant: 'destructive',
        });
        return;
      }

      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        setIsProcessingImage(false);
        toast({
          title: t('contacts.edit_dialog.file_too_large', 'File too large'),
          description: t('contacts.edit_dialog.file_too_large_desc', `File size is ${sizeMB}MB. Please select an image smaller than 5MB.`, { sizeMB }),
          variant: 'destructive',
        });
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const maxDimension = 2048;
        if (img.width > maxDimension || img.height > maxDimension) {
          setIsProcessingImage(false);
          toast({
            title: t('contacts.edit_dialog.image_too_large', 'Image too large'),
            description: t('contacts.edit_dialog.image_too_large_desc', `Image dimensions are ${img.width}x${img.height}. Please use an image smaller than ${maxDimension}x${maxDimension} pixels.`, { width: img.width, height: img.height, maxDimension }),
            variant: 'destructive',
          });
          return;
        }

        setProfilePictureFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
          setProfilePicturePreview(e.target?.result as string);
          setIsProcessingImage(false);
          toast({
            title: t('contacts.edit_dialog.image_selected', 'Image selected'),
            description: t('contacts.edit_dialog.image_selected_desc', 'Profile picture has been selected successfully.'),
          });
        };
        reader.onerror = () => {
          setIsProcessingImage(false);
          toast({
            title: t('contacts.edit_dialog.error_reading_file', 'Error reading file'),
            description: t('contacts.edit_dialog.error_reading_file_desc', 'Failed to read the selected image file.'),
            variant: 'destructive',
          });
        };
        reader.readAsDataURL(file);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setIsProcessingImage(false);
        toast({
          title: t('contacts.edit_dialog.invalid_image', 'Invalid image'),
          description: t('contacts.edit_dialog.invalid_image_desc', 'The selected file is not a valid image.'),
          variant: 'destructive',
        });
      };

      img.src = objectUrl;

    } catch (error) {
      setIsProcessingImage(false);
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.edit_dialog.unexpected_error', 'An unexpected error occurred while processing the image.'),
        variant: 'destructive',
      });
    }
  };

  const handleRemoveProfilePicture = () => {
    setProfilePictureFile(null);
    setProfilePicturePreview(null);
    setIsProcessingImage(false);
    toast({
      title: t('contacts.edit_dialog.image_removed', 'Image removed'),
      description: t('contacts.edit_dialog.image_removed_desc', 'Profile picture has been removed.'),
    });
  };

  const handleWhatsAppProfilePictureUpdate = () => {
    if (contact?.id && conversation?.channelId) {
      updateProfilePicture({
        contactId: contact.id,
        connectionId: conversation.channelId
      });
    }
  };

  const triggerFileInput = () => {
    try {
      if (fileInputRef.current) {
        if (fileInputRef.current.disabled) {
          toast({
            title: t('contacts.edit_dialog.upload_disabled', 'Upload disabled'),
            description: t('contacts.edit_dialog.upload_disabled_desc', 'File upload is currently disabled.'),
            variant: 'destructive',
          });
          return;
        }

        fileInputRef.current.click();
        return;
      }

      const fileInput = document.getElementById('profile-picture-upload') as HTMLInputElement;
      if (fileInput) {
        if (fileInput.disabled) {
          toast({
            title: t('contacts.edit_dialog.upload_disabled', 'Upload disabled'),
            description: t('contacts.edit_dialog.upload_disabled_desc', 'File upload is currently disabled.'),
            variant: 'destructive',
          });
          return;
        }

        fileInput.click();
      } else {
        toast({
          title: t('contacts.edit_dialog.upload_error', 'Upload error'),
          description: t('contacts.edit_dialog.upload_not_available', 'File upload is not available. Please try refreshing the page.'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('contacts.edit_dialog.upload_error', 'Upload error'),
        description: t('contacts.edit_dialog.upload_failed', 'Failed to open file picker. Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast({
        title: t('contacts.edit_dialog.validation_error', 'Validation error'),
        description: t('contacts.edit_dialog.name_required', 'Contact name is required.'),
        variant: 'destructive',
      });
      return false;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({
        title: t('contacts.edit_dialog.validation_error', 'Validation error'),
        description: t('contacts.edit_dialog.invalid_email', 'Please enter a valid email address.'),
        variant: 'destructive',
      });
      return false;
    }

    if (formData.phone && !/^[\+]?[0-9\s\-\(\)]{7,20}$/.test(formData.phone)) {
      toast({
        title: t('contacts.edit_dialog.validation_error', 'Validation error'),
        description: t('contacts.edit_dialog.invalid_phone', 'Please enter a valid phone number (7-20 digits).'),
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const tagsArray = formData.tags
        ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : [];

      const updateData = {
        ...formData,
        tags: tagsArray
      };

      await updateContactMutation.mutateAsync(updateData);

      if (profilePictureFile && contact?.id) {
        const formDataUpload = new FormData();
        formDataUpload.append('avatar', profilePictureFile);

        try {
          const response = await fetch(`/api/contacts/${contact.id}/avatar`, {
            method: 'POST',
            body: formDataUpload,
          });

          if (!response.ok) {
            throw new Error(t('contacts.edit_dialog.upload_profile_picture_failed', 'Failed to upload profile picture'));
          }

          toast({
            title: t('contacts.edit_dialog.profile_picture_updated', 'Profile picture updated'),
            description: t('contacts.edit_dialog.profile_picture_uploaded', 'The profile picture has been uploaded successfully.'),
          });

          queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
          queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
        } catch (error) {
          toast({
            title: t('contacts.edit_dialog.profile_picture_upload_failed', 'Profile picture upload failed'),
            description: t('contacts.edit_dialog.contact_updated_upload_failed', 'Contact was updated but profile picture upload failed.'),
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  const confirmClose = () => {
    setShowConfirmDialog(false);
    onClose();
  };

  const cancelClose = () => {
    setShowConfirmDialog(false);
  };

  if (!contact) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto z-[9999]">
          <DialogHeader>
            <DialogTitle>{t('contacts.edit_dialog.title', 'Edit Contact Details')}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                {profilePicturePreview ? (
                  <div className="relative">
                    <img
                      src={profilePicturePreview}
                      alt={t('contacts.edit_dialog.profile_preview', 'Profile preview')}
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveProfilePicture}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <ContactAvatar
                    contact={contact}
                    connectionId={conversation?.channelId}
                    size="lg"
                    showRefreshButton={false}
                  />
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  className="hidden"
                  id="profile-picture-upload"
                  disabled={isSubmitting || isProcessingImage}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={triggerFileInput}
                  className="hover:bg-gray-50 transition-colors"
                  disabled={isSubmitting || isProcessingImage}
                >
                  {isProcessingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('contacts.edit_dialog.processing', 'Processing...')}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {t('contacts.edit_dialog.upload_photo', 'Upload Photo')}
                    </>
                  )}
                </Button>

                {(conversation?.channelType === 'whatsapp' ||
                  conversation?.channelType === 'whatsapp_unofficial') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleWhatsAppProfilePictureUpdate}
                    disabled={isUpdatingProfilePicture}
                  >
                    {isUpdatingProfilePicture ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <i className="ri-whatsapp-line w-4 h-4 mr-2"></i>
                    )}
                    {t('contacts.edit_dialog.sync_from_whatsapp', 'Sync from WhatsApp')}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('contacts.edit_dialog.full_name_required', 'Full Name *')}</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder={t('contacts.edit_dialog.enter_full_name', 'Enter full name')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('contacts.edit_dialog.email', 'Email')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder={t('contacts.edit_dialog.enter_email', 'Enter email address')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('contacts.edit_dialog.phone_number', 'Phone Number')}</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder={t('contacts.edit_dialog.enter_phone', 'Enter phone number')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">{t('contacts.edit_dialog.company', 'Company')}</Label>
                <Input
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  placeholder={t('contacts.edit_dialog.enter_company', 'Enter company name')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="identifierType">{t('contacts.edit_dialog.primary_channel', 'Primary Channel')}</Label>
                <Select
                  value={formData.identifierType}
                  onValueChange={(value) => handleSelectChange('identifierType', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('contacts.edit_dialog.select_channel', 'Select channel')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">{t('contacts.edit_dialog.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                    <SelectItem value="whatsapp_unofficial">{t('contacts.edit_dialog.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                    <SelectItem value="messenger">{t('contacts.edit_dialog.facebook_messenger', 'Facebook Messenger')}</SelectItem>
                    <SelectItem value="instagram">{t('contacts.edit_dialog.instagram', 'Instagram')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="identifier">{t('contacts.edit_dialog.channel_identifier', 'Channel Identifier')}</Label>
                <Input
                  id="identifier"
                  name="identifier"
                  value={formData.identifier}
                  onChange={handleInputChange}
                  placeholder={t('contacts.edit_dialog.phone_username_id', 'Phone number, username, or ID')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">{t('contacts.edit_dialog.tags', 'Tags')}</Label>
              <Input
                id="tags"
                name="tags"
                value={formData.tags}
                onChange={handleInputChange}
                placeholder={t('contacts.edit_dialog.enter_tags', 'Enter tags separated by commas (e.g., lead, customer, vip)')}
              />
              <p className="text-sm text-gray-500">
                {t('contacts.edit_dialog.tags_help', 'Separate multiple tags with commas')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('contacts.edit_dialog.notes', 'Notes')}</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                placeholder={t('contacts.edit_dialog.add_notes', 'Add any additional notes about this contact...')}
              />
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !hasUnsavedChanges}
                className="btn-brand-primary"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('contacts.edit_dialog.saving', 'Saving...')}
                  </>
                ) : (
                  t('contacts.edit_dialog.save_changes', 'Save Changes')
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('contacts.edit_dialog.unsaved_changes', 'Unsaved Changes')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t('contacts.edit_dialog.unsaved_changes_message', 'You have unsaved changes. Are you sure you want to close without saving?')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={cancelClose}>
              {t('contacts.edit_dialog.continue_editing', 'Continue Editing')}
            </Button>
            <Button variant="destructive" onClick={confirmClose}>
              {t('contacts.edit_dialog.discard_changes', 'Discard Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
