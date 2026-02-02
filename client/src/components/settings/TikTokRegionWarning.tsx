import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ExternalLink } from 'lucide-react';

const TIKTOK_REGION_DOCS_URL = 'https://developers.tiktok.com/doc/regional-availability/';

interface TikTokRegionWarningProps {
  regionCode?: string;
  isRestricted: boolean;
  unavailableFeatures?: string[];
  className?: string;
}

export default function TikTokRegionWarning({
  regionCode,
  isRestricted,
  unavailableFeatures = [],
  className
}: TikTokRegionWarningProps) {
  if (!isRestricted) return null;

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Region restrictions</AlertTitle>
      <AlertDescription>
        <p className="mb-2">
          Your TikTok account is in a restricted region ({regionCode || 'EEA/UK/CH'}). Some features may be unavailable.
        </p>
        {unavailableFeatures.length > 0 && (
          <p className="mb-2 text-sm">
            Unavailable in your region: {unavailableFeatures.join(', ')}.
          </p>
        )}
        <p className="text-sm opacity-90">
          Analytics and reporting may still be available. Check TikTok&apos;s regional availability for details.
        </p>
        <a
          href={TIKTOK_REGION_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-sm font-medium underline"
        >
          Learn More
          <ExternalLink className="h-3 w-3" />
        </a>
      </AlertDescription>
    </Alert>
  );
}
