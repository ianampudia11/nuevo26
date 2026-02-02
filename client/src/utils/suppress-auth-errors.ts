
export function suppressAuthErrors() {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  

  console.error = (...args: any[]) => {

    const fullMessage = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    

    if (fullMessage.includes('401') || fullMessage.includes('Unauthorized')) {

      return;
    }
    

    originalError.apply(console, args);
  };
  

  console.warn = (...args: any[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('401') || 
        lowerMessage.includes('unauthorized') || 
        lowerMessage.includes('blocked conversation update') || 
        lowerMessage.includes('insufficient permissions') ||
        message.includes('[Security] Blocked conversation update')) {
      return;
    }
    originalWarn.apply(console, args);
  };
  


  

  const originalWindowError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (typeof message === 'string' && (message.includes('401') || message.includes('Unauthorized'))) {
      return true; // Prevent default browser error handling
    }
    if (originalWindowError) {
      return originalWindowError(message, source, lineno, colno, error);
    }
    return false;
  };
  

  return () => {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
    window.onerror = originalWindowError;
  };
}
