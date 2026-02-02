import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useConversations } from '@/context/ConversationContext';
import { useBotStatus } from '@/hooks/useBotStatus';
import MediaUploadModal from './MediaUploadModal';
import MessageScheduler from './MessageScheduler';
import EmojiPickerComponent from '@/components/ui/emoji-picker';
import QuickReplyPanel from './QuickReplyPanel';
import BusinessTemplatePanel from './BusinessTemplatePanel';
import BotIcon from '@/components/ui/bot-icon';
import { Mic, Pause, Play, Square, Send, Smile, X, Reply, Loader2, Clock } from 'lucide-react';
import './MessageInput.css';
import { requestMicrophoneAccess, stopMicrophoneStream } from '@/utils/microphone-permissions';

interface MessageInputProps {
  conversationId: number;
  conversation?: any;
  contact?: any;
}

export default function MessageInput({ conversationId, conversation, contact }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);

  const { isBotDisabled, toggleBot, isToggling } = useBotStatus(conversationId);

  const [showRecordingUI, setShowRecordingUI] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(30));
  const [isWebAudioSupported, setIsWebAudioSupported] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const { toast } = useToast();
  const { t } = useTranslation();
  const { sendMessage, sendMediaMessage, replyToMessage, setReplyToMessage } = useConversations();


  const isTikTok = conversation?.channelType === 'tiktok';
  const tiktokMeta = isTikTok && conversation?.groupMetadata ? (conversation.groupMetadata as {
    messagingWindowStatus?: 'open' | 'closed' | 'expired';
    conversationState?: 'active' | 'window_closed' | 'user_blocked' | 'expired';
    messagingWindowExpiresAt?: number;
  }) : null;
  const tiktokCanReply = isTikTok
    ? (tiktokMeta?.messagingWindowStatus === 'open' || !tiktokMeta?.messagingWindowStatus) &&
      tiktokMeta?.conversationState !== 'window_closed' &&
      tiktokMeta?.conversationState !== 'user_blocked' &&
      tiktokMeta?.conversationState !== 'expired'
    : true;
  const tiktokWindowClosedMessage = !tiktokCanReply && isTikTok
    ? t('message_input.tiktok_window_closed', 'Messaging window has closed. The user must send a message to reopen the conversation.')
    : null;
  const tiktokExpiresAt = tiktokMeta?.messagingWindowExpiresAt;
  const tiktokExpiringSoon = isTikTok && tiktokCanReply && tiktokExpiresAt && tiktokExpiresAt > Date.now();
  const tiktokRemainingMs = tiktokExpiringSoon && tiktokExpiresAt ? Math.max(0, tiktokExpiresAt - Date.now()) : 0;
  const TIKTOK_LEARN_MORE_URL = 'https://developers.tiktok.com/doc/business-messaging-overview/';

  const focusTextarea = (delay: number = 100, forceForReply: boolean = false) => {
    setTimeout(() => {
      if (textareaRef.current &&
          !showRecordingUI &&
          !isMediaModalOpen &&
          !isEmojiPickerOpen &&
          !isSending &&
          !isSendingVoice) {

        const activeElement = document.activeElement;
        const isUserInteracting = activeElement && (
          activeElement.tagName === 'BUTTON' ||
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.hasAttribute('contenteditable') ||
          activeElement.closest('[role="dialog"]') ||
          activeElement.closest('[role="menu"]')
        );

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        const shouldFocus = forceForReply ||
          (!isUserInteracting && (!isMobile || delay > 150)) ||
          document.activeElement === textareaRef.current;

        if (shouldFocus) {
          try {
            textareaRef.current.focus();
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);
          } catch (error) {

          }
        }
      }
    }, delay);
  };

  const handleQuickReplySelect = (content: string) => {
    setMessage(content);
    focusTextarea(100);
  };
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  useEffect(() => {
    focusTextarea(150);
  }, [conversationId]);

  useEffect(() => {
    if (!isSending && !isSendingVoice) {
      focusTextarea(50);
    }
  }, [isSending, isSendingVoice]);

  useEffect(() => {
    if (!isEmojiPickerOpen && !isMediaModalOpen && !showRecordingUI) {
      focusTextarea(100);
    }
  }, [isEmojiPickerOpen, isMediaModalOpen, showRecordingUI]);

  useEffect(() => {
    if (replyToMessage) {
      setTimeout(() => {
        focusTextareaForReply();
      }, 200);

      focusTextarea(300, true);
    }
  }, [replyToMessage]);
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const startTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    timerIntervalRef.current = window.setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };
  
  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const setupAudioAnalysis = (stream: MediaStream): boolean => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        setIsWebAudioSupported(false);
        return false;
      }

      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;

      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      startAudioAnalysis();

      return true;
    } catch (error) {
      
      setIsWebAudioSupported(false);
      return false;
    }
  };

  const startAudioAnalysis = () => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateAudioData = () => {
      if (!analyser || isPaused) {
        if (!isPaused) {
          animationFrameRef.current = requestAnimationFrame(updateAudioData);
        }
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      const normalizedData = new Uint8Array(30);
      for (let i = 0; i < 30; i++) {
        if (i < bufferLength) {
          normalizedData[i] = dataArray[i];
        } else {
          normalizedData[i] = 0;
        }
      }

      setAudioData(normalizedData);
      animationFrameRef.current = requestAnimationFrame(updateAudioData);
    };

    updateAudioData();
  };

  const stopAudioAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setAudioData(new Uint8Array(30));
  };
  
  const getSupportedAudioFormat = (): { mimeType: string; extension: string } => {
    const formats = [
      { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
      { mimeType: 'audio/webm', extension: 'webm' },
      { mimeType: 'audio/mp4', extension: 'm4a' },
      { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
      { mimeType: 'audio/wav', extension: 'wav' }
    ];

    for (const format of formats) {
      if (MediaRecorder.isTypeSupported(format.mimeType)) {
        return format;
      }
    }

    return { mimeType: 'audio/webm', extension: 'webm' };
  };

  const setupRecorder = async (): Promise<boolean> => {
    try {

      const result = await requestMicrophoneAccess({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100,
        channelCount: 1
      });

      const stream = result.stream;
      streamRef.current = stream;

      setupAudioAnalysis(stream);

      const audioFormat = getSupportedAudioFormat();

      const recorder = new MediaRecorder(stream, {
        mimeType: audioFormat.mimeType,
        audioBitsPerSecond: 128000
      });

      audioChunksRef.current = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: audioFormat.mimeType });
          setRecordedAudio(audioBlob);

          const url = URL.createObjectURL(audioBlob);
          setAudioURL(url);
        }

        stopAudioAnalysis();
      });

      mediaRecorderRef.current = recorder;
      return true;
    } catch (error) {
      console.error('Unexpected error in setupRecorder:', error);

      toast({
        title: t('messages.input.recording_error', 'Recording Error'),
        description: t('messages.input.microphone_setup_failed', 'Could not set up microphone. Please try again.'),
        variant: "destructive"
      });

      return false;
    }
  };
  
  const handleStartRecording = async () => {

    setRecordedAudio(null);
    setAudioURL(null);
    setRecordingTime(0);
    setIsPaused(false);


    setShowRecordingUI(true);

    try {

      startTimer();

      const setupSuccess = await setupRecorder();

      if (setupSuccess && mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.start(100);
        } catch (error) {
          console.error('Error starting MediaRecorder:', error);
          toast({
            title: t('messages.input.recording_error', 'Recording Error'),
            description: t('messages.input.recording_start_failed', 'Could not start recording. Please try again.'),
            variant: "destructive"
          });
          stopTimer();
          setShowRecordingUI(false);
        }
      } else {
        stopTimer();
        setShowRecordingUI(false);
      }
    } catch (error) {
      console.error('Error in handleStartRecording:', error);
      stopTimer();
      setShowRecordingUI(false);

      toast({
        title: t('messages.input.recording_error', 'Recording Error'),
        description: t('messages.input.recording_setup_failed', 'Could not set up recording. Please try again.'),
        variant: "destructive"
      });
    }
  };
  
  const handlePauseRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;

    try {
      if (typeof mediaRecorderRef.current.pause === 'function') {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        stopTimer();
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } else {
        handleStopRecording();
      }
    } catch (error) {
      handleStopRecording();
    }
  };
  
  const handleResumeRecording = () => {
    if (!mediaRecorderRef.current || !isPaused) return;

    try {
      if (typeof mediaRecorderRef.current.resume === 'function') {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        startTimer();
        startAudioAnalysis();
      } else {
        handleCancelRecording();
        setTimeout(handleStartRecording, 100);
      }
    } catch (error) {
      handleCancelRecording();
      setTimeout(handleStartRecording, 100);
    }
  };
  
  const handleStopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    
    try {
      mediaRecorderRef.current.stop();
      stopTimer();
    } catch (error) {
    }
  };
  
  const handleSendVoiceMessage = async () => {
    if (!recordedAudio || isSendingVoice) {
      if (!recordedAudio) {
        toast({
          title: t('common.error', 'Error'),
          description: t('messages.input.no_recording', 'No recording to send'),
          variant: "destructive"
        });
      }
      return;
    }

    if (recordedAudio.size < 100) {
      toast({
        title: t('common.error', 'Error'),
        description: t('messages.input.recording_too_short', 'Recording is too short or empty'),
        variant: "destructive"
      });
      return;
    }

    setIsSendingVoice(true);

    try {
      const audioFormat = getSupportedAudioFormat();
      const timestamp = Date.now();

      const audioFile = new File(
        [recordedAudio],
        `voice_message_${timestamp}.${audioFormat.extension}`,
        {
          type: recordedAudio.type || audioFormat.mimeType,
          lastModified: timestamp
        }
      );

      await sendMediaMessage(conversationId, audioFile, 'audio');

      handleCancelRecording();

      toast({
        title: t('common.success', 'Success'),
        description: t('messages.input.voice_message_sent', 'Voice message sent'),
      });

      focusTextarea(200);
    } catch (error) {
      console.error('Voice message send error:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('messages.input.voice_message_failed', 'Failed to send voice message'),
        variant: "destructive"
      });
    } finally {
      setIsSendingVoice(false);
    }
  };
  
  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
      }
    }

    if (streamRef.current) {
      stopMicrophoneStream(streamRef.current);
      streamRef.current = null;
    }

    stopTimer();
    stopAudioAnalysis();

    setShowRecordingUI(false);
    setIsPaused(false);
    setRecordingTime(0);
    setIsSendingVoice(false);

    if (audioURL) {
      URL.revokeObjectURL(audioURL);
      setAudioURL(null);
    }

    setRecordedAudio(null);

    focusTextarea(100);
  };
  
  const handleSendMessage = async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);
    let messageWasSent = false;
    const wasReply = !!replyToMessage;

    try {
      if (replyToMessage) {
        const response = await fetch(`/api/messages/${replyToMessage.id}/reply`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: message.trim()
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || t('message_input.reply_failed', 'Failed to send reply'));
        }

        await response.json();

        toast({
          title: t('message_input.reply_sent', 'Reply sent'),
          description: t('message_input.reply_success', 'Your reply has been sent successfully'),
          variant: 'default'
        });

        setReplyToMessage(null);
        setMessage('');
        messageWasSent = true;
      } else {
        await sendMessage(conversationId, message, false);
        setMessage('');
        messageWasSent = true;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('messages.input.send_message_failed', 'Failed to send message');

      toast({
        title: t('common.error', 'Error'),
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsSending(false);

      if (messageWasSent) {
        const focusDelay = wasReply ? 150 : 100;
        focusTextarea(focusDelay);
      }
    }
  };

  const handleScheduleMessage = async (scheduledData: any) => {
    try {
      const response = await fetch('/api/scheduled-messages', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          content: scheduledData.content,
          scheduledFor: scheduledData.scheduledFor.toISOString(),
          messageType: scheduledData.messageType,
          mediaUrl: scheduledData.mediaUrl,
          mediaType: scheduledData.mediaType,
          caption: scheduledData.caption,
          timezone: scheduledData.timezone,
          metadata: scheduledData.metadata || {}
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to schedule message');
      }

      const result = await response.json();
      

      setMessage('');
      setSelectedFile(null);
      
      return result;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to schedule message');
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && !isSending) {
        handleSendMessage();
      }
    }
    if (e.key === 'Escape' && replyToMessage) {
      handleCancelReply();
    }
  };
  

  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t('messages.input.file_too_large', 'File Too Large'),
        description: t('messages.input.max_file_size', 'Maximum file size is 10MB'),
        variant: "destructive"
      });
      return;
    }
    
    setSelectedFile(file);
    setIsMediaModalOpen(true);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleAttachmentClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleImageClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*';
      fileInputRef.current.click();
    }
  };
  
  const handleCloseMediaModal = () => {
    setIsMediaModalOpen(false);
    setSelectedFile(null);
    focusTextarea(100);
  };

  const handleEmojiButtonClick = () => {
    setIsEmojiPickerOpen(!isEmojiPickerOpen);
  };

  const handleEmojiSelect = (emoji: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const newMessage = message.slice(0, start) + emoji + message.slice(end);
    setMessage(newMessage);

    setTimeout(() => {
      if (textarea) {
        const newCursorPosition = start + emoji.length;
        textarea.setSelectionRange(newCursorPosition, newCursorPosition);
        textarea.focus();
      }
    }, 0);
  };

  const handleCloseEmojiPicker = () => {
    setIsEmojiPickerOpen(false);
    focusTextarea(100);
  };

  const handleCancelReply = () => {
    setReplyToMessage(null);
    focusTextarea(150, true);
  };

  const focusTextareaForReply = () => {
    if (textareaRef.current) {
      try {
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);

            requestAnimationFrame(() => {
              if (document.activeElement !== textareaRef.current) {
                if (textareaRef.current) {
                  textareaRef.current.focus();
                  textareaRef.current.click();
                }
              }
            });
          }
        });
      } catch (error) {
        
      }
    }
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };
  
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
        }
      }

      if (streamRef.current) {
        stopMicrophoneStream(streamRef.current);
      }

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      stopAudioAnalysis();

      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);
  
  const formatRemaining = (ms: number) => {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return t('message_input.tiktok_window_hours', `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min`, { hours, minutes });
    return t('message_input.tiktok_window_minutes', `${minutes} minute${minutes !== 1 ? 's' : ''}`, { minutes });
  };

  return (
    <div className="bg-background border-t border-border p-4 transition-colors duration-200">
      {isTikTok && tiktokExpiringSoon && tiktokRemainingMs > 0 && (
        <div
          className="mb-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
          role="status"
          title={t('message_input.tiktok_window_tooltip', 'TikTok allows messaging within 24–48 hours after the user\'s last message. After that, the user must send a new message to reopen the window.')}
        >
          <span className="font-medium">⚠️ {t('message_input.tiktok_window_expiring_soon', 'Messaging Window Expiring Soon')}</span>
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            {t('message_input.tiktok_window_expires_in', `This conversation will expire in ${formatRemaining(tiktokRemainingMs)}.`, { time: formatRemaining(tiktokRemainingMs) })}
          </p>
          <p className="mt-0.5 text-amber-600 dark:text-amber-400">
            {t('message_input.tiktok_window_reopen', 'The user must send a new message to reopen the window.')}
          </p>
          <a
            href={TIKTOK_LEARN_MORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-800 dark:text-amber-200 underline font-medium mt-1 inline-block"
          >
            {t('message_input.learn_more', 'Learn More')}
          </a>
        </div>
      )}
      {tiktokWindowClosedMessage && (
        <div
          className="mb-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5 text-sm text-red-800 dark:text-red-200"
          role="alert"
          title={t('message_input.tiktok_window_tooltip', 'TikTok allows messaging within 24–48 hours after the user\'s last message. After that, the user must send a new message to reopen the window.')}
        >
          <span className="font-medium">⚠️ {t('message_input.tiktok_window_closed_banner', 'Messaging Window Closed')}</span>
          <p className="mt-1">{t('message_input.tiktok_window_closed_description', 'This conversation has expired. The user must send a new message to reopen the window.')}</p>
          <a
            href={TIKTOK_LEARN_MORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-700 dark:text-red-300 underline font-medium mt-1 inline-block"
          >
            {t('message_input.learn_more', 'Learn More')}
          </a>
        </div>
      )}
      {replyToMessage && (
        <div
          id="reply-context"
          className="mb-3 bg-muted border-l-4 border-primary rounded-r-md"
          ref={(el) => {
            if (el && textareaRef.current) {
              setTimeout(() => {
                focusTextareaForReply();
              }, 150);
            }
          }}
        >
          <div className="flex items-start justify-between p-3">
            <div className="flex items-start space-x-2 flex-1 min-w-0">
              <Reply className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {t('message_input.replying_to', 'Replying to')}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-muted-foreground">
                    {replyToMessage.direction === 'inbound'
                      ? (replyToMessage.contact?.name || t('common.contact', 'Contact'))
                      : t('common.you', 'You')
                    }
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-foreground line-clamp-2">
                  {replyToMessage.content
                    ? truncateText(replyToMessage.content)
                    : t('message_bubble.media_message', 'Media message')
                  }
                </p>
              </div>
            </div>
            <button
              onClick={handleCancelReply}
              className="p-1 rounded-md hover:bg-gray-200 dark:hover: text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground transition-colors ml-2 flex-shrink-0"
              title={t('message_input.cancel_reply', 'Cancel reply')}
              aria-label={t('message_input.cancel_reply', 'Cancel reply')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {!tiktokCanReply && isTikTok ? (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-6 text-center text-muted-foreground text-sm">
          {t('message_input.tiktok_conversation_expired', 'This conversation has expired. The user must send a new message to reopen the window.')}
        </div>
      ) : !showRecordingUI ? (
        <>
          <div className="relative flex items-center bg-background border border-border rounded-full px-4 py-3 shadow-sm hover:shadow-md transition-shadow duration-200">
            <button
              ref={emojiButtonRef}
              className={`
                p-2 rounded-full transition-all duration-200
                hover:bg-gray-100 dark:hover:bg-muted
                ${isEmojiPickerOpen ? 'bg-gray-100 dark:bg-muted' : ''}
                text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground
                flex-shrink-0
              `}
              onClick={handleEmojiButtonClick}
              title={t('messages.input.add_emoji', 'Add emoji')}
            >
              <Smile className="h-5 w-5" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={t('messages.input.type_message', 'Type a message...')}
              data-message-input
              className="
                flex-1 mx-3 py-2
                bg-transparent
                text-gray-900 dark:text-white
                placeholder-gray-500 dark:placeholder-gray-400
                focus:outline-none
                resize-none
                max-h-32 overflow-y-auto
                text-base
                border-none
              "
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending || !tiktokCanReply}
              aria-label={t('messages.input.type_message', 'Type a message...')}
              aria-describedby={replyToMessage ? 'reply-context' : undefined}
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck="true"
            />

            {message.trim() ? (
              <div className="flex items-center gap-2">
                {/* Schedule Button */}
                <button
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-200 button-scale-hover
                    shadow-md hover:shadow-lg
                    bg-blue-600 hover:bg-blue-700
                    text-white focus-ring
                    flex-shrink-0
                  `}
                  onClick={() => setIsSchedulerOpen(true)}
                  disabled={isSending || !tiktokCanReply}
                  data-tooltip={t('messages.input.schedule_message', 'Schedule message')}
                  aria-label={t('messages.input.schedule_message', 'Schedule message')}
                >
                  <Clock className="h-5 w-5" />
                </button>

                {/* Send Button */}
                <button
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    send-button-transition button-scale-hover button-scale-active
                    shadow-lg hover:shadow-xl
                    ${isSending || !tiktokCanReply
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'send-button-gradient'
                    }
                    text-white focus-ring
                    flex-shrink-0
                    ${!isSending && message.trim() && tiktokCanReply ? 'send-button-pulse' : ''}
                  `}
                  onClick={handleSendMessage}
                  disabled={isSending || !message.trim() || !tiktokCanReply}
                  data-tooltip={t('messages.input.send_message', 'Send message')}
                  aria-label={t('messages.input.send_message', 'Send message')}
                >
                  {isSending ? (
                    <Loader2 className="h-5 w-5 loading-spinner" />
                  ) : (
                    <i className="ri-send-plane-fill text-lg transform rotate-45 transition-transform duration-200" />
                  )}
                </button>
              </div>
            ) : (
              <button
                className={`
                  p-2 rounded-full transition-all duration-200
                  hover:bg-gray-100 dark:hover:bg-muted
                  text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground
                  button-scale-hover
                  flex-shrink-0
                `}
                onClick={handleStartRecording}
                disabled={!tiktokCanReply}
                data-tooltip={t('messages.input.record_voice_message', 'Record voice message')}
                aria-label={t('messages.input.record_voice_message', 'Record voice message')}
              >
                <Mic className="h-5 w-5 transition-transform duration-200 hover:scale-110" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center space-x-1">
              <QuickReplyPanel
                onSelectTemplate={handleQuickReplySelect}
                conversation={conversation}
                contact={contact}
              />
              {conversation?.channelType === 'whatsapp_official' && (
                <BusinessTemplatePanel
                  conversationId={conversationId}
                  conversation={conversation}
                  contact={contact}
                />
              )}
              <button
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-muted text-gray-600 dark:text-muted-foreground hover:text-gray-800 dark:hover:text-foreground transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none"
                onClick={handleAttachmentClick}
                disabled={!tiktokCanReply}
                title={t('messages.input.attach_file', 'Attach file')}
              >
                <i className="ri-attachment-2 text-base"></i>
              </button>
              <button
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-muted text-gray-600 dark:text-muted-foreground hover:text-gray-800 dark:hover:text-foreground transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none"
                onClick={handleImageClick}
                disabled={!tiktokCanReply}
                title={t('messages.input.attach_image', 'Attach image')}
              >
                <i className="ri-image-line text-base"></i>
              </button>
            </div>

            <button
              className={`
                p-2 rounded-md transition-colors duration-200 relative
                ${!isBotDisabled
                  ? 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800'
                  : 'hover:bg-gray-100 dark:hover:bg-muted text-gray-600 dark:text-muted-foreground hover:text-gray-800 dark:hover:text-foreground'
                }
                ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              onClick={toggleBot}
              disabled={isToggling}
              title={!isBotDisabled ? t('messages.input.disable_bot', 'Disable bot') : t('messages.input.enable_bot', 'Enable bot')}
            >
              {isToggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BotIcon size={16} />
              )}
            </button>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/zip"
            />
          </div>
        </>
      ) : (
        <div className="py-2">
          <div className="flex items-center justify-between bg-background border border-border p-4 rounded-lg shadow-lg">
            <div className="flex items-center">
              <button
                className="p-2 rounded-full hover:bg-accent transition-colors duration-200 button-scale-hover"
                onClick={handleCancelRecording}
                title={t('common.cancel', 'Cancel')}
              >
                <i className="ri-delete-bin-line text-destructive"></i>
              </button>
              <div className="text-base font-mono ml-3 text-green-600 dark:text-green-400 font-semibold">
                {formatTime(recordingTime)}
              </div>
            </div>
            
            <div className="flex-1 mx-4 h-8 flex items-center justify-center">
              {!isPaused ? (
                <div className="flex items-center justify-center space-x-0.5 h-8 w-full">
                  {isWebAudioSupported ? (
                    Array.from(audioData).map((amplitude, i) => {
                      const height = Math.max(4, Math.min(32, (amplitude / 255) * 28 + 4));
                      return (
                        <div
                          key={i}
                          className="w-1 bg-green-500 dark:bg-green-400 rounded-full transition-all duration-75"
                          style={{
                            height: `${height}px`,
                            opacity: amplitude > 0 ? 1 : 0.3
                          }}
                        />
                      );
                    })
                  ) : (
                    [...Array(30)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-green-500 dark:bg-green-400 rounded-full animate-voiceWave"
                        style={{
                          height: '8px',
                          animationDelay: `${i * 30}ms`
                        }}
                      />
                    ))
                  )}
                </div>
              ) : (
                <div className="relative w-full h-2 bg-muted rounded-full">
                  <div
                    className="absolute left-0 top-0 h-full bg-green-500 dark:bg-green-400 rounded-full"
                    style={{ width: `${Math.min(100, (recordingTime / 300) * 100)}%` }}
                  />
                  <div
                    className="absolute top-0 w-3 h-3 bg-green-500 dark:bg-green-400 rounded-full transform -translate-y-1/4"
                    style={{
                      left: `${Math.min(100, (recordingTime / 300) * 100)}%`,
                      transform: 'translateX(-50%)'
                    }}
                  />
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {!isSendingVoice && (
                <>
                  {isPaused ? (
                    <button
                      className="p-2 rounded-full bg-green-500 hover:bg-green-600 text-white transition-all duration-200 button-scale-hover shadow-md hover:shadow-lg"
                      onClick={handleResumeRecording}
                      title={t('messages.input.resume', 'Resume')}
                    >
                      <Play className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      className="p-2 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white transition-all duration-200 button-scale-hover shadow-md hover:shadow-lg"
                      onClick={handlePauseRecording}
                      title={t('messages.input.pause', 'Pause')}
                    >
                      <Pause className="h-5 w-5" />
                    </button>
                  )}

                  <button
                    className="p-2 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-all duration-200 button-scale-hover shadow-md hover:shadow-lg"
                    onClick={handleStopRecording}
                    title={t('messages.input.stop', 'Stop')}
                  >
                    <Square className="h-5 w-5" />
                  </button>
                </>
              )}

              <button
                className={`
                  p-2 rounded-full transition-all duration-200 button-scale-hover shadow-md hover:shadow-lg text-white
                  ${recordedAudio && !isSendingVoice
                    ? 'send-button-gradient hover:shadow-xl'
                    : 'bg-muted cursor-not-allowed opacity-50'
                  }
                `}
                onClick={handleSendVoiceMessage}
                disabled={!recordedAudio || isSendingVoice}
                title={isSendingVoice ? t('messages.input.sending', 'Sending...') : t('messages.input.send', 'Send')}
              >
                {isSendingVoice ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>

              {isSendingVoice && (
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>{t('messages.input.sending_voice', 'Sending voice message...')}</span>
                </div>
              )}
            </div>
          </div>
          
          
        </div>
      )}
      
      <MediaUploadModal
        isOpen={isMediaModalOpen}
        onClose={handleCloseMediaModal}
        file={selectedFile}
        conversationId={conversationId}
      />

      <MessageScheduler
        isOpen={isSchedulerOpen}
        onClose={() => setIsSchedulerOpen(false)}
        onSchedule={handleScheduleMessage}
        conversationId={conversationId}
        initialContent={message}
        messageType={selectedFile ? 'media' : 'text'}
        mediaFile={selectedFile || undefined}
      />

      <EmojiPickerComponent
        isOpen={isEmojiPickerOpen}
        onClose={handleCloseEmojiPicker}
        onEmojiSelect={handleEmojiSelect}
        anchorRef={emojiButtonRef}
      />
    </div>
  );
}