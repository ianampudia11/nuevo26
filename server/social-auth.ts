import { Express } from "express";







/*
interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface FacebookUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: {
    data: {
      url: string;
    };
  };
}


function encryptToken(token: string): string {
  const algorithm = 'aes-256-gcm';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const key = crypto.scryptSync(secretKey, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}


function decryptToken(encryptedToken: string): string {
  const algorithm = 'aes-256-gcm';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const key = crypto.scryptSync(secretKey, 'salt', 32);

  const [ivHex, encrypted] = encryptedToken.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipher(algorithm, key);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
*/

export function setupSocialAuth(app: Express) {



  /*
  app.get("/api/auth/google", async (req: Request, res: Response) => {
    try {
      const googleConfig = await storage.getAppSetting('social_login_google');
      
      if (!googleConfig || !(googleConfig.value as any).enabled) {
        return res.status(400).json({ error: "Google OAuth is not enabled" });
      }
      
      const config = googleConfig.value as any;


      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('x-forwarded-host') || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;



      const oauth2Client = new OAuth2Client(
        config.client_id,
        config.client_secret,
        redirectUri
      );
      
      const scopes = [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ];
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
      });
      
      res.redirect(authUrl);
    } catch (error) {
      console.error("Error initiating Google OAuth:", error);
      res.status(500).json({ error: "Failed to initiate Google OAuth" });
    }
  });


  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, error } = req.query;
      
      if (error) {
        return res.redirect('/auth?error=oauth_cancelled');
      }
      
      if (!code) {
        return res.redirect('/auth?error=oauth_failed');
      }
      
      const googleConfig = await storage.getAppSetting('social_login_google');
      if (!googleConfig || !(googleConfig.value as any).enabled) {
        return res.redirect('/auth?error=oauth_disabled');
      }
      
      const config = googleConfig.value as any;


      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('x-forwarded-host') || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

      const oauth2Client = new OAuth2Client(
        config.client_id,
        config.client_secret,
        redirectUri
      );
      

      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);
      

      const userInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokens.access_token}`
      );
      const userInfo: GoogleUserInfo = await userInfoResponse.json();
      

      let user = await storage.getUserBySocialAccount('google', userInfo.id);
      
      if (!user) {

        user = await storage.getUserByEmail(userInfo.email);
        
        if (user) {

          await storage.createUserSocialAccount({
            userId: user.id,
            provider: 'google',
            providerUserId: userInfo.id,
            providerEmail: userInfo.email,
            providerName: userInfo.name,
            providerAvatarUrl: userInfo.picture,
            accessToken: encryptToken(tokens.access_token || ''),
            refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
            tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            providerData: { userInfo }
          });
        } else {

          const newUser = await storage.createUserFromSocialLogin({
            email: userInfo.email,
            fullName: userInfo.name,
            avatarUrl: userInfo.picture,
            provider: 'google',
            providerUserId: userInfo.id,
            providerData: { userInfo }
          });
          
          user = newUser;
          

          await storage.createUserSocialAccount({
            userId: user.id,
            provider: 'google',
            providerUserId: userInfo.id,
            providerEmail: userInfo.email,
            providerName: userInfo.name,
            providerAvatarUrl: userInfo.picture,
            accessToken: encryptToken(tokens.access_token || ''),
            refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
            tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            providerData: { userInfo }
          });
        }
      }
      

      req.logIn(user, (err) => {
        if (err) {
          console.error("Error logging in user:", err);
          return res.redirect('/auth?error=login_failed');
        }
        
        res.redirect('/');
      });
      
    } catch (error) {
      console.error("Error in Google OAuth callback:", error);
      res.redirect('/auth?error=oauth_failed');
    }
  });


  app.get("/api/auth/facebook", async (req: Request, res: Response) => {
    try {
      const facebookConfig = await storage.getAppSetting('social_login_facebook');
      
      if (!facebookConfig || !(facebookConfig.value as any).enabled) {
        return res.status(400).json({ error: "Facebook OAuth is not enabled" });
      }
      
      const config = facebookConfig.value as any;


      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('x-forwarded-host') || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/facebook/callback`;


      
      const authUrl = `https://www.facebook.com/v24.0/dialog/oauth?` +
        `client_id=${config.app_id}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=email,public_profile&` +
        `response_type=code`;
      
      res.redirect(authUrl);
    } catch (error) {
      console.error("Error initiating Facebook OAuth:", error);
      res.status(500).json({ error: "Failed to initiate Facebook OAuth" });
    }
  });


  app.get("/api/auth/facebook/callback", async (req: Request, res: Response) => {
    try {
      const { code, error } = req.query;
      
      if (error) {
        return res.redirect('/auth?error=oauth_cancelled');
      }
      
      if (!code) {
        return res.redirect('/auth?error=oauth_failed');
      }
      
      const facebookConfig = await storage.getAppSetting('social_login_facebook');
      if (!facebookConfig || !(facebookConfig.value as any).enabled) {
        return res.redirect('/auth?error=oauth_disabled');
      }
      
      const config = facebookConfig.value as any;


      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('x-forwarded-host') || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/facebook/callback`;
      

      const tokenResponse = await fetch(
        `https://graph.facebook.com/v24.0/oauth/access_token?` +
        `client_id=${config.app_id}&` +
        `client_secret=${config.app_secret}&` +
        `code=${code}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}`
      );
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        console.error("Facebook token exchange error:", tokenData.error);
        return res.redirect('/auth?error=oauth_failed');
      }
      

      const userInfoResponse = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${tokenData.access_token}`
      );
      const userInfo: FacebookUserInfo = await userInfoResponse.json();
      

      let user = await storage.getUserBySocialAccount('facebook', userInfo.id);
      
      if (!user) {

        user = await storage.getUserByEmail(userInfo.email);
        
        if (user) {

          await storage.createUserSocialAccount({
            userId: user.id,
            provider: 'facebook',
            providerUserId: userInfo.id,
            providerEmail: userInfo.email,
            providerName: userInfo.name,
            providerAvatarUrl: userInfo.picture?.data?.url,
            accessToken: encryptToken(tokenData.access_token),
            refreshToken: null,
            tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
            providerData: { userInfo }
          });
        } else {

          const newUser = await storage.createUserFromSocialLogin({
            email: userInfo.email,
            fullName: userInfo.name,
            avatarUrl: userInfo.picture?.data?.url,
            provider: 'facebook',
            providerUserId: userInfo.id,
            providerData: { userInfo }
          });
          
          user = newUser;
          

          await storage.createUserSocialAccount({
            userId: user.id,
            provider: 'facebook',
            providerUserId: userInfo.id,
            providerEmail: userInfo.email,
            providerName: userInfo.name,
            providerAvatarUrl: userInfo.picture?.data?.url,
            accessToken: encryptToken(tokenData.access_token),
            refreshToken: null,
            tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
            providerData: { userInfo }
          });
        }
      }
      

      req.logIn(user, (err) => {
        if (err) {
          console.error("Error logging in user:", err);
          return res.redirect('/auth?error=login_failed');
        }
        
        res.redirect('/');
      });
      
    } catch (error) {
      console.error("Error in Facebook OAuth callback:", error);
      res.redirect('/auth?error=oauth_failed');
    }
  });


  app.get("/api/auth/apple", async (req: Request, res: Response) => {
    try {
      const appleConfig = await storage.getAppSetting('social_login_apple');

      if (!appleConfig || !(appleConfig.value as any).enabled) {
        return res.status(400).json({ error: "Apple OAuth is not enabled" });
      }

      const config = appleConfig.value as any;


      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('x-forwarded-host') || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/apple/callback`;




      const state = crypto.randomBytes(32).toString('hex');

      const authUrl = `https://appleid.apple.com/auth/authorize?` +
        `client_id=${config.client_id}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=name email&` +
        `response_mode=form_post&` +
        `state=${state}`;

      res.redirect(authUrl);
    } catch (error) {
      console.error("Error initiating Apple OAuth:", error);
      res.status(500).json({ error: "Failed to initiate Apple OAuth" });
    }
  });


  app.post("/api/auth/apple/callback", async (req: Request, res: Response) => {
    try {
      const { code, error, user } = req.body;

      if (error) {
        return res.redirect('/auth?error=oauth_cancelled');
      }

      if (!code) {
        return res.redirect('/auth?error=oauth_failed');
      }

      const appleConfig = await storage.getAppSetting('social_login_apple');
      if (!appleConfig || !(appleConfig.value as any).enabled) {
        return res.redirect('/auth?error=oauth_disabled');
      }








      const config = appleConfig.value as any;


      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('x-forwarded-host') || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/apple/callback`;


      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: config.team_id,
        iat: now,
        exp: now + 3600, // 1 hour
        aud: 'https://appleid.apple.com',
        sub: config.client_id
      };

      const privateKey = config.private_key.replace(/\\n/g, '\n');
      const options: jwt.SignOptions = {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: config.key_id
        }
      };

      const clientSecret = jwt.sign(payload, privateKey, options);


      const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: config.client_id,
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        })
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Apple token exchange error:", tokenData.error);
        return res.redirect('/auth?error=oauth_failed');
      }


      const idToken = tokenData.id_token;
      const decodedToken = jwt.decode(idToken) as any;

      if (!decodedToken) {
        console.error("Failed to decode Apple ID token");
        return res.redirect('/auth?error=oauth_failed');
      }


      const userInfo = {
        id: decodedToken.sub,
        email: decodedToken.email,
        name: user?.name ? `${user.name.firstName} ${user.name.lastName}` : decodedToken.email?.split('@')[0] || 'Apple User',
        email_verified: decodedToken.email_verified === 'true'
      };

      if (!userInfo.email_verified) {
        return res.redirect('/auth?error=email_not_verified');
      }


      let existingUser = await storage.getUserByEmail(userInfo.email);
      let user_obj;

      if (existingUser) {
        user_obj = existingUser;


        await storage.createUserSocialAccount({
          userId: user_obj.id,
          provider: 'apple',
          providerUserId: userInfo.id,
          providerEmail: userInfo.email,
          providerName: userInfo.name,
          providerAvatarUrl: undefined,
          accessToken: encryptToken(tokenData.access_token || ''),
          refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
          tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
          providerData: { userInfo, decodedToken }
        });
      } else {

        const newUser = await storage.createUserFromSocialLogin({
          email: userInfo.email,
          fullName: userInfo.name,
          avatarUrl: undefined,
          provider: 'apple',
          providerUserId: userInfo.id,
          providerData: { userInfo, decodedToken }
        });

        user_obj = newUser;


        await storage.createUserSocialAccount({
          userId: user_obj.id,
          provider: 'apple',
          providerUserId: userInfo.id,
          providerEmail: userInfo.email,
          providerName: userInfo.name,
          providerAvatarUrl: undefined,
          accessToken: encryptToken(tokenData.access_token || ''),
          refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
          tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
          providerData: { userInfo, decodedToken }
        });
      }


      req.logIn(user_obj, (err) => {
        if (err) {
          console.error("Error logging in user:", err);
          return res.redirect('/auth?error=login_failed');
        }

        res.redirect('/');
      });

    } catch (error) {
      console.error("Error in Apple OAuth callback:", error);
      res.redirect('/auth?error=oauth_failed');
    }
  });
  */
}
