import { Badge } from '@/components/ui/badge';
import { SegmentCard } from '@/components/segments/SegmentCard';
import { SkeletonLoader } from '@/components/segments/SkeletonLoader';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useTranslation } from '@/hooks/use-translation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeInfo,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  File,
  FileText,
  Image,
  LayoutTemplate,
  Loader2,
  MapPin,
  MessageSquare,
  Music,
  Plus,
  Save,
  Send,
  Settings,
  Shield,
  Trash2,
  Upload,
  User,
  Users,
  Video,
  X
} from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useParams } from 'wouter';
import { whatsappRateLimitService, type RateLimitCalculation } from '@/services/whatsappRateLimitService';
import { CreateSegmentModal } from './CreateSegmentModal';
import { CreateTemplateModal } from './CreateTemplateModal';
import { EditSegmentModal } from './EditSegmentModal';
import { EditTemplateModal } from './EditTemplateModal';
import { VariableInsertion } from './VariableInsertion';
import {
  WhatsAppCampaignData,
  WhatsAppCampaignTemplate,
  WhatsAppContactSegment,
  WhatsAppContentValidation
} from '@/types/whatsapp-campaign';
import { TimezoneSelector } from '@/components/ui/TimezoneSelector';
import { getBrowserTimezone } from '@/utils/timezones';


type ContactSegment = WhatsAppContactSegment;
type CampaignTemplate = WhatsAppCampaignTemplate;
import {
  WHATSAPP_CHANNEL_TYPES,
  WHATSAPP_MESSAGE_TYPES,
  WHATSAPP_LIMITS,
  getRateLimits,
  DAYS_OF_WEEK,
  RECURRING_DAILY_LIMITS
} from '@/lib/whatsapp-constants';





const getCampaignRateLimits = (channelType: string) => {
  const limits = getRateLimits(channelType as any);
  return {
    messages_per_minute: limits.MESSAGES_PER_MINUTE,
    messages_per_hour: limits.MESSAGES_PER_HOUR,
    messages_per_day: limits.MESSAGES_PER_DAY,
    delay_between_messages: limits.DEFAULT_DELAY / 1000 // Convert ms to seconds
  };
};


const validateWhatsAppContent = (content: string, channelType: string, messageType: string): WhatsAppContentValidation => {
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 100;


  if (content.length > WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH) {
    issues.push(`Message exceeds ${WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH} character limit (${content.length} characters)`);
    score -= 30;
  } else if (content.length > WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH * 0.9) {
    warnings.push(`Message is close to character limit (${content.length}/${WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH})`);
    score -= 5;
  }


  const emojiCount = (content.match(/[\u2600-\u26FF]|[\u2700-\u27BF]/g) || []).length;
  if (emojiCount > 50) {
    warnings.push(`High emoji count (${emojiCount}) may trigger spam filters`);
    score -= 10;
  }


  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = content.match(urlPattern) || [];

  if (urls.length > 3) {
    warnings.push(`Multiple URLs (${urls.length}) may be flagged as spam`);
    score -= 15;
  }


  const suspiciousUrls = urls.filter(url =>
    url.includes('bit.ly') ||
    url.includes('tinyurl') ||
    url.includes('t.co') ||
    url.includes('short.link')
  );

  if (suspiciousUrls.length > 0) {
    warnings.push('Shortened URLs may be flagged as spam');
    score -= 10;
  }


  const spamTriggers = [
    'urgent', 'limited time', 'act now', 'free money', 'guaranteed',
    'no risk', 'click here', 'buy now', 'special offer', 'winner',
    'congratulations', 'claim now', 'exclusive deal'
  ];

  const foundTriggers = spamTriggers.filter(trigger =>
    content.toLowerCase().includes(trigger.toLowerCase())
  );

  if (foundTriggers.length > 0) {
    warnings.push(`Potential spam triggers found: ${foundTriggers.join(', ')}`);
    score -= foundTriggers.length * 5;
  }


  if (channelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL) {

    if (content.length > 1000) {
      warnings.push('Long messages may increase ban risk on unofficial channels');
      score -= 10;
    }

    if (urls.length > 1) {
      warnings.push('Multiple URLs increase ban risk on unofficial channels');
      score -= 10;
    }
  }


  const variablePattern = /\{\{(\d+)\}\}/g;
  const variables: RegExpExecArray[] = [];
  let match;
  while ((match = variablePattern.exec(content)) !== null) {
    variables.push(match);
  }


  if (messageType === WHATSAPP_MESSAGE_TYPES.TEMPLATE && channelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL) {
    if (variables.length === 0) {
      warnings.push('Template messages should include variables for personalization');
      score -= 5;
    }
  }

  return {
    isValid: issues.length === 0,
    score: Math.max(0, score),
    issues,
    errors: issues, // Map issues to errors for interface compatibility
    warnings,
    suggestions: [], // Empty suggestions array
    characterCount: content.length,
    emojiCount,
    linkCount: urls.length, // Map urlCount to linkCount
    urlCount: urls.length,
    variableCount: variables.length,
    supportedChannels: [WHATSAPP_CHANNEL_TYPES.OFFICIAL, WHATSAPP_CHANNEL_TYPES.UNOFFICIAL]
  };
};


const getMediaUploadHint = (messageType: string): string => {
  switch (messageType) {
    case WHATSAPP_MESSAGE_TYPES.IMAGE:
      return 'JPEG, PNG, WebP formats. Max 16MB';
    case WHATSAPP_MESSAGE_TYPES.VIDEO:
      return 'MP4, 3GPP formats. Max 16MB';
    case WHATSAPP_MESSAGE_TYPES.AUDIO:
      return 'AAC, MP4, MPEG, AMR, OGG formats. Max 16MB';
    case WHATSAPP_MESSAGE_TYPES.DOCUMENT:
      return 'PDF, DOC, XLS, TXT formats. Max 100MB';
    default:
      return 'Select a message type to see format requirements';
  }
};

export function CampaignBuilder() {
  const [location, setLocation] = useLocation();
  const params = useParams();
  const isEditMode = location.includes('/edit');
  const campaignId = isEditMode ? parseInt(params.id || '0') : null;
  const { t } = useTranslation();

  const CAMPAIGN_STEPS = [
    { id: 'basic', title: t('campaigns.builder.steps.basic', 'Basic Info'), icon: BadgeInfo },
    { id: 'audience', title: t('campaigns.builder.steps.audience', 'Audience'), icon: Users },
    { id: 'content', title: t('campaigns.builder.steps.content', 'Content'), icon: LayoutTemplate },
    { id: 'settings', title: t('campaigns.builder.steps.settings', 'Settings'), icon: Settings },
    { id: 'antiban', title: t('campaigns.builder.steps.antiban', 'Anti-Ban'), icon: Shield },
    { id: 'review', title: t('campaigns.builder.steps.review', 'Review'), icon: Eye }
  ];

  const getStepDescription = (stepIndex: number): string => {
    const descriptions = [
      t('campaigns.builder.steps.basic_desc', 'Set up your campaign name, description, and basic configuration'),
      t('campaigns.builder.steps.audience_desc', 'Choose your target audience and contact segments'),
      t('campaigns.builder.steps.content_desc', 'Create your message content and add media attachments'),
      t('campaigns.builder.steps.settings_desc', 'Configure delivery settings and scheduling options'),
      t('campaigns.builder.steps.antiban_desc', 'Set up anti-ban measures and rate limiting'),
      t('campaigns.builder.steps.review_desc', 'Review all settings and launch your campaign')
    ];
    return descriptions[stepIndex] || '';
  };

  const [currentStep, setCurrentStep] = useState(0);
  const [campaignData, setCampaignData] = useState<WhatsAppCampaignData>({
    name: '',
    description: '',
    content: '',
    mediaUrls: [],
    whatsappChannelType: WHATSAPP_CHANNEL_TYPES.UNOFFICIAL,
    campaignType: 'immediate',
    messageType: WHATSAPP_MESSAGE_TYPES.TEXT,
    rateLimitSettings: {
      messages_per_minute: 10,
      messages_per_hour: 200,
      messages_per_day: 1000,
      delay_between_messages: 6,
      humanization_enabled: true,
      respect_whatsapp_limits: true,
      adaptive_rate_limiting: true
    },
    antiBanSettings: {
      enabled: true,
      mode: 'moderate',
      businessHoursOnly: false,
      respectWeekends: false,
      randomizeDelay: true,
      minDelay: 3,
      maxDelay: 15,
      accountRotation: true,
      cooldownPeriod: 30,
      messageVariation: false,
      avoidSpamTriggers: true,
      useTypingIndicators: true,
      randomizeMessageTiming: true,
      respectRecipientTimezone: false
    },
    recurringDailySettings: {
      enabled: false,
      sendTimes: ['10:00'],
      offDays: [],
      timezone: 'UTC'
    }
  });

  const [templates, setTemplates] = useState<WhatsAppCampaignTemplate[]>([]);
  const [segments, setSegments] = useState<WhatsAppContactSegment[]>([]);
  const [pipelineStages, setPipelineStages] = useState<Array<{ id: number; name: string; color: string }>>([]);
  const [selectedPipelineStageId, setSelectedPipelineStageId] = useState<number | undefined>(undefined);
  const [contentValidation, setContentValidation] = useState<WhatsAppContentValidation | null>(null);
  const [rateLimitCalculation, setRateLimitCalculation] = useState<RateLimitCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editSegmentId, setEditSegmentId] = useState<number | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);
  const [showLaunchConfirmation, setShowLaunchConfirmation] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [editingSendTimeIndex, setEditingSendTimeIndex] = useState<number | null>(null);
  const [segmentSearchQuery, setSegmentSearchQuery] = useState('');
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: channelConnections = [], isLoading: connectionsLoading } = useChannelConnections();

  const whatsappConnections = channelConnections.filter(
    (conn: any) => {

      const isWhatsAppOfficial = conn.channelType === 'whatsapp_official' || conn.type === 'official';
      const isWhatsAppUnofficial = conn.channelType === 'whatsapp_unofficial' || conn.type === 'unofficial';


      if (campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL) {
        return isWhatsAppOfficial && conn.status === 'active';
      } else {
        return isWhatsAppUnofficial && conn.status === 'active';
      }
    }
  );


  const filteredTemplates = templates.filter((template) => {
    if (campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL) {

      return template.whatsappChannelType === 'official' &&
             template.whatsappTemplateStatus === 'approved';
    } else {

      return template.whatsappChannelType === 'unofficial';
    }
  });


  const isOfficialTemplateSelected = () => {
    if (!campaignData.templateId) return false;
    if (campaignData.whatsappChannelType !== WHATSAPP_CHANNEL_TYPES.OFFICIAL) return false;
    const selectedTemplate = templates.find(t => t.id === campaignData.templateId);
    return selectedTemplate?.whatsappChannelType === 'official';
  };


  useKeyboardShortcuts([
    {
      key: 'n',
      ctrl: true,
      callback: () => {
        if (currentStep === 1) { // Audience step
          setIsSegmentModalOpen(true);
        }
      },
      description: 'Create new segment'
    },
    {
      key: 'k',
      ctrl: true,
      callback: () => {
        if (currentStep === 1) { // Audience step
          const searchInput = document.querySelector('input[placeholder*="Search segments"]') as HTMLInputElement;
          searchInput?.focus();
        }
      },
      description: 'Focus segment search'
    },
    {
      key: 'Escape',
      callback: () => {
        if (isSegmentModalOpen) setIsSegmentModalOpen(false);
        if (isTemplateModalOpen) setIsTemplateModalOpen(false);
        if (editSegmentId) setEditSegmentId(null);
        if (editTemplateId) setEditTemplateId(null);
      },
      description: 'Close modals'
    }
  ], true);

  useEffect(() => {
    fetchTemplates();
    fetchSegments();
    fetchPipelineStages();

    if (isEditMode && campaignId) {
      fetchCampaignData(campaignId);
    }
  }, [isEditMode, campaignId]);

  useEffect(() => {
    if (campaignData.content) {
      validateContent();
    }
  }, [campaignData.content]);

  useEffect(() => {

    if (campaignData.segmentId && (campaignData.whatsappAccountIds?.length || campaignData.channelIds?.length)) {
      calculateOptimalRateLimit();
    }
  }, [campaignData.whatsappChannelType, campaignData.segmentId, campaignData.whatsappAccountIds, campaignData.channelIds, segments]);


  useEffect(() => {
    if (campaignData.templateId) {
      const selectedTemplate = templates.find(t => t.id === campaignData.templateId);
      if (selectedTemplate) {

        const isCompatible = campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL
          ? selectedTemplate.whatsappChannelType === 'official' && selectedTemplate.whatsappTemplateStatus === 'approved'
          : selectedTemplate.whatsappChannelType === 'unofficial';

        if (!isCompatible) {

          setCampaignData(prev => ({
            ...prev,
            templateId: undefined,
            content: ''
          }));
          toast({
            title: t('campaigns.builder.messages.template_cleared', 'Template Cleared'),
            description: t('campaigns.builder.messages.template_incompatible', 'The selected template is not compatible with the current channel type and has been cleared.'),
            variant: 'default'
          });
        }
      }
    }
  }, [campaignData.whatsappChannelType, campaignData.templateId, templates, toast, t]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/campaigns/templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const fetchSegments = async () => {
    setSegmentsLoading(true);
    try {
      const response = await fetch('/api/campaigns/segments');
      const data = await response.json();
      if (data.success) {
        setSegments(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch segments:', error);
    } finally {
      setSegmentsLoading(false);
    }
  };

  const fetchPipelineStages = async () => {
    try {
      const response = await fetch('/api/pipeline/stages');
      if (response.ok) {
        const stages = await response.json();
        setPipelineStages(stages || []);
      }
    } catch (error) {
      console.error('Failed to fetch pipeline stages:', error);
    }
  };

  const fetchCampaignData = async (id: number) => {
    try {
      const response = await fetch(`/api/campaigns/${id}`);
      const data = await response.json();
      if (data.success) {
        const campaign = data.data;
        const pipelineStageIds = campaign.pipelineStageIds || [];

        if (pipelineStageIds.length > 0) {
          setSelectedPipelineStageId(pipelineStageIds[0]);
        }
        setCampaignData({
          name: campaign.name || '',
          description: campaign.description || '',
          content: campaign.content || '',
          mediaUrls: campaign.mediaUrls || [],
          whatsappChannelType: campaign.whatsappChannelType ||
            (campaign.channelType === 'whatsapp_official' ? WHATSAPP_CHANNEL_TYPES.OFFICIAL : WHATSAPP_CHANNEL_TYPES.UNOFFICIAL),
          whatsappAccountId: campaign.whatsappAccountId || campaign.channelId,
          whatsappAccountIds: campaign.whatsappAccountIds || campaign.channelIds || [],
          templateId: campaign.templateId,
          segmentId: campaign.segmentId,
          pipelineStageIds: pipelineStageIds.length > 0 ? pipelineStageIds : undefined,
          campaignType: campaign.campaignType || 'immediate',
          messageType: campaign.messageType || WHATSAPP_MESSAGE_TYPES.TEXT,
          scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '',
          rateLimitSettings: campaign.rateLimitSettings || {
            messages_per_minute: 10,
            messages_per_hour: 200,
            messages_per_day: 1000,
            delay_between_messages: 6,
            humanization_enabled: true,
          },
          antiBanSettings: campaign.antiBanSettings || {
            enabled: true,
            mode: 'moderate',
            businessHoursOnly: false,
            respectWeekends: false,
            randomizeDelay: true,
            minDelay: 3,
            maxDelay: 15,
            accountRotation: true,
            cooldownPeriod: 30,
            messageVariation: false
          },
          recurringDailySettings: campaign.recurringDailySettings || (campaign.campaignType === 'recurring_daily' && campaign.dripSettings ? {
            enabled: true,
            sendTimes: campaign.dripSettings.sendTimes || ['10:00'],
            offDays: campaign.dripSettings.offDays || [],
            timezone: campaign.timezone || campaign.dripSettings.timezone || 'UTC',
            startDate: campaign.dripSettings.startDate,
            endDate: campaign.dripSettings.endDate
          } : undefined)
        });
      }
    } catch (error) {
      console.error('Failed to fetch campaign data:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.builder.messages.load_error', 'Failed to load campaign data'),
        variant: 'destructive'
      });
    }
  };

  const calculateOptimalRateLimit = async () => {
    try {
      const selectedSegment = segments.find(s => s.id === campaignData.segmentId);
      const recipientCount = selectedSegment?.contactCount || 0;
      const accountCount = (campaignData.whatsappAccountIds?.length || campaignData.channelIds?.length || 1);

      if (recipientCount > 0) {
        const calculation = whatsappRateLimitService.calculateOptimalRateLimit(
          campaignData.whatsappChannelType,
          recipientCount,
          accountCount,
          'medium' // Default priority level
        );

        setRateLimitCalculation(calculation);


        setCampaignData(prev => ({
          ...prev,
          rateLimitSettings: {
            ...prev.rateLimitSettings,
            messages_per_minute: calculation.recommended_messages_per_minute,
            delay_between_messages: Math.ceil(calculation.recommended_delay_ms / 1000)
          }
        }));
      }
    } catch (error) {
      console.error('Failed to calculate optimal rate limit:', error);
    }
  };

  const validateContent = async () => {
    try {

      const clientValidation = validateWhatsAppContent(
        campaignData.content,
        campaignData.whatsappChannelType,
        campaignData.messageType
      );


      const response = await fetch('/api/campaigns/validate-whatsapp-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: campaignData.content,
          whatsappChannelType: campaignData.whatsappChannelType,
          messageType: campaignData.messageType
        })
      });

      const data = await response.json();
      if (data.success) {

        const combinedValidation = {
          ...clientValidation,
          issues: [...clientValidation.issues, ...(data.data.issues || [])],
          warnings: [...clientValidation.warnings, ...(data.data.warnings || [])],
          score: Math.min(clientValidation.score, data.data.score || 100)
        };
        setContentValidation(combinedValidation);
      } else {

        setContentValidation(clientValidation);
      }
    } catch (error) {
      console.error('Failed to validate content:', error);

      const clientValidation = validateWhatsAppContent(
        campaignData.content,
        campaignData.whatsappChannelType,
        campaignData.messageType
      );
      setContentValidation(clientValidation);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === parseInt(templateId));
    if (template) {
      setCampaignData(prev => ({
        ...prev,
        templateId: template.id,
        content: template.content,
        mediaUrls: template.mediaUrls || []
      }));
    }
  };

  const handleSegmentSelect = (segmentId: string) => {
    setCampaignData(prev => ({
      ...prev,
      segmentId: parseInt(segmentId)
    }));
  };

  const handleSegmentCreated = async (newSegment: ContactSegment) => {
    setSegments(prev => [newSegment, ...prev]);

    setCampaignData(prev => ({
      ...prev,
      segmentId: newSegment.id
    }));


    await fetchSegments();

    toast({
      title: t('common.success', 'Success'),
      description: t('campaigns.builder.messages.segment_created', 'Segment "{{name}}" created and selected', { name: newSegment.name })
    });
  };

  const handleTemplateCreated = (newTemplate: CampaignTemplate) => {
    setTemplates(prev => [newTemplate, ...prev]);

    setCampaignData(prev => ({
      ...prev,
      templateId: newTemplate.id,
      content: newTemplate.content,
      mediaUrls: newTemplate.mediaUrls || []
    }));

    toast({
      title: t('common.success', 'Success'),
      description: t('campaigns.builder.messages.template_created', 'Template "{{name}}" created and selected', { name: newTemplate.name })
    });
  };

  const handleTemplateUpdated = (updatedTemplate: CampaignTemplate | null) => {
    if (updatedTemplate === null) {
      setTemplates(prev => prev.filter(t => t.id !== editTemplateId));
      if (campaignData.templateId === editTemplateId) {
        setCampaignData(prev => ({
          ...prev,
          templateId: undefined,
          content: ''
        }));
      }
    } else {
      setTemplates(prev => prev.map(t => t.id === updatedTemplate.id ? updatedTemplate : t));
      if (campaignData.templateId === updatedTemplate.id) {
        setCampaignData(prev => ({
          ...prev,
          content: updatedTemplate.content,
          mediaUrls: updatedTemplate.mediaUrls || []
        }));
      }
    }
    setEditTemplateId(null);
  };

  const handleSegmentUpdated = async (updatedSegment: ContactSegment | null) => {
    if (updatedSegment === null) {

      setSegments(prev => prev.filter(s => s.id !== editSegmentId));
      if (campaignData.segmentId === editSegmentId) {
        setCampaignData(prev => ({
          ...prev,
          segmentId: undefined
        }));
      }
    } else {

      const completeSegment = {
        ...updatedSegment,
        contactCount: updatedSegment.contactCount || 0
      };


      setSegments(prev => {
        const updatedSegments = prev.map(s =>
          s.id === completeSegment.id ? completeSegment : s
        );


        const segmentExists = updatedSegments.some(s => s.id === completeSegment.id);
        if (!segmentExists) {
          console.warn('Segment not found in list, adding it');
          return [...updatedSegments, completeSegment];
        }

        return updatedSegments;
      });


      if (campaignData.segmentId === updatedSegment.id) {

        setCampaignData(prev => ({ ...prev }));
      }



      try {
        await fetchSegments();
      } catch (error) {
        console.warn('Failed to refresh segments after update:', error);

      }
    }
    setEditSegmentId(null);
  };



  const formatTimeTo12Hour = (time24: string): string => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
  };


  const formatTimeTo24Hour = (time12: string): string => {
    const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return time12; // Return as-is if format doesn't match
    
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3].toUpperCase();
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const handleUpdateSendTime = (index: number, newTime: string) => {

    const time24 = newTime;
    
    if (!time24 || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time24)) {
      toast({
        title: t('campaigns.builder.basic.invalid_time', 'Invalid Time'),
        description: t('campaigns.builder.basic.invalid_time_format', 'Please enter a valid time in HH:mm format'),
        variant: 'destructive'
      });
      return;
    }

    const currentTimes = campaignData.recurringDailySettings?.sendTimes || [];
    

    if (currentTimes[index] === time24) {
      setEditingSendTimeIndex(null);
      return;
    }


    const otherTimes = currentTimes.filter((_, i) => i !== index);
    if (otherTimes.includes(time24)) {
      toast({
        title: t('campaigns.builder.basic.duplicate_time', 'Duplicate Time'),
        description: t('campaigns.builder.basic.time_already_added', 'This time has already been added'),
        variant: 'destructive'
      });
      return;
    }


    const [newHour, newMinute] = time24.split(':').map(Number);
    const newTimeMinutes = newHour * 60 + newMinute;
    
    for (let i = 0; i < otherTimes.length; i++) {
      const [existingHour, existingMinute] = otherTimes[i].split(':').map(Number);
      const existingTimeMinutes = existingHour * 60 + existingMinute;
      const timeDifference = Math.abs(newTimeMinutes - existingTimeMinutes);
      
      if (timeDifference < RECURRING_DAILY_LIMITS.MIN_TIME_INTERVAL_MINUTES && timeDifference > 0) {
        toast({
          title: t('campaigns.builder.basic.min_time_interval', 'Time Interval Too Short'),
          description: t('campaigns.builder.basic.min_time_interval_message', 'Send times must be at least {minutes} minutes apart', { minutes: RECURRING_DAILY_LIMITS.MIN_TIME_INTERVAL_MINUTES }),
          variant: 'destructive'
        });
        return;
      }
    }


    const updatedTimes = [...currentTimes];
    updatedTimes[index] = time24;


    const sortedTimes = updatedTimes.sort((a, b) => {
      const [aHours, aMinutes] = a.split(':').map(Number);
      const [bHours, bMinutes] = b.split(':').map(Number);
      return aHours * 60 + aMinutes - (bHours * 60 + bMinutes);
    });

    setCampaignData(prev => ({
      ...prev,
      recurringDailySettings: {
        ...prev.recurringDailySettings!,
        sendTimes: sortedTimes
      }
    }));

    setEditingSendTimeIndex(null);
  };

  const handleAddSendTime = (time: string) => {
    if (!time || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      toast({
        title: t('campaigns.builder.basic.invalid_time', 'Invalid Time'),
        description: t('campaigns.builder.basic.invalid_time_format', 'Please enter a valid time in HH:mm format'),
        variant: 'destructive'
      });
      return;
    }

    const currentTimes = campaignData.recurringDailySettings?.sendTimes || [];
    

    if (currentTimes.length >= RECURRING_DAILY_LIMITS.MAX_SEND_TIMES) {
      toast({
        title: t('campaigns.builder.basic.max_send_times_reached', 'Maximum Send Times Reached'),
        description: t('campaigns.builder.basic.max_send_times_message', 'You can only add up to {max} send times', { max: RECURRING_DAILY_LIMITS.MAX_SEND_TIMES }),
        variant: 'destructive'
      });
      return;
    }

    if (currentTimes.includes(time)) {
      toast({
        title: t('campaigns.builder.basic.duplicate_time', 'Duplicate Time'),
        description: t('campaigns.builder.basic.time_already_added', 'This time has already been added'),
        variant: 'destructive'
      });
      return;
    }


    const [newHour, newMinute] = time.split(':').map(Number);
    const newTimeMinutes = newHour * 60 + newMinute;
    
    for (const existingTime of currentTimes) {
      const [existingHour, existingMinute] = existingTime.split(':').map(Number);
      const existingTimeMinutes = existingHour * 60 + existingMinute;
      const timeDifference = Math.abs(newTimeMinutes - existingTimeMinutes);
      
      if (timeDifference < RECURRING_DAILY_LIMITS.MIN_TIME_INTERVAL_MINUTES && timeDifference > 0) {
        toast({
          title: t('campaigns.builder.basic.min_time_interval', 'Time Interval Too Short'),
          description: t('campaigns.builder.basic.min_time_interval_message', 'Send times must be at least {minutes} minutes apart', { minutes: RECURRING_DAILY_LIMITS.MIN_TIME_INTERVAL_MINUTES }),
          variant: 'destructive'
        });
        return;
      }
    }

    const sortedTimes = [...currentTimes, time].sort((a, b) => {
      const [aHours, aMinutes] = a.split(':').map(Number);
      const [bHours, bMinutes] = b.split(':').map(Number);
      return aHours * 60 + aMinutes - (bHours * 60 + bMinutes);
    });

    setCampaignData(prev => ({
      ...prev,
      recurringDailySettings: {
        ...prev.recurringDailySettings!,
        sendTimes: sortedTimes
      }
    }));
  };

  const handleRemoveSendTime = (index: number) => {
    const currentTimes = campaignData.recurringDailySettings?.sendTimes || [];
    if (currentTimes.length <= 1) {
      toast({
        title: t('campaigns.builder.basic.min_send_times', 'Minimum Send Times'),
        description: t('campaigns.builder.basic.at_least_one_time', 'At least one send time is required'),
        variant: 'destructive'
      });
      return;
    }

    setCampaignData(prev => ({
      ...prev,
      recurringDailySettings: {
        ...prev.recurringDailySettings!,
        sendTimes: currentTimes.filter((_, i) => i !== index)
      }
    }));
  };

  const handleToggleOffDay = (dayNumber: number) => {
    const currentOffDays = campaignData.recurringDailySettings?.offDays || [];
    const newOffDays = currentOffDays.includes(dayNumber)
      ? currentOffDays.filter(d => d !== dayNumber)
      : [...currentOffDays, dayNumber];


    if (newOffDays.length === 7) {
      toast({
        title: t('campaigns.builder.basic.invalid_off_days', 'Invalid Configuration'),
        description: t('campaigns.builder.basic.all_days_off', 'Cannot mark all days as off days'),
        variant: 'destructive'
      });
      return;
    }

    setCampaignData(prev => ({
      ...prev,
      recurringDailySettings: {
        ...prev.recurringDailySettings!,
        offDays: newOffDays
      }
    }));
  };

  const handleAutoDetectTimezone = () => {
    const detectedTimezone = getBrowserTimezone();
    setCampaignData(prev => ({
      ...prev,
      recurringDailySettings: {
        ...prev.recurringDailySettings!,
        timezone: detectedTimezone
      }
    }));
    toast({
      title: t('campaigns.builder.basic.timezone_detected', 'Timezone Detected'),
      description: t('campaigns.builder.basic.timezone_set_to', 'Timezone set to {timezone}', { timezone: detectedTimezone }),
    });
  };

  const handleSegmentDelete = async (segmentId: number) => {
    if (!confirm(t('campaigns.builder.audience.delete_segment_confirm', 'Are you sure you want to delete this segment? This action cannot be undone.'))) {
      return;
    }

    try {
      const response = await fetch(`/api/campaigns/segments/${segmentId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {

        setSegments(prev => prev.filter(s => s.id !== segmentId));

        if (campaignData.segmentId === segmentId) {
          setCampaignData(prev => ({
            ...prev,
            segmentId: undefined
          }));
        }


        await fetchSegments();

        toast({
          title: t('common.success', 'Success'),
          description: t('campaigns.builder.audience.delete_segment_success', 'Segment deleted successfully')
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.builder.audience.delete_segment_failed', 'Failed to delete segment'),
        variant: 'destructive'
      });
    }
  };

  const handleNext = () => {

    if (currentStep === 0) {

      if (!campaignData.name || !campaignData.name.trim()) {
        toast({
          title: t('common.error', 'Error'),
          description: t('campaigns.builder.basic.name_required', 'Please enter a campaign name before proceeding to the next step.'),
          variant: 'destructive'
        });
        return;
      }


      const hasChannelSelected = 
        (campaignData.channelIds && campaignData.channelIds.length > 0) ||
        (campaignData.channelId !== undefined && campaignData.channelId !== null);
      
      if (!hasChannelSelected) {
        toast({
          title: t('common.error', 'Error'),
          description: t('campaigns.builder.basic.channel_required', 'Please select at least one WhatsApp connection before proceeding to the next step.'),
          variant: 'destructive'
        });
        return;
      }
    }

    if (currentStep < CAMPAIGN_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const resetCampaignBuilder = () => {
    setCampaignData({
      name: '',
      description: '',
      content: '',
      mediaUrls: [],
      whatsappChannelType: WHATSAPP_CHANNEL_TYPES.UNOFFICIAL,
      campaignType: 'immediate',
      messageType: WHATSAPP_MESSAGE_TYPES.TEXT,
      rateLimitSettings: {
        messages_per_minute: 10,
        messages_per_hour: 200,
        messages_per_day: 1000,
        delay_between_messages: 6,
        humanization_enabled: true,
        respect_whatsapp_limits: true,
        adaptive_rate_limiting: true
      },
      antiBanSettings: {
        enabled: true,
        mode: 'moderate',
        businessHoursOnly: false,
        respectWeekends: false,
        randomizeDelay: true,
        minDelay: 3,
        maxDelay: 15,
        accountRotation: true,
        cooldownPeriod: 30,
        messageVariation: false,
        avoidSpamTriggers: true,
        useTypingIndicators: true,
        randomizeMessageTiming: true,
        respectRecipientTimezone: false
      }
    });

    setCurrentStep(0);

    setContentValidation(null);

    setIsSegmentModalOpen(false);
    setIsTemplateModalOpen(false);
    setEditSegmentId(null);
    setEditTemplateId(null);
    setShowLaunchConfirmation(false);
  };

  const validateCampaignData = () => {
    const errors: string[] = [];

    if (!campaignData.name.trim()) {
      errors.push(t('campaigns.builder.validation.name_required', 'Campaign name is required'));
    }


    const hasAccounts = (campaignData.whatsappAccountIds?.length || 0) > 0 ||
                       (campaignData.channelIds?.length || 0) > 0 ||
                       campaignData.whatsappAccountId ||
                       campaignData.channelId;

    if (!hasAccounts) {
      errors.push(t('campaigns.builder.validation.connection_required', 'At least one WhatsApp connection is required'));
    }


    if (!campaignData.segmentId && (!campaignData.pipelineStageIds || campaignData.pipelineStageIds.length === 0)) {
      errors.push(t('campaigns.builder.validation.segment_or_pipeline_required', 'Either an audience segment or a pipeline stage filter is required'));
    }

    if (!campaignData.content.trim()) {
      errors.push(t('campaigns.builder.validation.content_required', 'Message content is required'));
    }


    if (campaignData.content.length > WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH) {
      errors.push(t('campaigns.builder.validation.content_too_long', 'Message content exceeds WhatsApp limit of {{limit}} characters', {
        limit: WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH
      }));
    }

    if (campaignData.campaignType === 'scheduled' && !campaignData.scheduledAt) {
      errors.push(t('campaigns.builder.validation.schedule_required', 'Scheduled date and time is required for scheduled campaigns'));
    }


    if (campaignData.campaignType === 'recurring_daily') {
      const settings = campaignData.recurringDailySettings;
      if (!settings) {
        errors.push(t('campaigns.builder.validation.recurring_settings_required', 'Recurring daily settings are required'));
      } else {
        if (!settings.sendTimes || settings.sendTimes.length === 0) {
          errors.push(t('campaigns.builder.validation.send_times_required', 'At least one send time is required'));
        } else {

          const invalidTimes = settings.sendTimes.filter(time => !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time));
          if (invalidTimes.length > 0) {
            errors.push(t('campaigns.builder.validation.invalid_time_format', 'Invalid time format. Use HH:mm format'));
          }
        }
        if (!settings.timezone || settings.timezone.trim() === '') {
          errors.push(t('campaigns.builder.validation.timezone_required', 'Timezone is required'));
        }
        if (settings.offDays && settings.offDays.length === 7) {
          errors.push(t('campaigns.builder.validation.all_days_off', 'Cannot mark all days as off days'));
        }
      }
    }

    if (campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL) {
      if (campaignData.messageType === WHATSAPP_MESSAGE_TYPES.TEMPLATE && !campaignData.templateId) {
        errors.push(t('campaigns.builder.validation.template_required', 'Template is required for official WhatsApp API template messages'));
      }
    }

    return errors;
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const url = isEditMode ? `/api/campaigns/${campaignId}` : '/api/campaigns';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData)
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: isEditMode ? t('campaigns.builder.messages.update_success', 'Campaign updated successfully') : t('campaigns.builder.messages.save_success', 'Campaign saved as draft')
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: isEditMode ? t('campaigns.builder.messages.update_error', 'Failed to update campaign') : t('campaigns.builder.messages.save_error', 'Failed to save campaign'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchClick = () => {
    const validationErrors = validateCampaignData();
    if (validationErrors.length > 0) {
      toast({
        title: t('campaigns.builder.validation.error_title', 'Validation Error'),
        description: validationErrors.join(', '),
        variant: 'destructive'
      });
      return;
    }

    setShowLaunchConfirmation(true);
  };

  const handleLaunchConfirm = async () => {
    setShowLaunchConfirmation(false);
    setLoading(true);

    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData)
      });

      const data = await response.json();
      if (data.success) {
        const campaignId = data.data.id;
        const selectedSegment = segments.find(s => s.id === campaignData.segmentId);

        const contactCount = selectedSegment?.contactCount || data.data.totalRecipients || 0;


        if (campaignData.campaignType === 'scheduled' && campaignData.scheduledAt) {
          const scheduledDate = new Date(campaignData.scheduledAt);
          const now = new Date();
          
          if (scheduledDate > now) {

            toast({
              title: t('campaigns.builder.messages.scheduled_success_title', 'Campaign Scheduled Successfully! 📅'),
              description: t('campaigns.builder.messages.scheduled_success_description', '"{{name}}" is scheduled for {{date}} and will send messages to {{count}} contacts', { 
                name: campaignData.name, 
                date: scheduledDate.toLocaleString(),
                count: contactCount 
              })
            });

            resetCampaignBuilder();

            setTimeout(() => {
              setLocation('/campaigns');
            }, 2000);
            return;
          }
        }


        const startResponse = await fetch(`/api/campaigns/${campaignId}/start`, {
          method: 'POST'
        });

        const startData = await startResponse.json();
        if (startData.success) {
          toast({
            title: t('campaigns.builder.messages.launch_success_title', 'Campaign Launched Successfully! 🚀'),
            description: t('campaigns.builder.messages.launch_success_description', '"{{name}}" is now running and will send messages to {{count}} contacts', { name: campaignData.name, count: contactCount })
          });

          resetCampaignBuilder();

          setTimeout(() => {
            setLocation('/campaigns');
          }, 2000);

        } else {
          throw new Error(startData.error);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Campaign launch error:', error);
      toast({
        title: t('campaigns.builder.messages.launch_error_title', 'Launch Failed'),
        description: error instanceof Error ? error.message : t('campaigns.builder.messages.launch_error_description', 'Failed to launch campaign. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };


  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const file = files[0]; // Only handle single file for now


    const maxSize = 16 * 1024 * 1024; // 16MB WhatsApp limit
    if (file.size > maxSize) {
      toast({
        title: t('campaigns.builder.content.file_too_large', 'File Too Large'),
        description: t('campaigns.builder.content.max_file_size', 'Maximum file size is 16MB'),
        variant: 'destructive'
      });
      return;
    }


    const validTypes = getValidFileTypes(campaignData.messageType);
    if (!validTypes.includes(file.type)) {
      toast({
        title: t('campaigns.builder.content.invalid_file_type', 'Invalid File Type'),
        description: t('campaigns.builder.content.supported_formats', 'Please select a supported file format'),
        variant: 'destructive'
      });
      return;
    }

    setMediaFiles([file]);


    try {
      setUploadingMedia(true);

      const formData = new FormData();
      formData.append('media', file);

      const response = await fetch('/api/campaigns/templates/upload-media', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();


      setCampaignData(prev => ({
        ...prev,
        mediaUrls: [data.data.url] // Use server URL instead of blob URL
      }));

      toast({
        title: t('campaigns.builder.content.file_uploaded', 'File Uploaded'),
        description: t('campaigns.builder.content.file_ready', 'File is ready for use')
      });
    } catch (error) {
      console.error('Media upload failed:', error);
      toast({
        title: t('campaigns.builder.content.upload_failed', 'Upload Failed'),
        description: t('campaigns.builder.content.upload_error', 'Failed to upload media file. Please try again.'),
        variant: 'destructive'
      });

      setMediaFiles([]);
      return;
    } finally {
      setUploadingMedia(false);
    }


    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [campaignData.messageType, toast, t]);

  const handleChooseFileClick = useCallback(() => {
    if (fileInputRef.current) {

      const acceptTypes = getAcceptTypes(campaignData.messageType);
      fileInputRef.current.accept = acceptTypes;
      fileInputRef.current.click();
    }
  }, [campaignData.messageType]);

  const getValidFileTypes = (messageType: string): string[] => {
    switch (messageType) {
      case WHATSAPP_MESSAGE_TYPES.IMAGE:
        return ['image/jpeg', 'image/png', 'image/webp'];
      case WHATSAPP_MESSAGE_TYPES.VIDEO:
        return ['video/mp4', 'video/3gpp'];
      case WHATSAPP_MESSAGE_TYPES.AUDIO:
        return ['audio/mpeg', 'audio/aac', 'audio/ogg'];
      case WHATSAPP_MESSAGE_TYPES.DOCUMENT:
        return ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      default:
        return [];
    }
  };

  const getAcceptTypes = (messageType: string): string => {
    switch (messageType) {
      case WHATSAPP_MESSAGE_TYPES.IMAGE:
        return 'image/jpeg,image/png,image/webp';
      case WHATSAPP_MESSAGE_TYPES.VIDEO:
        return 'video/mp4,video/3gpp';
      case WHATSAPP_MESSAGE_TYPES.AUDIO:
        return 'audio/mpeg,audio/aac,audio/ogg';
      case WHATSAPP_MESSAGE_TYPES.DOCUMENT:
        return '.pdf,.doc,.docx';
      default:
        return '';
    }
  };

  const removeMediaFile = useCallback((index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));


    setCampaignData(prev => ({
      ...prev,
      mediaUrls: prev.mediaUrls?.filter((_, i) => i !== index) || []
    }));

    toast({
      title: t('campaigns.builder.content.file_removed', 'File Removed'),
      description: t('campaigns.builder.content.file_removed_desc', 'Media file has been removed')
    });
  }, [toast, t]);

  const renderStepContent = () => {
    const step = CAMPAIGN_STEPS[currentStep];

    switch (step.id) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('campaigns.builder.basic.name_label', 'Campaign Name')}</Label>
              <Input
                id="name"
                value={campaignData.name}
                onChange={(e) => setCampaignData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('campaigns.builder.basic.name_placeholder', 'Enter campaign name')}
              />
            </div>

            <div>
              <Label htmlFor="description">{t('campaigns.builder.basic.description_label', 'Description')}</Label>
              <Textarea
                id="description"
                value={campaignData.description}
                onChange={(e) => setCampaignData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('campaigns.builder.basic.description_placeholder', 'Describe your campaign')}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="whatsappChannelType">{t('campaigns.builder.basic.channel_type_label', 'WhatsApp Channel Type')}</Label>
              <Select
                value={campaignData.whatsappChannelType}
                onValueChange={(value: any) => {
                  setCampaignData(prev => ({
                    ...prev,
                    whatsappChannelType: value,

                    rateLimitSettings: {
                      ...prev.rateLimitSettings,
                      ...getCampaignRateLimits(value)
                    }
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('campaigns.builder.basic.channel_type_placeholder', 'Select WhatsApp channel type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHATSAPP_CHANNEL_TYPES.OFFICIAL}>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <div>
                        <div className="font-medium">{t('campaigns.builder.basic.official_api', 'Official WhatsApp Business API')}</div>
                        <div className="text-xs text-muted-foreground">{t('campaigns.builder.basic.official_description', 'High volume, templates, interactive messages')}</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value={WHATSAPP_CHANNEL_TYPES.UNOFFICIAL}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <div>
                        <div className="font-medium">{t('campaigns.builder.basic.unofficial_web', 'Unofficial WhatsApp Web/Desktop')}</div>
                        <div className="text-xs text-muted-foreground">{t('campaigns.builder.basic.unofficial_description', 'Lower volume, basic messages only')}</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Channel Type Warnings */}
              {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL && (
                <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-orange-800 dark:text-orange-400">{t('campaigns.builder.basic.unofficial_warning_title', 'Unofficial Channel Limitations')}</div>
                      <ul className="mt-1 text-orange-700 dark:text-orange-300 space-y-1">
                        <li>• {t('campaigns.builder.basic.unofficial_limit_1', 'Lower rate limits (20 messages/minute)')}</li>
                        <li>• {t('campaigns.builder.basic.unofficial_limit_2', 'Business hours restrictions recommended')}</li>
                        <li>• {t('campaigns.builder.basic.unofficial_limit_3', 'No delivery/read receipts')}</li>
                        <li>• {t('campaigns.builder.basic.unofficial_limit_4', 'Higher risk of account restrictions')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL && (
                <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-green-800 dark:text-green-400">{t('campaigns.builder.basic.official_benefits_title', 'Official API Benefits')}</div>
                      <ul className="mt-1 text-green-700 dark:text-green-300 space-y-1">
                        <li>• {t('campaigns.builder.basic.official_benefit_1', 'High volume messaging (1000+ messages/minute)')}</li>
                        <li>• {t('campaigns.builder.basic.official_benefit_2', 'Delivery and read receipts')}</li>
                        <li>• {t('campaigns.builder.basic.official_benefit_3', 'Interactive messages and templates')}</li>
                        <li>• {t('campaigns.builder.basic.official_benefit_4', 'Better deliverability and compliance')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="channelIds">{t('campaigns.builder.basic.connections_label', 'WhatsApp Connections')}</Label>
              <p className="text-sm text-muted-foreground mb-2">
                {t('campaigns.builder.basic.connections_description', 'Select multiple WhatsApp accounts for better distribution and anti-ban protection')}
              </p>
              {connectionsLoading ? (
                <div className="flex items-center justify-center p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : whatsappConnections.length === 0 ? (
                <div className="p-4 border border-dashed border-border rounded-lg text-center">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">{t('campaigns.builder.basic.no_connections', 'No WhatsApp connections available')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('campaigns.builder.basic.setup_connection', 'Please set up a WhatsApp connection in Settings > Channel Connections first')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {whatsappConnections.map((connection: any) => {
                      const isSelected = campaignData.channelIds?.includes(connection.id) ||
                                       (campaignData.channelId === connection.id && !campaignData.channelIds?.length);

                      return (
                        <div key={connection.id} className="flex items-center space-x-3 p-2 hover:bg-muted rounded">
                          <input
                            type="checkbox"
                            id={`connection-${connection.id}`}
                            checked={isSelected}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setCampaignData(prev => {
                                let newChannelIds = prev.channelIds || [];

                                if (isChecked) {
                                  if (!newChannelIds.includes(connection.id)) {
                                    newChannelIds = [...newChannelIds, connection.id];
                                  }
                                } else {
                                  newChannelIds = newChannelIds.filter(id => id !== connection.id);
                                }

                                return {
                                  ...prev,
                                  channelIds: newChannelIds,
                                  whatsappAccountId: newChannelIds.length > 0 ? newChannelIds[0] : undefined,
                                  whatsappAccountIds: newChannelIds
                                };
                              });
                            }}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <label htmlFor={`connection-${connection.id}`} className="flex items-center gap-2 flex-1 cursor-pointer">
                            <i className="ri-whatsapp-line text-green-600"></i>
                            <span className="font-medium">{connection.accountName}</span>
                            <Badge variant="secondary" className="ml-auto !bg-muted !text-muted-foreground">
                              {connection.status}
                            </Badge>
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  {(campaignData.channelIds?.length || 0) > 0 && (
                    <div className="text-sm text-muted-foreground">
                      <strong>{campaignData.channelIds?.length || 0}</strong> {t('campaigns.builder.basic.accounts_selected', 'account(s) selected for distribution')}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const allIds = whatsappConnections.map((conn: any) => conn.id);
                        setCampaignData(prev => ({
                          ...prev,
                          channelIds: allIds,
                          whatsappAccountId: allIds[0],
                          whatsappAccountIds: allIds
                        }));
                      }}
                    >
                      {t('campaigns.builder.basic.select_all', 'Select All')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCampaignData(prev => ({
                          ...prev,
                          channelIds: [],
                          whatsappAccountId: undefined,
                          whatsappAccountIds: []
                        }));
                      }}
                    >
                      {t('campaigns.builder.basic.clear_all', 'Clear All')}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="campaignType">{t('campaigns.builder.basic.type_label', 'Campaign Type')}</Label>
              <Select
                value={campaignData.campaignType}
                onValueChange={(value: any) => setCampaignData(prev => ({ ...prev, campaignType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">{t('campaigns.builder.basic.type_immediate', 'Send Immediately')}</SelectItem>
                  <SelectItem value="scheduled">{t('campaigns.builder.basic.type_scheduled', 'Schedule for Later')}</SelectItem>
                  <SelectItem value="recurring_daily">{t('campaigns.builder.basic.type_recurring_daily', 'Recurring Daily')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {campaignData.campaignType === 'scheduled' && (
              <div>
                <Label htmlFor="scheduledAt">{t('campaigns.builder.basic.schedule_label', 'Scheduled Date & Time')}</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={campaignData.scheduledAt}
                  onChange={(e) => setCampaignData(prev => ({ ...prev, scheduledAt: e.target.value }))}
                />
              </div>
            )}

            {campaignData.campaignType === 'recurring_daily' && (
              <div className="space-y-6">
                {/* Send Times Section */}
                <div>
                  <Label>{t('campaigns.builder.basic.send_times_label', 'Send Times')}</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {campaignData.recurringDailySettings?.sendTimes.map((time, index) => (
                        <div key={index} className="flex items-center gap-1">
                          {editingSendTimeIndex === index ? (
                            <Input
                              type="time"
                              defaultValue={time}
                              className="w-36 font-bold text-lg"
                              autoFocus
                              onBlur={(e) => {
                                if (e.target.value) {
                                  handleUpdateSendTime(index, e.target.value);
                                } else {
                                  setEditingSendTimeIndex(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const input = e.target as HTMLInputElement;
                                  if (input.value) {
                                    handleUpdateSendTime(index, input.value);
                                  } else {
                                    setEditingSendTimeIndex(null);
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingSendTimeIndex(null);
                                }
                              }}
                            />
                          ) : (
                            <Badge 
                              variant="secondary" 
                              className="flex items-center gap-1 cursor-pointer hover:bg-muted/80 font-bold text-lg px-3 py-1.5 !bg-muted !text-muted-foreground"
                              onClick={() => setEditingSendTimeIndex(index)}
                            >
                              <span className="font-bold text-lg">{formatTimeTo12Hour(time)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSendTime(index);
                                }}
                                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        id="newSendTime"
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const input = e.target as HTMLInputElement;
                            if (input.value) {
                              handleAddSendTime(input.value);
                              input.value = '';
                            }
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const input = document.getElementById('newSendTime') as HTMLInputElement;
                          if (input?.value) {
                            handleAddSendTime(input.value);
                            input.value = '';
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {t('campaigns.builder.basic.add_time', 'Add Time')}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Off Days Section */}
                <div>
                  <Label>{t('campaigns.builder.basic.off_days_label', 'Off Days')}</Label>
                  <p className="text-sm text-muted-foreground mt-1 mb-3">
                    {t('campaigns.builder.basic.off_days_description', 'Select days when the campaign should NOT be sent')}
                  </p>
                  <div className="grid grid-cols-7 gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <div key={day.value} className="flex flex-col items-center gap-1">
                        <Checkbox
                          id={`offDay-${day.value}`}
                          checked={(campaignData.recurringDailySettings?.offDays || []).includes(day.value)}
                          onCheckedChange={() => handleToggleOffDay(day.value)}
                        />
                        <Label
                          htmlFor={`offDay-${day.value}`}
                          className="text-xs cursor-pointer text-center"
                        >
                          {day.short}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timezone Section */}
                <div>
                  <Label>{t('campaigns.builder.basic.timezone_label', 'Timezone')}</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <TimezoneSelector
                        value={campaignData.recurringDailySettings?.timezone || 'UTC'}
                        onChange={(tz) => {
                          setCampaignData(prev => ({
                            ...prev,
                            recurringDailySettings: {
                              ...prev.recurringDailySettings!,
                              timezone: tz
                            }
                          }));
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAutoDetectTimezone}
                      >
                        {t('campaigns.builder.basic.auto_detect_timezone', 'Auto-detect Timezone')}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Date Range Section (Optional) */}
                <div>
                  <Label>{t('campaigns.builder.basic.campaign_duration', 'Campaign Duration (Optional)')}</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="recurringStartDate" className="text-xs text-muted-foreground">
                        {t('campaigns.builder.basic.start_date', 'Start Date')}
                      </Label>
                      <Input
                        id="recurringStartDate"
                        type="date"
                        value={campaignData.recurringDailySettings?.startDate || ''}
                        onChange={(e) => {
                          setCampaignData(prev => ({
                            ...prev,
                            recurringDailySettings: {
                              ...prev.recurringDailySettings!,
                              startDate: e.target.value || undefined
                            }
                          }));
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="recurringEndDate" className="text-xs text-muted-foreground">
                        {t('campaigns.builder.basic.end_date', 'End Date')}
                      </Label>
                      <Input
                        id="recurringEndDate"
                        type="date"
                        value={campaignData.recurringDailySettings?.endDate || ''}
                        onChange={(e) => {
                          setCampaignData(prev => ({
                            ...prev,
                            recurringDailySettings: {
                              ...prev.recurringDailySettings!,
                              endDate: e.target.value || undefined
                            }
                          }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'audience':
        const filteredSegments = segments.filter(segment => 
          segment.name.toLowerCase().includes(segmentSearchQuery.toLowerCase()) ||
          segment.description?.toLowerCase().includes(segmentSearchQuery.toLowerCase())
        );

        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{t('campaigns.builder.audience.segment_label', 'Select Audience Segment')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('campaigns.builder.audience.segment_description', 'Choose a contact segment to target with this campaign')}
                  </p>
                </div>
                <Button
                  type="button"
                  size="default"
                  onClick={() => setIsSegmentModalOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('campaigns.builder.audience.create_segment', 'Create New Segment')}
                </Button>
              </div>

              <div className="mb-4">
                <Input
                  placeholder={t('campaigns.builder.audience.search_segments', 'Search segments...')}
                  value={segmentSearchQuery}
                  onChange={(e) => setSegmentSearchQuery(e.target.value)}
                  className="max-w-md"
                />
              </div>

              {segmentsLoading ? (
                <SkeletonLoader type="card" count={4} />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {filteredSegments.map((segment) => (
                      <div key={segment.id} className="group">
                        <SegmentCard
                          segment={segment}
                          isSelected={campaignData.segmentId === segment.id}
                          onSelect={() => handleSegmentSelect(segment.id.toString())}
                          onEdit={() => setEditSegmentId(segment.id)}
                          onDelete={() => handleSegmentDelete(segment.id)}
                        />
                      </div>
                    ))}
                  </div>

                  {filteredSegments.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                      <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground mb-2">
                        {segmentSearchQuery
                          ? t('campaigns.builder.audience.no_segments_found', 'No segments found matching your search')
                          : t('campaigns.builder.audience.no_segments', 'No segments available')}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsSegmentModalOpen(true)}
                        className="mt-2"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('campaigns.builder.audience.create_first_segment', 'Create your first segment')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <Label>{t('campaigns.builder.audience.pipeline_stage_label', 'Filter by Pipeline Stage (Optional)')}</Label>
              <Select
                value={selectedPipelineStageId?.toString() || undefined}
                onValueChange={(value) => {
                  const stageId = value ? parseInt(value) : undefined;
                  setSelectedPipelineStageId(stageId);

                  setCampaignData(prev => ({
                    ...prev,
                    pipelineStageIds: stageId ? [stageId] : undefined
                  }));
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={t('campaigns.builder.audience.pipeline_stage_placeholder', 'Select a pipeline stage')} />
                </SelectTrigger>
                <SelectContent>
                  {pipelineStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Badge style={{ backgroundColor: stage.color }} className="w-3 h-3 rounded-full p-0" />
                        <span>{stage.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPipelineStageId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedPipelineStageId(undefined);
                    setCampaignData(prev => ({
                      ...prev,
                      pipelineStageIds: undefined
                    }));
                  }}
                  className="mt-2 text-xs"
                >
                  {t('common.clear', 'Clear selection')}
                </Button>
              )}
            </div>

            {campaignData.segmentId && (
              <Card>
                <CardContent className="pt-4">
                  {(() => {
                    const segment = segments.find(s => s.id === campaignData.segmentId);
                    return segment ? (
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{segment.name}</h4>
                            <p className="text-sm text-muted-foreground">{segment.description}</p>
                            <p className="text-sm mt-2">
                              <strong>{segment.contactCount}</strong> {t('campaigns.builder.audience.unique_contacts_will_receive', 'unique contacts will receive this campaign')}
                            </p>
                            {selectedPipelineStageId && (() => {
                              const selectedStage = pipelineStages.find(s => s.id === selectedPipelineStageId);
                              return selectedStage ? (
                                <div className="mt-3 p-2 bg-muted rounded-md">
                                  <div className="flex items-center gap-2">
                                    <Badge style={{ backgroundColor: selectedStage.color }} className="w-3 h-3 rounded-full p-0" />
                                    <span className="text-sm font-medium">{selectedStage.name}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {t('campaigns.builder.audience.pipeline_stage_filter_info', 'Contacts with deals in this stage will receive the campaign')}
                                  </p>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 'content':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('campaigns.builder.content.template_label', 'Use Template (Optional)')}
                  </Label>
                  {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL && (
                    <Badge variant="secondary" className="text-xs !bg-muted !text-muted-foreground">
                      {t('campaigns.builder.content.approved_only', 'Approved only')}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    ({filteredTemplates.length} {t('campaigns.builder.content.available', 'available')})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('campaigns.builder.content.create_template', 'Create New Template')}
                </Button>
              </div>
              <div className="flex gap-2">
                <Select onValueChange={handleTemplateSelect} value={campaignData.templateId?.toString()}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t('campaigns.builder.content.template_placeholder', 'Choose a template')} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTemplates.length > 0 ? (
                      filteredTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          <div className="flex items-center justify-between w-full">
                            <span>
                              {template.name}
                              {template.whatsappTemplateName && ` (${template.whatsappTemplateName})`}
                            </span>
                            {template.whatsappTemplateId && (
                              <Badge variant="secondary" className="ml-2 text-xs !bg-muted !text-muted-foreground">
                                Meta
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                        {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL
                          ? t('campaigns.builder.content.no_approved_templates', 'No approved templates available. Please sync templates from Meta or create and submit new templates for approval.')
                          : t('campaigns.builder.content.no_templates', 'No templates available. Create a new template to get started.')}
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {campaignData.templateId && (() => {
                  const selectedTemplate = templates.find(t => t.id === campaignData.templateId);
                  const isMetaTemplate = selectedTemplate?.whatsappTemplateId ? true : false;

                  return (
                    <div className="relative group">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => !isMetaTemplate && setEditTemplateId(campaignData.templateId!)}
                        disabled={isMetaTemplate}
                        className="flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        {t('common.edit', 'Edit')}
                      </Button>
                      {isMetaTemplate && (
                        <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-[9999] w-64 p-2 bg-popover text-popover-foreground text-xs rounded shadow-lg pointer-events-none">
                          {t('campaigns.builder.content.meta_template_readonly', 'This template is synced from Meta Business Manager and can only be edited there.')}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="content">{t('campaigns.builder.content.message_label', 'Message Content')}</Label>
                {isOfficialTemplateSelected() && (
                  <Badge variant="secondary" className="text-xs !bg-muted !text-muted-foreground">
                    <Shield className="w-3 h-3 mr-1" />
                    {t('campaigns.builder.content.readonly_template', 'Approved Template (Read-only)')}
                  </Badge>
                )}
              </div>
              <Textarea
                ref={contentTextareaRef}
                id="content"
                value={campaignData.content}
                onChange={(e) => setCampaignData(prev => ({ ...prev, content: e.target.value }))}
                placeholder={t('campaigns.builder.content.message_placeholder', 'Enter your message content. Click \'Insert Variable\' to add personalization...')}
                rows={6}
                readOnly={isOfficialTemplateSelected()}
                className={isOfficialTemplateSelected() ? 'bg-muted cursor-not-allowed' : ''}
              />

              {!isOfficialTemplateSelected() && (
                <div className="mt-2">
                  <VariableInsertion
                    textareaRef={contentTextareaRef}
                    value={campaignData.content}
                    onChange={(content) => setCampaignData(prev => ({ ...prev, content }))}
                    customVariables={['company', 'position', 'location', 'industry']}
                  />
                </div>
              )}

              {isOfficialTemplateSelected() && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md">
                  <p className="text-sm text-blue-800 dark:text-blue-400">
                    <BadgeInfo className="w-4 h-4 inline mr-1" />
                    {t('campaigns.builder.content.template_readonly_info', 'This template content is approved by Meta and cannot be modified. Variables will be automatically replaced with recipient data when sending.')}
                  </p>
                </div>
              )}
            </div>

          </div>
        );

      case 'settings':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('campaigns.builder.settings.rate_limiting_title', 'Rate Limiting & Anti-Ban Settings')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="messagesPerMinute">{t('campaigns.builder.settings.messages_per_minute', 'Messages per Minute')}</Label>
                    <Input
                      id="messagesPerMinute"
                      type="number"
                      value={campaignData.rateLimitSettings.messages_per_minute}
                      onChange={(e) => setCampaignData(prev => ({
                        ...prev,
                        rateLimitSettings: {
                          ...prev.rateLimitSettings,
                          messages_per_minute: parseInt(e.target.value)
                        }
                      }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="messagesPerHour">{t('campaigns.builder.settings.messages_per_hour', 'Messages per Hour')}</Label>
                    <Input
                      id="messagesPerHour"
                      type="number"
                      value={campaignData.rateLimitSettings.messages_per_hour}
                      onChange={(e) => setCampaignData(prev => ({
                        ...prev,
                        rateLimitSettings: {
                          ...prev.rateLimitSettings,
                          messages_per_hour: parseInt(e.target.value)
                        }
                      }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="delayBetweenMessages">{t('campaigns.builder.settings.delay_between_messages', 'Delay Between Messages (seconds)')}</Label>
                  <Input
                    id="delayBetweenMessages"
                    type="number"
                    value={campaignData.rateLimitSettings.delay_between_messages}
                    onChange={(e) => setCampaignData(prev => ({
                      ...prev,
                      rateLimitSettings: {
                        ...prev.rateLimitSettings,
                        delay_between_messages: parseInt(e.target.value)
                      }
                    }))}
                  />
                </div>

                {/* Channel-specific rate limit warnings */}
                <div className={`p-3 rounded-lg border ${
                  campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900'
                    : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900'
                }`}>
                  <div className="flex items-start gap-2">
                    {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL ? (
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                    )}
                    <div className="text-sm">
                      <div className={`font-medium mb-1 ${
                        campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL
                          ? 'text-green-800 dark:text-green-400'
                          : 'text-orange-800 dark:text-orange-400'
                      }`}>
                        {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL
                          ? t('campaigns.builder.settings.official_limits_title', 'Official API Rate Limits')
                          : t('campaigns.builder.settings.unofficial_limits_title', 'Unofficial Channel Limits')
                        }
                      </div>
                      <div className={`space-y-1 ${
                        campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL
                          ? 'text-green-700'
                          : 'text-orange-700'
                      }`}>
                        {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL ? (
                          <>
                            <div>• {t('campaigns.builder.settings.official_limit_1', 'Up to 1000 messages per minute')}</div>
                            <div>• {t('campaigns.builder.settings.official_limit_2', 'Up to 100,000 messages per day')}</div>
                            <div>• {t('campaigns.builder.settings.official_limit_3', 'Burst sending supported')}</div>
                            <div>• {t('campaigns.builder.settings.official_limit_4', 'No business hours restrictions')}</div>
                          </>
                        ) : (
                          <>
                            <div>• {t('campaigns.builder.settings.unofficial_limit_1', 'Maximum 20 messages per minute recommended')}</div>
                            <div>• {t('campaigns.builder.settings.unofficial_limit_2', 'Maximum 1000 messages per day')}</div>
                            <div>• {t('campaigns.builder.settings.unofficial_limit_3', 'Minimum 3 second delay between messages')}</div>
                            <div>• {t('campaigns.builder.settings.unofficial_limit_4', 'Business hours strongly recommended')}</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rate Limit Recommendations */}
                {rateLimitCalculation && (
                  <div className="mt-4 p-4 bg-muted border border-border rounded-lg">
                    <div className="flex items-start gap-2">
                      <Settings className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium text-foreground mb-2">
                          {t('campaigns.builder.settings.recommendations_title', 'WhatsApp Rate Limit Recommendations')}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">{t('campaigns.builder.settings.recommended_rate', 'Recommended Rate')}:</span>
                            <span className="ml-2">{rateLimitCalculation.recommended_messages_per_minute} msg/min</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('campaigns.builder.settings.estimated_time', 'Estimated Time')}:</span>
                            <span className="ml-2">{rateLimitCalculation.estimated_completion_minutes} minutes</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('campaigns.builder.settings.safety_factor', 'Safety Factor')}:</span>
                            <span className="ml-2">{Math.round(rateLimitCalculation.safety_factor * 100)}%</span>
                          </div>
                          <div>
                            <span className="font-medium">{t('campaigns.builder.settings.channel_limit', 'Channel Limit')}:</span>
                            <span className="ml-2">{rateLimitCalculation.channel_limits.max_per_minute} msg/min</span>
                          </div>
                        </div>

                        {rateLimitCalculation.warnings.length > 0 && (
                          <div className="mt-3">
                            <div className="font-medium text-orange-800 mb-1">
                              {t('campaigns.builder.settings.warnings', 'Warnings')}:
                            </div>
                            <ul className="text-sm text-orange-700 space-y-1">
                              {rateLimitCalculation.warnings.map((warning, index) => (
                                <li key={index} className="flex items-start gap-1">
                                  <span className="text-orange-600">•</span>
                                  <span>{warning}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="mt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCampaignData(prev => ({
                                ...prev,
                                rateLimitSettings: {
                                  ...prev.rateLimitSettings,
                                  messages_per_minute: rateLimitCalculation.recommended_messages_per_minute,
                                  delay_between_messages: Math.ceil(rateLimitCalculation.recommended_delay_ms / 1000)
                                }
                              }));
                            }}
                          >
                            {t('campaigns.builder.settings.apply_recommendations', 'Apply Recommendations')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Business Hours Configuration */}
                {campaignData.antiBanSettings.businessHoursOnly && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">{t('campaigns.builder.antiban.business_hours_config_title', 'Business Hours Configuration')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="businessStartTime">{t('campaigns.builder.antiban.start_time_label', 'Start Time')}</Label>
                          <Input
                            id="businessStartTime"
                            type="time"
                            defaultValue="09:00"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <Label htmlFor="businessEndTime">{t('campaigns.builder.antiban.end_time_label', 'End Time')}</Label>
                          <Input
                            id="businessEndTime"
                            type="time"
                            defaultValue="18:00"
                            className="w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="timezone">{t('campaigns.builder.antiban.timezone_label', 'Timezone')}</Label>
                        <Select defaultValue="UTC">
                          <SelectTrigger>
                            <SelectValue placeholder={t('campaigns.builder.antiban.timezone_placeholder', 'Select timezone')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                            <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                            <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                            <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                            <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                            <SelectItem value="Europe/Paris">Paris (CET/CEST)</SelectItem>
                            <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                            <SelectItem value="Asia/Shanghai">Shanghai (CST)</SelectItem>
                            <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Business Hours Preview */}
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-sm font-medium mb-2">{t('campaigns.builder.antiban.schedule_preview', 'Schedule Preview')}</div>
                        <div className="text-sm text-muted-foreground">
                          {rateLimitCalculation && campaignData.segmentId && (
                            <>
                              <p>{t('campaigns.builder.antiban.estimated_schedule', 'Estimated schedule based on current settings')}:</p>
                              <ul className="mt-2 space-y-1">
                                <li>• {t('campaigns.builder.antiban.daily_hours', 'Daily sending window')}: 9:00 AM - 6:00 PM</li>
                                <li>• {t('campaigns.builder.antiban.messages_per_day', 'Messages per day')}: {Math.min(rateLimitCalculation.recommended_messages_per_minute * 60 * 9, segments.find(s => s.id === campaignData.segmentId)?.contactCount || 0)}</li>
                                <li>• {t('campaigns.builder.antiban.estimated_days', 'Estimated completion')}: {Math.ceil((segments.find(s => s.id === campaignData.segmentId)?.contactCount || 0) / (rateLimitCalculation.recommended_messages_per_minute * 60 * 9))} business days</li>
                                {campaignData.antiBanSettings.respectWeekends && (
                                  <li>• {t('campaigns.builder.antiban.weekends_excluded', 'Weekends excluded from schedule')}</li>
                                )}
                              </ul>
                            </>
                          )}
                        </div>
                      </div>

                      {/* WhatsApp Channel Specific Recommendations */}
                      {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL && (
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5" />
                            <div className="text-sm">
                              <div className="font-medium text-orange-800 mb-1">
                                {t('campaigns.builder.antiban.unofficial_recommendations', 'Unofficial Channel Recommendations')}
                              </div>
                              <ul className="text-orange-700 space-y-1">
                                <li>• {t('campaigns.builder.antiban.unofficial_rec_1', 'Business hours are strongly recommended to avoid detection')}</li>
                                <li>• {t('campaigns.builder.antiban.unofficial_rec_2', 'Consider recipient timezone for better engagement')}</li>
                                <li>• {t('campaigns.builder.antiban.unofficial_rec_3', 'Avoid sending during peak WhatsApp usage (8-10 PM)')}</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'antiban':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  {t('campaigns.builder.antiban.title', 'Anti-Ban Protection')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="antiBanEnabled">{t('campaigns.builder.antiban.enable_label', 'Enable Anti-Ban Protection')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('campaigns.builder.antiban.enable_description', 'Automatically apply intelligent rate limiting and account rotation')}
                    </p>
                  </div>
                  <Switch
                    id="antiBanEnabled"
                    checked={campaignData.antiBanSettings.enabled}
                    onCheckedChange={(checked) => setCampaignData(prev => ({
                      ...prev,
                      antiBanSettings: { ...prev.antiBanSettings, enabled: checked }
                    }))}
                  />
                </div>

                {/* Channel-specific anti-ban importance warning */}
                <div className={`p-3 rounded-lg border ${
                  campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900'
                    : 'bg-muted border-border'
                }`}>
                  <div className="flex items-start gap-2">
                    {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL ? (
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" />
                    ) : (
                      <BadgeInfo className="w-4 h-4 text-muted-foreground mt-0.5" />
                    )}
                    <div className="text-sm">
                      <div className={`font-medium mb-1 ${
                        campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL
                          ? 'text-red-800 dark:text-red-400'
                          : 'text-foreground'
                      }`}>
                        {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL
                          ? t('campaigns.builder.antiban.unofficial_critical', 'Critical: Anti-Ban Protection Required')
                          : t('campaigns.builder.antiban.official_optional', 'Anti-Ban Protection (Optional)')
                        }
                      </div>
                      <div className={`${
                        campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-muted-foreground'
                      }`}>
                        {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL ? (
                          <p>{t('campaigns.builder.antiban.unofficial_critical_desc', 'Unofficial WhatsApp channels have high ban risk. Anti-ban protection is essential to avoid account restrictions. Use conservative settings and business hours.')}</p>
                        ) : (
                          <p>{t('campaigns.builder.antiban.official_optional_desc', 'Official WhatsApp Business API has built-in compliance. Anti-ban features are optional but can help optimize delivery rates and user experience.')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {campaignData.antiBanSettings.enabled && (
                  <div className="space-y-4 pt-4 border-t">
                    <div>
                      <Label>{t('campaigns.builder.antiban.mode_label', 'Protection Mode')}</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        {t('campaigns.builder.antiban.mode_description', 'Choose how aggressive the anti-ban protection should be')}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'conservative', label: t('campaigns.builder.antiban.mode_conservative', 'Conservative'), desc: t('campaigns.builder.antiban.mode_conservative_desc', 'Slowest, safest') },
                          { value: 'moderate', label: t('campaigns.builder.antiban.mode_moderate', 'Moderate'), desc: t('campaigns.builder.antiban.mode_moderate_desc', 'Balanced approach') },
                          { value: 'aggressive', label: t('campaigns.builder.antiban.mode_aggressive', 'Aggressive'), desc: t('campaigns.builder.antiban.mode_aggressive_desc', 'Faster, higher risk') }
                        ].map((mode) => (
                          <Button
                            key={mode.value}
                            type="button"
                            variant={campaignData.antiBanSettings.mode === mode.value ? 'default' : 'outline'}
                            className="h-auto p-3 flex flex-col items-center"
                            onClick={() => setCampaignData(prev => ({
                              ...prev,
                              antiBanSettings: { ...prev.antiBanSettings, mode: mode.value as any }
                            }))}
                          >
                            <span className="font-medium">{mode.label}</span>
                            <span className="text-xs text-muted-foreground">{mode.desc}</span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="businessHoursOnly">{t('campaigns.builder.antiban.business_hours_label', 'Business Hours Only')}</Label>
                          <p className="text-sm text-muted-foreground">
                            {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.UNOFFICIAL
                              ? t('campaigns.builder.antiban.business_hours_desc_unofficial', 'Highly recommended for unofficial channels (9 AM - 6 PM)')
                              : t('campaigns.builder.antiban.business_hours_desc_official', 'Optional for official API (9 AM - 6 PM)')
                            }
                          </p>
                        </div>
                        <Switch
                          id="businessHoursOnly"
                          checked={campaignData.antiBanSettings.businessHoursOnly}
                          onCheckedChange={(checked) => setCampaignData(prev => ({
                            ...prev,
                            antiBanSettings: { ...prev.antiBanSettings, businessHoursOnly: checked }
                          }))}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="respectWeekends">{t('campaigns.builder.antiban.respect_weekends_label', 'Respect Weekends')}</Label>
                          <p className="text-sm text-muted-foreground">{t('campaigns.builder.antiban.respect_weekends_desc', 'Pause on weekends')}</p>
                        </div>
                        <Switch
                          id="respectWeekends"
                          checked={campaignData.antiBanSettings.respectWeekends}
                          onCheckedChange={(checked) => setCampaignData(prev => ({
                            ...prev,
                            antiBanSettings: { ...prev.antiBanSettings, respectWeekends: checked }
                          }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="randomizeDelay">{t('campaigns.builder.antiban.randomize_delays_label', 'Randomize Delays')}</Label>
                          <p className="text-sm text-muted-foreground">{t('campaigns.builder.antiban.randomize_delays_desc', 'Add human-like variance to message timing')}</p>
                        </div>
                        <Switch
                          id="randomizeDelay"
                          checked={campaignData.antiBanSettings.randomizeDelay}
                          onCheckedChange={(checked) => setCampaignData(prev => ({
                            ...prev,
                            antiBanSettings: { ...prev.antiBanSettings, randomizeDelay: checked }
                          }))}
                        />
                      </div>

                      {campaignData.antiBanSettings.randomizeDelay && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="minDelay">{t('campaigns.builder.antiban.min_delay_label', 'Min Delay (seconds)')}</Label>
                            <Input
                              id="minDelay"
                              type="number"
                              min="1"
                              max="60"
                              value={campaignData.antiBanSettings.minDelay}
                              onChange={(e) => setCampaignData(prev => ({
                                ...prev,
                                antiBanSettings: { ...prev.antiBanSettings, minDelay: parseInt(e.target.value) || 3 }
                              }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor="maxDelay">{t('campaigns.builder.antiban.max_delay_label', 'Max Delay (seconds)')}</Label>
                            <Input
                              id="maxDelay"
                              type="number"
                              min="1"
                              max="300"
                              value={campaignData.antiBanSettings.maxDelay}
                              onChange={(e) => setCampaignData(prev => ({
                                ...prev,
                                antiBanSettings: { ...prev.antiBanSettings, maxDelay: parseInt(e.target.value) || 15 }
                              }))}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="accountRotation">{t('campaigns.builder.antiban.account_rotation_label', 'Smart Account Rotation')}</Label>
                          <p className="text-sm text-muted-foreground">{t('campaigns.builder.antiban.account_rotation_desc', 'Distribute messages across selected accounts')}</p>
                        </div>
                        <Switch
                          id="accountRotation"
                          checked={campaignData.antiBanSettings.accountRotation}
                          onCheckedChange={(checked) => setCampaignData(prev => ({
                            ...prev,
                            antiBanSettings: { ...prev.antiBanSettings, accountRotation: checked }
                          }))}
                        />
                      </div>

                      <div>
                        <Label htmlFor="cooldownPeriod">{t('campaigns.builder.antiban.cooldown_period_label', 'Account Cooldown Period (minutes)')}</Label>
                        <p className="text-sm text-muted-foreground mb-2">
                          {t('campaigns.builder.antiban.cooldown_period_desc', 'Rest time between high-volume sending for each account')}
                        </p>
                        <Input
                          id="cooldownPeriod"
                          type="number"
                          min="5"
                          max="1440"
                          value={campaignData.antiBanSettings.cooldownPeriod}
                          onChange={(e) => setCampaignData(prev => ({
                            ...prev,
                            antiBanSettings: { ...prev.antiBanSettings, cooldownPeriod: parseInt(e.target.value) || 30 }
                          }))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('campaigns.builder.review.campaign_summary_title', 'Campaign Summary')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">{t('campaigns.builder.review.basic_info_title', 'Basic Information')}</h4>
                  <p><strong>{t('campaigns.builder.review.name_label', 'Name')}:</strong> {campaignData.name}</p>
                  <p><strong>{t('campaigns.builder.review.description_label', 'Description')}:</strong> {campaignData.description}</p>
                  <p><strong>{t('campaigns.builder.review.channel_label', 'WhatsApp Channel')}:</strong>
                    <Badge variant={campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL ? 'default' : 'secondary'} className={`ml-2 ${campaignData.whatsappChannelType !== WHATSAPP_CHANNEL_TYPES.OFFICIAL ? '!bg-muted !text-muted-foreground' : ''}`}>
                      {campaignData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL ?
                        t('campaigns.builder.review.official_api', 'Official API') :
                        t('campaigns.builder.review.unofficial_web', 'Unofficial/Web')
                      }
                    </Badge>
                  </p>
                  <p><strong>{t('campaigns.builder.review.message_type_label', 'Message Type')}:</strong> {campaignData.messageType}</p>
                  <p><strong>{t('campaigns.builder.review.type_label', 'Campaign Type')}:</strong> {campaignData.campaignType}</p>
                  {campaignData.campaignType === 'scheduled' && campaignData.scheduledAt && (
                    <p><strong>{t('campaigns.builder.review.scheduled_for_label', 'Scheduled for')}:</strong> {new Date(campaignData.scheduledAt).toLocaleString()}</p>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium">{t('campaigns.builder.review.whatsapp_accounts_title', 'WhatsApp Accounts')}</h4>
                  {(campaignData.whatsappAccountIds?.length || campaignData.channelIds?.length || 0) > 0 ? (
                    <div className="space-y-2">
                      <p><strong>{campaignData.whatsappAccountIds?.length || campaignData.channelIds?.length || 0}</strong> {t('campaigns.builder.review.accounts_selected_for_distribution', 'account(s) selected for distribution')}:</p>
                      <div className="space-y-1">
                        {whatsappConnections
                          .filter((conn: any) =>
                            (campaignData.whatsappAccountIds?.includes(conn.id) || campaignData.channelIds?.includes(conn.id))
                          )
                          .map((connection: any) => (
                            <div key={connection.id} className="flex items-center gap-2 text-sm">
                              <i className="ri-whatsapp-line text-green-600"></i>
                              <span>{connection.accountName}</span>
                              <Badge variant="secondary" className="text-xs !bg-muted !text-muted-foreground">
                                {connection.status}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : campaignData.channelId ? (
                    <p><strong>{t('campaigns.builder.review.single_account_label', 'Single Account')}:</strong> {
                      whatsappConnections.find((conn: any) => conn.id === campaignData.channelId)?.accountName || 'Unknown'
                    }</p>
                  ) : (
                    <p>{t('campaigns.builder.review.no_account_selected', 'No WhatsApp account selected')}</p>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium">{t('campaigns.builder.review.audience_title', 'Audience')}</h4>
                  {(() => {
                    const segment = segments.find(s => s.id === campaignData.segmentId);
                    return segment ? (
                      <p><strong>{t('campaigns.builder.review.segment_label', 'Segment')}:</strong> {segment.name} ({segment.contactCount} {t('campaigns.builder.audience.contacts', 'contacts')})</p>
                    ) : (
                      <p>{t('campaigns.builder.review.no_segment_selected', 'No segment selected')}</p>
                    );
                  })()}
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium">{t('campaigns.builder.review.antiban_title', 'Anti-Ban Protection')}</h4>
                  {campaignData.antiBanSettings.enabled ? (
                    <div className="space-y-1">
                      <p><strong>{t('campaigns.builder.review.antiban_mode_label', 'Mode')}:</strong> {campaignData.antiBanSettings.mode}</p>
                      <div className="flex flex-wrap gap-2">
                        {campaignData.antiBanSettings.businessHoursOnly && (
                          <Badge variant="outline">{t('campaigns.builder.antiban.business_hours_label', 'Business Hours Only')}</Badge>
                        )}
                        {campaignData.antiBanSettings.respectWeekends && (
                          <Badge variant="outline">{t('campaigns.builder.antiban.respect_weekends_label', 'Respect Weekends')}</Badge>
                        )}
                        {campaignData.antiBanSettings.randomizeDelay && (
                          <Badge variant="outline">
                            {t('campaigns.builder.review.random_delays_badge', 'Random Delays')} ({campaignData.antiBanSettings.minDelay}-{campaignData.antiBanSettings.maxDelay}s)
                          </Badge>
                        )}
                        {campaignData.antiBanSettings.accountRotation && (
                          <Badge variant="outline">{t('campaigns.builder.review.account_rotation_badge', 'Account Rotation')}</Badge>
                        )}
                        {campaignData.antiBanSettings.messageVariation && (
                          <Badge variant="outline">{t('campaigns.builder.antiban.message_variation_label', 'Message Variation')}</Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p>{t('campaigns.builder.review.antiban_disabled', 'Anti-ban protection disabled')}</p>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium">{t('campaigns.builder.review.rate_limiting_title', 'Rate Limiting')}</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <p><strong>{t('campaigns.builder.review.per_minute_label', 'Per Minute')}:</strong> {campaignData.rateLimitSettings.messages_per_minute} {t('campaigns.builder.review.messages_unit', 'messages')}</p>
                    <p><strong>{t('campaigns.builder.review.per_hour_label', 'Per Hour')}:</strong> {campaignData.rateLimitSettings.messages_per_hour} {t('campaigns.builder.review.messages_unit', 'messages')}</p>
                    <p><strong>{t('campaigns.builder.review.per_day_label', 'Per Day')}:</strong> {campaignData.rateLimitSettings.messages_per_day} {t('campaigns.builder.review.messages_unit', 'messages')}</p>
                    <p><strong>{t('campaigns.builder.review.base_delay_label', 'Base Delay')}:</strong> {campaignData.rateLimitSettings.delay_between_messages} {t('campaigns.builder.review.seconds_unit', 'seconds')}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium">{t('campaigns.builder.review.message_content_title', 'Message Content')}</h4>
                  <div className="bg-muted p-3 rounded-md">
                    <pre className="whitespace-pre-wrap text-sm">{campaignData.content}</pre>
                  </div>
                  {campaignData.mediaUrls && campaignData.mediaUrls.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium">{t('campaigns.builder.review.media_attachments_label', 'Media Attachments')}:</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {campaignData.mediaUrls.map((url, index) => (
                          <Badge key={index} variant="secondary" className="text-xs !bg-muted !text-muted-foreground">
                            {t('campaigns.builder.review.media_item_label', 'Media')} {index + 1}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-8xl mx-auto space-y-6 pb-20 px-4 sm:px-6 lg:px-8">
      {/* Enhanced Header Section */}
      <div className="bg-gradient-to-r from-muted to-muted/80 rounded-xl p-6 mb-8 border border-border">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/campaigns')}
            className="hover:bg-accent"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">
              {isEditMode ? t('campaigns.builder.header.edit', 'Edit Campaign') : t('campaigns.builder.header.create', 'Create Campaign')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('campaigns.builder.header.step_progress', 'Step {{current}} of {{total}}: {{title}}', {
                current: currentStep + 1,
                total: CAMPAIGN_STEPS.length,
                title: CAMPAIGN_STEPS[currentStep].title
              })}
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="hidden md:flex items-center gap-2 bg-background/60 rounded-full px-4 py-2 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-brand-primary"></div>
            <span className="text-sm font-medium text-foreground">
              {Math.round(((currentStep + 1) / CAMPAIGN_STEPS.length) * 100)}% Complete
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted rounded-full h-2 mb-4">
          <div
            className="bg-brand-primary h-2 rounded-full"
            style={{ width: `${((currentStep + 1) / CAMPAIGN_STEPS.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Enhanced Step Navigation */}
      <div className="bg-card rounded-xl p-4 sm:p-6 shadow-sm border border-border mb-8">
        <div className="flex items-center justify-between relative overflow-x-auto">
          {/* Background Progress Line - Hidden on mobile */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2 z-0 hidden sm:block"></div>
          <div
            className="absolute top-1/2 left-0 h-0.5 bg-brand-primary -translate-y-1/2 z-0 hidden sm:block"
            style={{ width: `${(currentStep / (CAMPAIGN_STEPS.length - 1)) * 100}%` }}
          ></div>

          {CAMPAIGN_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            const isClickable = index <= currentStep; // Allow clicking on current and previous steps

            return (
              <div key={step.id} className="flex flex-col items-center relative z-10 min-w-0 flex-shrink-0">
                {/* Step Circle */}
                <button
                  onClick={() => isClickable && setCurrentStep(index)}
                  disabled={!isClickable}
                  className={`
                    flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 group
                    ${isActive
                      ? 'border-brand-primary bg-brand-primary text-white shadow-lg'
                      : isCompleted
                        ? 'border-green-500 bg-green-500 text-white cursor-pointer'
                        : 'border-border bg-background text-muted-foreground'
                    }
                    ${isClickable && !isActive ? 'hover:border-brand-primary hover:bg-accent cursor-pointer' : ''}
                    ${!isClickable ? 'cursor-not-allowed opacity-50' : ''}
                  `}
                  aria-label={`${step.title} - ${isCompleted ? 'Completed' : isActive ? 'Current' : 'Upcoming'}`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </button>

                {/* Step Label */}
                <div className="mt-2 sm:mt-3 text-center">
                  <span className={`
                    text-xs sm:text-sm font-medium whitespace-nowrap
                    ${isActive
                      ? 'text-foreground'
                      : isCompleted
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-muted-foreground'
                    }
                  `}>
                    <span className="hidden sm:inline">{step.title}</span>
                    <span className="sm:hidden">{step.title.split(' ')[0]}</span>
                  </span>
                  {isActive && (
                    <div className="mt-1 w-2 h-2 bg-brand-primary rounded-full mx-auto"></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Step Description */}
        <div className="mt-6 text-center">
          <p className="text-muted-foreground text-sm">
            {getStepDescription(currentStep)}
          </p>
        </div>
      </div>

      {/* Enhanced Main Content Card */}
      <Card className="shadow-lg border-0 bg-card overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-muted to-muted/80 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center">
              {(() => {
                const Icon = CAMPAIGN_STEPS[currentStep].icon;
                return <Icon className="w-5 h-5 text-white" />;
              })()}
            </div>
            <div>
              <CardTitle className="text-xl font-semibold text-foreground">
                {CAMPAIGN_STEPS[currentStep].title}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {getStepDescription(currentStep)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <div className="min-h-[400px]">
            {renderStepContent()}
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Navigation */}
      <div className="bg-card rounded-xl p-6 shadow-sm border border-border mt-8">
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className={`
              px-6 py-3
              ${currentStep === 0
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-accent hover:border-border'
              }
            `}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('campaigns.builder.navigation.previous', 'Previous')}
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={loading}
              className="px-6 py-3 hover:bg-accent hover:border-border"
            >
              <Save className="w-4 h-4 mr-2" />
              {t('campaigns.builder.navigation.save_draft', 'Save Draft')}
            </Button>

            {currentStep === CAMPAIGN_STEPS.length - 1 ? (
              <Button
                onClick={handleLaunchClick}
                disabled={loading}
                className="min-w-[160px] px-8 py-3 bg-green-600 hover:bg-green-700 text-white shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2" />
                    {t('campaigns.builder.navigation.launching', 'Launching...')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {t('campaigns.builder.navigation.launch', 'Launch Campaign')}
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                className="px-8 py-3 bg-brand-primary hover:bg-brand-primary text-white shadow-lg"
              >
                {t('campaigns.builder.navigation.next', 'Next')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>

        {/* Step Indicator at Bottom */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {CAMPAIGN_STEPS.length}
            </span>
            <div className="flex gap-1 ml-2">
              {CAMPAIGN_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentStep
                      ? 'bg-brand-primary'
                      : index < currentStep
                        ? 'bg-green-500'
                        : 'bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Quick Actions */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        <div className="flex flex-col gap-2 sm:gap-3">
          {/* Quick Save Button */}
          <Button
            onClick={handleSaveDraft}
            disabled={loading}
            size="sm"
            className="w-12 h-12 rounded-full bg-background border-2 border-border shadow-lg hover:shadow-xl group"
            title={t('campaigns.builder.navigation.quick_save', 'Quick Save')}
          >
            <Save className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          </Button>

          {/* Progress Indicator */}
          <div className="w-12 h-12 rounded-full bg-background border-2 border-border shadow-lg flex items-center justify-center">
            <div className="relative w-8 h-8">
              <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 32 32">
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  className="text-muted-foreground/30"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 14}`}
                  strokeDashoffset={`${2 * Math.PI * 14 * (1 - (currentStep + 1) / CAMPAIGN_STEPS.length)}`}
                  className="text-foreground"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {Math.round(((currentStep + 1) / CAMPAIGN_STEPS.length) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreateSegmentModal
        isOpen={isSegmentModalOpen}
        onClose={() => setIsSegmentModalOpen(false)}
        onSegmentCreated={handleSegmentCreated}
      />

      <CreateTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onTemplateCreated={handleTemplateCreated}
        whatsappChannelType={campaignData.whatsappChannelType}
      />

      {editSegmentId && (
        <EditSegmentModal
          isOpen={editSegmentId !== null}
          onClose={() => setEditSegmentId(null)}
          segmentId={editSegmentId}
          onSegmentUpdated={handleSegmentUpdated}
        />
      )}

      {editTemplateId && (
        <EditTemplateModal
          isOpen={editTemplateId !== null}
          onClose={() => setEditTemplateId(null)}
          templateId={editTemplateId}
          onTemplateUpdated={handleTemplateUpdated}
        />
      )}

      <Dialog open={showLaunchConfirmation} onOpenChange={setShowLaunchConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('campaigns.builder.launch.confirmation_title', 'Launch Campaign Confirmation')}</DialogTitle>
            <DialogDescription>
              {t('campaigns.builder.launch.confirmation_description', 'Are you sure you want to launch this campaign? This action cannot be undone.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">{t('campaigns.builder.launch.summary_title', 'Campaign Summary')}:</h4>
              <div className="space-y-1 text-sm">
                <p><strong>{t('campaigns.builder.launch.summary_name', 'Name')}:</strong> {campaignData.name}</p>
                <p><strong>{t('campaigns.builder.launch.summary_type', 'Type')}:</strong> {campaignData.campaignType}</p>
                {(() => {
                  const segment = segments.find(s => s.id === campaignData.segmentId);
                  return segment ? (
                    <p><strong>{t('campaigns.builder.launch.summary_recipients', 'Recipients')}:</strong> {segment.contactCount} {t('campaigns.builder.audience.contacts', 'contacts')}</p>
                  ) : null;
                })()}
                {campaignData.campaignType === 'scheduled' && campaignData.scheduledAt && (
                  <p><strong>{t('campaigns.builder.launch.summary_scheduled', 'Scheduled for')}:</strong> {new Date(campaignData.scheduledAt).toLocaleString()}</p>
                )}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">{t('campaigns.builder.launch.warning_title', 'Important')}:</p>
                  <p>{t('campaigns.builder.launch.warning_description', 'Once launched, this campaign will start sending messages immediately and cannot be stopped.')}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLaunchConfirmation(false)}
              disabled={loading}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleLaunchConfirm}
              disabled={loading}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('campaigns.builder.navigation.launching', 'Launching...')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {t('campaigns.builder.launch.confirm_button', 'Yes, Launch')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
