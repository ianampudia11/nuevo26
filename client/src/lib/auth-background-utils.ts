interface AuthBackgroundConfig {
  backgroundColor: string;
  gradientMode: 'simple' | 'advanced';
  simpleGradient: {
    startColor: string;
    endColor: string;
    direction: string;
  };
  advancedGradient: {
    stops: Array<{ color: string; position: number }>;
    angle: number;
  };
  priority: 'image' | 'color' | 'layer';
}

interface BackgroundStyle {
  backgroundImage?: string;
  backgroundColor?: string;
  background?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
}

/**
 * Converts direction string to CSS linear-gradient direction
 */
function convertDirectionToCSS(direction: string): string {
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
  return directionMap[direction] || direction;
}

/**
 * Generates CSS background style from auth background configuration
 */
export function generateBackgroundStyle(
  config: AuthBackgroundConfig,
  imageUrl: string | null
): BackgroundStyle {
  const style: BackgroundStyle = {};


  const angle = Math.max(0, Math.min(360, config.advancedGradient?.angle || 135));


  let gradientString: string | null = null;

  if (config.gradientMode === 'simple' && config.simpleGradient) {
    const { startColor, endColor, direction } = config.simpleGradient;
    if (startColor && endColor) {
      const cssDirection = convertDirectionToCSS(direction);
      gradientString = `linear-gradient(${cssDirection}, ${startColor}, ${endColor})`;
    }
  } else if (config.gradientMode === 'advanced' && config.advancedGradient?.stops) {
    const stops = [...config.advancedGradient.stops];

    stops.sort((a, b) => a.position - b.position);
    
    if (stops.length > 0) {
      const stopStrings = stops.map(stop => `${stop.color} ${stop.position}%`);
      gradientString = `linear-gradient(${angle}deg, ${stopStrings.join(', ')})`;
    }
  }


  if (config.priority === 'image') {

    if (imageUrl) {

      if (gradientString) {
        style.background = `url(${imageUrl}), ${gradientString}`;
        style.backgroundImage = `url(${imageUrl}), ${gradientString}`;
      } else if (config.backgroundColor) {
        style.backgroundColor = config.backgroundColor;
        style.background = `url(${imageUrl})`;
        style.backgroundImage = `url(${imageUrl})`;
      } else {
        style.background = `url(${imageUrl})`;
        style.backgroundImage = `url(${imageUrl})`;
      }

      style.backgroundSize = 'cover';
      style.backgroundPosition = 'center';
      style.backgroundRepeat = 'no-repeat';
    } else {

      if (gradientString) {
        style.background = gradientString;
        style.backgroundImage = gradientString;
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
        style.backgroundRepeat = 'no-repeat';
      } else if (config.backgroundColor) {
        style.backgroundColor = config.backgroundColor;
      } else {

        style.backgroundColor = '#ffffff';
      }
    }
  } else if (config.priority === 'color') {

    if (gradientString) {
      style.background = gradientString;
      style.backgroundImage = gradientString;
      style.backgroundSize = 'cover';
      style.backgroundPosition = 'center';
      style.backgroundRepeat = 'no-repeat';
    } else if (config.backgroundColor) {
      style.backgroundColor = config.backgroundColor;
    } else {

      style.backgroundColor = '#ffffff';
    }
  } else if (config.priority === 'layer') {

    const layers: string[] = [];
    

    if (imageUrl) {
      layers.push(`url(${imageUrl})`);
    }
    
    if (gradientString) {
      layers.push(gradientString);
    } else if (config.backgroundColor) {
      layers.push(config.backgroundColor);
    }
    
    if (layers.length > 0) {
      style.background = layers.join(', ');

      if (imageUrl) {
        style.backgroundImage = `url(${imageUrl})`;
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
        style.backgroundRepeat = 'no-repeat';
      } else if (gradientString) {
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
        style.backgroundRepeat = 'no-repeat';
      }
    } else {

      style.backgroundColor = '#ffffff';
    }
  } else {

    if (gradientString) {
      style.background = gradientString;
      style.backgroundImage = gradientString;
      style.backgroundSize = 'cover';
      style.backgroundPosition = 'center';
      style.backgroundRepeat = 'no-repeat';
    } else if (config.backgroundColor) {
      style.backgroundColor = config.backgroundColor;
    } else {
      style.backgroundColor = '#ffffff';
    }
  }

  return style;
}

