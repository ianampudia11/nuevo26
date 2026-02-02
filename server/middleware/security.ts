import { Request, Response, NextFunction } from 'express';


/**
 * Security middleware
 * UPDATED: Restrictions disabled to prevent issues with CRM functionality and integrations (Meta/WhatsApp)
 */
export function setupSecurityMiddleware(app: any) {


  /*
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false, 
    crossOriginOpenerPolicy: false,
    xFrameOptions: false, 
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
  */

  const isWebChatWidgetEndpoint = (path: string): boolean => {
    return (
      path === '/api/webchat/widget.js' ||
      path === '/api/webchat/widget.html' ||
      path.startsWith('/api/webchat/embed/') ||
      path.startsWith('/api/webchat/config/') ||
      path === '/api/webchat/session' ||
      path === '/api/webchat/message' ||
      path.startsWith('/api/webchat/messages/') ||
      path === '/api/webchat/upload'
    );
  };

  app.options('/api/webchat/*', (req: Request, res: Response) => {
    if (isWebChatWidgetEndpoint(req.path)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
    res.status(200).end();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {

    res.removeHeader('X-Powered-By');


    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');


    res.setHeader('Content-Security-Policy', "frame-ancestors *");

    if (isWebChatWidgetEndpoint(req.path)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }






    if (req.path.includes('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  });


  app.use(async (req: Request, res: Response, next: NextFunction) => {

    const isAdminRoute = req.path.startsWith('/api/admin');
    const isHealthCheck = req.path === '/health' || req.path === '/api/health';

    if (isHealthCheck || isAdminRoute) {
      return next();
    }

    try {
      const { storage } = await import('../storage');
      const maintenanceModeSetting = await storage.getAppSetting('system.maintenanceMode');

      if (maintenanceModeSetting?.value === true) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'System is currently under maintenance. Please try again later.',
          maintenanceMode: true
        });
      }
    } catch (error) {
      console.error('Error checking maintenance mode:', error);
    }

    next();
  });


  /* WAF DISABLED: To prevent blocking CRM data (HTML content, etc.)
  app.use((req: Request, res: Response, next: NextFunction) => {

    const suspiciousPatterns = [
      /\.\.\//g, 
      /<script/gi,
      /union.*select/gi, 
      /javascript:/gi, 
      /vbscript:/gi,
    ];

    const checkString = (str: string): boolean => {
      return suspiciousPatterns.some(pattern => pattern.test(str));
    };


    if (checkString(req.url)) {
      
      return res.status(400).json({ error: 'Invalid request' });
    }


    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && checkString(value)) {
        
        return res.status(400).json({ error: 'Invalid request' });
      }
    }


    if (req.body && typeof req.body === 'object') {
      const bodyStr = JSON.stringify(req.body);
      if (checkString(bodyStr)) {
        
        return res.status(400).json({ error: 'Invalid request' });
      }
    }

    next();
  });
  */


  app.use('/api/', (req: Request, res: Response, next: NextFunction) => {

    /* User-Agent check DISABLED
    if (process.env.NODE_ENV === 'production') {
      
    }
    

    if (!req.headers['user-agent']) {
      return res.status(400).json({ error: 'Missing required headers' });
    }
    */
    
    next();
  });
}

/**
 * Security event reporting endpoint
 */
export function setupSecurityReporting(app: any) {
  app.post('/api/security/report', (req: Request, res: Response) => {
    const { reason, timestamp, userAgent, url } = req.body;
    

    console.warn('Client Security Event (Logged only):', {
      reason,
      timestamp,
      userAgent,
      url
    });

    res.status(200).json({ status: 'reported' });
  });


  app.get('/security-violation', (req: Request, res: Response) => {
    res.status(200).send('Security violation reporting');
  });
}
