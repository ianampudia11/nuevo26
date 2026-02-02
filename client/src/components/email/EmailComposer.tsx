import { useState, useRef } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Send, 
  Paperclip, 
  X, 
  Plus, 
  Minus,
  Bold,
  Italic,
  Underline,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EmailComposerProps {
  channelId: number;
  onEmailSent: () => void;
  onCancel: () => void;
  replyTo?: any;
  forwardFrom?: any;
}

interface EmailFormData {
  to: string;
  cc: string[];
  bcc: string[];
  subject: string;
  content: string;
  isHtml: boolean;
  attachments: File[];
}

export default function EmailComposer({ 
  channelId, 
  onEmailSent, 
  onCancel,
  replyTo,
  forwardFrom
}: EmailComposerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const [formData, setFormData] = useState<EmailFormData>({
    to: replyTo?.from || '',
    cc: [],
    bcc: [],
    subject: replyTo ? `Re: ${replyTo.subject}` : forwardFrom ? `Fwd: ${forwardFrom.subject}` : '',
    content: '',
    isHtml: false,
    attachments: []
  });

  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [newCc, setNewCc] = useState('');
  const [newBcc, setNewBcc] = useState('');

  const handleSendEmail = async () => {
    if (!formData.to.trim() || !formData.content.trim()) {
      toast({
        title: t('email.validation.required_fields', 'Required Fields'),
        description: t('email.validation.to_content_required', 'To and content are required'),
        variant: 'destructive'
      });
      return;
    }

    setIsSending(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('channelId', channelId.toString());
      formDataToSend.append('to', formData.to);
      formDataToSend.append('subject', formData.subject);
      formDataToSend.append('content', formData.content);
      formDataToSend.append('isHtml', formData.isHtml.toString());
      
      if (formData.cc.length > 0) {
        formDataToSend.append('cc', JSON.stringify(formData.cc));
      }
      
      if (formData.bcc.length > 0) {
        formDataToSend.append('bcc', JSON.stringify(formData.bcc));
      }

      if (replyTo) {
        formDataToSend.append('inReplyTo', replyTo.metadata?.emailMessageId || '');
        formDataToSend.append('references', replyTo.metadata?.emailReferences || '');
      }

      formData.attachments.forEach((file, index) => {
        formDataToSend.append(`attachment_${index}`, file);
      });

      const response = await fetch(`/api/email/${channelId}/send`, {
        method: 'POST',
        body: formDataToSend
      });

      const data = await response.json();
      if (data.success) {
        onEmailSent();
      } else {
        throw new Error(data.message || 'Failed to send email');
      }
    } catch (error: any) {
      toast({
        title: t('email.send.error', 'Send Failed'),
        description: error.message || t('email.send.error_message', 'Failed to send email'),
        variant: 'destructive'
      });
    } finally {
      setIsSending(false);
    }
  };

  const addCc = () => {
    if (newCc.trim() && !formData.cc.includes(newCc.trim())) {
      setFormData(prev => ({
        ...prev,
        cc: [...prev.cc, newCc.trim()]
      }));
      setNewCc('');
    }
  };

  const removeCc = (email: string) => {
    setFormData(prev => ({
      ...prev,
      cc: prev.cc.filter(cc => cc !== email)
    }));
  };

  const addBcc = () => {
    if (newBcc.trim() && !formData.bcc.includes(newBcc.trim())) {
      setFormData(prev => ({
        ...prev,
        bcc: [...prev.bcc, newBcc.trim()]
      }));
      setNewBcc('');
    }
  };

  const removeBcc = (email: string) => {
    setFormData(prev => ({
      ...prev,
      bcc: prev.bcc.filter(bcc => bcc !== email)
    }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setFormData(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...files]
    }));
  };

  const removeAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const insertFormatting = (tag: string) => {
    if (!contentRef.current) return;
    
    const textarea = contentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    let replacement = '';
    if (formData.isHtml) {
      switch (tag) {
        case 'bold':
          replacement = `<strong>${selectedText}</strong>`;
          break;
        case 'italic':
          replacement = `<em>${selectedText}</em>`;
          break;
        case 'underline':
          replacement = `<u>${selectedText}</u>`;
          break;
        default:
          replacement = selectedText;
      }
    } else {
      replacement = selectedText; // Plain text doesn't support formatting
    }
    
    const newContent = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    setFormData(prev => ({ ...prev, content: newContent }));
    

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 0);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Composer Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {replyTo ? t('email.reply', 'Reply') : forwardFrom ? t('email.forward', 'Forward') : t('email.compose', 'Compose')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Email Form */}
        <div className="space-y-4">
          {/* To Field */}
          <div className="flex items-center space-x-2">
            <Label htmlFor="to" className="w-12 text-sm font-medium text-gray-700">
              {t('email.to', 'To')}
            </Label>
            <Input
              id="to"
              type="email"
              value={formData.to}
              onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
              placeholder={t('email.enter_recipients', 'Enter recipients...')}
              className="flex-1"
              required
            />
            <div className="flex items-center space-x-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCc(!showCc)}
                className="text-xs"
              >
                Cc
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowBcc(!showBcc)}
                className="text-xs"
              >
                Bcc
              </Button>
            </div>
          </div>

          {/* CC Field */}
          {showCc && (
            <div className="flex items-start space-x-2">
              <Label className="w-12 text-sm font-medium text-gray-700 mt-2">
                {t('email.cc', 'Cc')}
              </Label>
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    type="email"
                    value={newCc}
                    onChange={(e) => setNewCc(e.target.value)}
                    placeholder={t('email.add_cc', 'Add Cc recipient...')}
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && addCc()}
                  />
                  <Button type="button" variant="brandOutline" size="sm" onClick={addCc}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.cc.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.cc.map((email, index) => (
                      <div key={index} className="flex items-center bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">
                        {email}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCc(email)}
                          className="ml-1 h-4 w-4 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BCC Field */}
          {showBcc && (
            <div className="flex items-start space-x-2">
              <Label className="w-12 text-sm font-medium text-gray-700 mt-2">
                {t('email.bcc', 'Bcc')}
              </Label>
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <Input
                    type="email"
                    value={newBcc}
                    onChange={(e) => setNewBcc(e.target.value)}
                    placeholder={t('email.add_bcc', 'Add Bcc recipient...')}
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && addBcc()}
                  />
                  <Button type="button" variant="brandOutline" size="sm" onClick={addBcc}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.bcc.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.bcc.map((email, index) => (
                      <div key={index} className="flex items-center bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">
                        {email}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBcc(email)}
                          className="ml-1 h-4 w-4 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subject Field */}
          <div className="flex items-center space-x-2">
            <Label htmlFor="subject" className="w-12 text-sm font-medium text-gray-700">
              {t('email.subject', 'Subject')}
            </Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder={t('email.enter_subject', 'Enter subject...')}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div className="border-b border-gray-200 p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertFormatting('bold')}
              disabled={!formData.isHtml}
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertFormatting('italic')}
              disabled={!formData.isHtml}
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertFormatting('underline')}
              disabled={!formData.isHtml}
            >
              <Underline className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-2" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={formData.isHtml}
                onChange={(e) => setFormData(prev => ({ ...prev, isHtml: e.target.checked }))}
              />
              <span>{t('email.html_mode', 'HTML Mode')}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4">
        <Textarea
          ref={contentRef}
          value={formData.content}
          onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
          placeholder={t('email.compose_message', 'Compose your message...')}
          className="w-full h-full resize-none border-0 focus:ring-0 text-base"
          required
        />
      </div>

      {/* Attachments */}
      {formData.attachments.length > 0 && (
        <div className="border-t border-gray-200 p-4">
          <div className="space-y-2">
            {formData.attachments.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <div className="flex items-center space-x-2">
                  <Paperclip className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              onClick={handleSendEmail}
              disabled={isSending || !formData.to.trim() || !formData.content.trim()}
              variant="brand"
              className="btn-brand-primary"
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('email.sending', 'Sending...')}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t('email.send', 'Send')}
                </>
              )}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="brandOutline" size="sm">
                  <span className="mr-2">{t('email.send_options', 'Send options')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  {t('email.schedule_send', 'Schedule send')}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  {t('email.save_draft', 'Save as draft')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
