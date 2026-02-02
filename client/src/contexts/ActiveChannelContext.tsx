import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useAuth } from '@/hooks/use-auth';

interface ChannelConnection {
  id: number;
  channelType: string;
  accountName?: string;
  accountId?: string;
  status: string | null;
  lastConnectedAt?: string;
  metadata?: any;
}

interface ActiveChannelContextType {
  activeChannelId: number | null;
  setActiveChannelId: (channelId: number | null) => void;
  activeChannel: ChannelConnection | null;
  availableChannels: ChannelConnection[];
  isLoading: boolean;
  error: Error | null;
}

const ActiveChannelContext = createContext<ActiveChannelContextType | undefined>(undefined);

interface ActiveChannelProviderProps {
  children: ReactNode;
}

const ACTIVE_CHANNEL_STORAGE_KEY = 'powerchat_active_channel_id';

export function ActiveChannelProvider({ children }: ActiveChannelProviderProps) {
  const [activeChannelId, setActiveChannelIdState] = useState<number | null>(null);
  const { user } = useAuth();


  const { data: channels = [], isLoading, error } = useChannelConnections();


  const normalizeStatus = (status: string | null): 'active' | 'inactive' | 'error' => {
    if (status === null || status === 'connected' || status === 'pending') {
      return 'active';
    }
    if (status === 'inactive' || status === 'error') {
      return status;
    }

    return 'active';
  };

  const availableChannels = channels
    .filter(channel => 
      channel.status === 'active' || channel.status === 'connected' || channel.status === 'pending' || channel.status === null
    )
    .map(channel => ({
      ...channel,
      status: normalizeStatus(channel.status)
    }));
  

  const activeChannel = availableChannels.find(channel => channel.id === activeChannelId) || null;


  useEffect(() => {
    const savedChannelId = localStorage.getItem(ACTIVE_CHANNEL_STORAGE_KEY);
    if (savedChannelId) {
      const channelId = parseInt(savedChannelId);
      if (!isNaN(channelId)) {
        setActiveChannelIdState(channelId);
      }
    }
  }, []);


  useEffect(() => {
    if (availableChannels.length > 0) {

      if (!activeChannelId) {
        const firstChannel = availableChannels[0];
        setActiveChannelIdState(firstChannel.id);
        localStorage.setItem(ACTIVE_CHANNEL_STORAGE_KEY, firstChannel.id.toString());

      }

      else if (!availableChannels.find(c => c.id === activeChannelId)) {
        const firstChannel = availableChannels[0];
        const previousChannelId = activeChannelId;
        setActiveChannelIdState(firstChannel.id);
        localStorage.setItem(ACTIVE_CHANNEL_STORAGE_KEY, firstChannel.id.toString());

      }
    } else if (activeChannelId) {


      setActiveChannelIdState(null);
      localStorage.removeItem(ACTIVE_CHANNEL_STORAGE_KEY);
    }
  }, [availableChannels, activeChannelId]);

  const setActiveChannelId = (channelId: number | null) => {
    setActiveChannelIdState(channelId);
    
    if (channelId) {
      localStorage.setItem(ACTIVE_CHANNEL_STORAGE_KEY, channelId.toString());
    } else {
      localStorage.removeItem(ACTIVE_CHANNEL_STORAGE_KEY);
    }
  };

  const contextValue: ActiveChannelContextType = {
    activeChannelId,
    setActiveChannelId,
    activeChannel,
    availableChannels,
    isLoading,
    error: error as Error | null,
  };

  return (
    <ActiveChannelContext.Provider value={contextValue}>
      {children}
    </ActiveChannelContext.Provider>
  );
}

export function useActiveChannel(): ActiveChannelContextType {
  const context = useContext(ActiveChannelContext);
  if (context === undefined) {
    throw new Error('useActiveChannel must be used within an ActiveChannelProvider');
  }
  return context;
}


export function useChannelInfo() {
  const getChannelDisplayName = (channel: ChannelConnection): string => {
    const typeDisplay = getChannelTypeDisplay(channel.channelType);
    if (channel.accountName) {
      return `${typeDisplay} (${channel.accountName})`;
    }
    return typeDisplay;
  };

  const getChannelTypeDisplay = (channelType: string): string => {
    switch (channelType) {
      case 'whatsapp_official':
        return 'WhatsApp Official';
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return 'WhatsApp';
      case 'messenger':
        return 'Messenger';
      case 'instagram':
        return 'Instagram';
      case 'tiktok':
        return 'TikTok Business';
      case 'twilio_sms':
        return 'Twilio SMS';
      case 'twilio_voice':
        return 'Twilio Calls';
      case 'telegram':
        return 'Telegram';
      case 'email':
        return 'Email';
      case 'webchat':
        return 'WebChat';
      default:
        return channelType;
    }
  };

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case 'whatsapp_official':
        return <i className="ri-whatsapp-line" style={{ color: '#25D366' }} />;
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return <i className="ri-whatsapp-line" style={{ color: '#F59E0B' }} />;
      case 'messenger':
        return <i className="ri-messenger-line" style={{ color: '#1877F2' }} />;
      case 'instagram':
        return <i className="ri-instagram-line" style={{ color: '#E4405F' }} />;
      case 'tiktok':
        return <i className="ri-tiktok-line text-black dark:text-white" />;
      case 'twilio_sms':
      case 'twilio_voice':
        return <i className="ri-message-3-line text-red-500 dark:text-white" />;
      case 'telegram':
        return <i className="ri-telegram-line" style={{ color: '#0088CC' }} />;
      case 'email':
        return <i className="ri-mail-line" style={{ color: '#6B7280' }} />;
      case 'webchat':
        return <i className="ri-message-3-line" style={{ color: '#6366f1' }} />;
      default:
        return <i className="ri-message-3-line" style={{ color: '#333235' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400';
      case 'inactive':
        return 'bg-muted text-muted-foreground';
      case 'error':
        return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return {
    getChannelDisplayName,
    getChannelTypeDisplay,
    getChannelIcon,
    getStatusColor,
  };
}
