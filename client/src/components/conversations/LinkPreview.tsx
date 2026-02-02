import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import './LinkPreview.css';

interface LinkPreviewProps {
  url: string;
  isInbound: boolean;
}

interface LinkPreviewData {
  success: boolean;
  url: string;
  preview: {
    title?: string;
    description?: string;
    images?: string[];
    siteName?: string;
    mediaType?: string;
    contentType?: string;
    favicons?: string[];
  };
}

interface LinkPreviewError {
  success: false;
  error: string;
  retryAfter?: number;
}

const LinkPreview: React.FC<LinkPreviewProps> = ({ url, isInbound }) => {
  const { t } = useTranslation();
  const [previewData, setPreviewData] = useState<LinkPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldRender, setShouldRender] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);

  const domain = useMemo(() => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }, [url]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    let controller: AbortController;

    const fetchPreview = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setImageError(false);

        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('/api/link-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = (await response.text()) || response.statusText;
          throw new Error(`${response.status}: ${text}`);
        }

        const data: LinkPreviewData | LinkPreviewError = await response.json();

        if (!isMounted) return;

        if ('success' in data && data.success) {
          const previewData = data as LinkPreviewData;
          if (previewData.preview && (previewData.preview.title || previewData.preview.description || previewData.preview.images?.length)) {
            setPreviewData(previewData);
            setShouldRender(true);
          } else {
            setShouldRender(false);
          }
        } else {
          const errorData = data as LinkPreviewError;
          if (errorData.retryAfter) {
            setError(t('link_preview.rate_limit', 'Too many requests, please wait'));
            setShouldRender(true);
          } else {
            setShouldRender(false);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;

        if (err.name === 'AbortError') {
          setShouldRender(false);
        } else if (err.message?.includes('429')) {
          setError(t('link_preview.rate_limit', 'Too many requests, please wait'));
          setShouldRender(true);
        } else if (err.message?.includes('400') || err.message?.includes('404')) {
          setShouldRender(false);
        } else {
          setError(t('link_preview.error', 'Failed to load preview'));
          setShouldRender(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (controller) {
        controller.abort();
      }
    };
  }, [url, t]);

  if (!shouldRender && !isLoading) {
    return null;
  }

  const handleImageError = () => {
    setImageError(true);
  };

  const handleCardClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const displayTitle = previewData?.preview?.title || previewData?.preview?.siteName || domain;
  const displayDescription = previewData?.preview?.description || '';
  const displayImage = previewData?.preview?.images?.[0];
  const displaySiteName = previewData?.preview?.siteName || domain;

  if (isLoading) {
    return (
      <div className={`link-preview-card ${isInbound ? 'inbound' : 'outbound'} loading`}>
        <div className="link-preview-shimmer link-preview-image-placeholder"></div>
        <div className="link-preview-content">
          <div className="link-preview-shimmer link-preview-site-name-placeholder"></div>
          <div className="link-preview-shimmer link-preview-title-placeholder"></div>
          <div className="link-preview-shimmer link-preview-description-placeholder"></div>
        </div>
      </div>
    );
  }

  if (error && !previewData) {
    return (
      <div className={`link-preview-card ${isInbound ? 'inbound' : 'outbound'}`}>
        <div className="link-preview-content">
          <div className="link-preview-site-name" style={{ color: '#ef4444' }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!previewData) {
    return null;
  }

  return (
    <div
      className={`link-preview-card ${isInbound ? 'inbound' : 'outbound'}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {displayImage && !imageError && (
        <div className="link-preview-image-container">
          <img
            src={displayImage}
            alt={displayTitle}
            className="link-preview-image"
            loading="lazy"
            crossOrigin="anonymous"
            onError={handleImageError}
          />
        </div>
      )}
      <div className="link-preview-content">
        <div className="link-preview-site-name" title={displaySiteName}>
          {displaySiteName.length > 50 ? `${displaySiteName.substring(0, 50)}...` : displaySiteName}
        </div>
        {displayTitle && (
          <div className="link-preview-title" title={displayTitle}>
            {displayTitle}
          </div>
        )}
        {displayDescription && (
          <div className="link-preview-description" title={displayDescription}>
            {displayDescription}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LinkPreview);

