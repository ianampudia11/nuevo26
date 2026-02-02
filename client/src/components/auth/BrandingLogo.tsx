import { useBranding } from "@/contexts/branding-context";

interface BrandingLogoProps {
  className?: string;
  logoHeight?: string;
}

export function BrandingLogo({ className = "", logoHeight = "h-12" }: BrandingLogoProps) {
  const { branding } = useBranding();

  return (
    <div className={`w-auto ${logoHeight} flex items-center justify-center ${className}`}>
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt={branding.appName} className={`${logoHeight} w-auto`} />
      ) : (
        <div className="w-10 h-10 rounded-lg flex items-center justify-center">
          <span className="text-secondary-foreground font-bold text-lg">
            {branding.appName.charAt(0)}
          </span>
        </div>
      )}
    </div>
  );
}