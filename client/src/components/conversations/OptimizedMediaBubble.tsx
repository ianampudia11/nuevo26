import { useState, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

function TikTokVideoShareCard({ message, mediaUrl, t }: { message: any; mediaUrl?: string; t: (key: string, fallback?: string) => string }) {
  const [imgError, setImgError] = useState(false);
  const meta = typeof message.metadata === 'string' ? ({} as Record<string, unknown>) : (message.metadata || {}) as Record<string, unknown>;
  const coverImageUrl = (meta.cover_image_url || meta.coverImageUrl || mediaUrl) as string | undefined;
  const videoUrl = (meta.video_url || meta.videoUrl) as string | undefined;
  const title = (meta.title) as string | undefined;
  const creatorName = (meta.creator_name || meta.creatorName) as string | undefined;
  const linkUrl = videoUrl || mediaUrl;
  return (
    <div className="message-media tiktok-video-share">
      <div className="rounded-lg border border-border overflow-hidden bg-muted/30 max-w-[280px]">
        {coverImageUrl && !imgError ? (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={coverImageUrl}
              alt={title || t('message_bubble.tiktok_video', 'TikTok video')}
              className="w-full aspect-video object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </a>
        ) : (
          <div className="w-full aspect-video flex items-center justify-center bg-muted">
            <i className="ri-video-line text-4xl text-muted-foreground" />
          </div>
        )}
        <div className="p-2">
          {title && <p className="text-sm font-medium line-clamp-1">{title}</p>}
          {creatorName && <p className="text-xs text-muted-foreground">{creatorName}</p>}
          {linkUrl && (
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary mt-1">
              {t('message_bubble.open_in_tiktok', 'Open in TikTok')}
              <i className="ri-external-link-line" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

interface OptimizedMediaBubbleProps {
  message: any;
  mediaUrl?: string;
  onDownload?: () => void;
  isDownloading?: boolean;
}

const MAX_AUTO_LOAD_SIZE = 2 * 1024 * 1024; // 2MB as per business requirements

export default function OptimizedMediaBubble({ 
  message, 
  mediaUrl, 
  onDownload, 
  isDownloading = false 
}: OptimizedMediaBubbleProps) {
  const { t } = useTranslation();
  const [shouldAutoLoad, setShouldAutoLoad] = useState(false);
  const [mediaSize, setMediaSize] = useState<number | null>(null);
  const [isCheckingSize, setIsCheckingSize] = useState(true);

  useEffect(() => {
    if (mediaUrl) {
      checkMediaSize(mediaUrl);
    } else {
      setIsCheckingSize(false);
    }
  }, [mediaUrl]);

  const checkMediaSize = async (url: string) => {
    try {

      if (url.includes('lookaside.fbsbx.com')) {
        setShouldAutoLoad(false); // Force download button for Instagram media
        setIsCheckingSize(false);
        return;
      }

      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      const contentLength = response.headers.get('content-length');

      if (contentLength) {
        const size = parseInt(contentLength, 10);
        setMediaSize(size);
        setShouldAutoLoad(size <= MAX_AUTO_LOAD_SIZE);
      } else {
        setShouldAutoLoad(true);
      }
    } catch (error) {
      console.error('Error checking media size:', error);
      setShouldAutoLoad(true);
    } finally {
      setIsCheckingSize(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeFromUrl = (url: string): string => {
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return 'Image';
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
        return 'Video';
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'aac':
        return 'Audio';
      case 'pdf':
        return 'PDF';
      case 'doc':
      case 'docx':
        return 'Document';
      default:
        return 'File';
    }
  };

  const renderContent = () => {
    const { type = 'text', content } = message;

    if (isCheckingSize) {
      return (
        <div className="flex items-center justify-center h-32 w-full bg-gray-100 rounded-md">
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('media.checking_size', 'Checking file size...')}</span>
          </div>
        </div>
      );
    }

    switch (type) {
      case 'image':
        if (shouldAutoLoad && mediaUrl) {
          return (
            <div className="message-media">
              <div className="relative rounded-md overflow-hidden bg-gray-100 mb-2">
                <img
                  src={mediaUrl}
                  alt={t('message_bubble.image_message', 'Image message')}
                  className="max-w-full rounded-md object-contain"
                  style={{ maxHeight: '240px' }}
                  crossOrigin="anonymous"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center', 'h-40');
                    const placeholder = document.createElement('i');
                    placeholder.className = 'ri-image-line text-4xl text-gray-400';
                    e.currentTarget.parentElement?.appendChild(placeholder);
                  }}
                />
              </div>
              {content && <p className="whitespace-pre-wrap text-sm">{content}</p>}
            </div>
          );
        } else {
          return (
            <div className="message-media">
              <div className="flex flex-col items-center justify-center h-40 w-full bg-gray-200 rounded-md relative group">
                <i className="ri-image-line text-4xl text-gray-400 mb-2"></i>
                <div className="text-center mb-3">
                  <p className="text-sm text-gray-600 font-medium">
                    {getFileTypeFromUrl(mediaUrl || '')}
                  </p>
                  {mediaSize && (
                    <p className="text-xs text-gray-500">
                      {formatFileSize(mediaSize)}
                    </p>
                  )}
                </div>
                <button
                  onClick={onDownload}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2 px-4 rounded-md text-sm transition-all"
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('message_bubble.downloading', 'Downloading...')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>{t('message_bubble.download_image', 'Download Image')}</span>
                    </>
                  )}
                </button>
              </div>
              {content && <p className="whitespace-pre-wrap text-sm mt-2">{content}</p>}
            </div>
          );
        }

      case 'video':
        if (shouldAutoLoad && mediaUrl) {
          return (
            <div className="message-media">
              <video
                controls
                className="max-w-full rounded-md"
                style={{ maxHeight: '240px' }}
                crossOrigin="anonymous"
                preload="metadata"
              >
                <source src={mediaUrl} type="video/mp4" />
                {t('message_bubble.video_not_supported', 'Your browser does not support the video element.')}
              </video>
              {content && <p className="whitespace-pre-wrap text-sm mt-2">{content}</p>}
            </div>
          );
        } else {
          return (
            <div className="message-media">
              <div className="flex flex-col items-center justify-center h-40 w-full bg-gray-200 rounded-md">
                <i className="ri-video-line text-4xl text-gray-400 mb-2"></i>
                <div className="text-center mb-3">
                  <p className="text-sm text-gray-600 font-medium">
                    {getFileTypeFromUrl(mediaUrl || '')}
                  </p>
                  {mediaSize && (
                    <p className="text-xs text-gray-500">
                      {formatFileSize(mediaSize)}
                    </p>
                  )}
                </div>
                <button
                  onClick={onDownload}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2 px-4 rounded-md text-sm transition-all"
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('message_bubble.downloading', 'Downloading...')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>{t('message_bubble.download_video', 'Download Video')}</span>
                    </>
                  )}
                </button>
              </div>
              {content && <p className="whitespace-pre-wrap text-sm mt-2">{content}</p>}
            </div>
          );
        }

      case 'audio':
        if (shouldAutoLoad && mediaUrl) {

          const getAudioMimeType = (url: string): string => {
            const extension = url.split('.').pop()?.toLowerCase();
            switch (extension) {
              case 'mp3':
                return 'audio/mpeg';
              case 'ogg':
                return 'audio/ogg';
              case 'webm':
                return 'audio/webm';
              case 'aac':
                return 'audio/aac';
              case 'm4a':
                return 'audio/mp4';
              case 'wav':
                return 'audio/wav';
              default:
                return 'audio/mpeg';
            }
          };

          const audioMimeType = getAudioMimeType(mediaUrl);

          return (
            <div className="message-media">
              <audio controls className="max-w-full" crossOrigin="anonymous" preload="metadata">
                <source src={mediaUrl} type={audioMimeType} />
                {/* Fallback sources for better compatibility */}
                <source src={mediaUrl} type="audio/mpeg" />
                <source src={mediaUrl} type="audio/ogg" />
                <source src={mediaUrl} type="audio/webm" />
                {t('message_bubble.audio_not_supported', 'Your browser does not support the audio element.')}
              </audio>
              {content && <p className="whitespace-pre-wrap text-sm mt-2">{content}</p>}
            </div>
          );
        } else {
          return (
            <div className="message-media">
              <div className="flex items-center justify-between rounded-md bg-gray-100 p-3 w-full">
                <div className="flex items-center">
                  <i className="ri-file-music-line text-xl mr-3 text-gray-500"></i>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {getFileTypeFromUrl(mediaUrl || '')}
                    </p>
                    {mediaSize && (
                      <p className="text-xs text-gray-500">
                        {formatFileSize(mediaSize)}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onDownload}
                  className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground py-1 px-3 rounded-md text-xs transition-all ml-3"
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>{t('message_bubble.loading', 'Loading...')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3" />
                      <span>{t('message_bubble.download', 'Download')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        }

      case 'document':
        return (
          <div className="flex items-center justify-between rounded-md bg-gray-100 p-3 w-full">
            <div className="flex items-center max-w-[70%]">
              <i className="ri-file-text-line text-xl mr-3 text-gray-500 flex-shrink-0"></i>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {content || t('message_bubble.document', 'Document')}
                </p>
                {mediaSize && (
                  <p className="text-xs text-gray-500">
                    {formatFileSize(mediaSize)}
                  </p>
                )}
              </div>
            </div>
            {mediaUrl ? (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground py-1 px-3 rounded-md text-xs transition-all ml-2 flex-shrink-0"
              >
                <i className="ri-external-link-line"></i>
                <span>{t('message_bubble.open', 'Open')}</span>
              </a>
            ) : (
              <button
                onClick={onDownload}
                className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground py-1 px-3 rounded-md text-xs transition-all ml-2 flex-shrink-0"
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{t('message_bubble.loading', 'Loading...')}</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3" />
                    <span>{t('message_bubble.download', 'Download')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        );

      case 'tiktok_video_share':
        return (
          <TikTokVideoShareCard
            message={message}
            mediaUrl={mediaUrl}
            t={t}
          />
        );

      case 'sticker':
        if (shouldAutoLoad && mediaUrl) {
          return (
            <div className="message-media">
              <img
                src={mediaUrl}
                alt={t('message_bubble.sticker', 'Sticker')}
                className="max-w-[120px] max-h-[120px]"
                crossOrigin="anonymous"
                loading="eager"
              />
            </div>
          );
        } else {
          return (
            <div className="message-media">
              <div className="flex items-center justify-between rounded-md bg-gray-100 p-3 w-full">
                <div className="flex items-center">
                  <i className="ri-sticky-note-line text-xl mr-3 text-gray-500"></i>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {t('message_bubble.sticker', 'Sticker')}
                    </p>
                    {mediaSize && (
                      <p className="text-xs text-gray-500">
                        {formatFileSize(mediaSize)}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onDownload}
                  className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground py-1 px-3 rounded-md text-xs transition-all ml-3"
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>{t('message_bubble.loading', 'Loading...')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3" />
                      <span>{t('message_bubble.download', 'Download')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        }

      default:
        return <p className="whitespace-pre-wrap">{content}</p>;
    }
  };

  return renderContent();
}
