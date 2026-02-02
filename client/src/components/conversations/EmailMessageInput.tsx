import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Bold, Italic, Underline, Link, X, Plus, Minus, FileText, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Separator } from '@/components/ui/separator';

interface EmailMessageInputProps {
  conversationId: number;
  channelId: number;
  onMessageSent?: () => void;
  replyToMessage?: any;
  onCancelReply?: () => void;
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

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  htmlContent?: string;
  plainTextContent?: string;
  variables: string[];
}

interface EmailSignature {
  id: number;
  name: string;
  htmlContent?: string;
  plainTextContent?: string;
  isDefault: boolean;
}

export default function EmailMessageInput({
  conversationId,
  channelId,
  onMessageSent,
  replyToMessage,
  onCancelReply
}: EmailMessageInputProps) {
  const [formData, setFormData] = useState<EmailFormData>({
    to: '',
    cc: [],
    bcc: [],
    subject: '',
    content: '',
    isHtml: false,
    attachments: []
  });
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [newCc, setNewCc] = useState('');
  const [newBcc, setNewBcc] = useState('');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedSignature, setSelectedSignature] = useState<string>('');
  
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (replyToMessage) {
      setFormData(prev => ({
        ...prev,
        to: replyToMessage.emailFrom || '',
        subject: replyToMessage.emailSubject?.startsWith('Re: ')
          ? replyToMessage.emailSubject
          : `Re: ${replyToMessage.emailSubject || 'No Subject'}`,
        content: `\n\n--- Original Message ---\nFrom: ${replyToMessage.emailFrom}\nSubject: ${replyToMessage.emailSubject}\n\n${replyToMessage.emailPlainText || replyToMessage.content || ''}`
      }));
    }
  }, [replyToMessage]);

  useEffect(() => {
    fetchTemplates();
    fetchSignatures();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/email-templates');
      const result = await response.json();
      if (result.success) {
        setTemplates(result.data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchSignatures = async () => {
    try {
      const response = await fetch('/api/email-signatures');
      const result = await response.json();
      if (result.success) {
        setSignatures(result.data);
        const defaultSig = result.data.find((sig: EmailSignature) => sig.isDefault);
        if (defaultSig) {
          setSelectedSignature(defaultSig.id.toString());
        }
      }
    } catch (error) {
      console.error('Error fetching signatures:', error);
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id.toString() === templateId);
    if (template) {
      setFormData(prev => ({
        ...prev,
        subject: template.subject,
        content: formData.isHtml ? (template.htmlContent || '') : (template.plainTextContent || ''),
      }));

      fetch(`/api/email-templates/${templateId}/use`, { method: 'POST' })
        .catch(error => console.error('Error recording template usage:', error));
    }
  };

  const applySignature = () => {
    const signature = signatures.find(s => s.id.toString() === selectedSignature);
    if (signature) {
      const signatureContent = formData.isHtml ? signature.htmlContent : signature.plainTextContent;
      if (signatureContent) {
        setFormData(prev => ({
          ...prev,
          content: prev.content + (formData.isHtml ? '<br><br>' : '\n\n') + signatureContent
        }));
      }
    }
  };

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
      
      if (replyToMessage) {
        formDataToSend.append('inReplyTo', replyToMessage.emailMessageId || '');
        formDataToSend.append('references', replyToMessage.emailReferences || replyToMessage.emailMessageId || '');
      }

      formData.attachments.forEach((file, index) => {
        formDataToSend.append(`attachment_${index}`, file);
      });

      const response = await fetch('/api/v1/email/send', {
        method: 'POST',
        body: formDataToSend
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: t('email.send.success', 'Email Sent'),
          description: t('email.send.success_message', 'Your email has been sent successfully'),
          variant: 'default'
        });
        
        setFormData({
          to: '',
          cc: [],
          bcc: [],
          subject: '',
          content: '',
          isHtml: false,
          attachments: []
        });
        setShowCc(false);
        setShowBcc(false);
        onCancelReply?.();
        onMessageSent?.();
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

  return (
    <div className="border-t bg-background p-4 space-y-4">
      {replyToMessage && (
        <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>{t('email.replying_to', 'Replying to')}:</strong> {replyToMessage.emailSubject || 'No Subject'}
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelReply}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t('email.template', 'Email Template')}</Label>
            <div className="flex gap-2">
              <Select value={selectedTemplate} onValueChange={(value) => {
                setSelectedTemplate(value);
                if (value) applyTemplate(value);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {template.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTemplate('')}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label>{t('email.signature', 'Email Signature')}</Label>
            <div className="flex gap-2">
              <Select value={selectedSignature} onValueChange={setSelectedSignature}>
                <SelectTrigger>
                  <SelectValue placeholder="Select signature..." />
                </SelectTrigger>
                <SelectContent>
                  {signatures.map(signature => (
                    <SelectItem key={signature.id} value={signature.id.toString()}>
                      <div className="flex items-center gap-2">
                        <FileSignature className="w-4 h-4" />
                        {signature.name}
                        {signature.isDefault && <span className="text-xs text-muted-foreground">(Default)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applySignature}
                disabled={!selectedSignature}
                title="Insert signature"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="email-to">{t('email.to', 'To')}</Label>
          <Input
            id="email-to"
            type="email"
            value={formData.to}
            onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
            placeholder={t('email.to_placeholder', 'recipient@example.com')}
            required
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowCc(!showCc)}
            className={showCc ? 'bg-blue-50' : ''}
          >
            {t('email.cc', 'CC')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowBcc(!showBcc)}
            className={showBcc ? 'bg-blue-50' : ''}
          >
            {t('email.bcc', 'BCC')}
          </Button>
        </div>

        {showCc && (
          <div>
            <Label>{t('email.cc', 'CC')}</Label>
            <div className="flex gap-2 mb-2">
              <Input
                type="email"
                value={newCc}
                onChange={(e) => setNewCc(e.target.value)}
                placeholder={t('email.cc_placeholder', 'cc@example.com')}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCc())}
              />
              <Button type="button" variant="outline" size="sm" onClick={addCc}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.cc.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.cc.map((email, index) => (
                  <div key={index} className="flex items-center bg-gray-100 rounded px-2 py-1 text-sm">
                    {email}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => removeCc(email)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showBcc && (
          <div>
            <Label>{t('email.bcc', 'BCC')}</Label>
            <div className="flex gap-2 mb-2">
              <Input
                type="email"
                value={newBcc}
                onChange={(e) => setNewBcc(e.target.value)}
                placeholder={t('email.bcc_placeholder', 'bcc@example.com')}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBcc())}
              />
              <Button type="button" variant="outline" size="sm" onClick={addBcc}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.bcc.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.bcc.map((email, index) => (
                  <div key={index} className="flex items-center bg-gray-100 rounded px-2 py-1 text-sm">
                    {email}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-1"
                      onClick={() => removeBcc(email)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="email-subject">{t('email.subject', 'Subject')}</Label>
          <Input
            id="email-subject"
            value={formData.subject}
            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
            placeholder={t('email.subject_placeholder', 'Email subject')}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="email-content">{t('email.content', 'Content')}</Label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.isHtml}
                  onChange={(e) => setFormData(prev => ({ ...prev, isHtml: e.target.checked }))}
                />
                {t('email.html_mode', 'HTML Mode')}
              </label>
            </div>
          </div>
          <Textarea
            ref={contentRef}
            id="email-content"
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            placeholder={t('email.content_placeholder', 'Type your email content here...')}
            rows={8}
            required
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Label>{t('email.attachments', 'Attachments')}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 mr-1" />
              {t('email.add_attachment', 'Add File')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
          {formData.attachments.length > 0 && (
            <div className="space-y-2">
              {formData.attachments.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                  <div className="flex items-center gap-2">
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
          )}
        </div>
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button
          onClick={handleSendEmail}
          disabled={isSending || !formData.to.trim() || !formData.content.trim()}
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
              {t('email.send', 'Send Email')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
