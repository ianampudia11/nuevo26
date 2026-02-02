import { useMemo } from 'react';
import { useBranding } from '@/contexts/branding-context';
import type { GradientConfig } from '@shared/schema';

/**
 * A hook that returns style objects for branding colors
 * 
 * @returns An object with style objects for primary and secondary colors
 */
export function useBrandingStyles() {
  const { branding } = useBranding();
  
  return useMemo(() => {
    return {
      primaryStyle: {
        backgroundColor: branding.primaryColor,
        color: 'white',
      },
      secondaryStyle: {
        backgroundColor: branding.secondaryColor,
        color: 'white',
      },
      primaryTextStyle: {
        color: branding.primaryColor,
      },
      secondaryTextStyle: {
        color: branding.secondaryColor,
      },
      primaryBorderStyle: {
        borderColor: branding.primaryColor,
      },
      secondaryBorderStyle: {
        borderColor: branding.secondaryColor,
      },
    };
  }, [branding.primaryColor, branding.secondaryColor]);
}

function convertDirectionToCss(direction: string): string {
  const directionMap: Record<string, string> = {
    'to-right': 'to right',
    'to-left': 'to left',
    'to-top': 'to top',
    'to-bottom': 'to bottom',
    'to-br': 'to bottom right',
    'to-bl': 'to bottom left',
    'to-tr': 'to top right',
    'to-tl': 'to top left'
  };
  return directionMap[direction] || 'to bottom';
}

function buildGradientCss(gradientConfig?: GradientConfig): string | undefined {
  if (!gradientConfig) return undefined;
  
  if (gradientConfig.mode === 'simple') {
    const { startColor, endColor, direction } = gradientConfig.simple;
    const cssDirection = convertDirectionToCss(direction);
    return `linear-gradient(${cssDirection}, ${startColor}, ${endColor})`;
  } else {
    const { stops, angle } = gradientConfig.advanced;
    const stopsCss = stops
      .map(stop => `${stop.color} ${stop.position}%`)
      .join(', ');
    return `linear-gradient(${angle}deg, ${stopsCss})`;
  }
}

/**
 * A hook that generates CSS styles for auth page backgrounds based on branding configuration
 * 
 * @param type - 'admin' or 'user' to determine which auth background to use
 * @returns CSS style object for the auth page background
 */
export function useAuthBackgroundStyles(type: 'admin' | 'user') {
  const { branding } = useBranding();
  
  return useMemo(() => {

    const config = type === 'admin' 
      ? branding.authBackgroundConfig?.adminAuthBackground
      : branding.authBackgroundConfig?.userAuthBackground;
    
    const imageUrl = type === 'admin'
      ? branding.adminAuthBackgroundUrl
      : branding.userAuthBackgroundUrl;
    
    if (!config) return {};
    

    const gradientCss = buildGradientCss(config.gradientConfig);
    

    switch (config.priority) {
      case 'image':

        if (imageUrl) {

          return {
            backgroundImage: gradientCss 
              ? `url(${imageUrl}), ${gradientCss}`
              : `url(${imageUrl})`,
            backgroundColor: !gradientCss ? config.backgroundColor : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          };
        } else {

          return {
            backgroundImage: gradientCss || undefined,
            backgroundColor: !gradientCss ? config.backgroundColor : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          };
        }
      
      case 'color':

        return {
          backgroundImage: gradientCss || undefined,
          backgroundColor: !gradientCss ? config.backgroundColor : undefined
        };
      
      case 'layer':

        return {
          backgroundImage: imageUrl && gradientCss 
            ? `url(${imageUrl}), ${gradientCss}`
            : imageUrl 
            ? `url(${imageUrl})`
            : gradientCss || undefined,
          backgroundColor: !imageUrl && !gradientCss ? config.backgroundColor : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        };
      
      default:
        return {};
    }
  }, [branding, type]);
}
