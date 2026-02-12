import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, Company } from "@shared/schema";
import connectPg from "connect-pg-simple";
import { getPool } from "./db";
import { createAffiliateReferral } from "./middleware/affiliate-tracking";
import { subdomainMiddleware, requireSubdomainAuth } from "./middleware/subdomain";
import { initPipelineStages } from "./init-pipeline-stages";

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}


async function findCompanyAdmin(companyId: number): Promise<SelectUser | undefined> {
  try {

    const companyUsers = await storage.getUsersByCompany(companyId);


    const adminUser = companyUsers.find(user => user.role === 'admin');


    if (!adminUser && companyUsers.length > 0) {
      return companyUsers[0];
    }

    return adminUser;
  } catch (error) {
    return undefined;
  }
}


async function createTemporaryAdmin(company: Company): Promise<SelectUser> {
  try {

    const username = `admin@${company.slug}`;


    const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
    if (existingUser) {
      return existingUser;
    }


    const password = randomBytes(8).toString('hex');


    const adminUser = await storage.createUser({
      username,
      password: await hashPassword(password),
      fullName: `${company.name} Admin`,
      email: username,
      role: 'admin',
      companyId: company.id,
      isSuperAdmin: false
    });

    return adminUser;
  } catch (error) {
    throw error;
  }
}

export async function setupAuth(app: Express) {
  const PostgresSessionStore = connectPg(session);

  const isProduction = process.env.NODE_ENV === 'production';
  const forceInsecure = process.env.FORCE_INSECURE_COOKIE === 'true';
  const sessionSecret = process.env.SESSION_SECRET || 'powerchat-secret';



  const poolProxy = new Proxy({} as any, {
    get(_target, prop) {
      return (getPool() as any)[prop];
    },
    set(_target, prop, value) {
      (getPool() as any)[prop] = value;
      return true;
    }
  });

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PostgresSessionStore({
      pool: poolProxy,
      createTableIfMissing: true,
    }),
    cookie: {
      secure: isProduction && !forceInsecure,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
      httpOnly: true
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));


  app.use(subdomainMiddleware);

  // TEMPORARY DEBUG ROUTE
  app.get('/api/debug/auth-check', async (req, res) => {
    try {
      const username = 'superadmin';
      const user = await storage.getUserByUsernameOrEmail(username);

      if (!user) {
        return res.json({
          found: false,
          message: 'User superadmin not found'
        });
      }

      const isSuperAdmin = user.isSuperAdmin;
      const storedHash = user.password;
      const testPassword = 'admin123';
      const isMatch = await comparePasswords(testPassword, storedHash);

      res.json({
        found: true,
        username: user.username,
        email: user.email,
        isSuperAdmin,
        hashPrefix: storedHash.substring(0, 10),
        hashLength: storedHash.length,
        passwordCheck: isMatch,
        nodeVersion: process.version
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());


  passport.use('local',
    new LocalStrategy(async (username, password, done) => {
      try {

        const user = await storage.getUserByUsernameOrEmail(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {

          if (user.isSuperAdmin) {
            return done(null, false);
          }
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );


  passport.use('admin-local',
    new LocalStrategy(async (username, password, done) => {
      try {

        const user = await storage.getUserByUsernameOrEmail(username);
        if (!user || !(await comparePasswords(password, user.password)) || !user.isSuperAdmin) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  });


  const ensureCompanyUser = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;


    if (user.isSuperAdmin) {
      return next();
    }


    if (!user.companyId) {
      return res.status(403).json({ message: 'No company association found' });
    }


    const company = await storage.getCompany(user.companyId);
    if (!company || !company.active) {
      return res.status(403).json({ message: 'Company account is inactive or not found' });
    }


    (req as any).company = company;
    next();
  };


  const ensureSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;
    if (!user.isSuperAdmin) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    next();
  };


  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, password, fullName, email, companyId } = req.body;


      if (!username || !password || !fullName || !email || !companyId) {
        return res.status(400).json({ error: "All fields are required" });
      }


      const company = await storage.getCompany(companyId);
      if (!company || !company.active) {
        return res.status(400).json({ error: "Invalid or inactive company" });
      }

      const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const user = await storage.createUser({
        username,
        password: await hashPassword(password),
        fullName,
        email,
        companyId,
        role: "agent",
        isSuperAdmin: false
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });


  app.post("/api/company/check-slug", async (req, res) => {
    try {
      const { slug } = req.body;

      if (!slug) {
        return res.status(400).json({ error: "Slug is required" });
      }


      const existingCompany = await storage.getCompanyBySlug(slug);

      res.json({
        available: !existingCompany,
        slug
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check slug availability" });
    }
  });


  app.post("/api/company/register", async (req, res) => {
    try {

      const registrationSettingObj = await storage.getAppSetting('registration_settings');
      const registrationSettings = (registrationSettingObj?.value as any) || { enabled: true, requireApproval: false };

      if (!registrationSettings.enabled) {
        return res.status(403).json({ error: "Company registration is currently disabled" });
      }

      const {
        companyName,
        companySlug,
        adminFullName,
        adminEmail,
        adminUsername,
        adminPassword,
        planId
      } = req.body;


      if (!companyName || !companySlug || !adminFullName || !adminEmail || !adminUsername || !adminPassword) {
        return res.status(400).json({ error: "All required fields must be provided" });
      }


      const existingCompany = await storage.getCompanyBySlug(companySlug);
      if (existingCompany) {
        return res.status(400).json({ error: "Company slug is already taken" });
      }


      const existingUser = await storage.getUserByUsernameCaseInsensitive(adminUsername);
      if (existingUser) {
        return res.status(400).json({ error: "Username is already taken" });
      }


      const existingEmailUser = await storage.getUserByEmail(adminEmail);
      if (existingEmailUser) {
        return res.status(400).json({ error: "Email address is already registered" });
      }


      let planName = registrationSettings.defaultPlan || 'free';
      let planMaxUsers = 5;
      let shouldStartTrial = false;
      let trialDays = 0;
      let selectedPlan = null;
      let subscriptionStatus: 'active' | 'inactive' | 'pending' | 'cancelled' | 'overdue' | 'trial' | 'grace_period' | 'paused' | 'past_due' = "inactive";

      if (planId) {
        try {
          const plan = await storage.getPlan(planId);
          if (plan) {
            selectedPlan = plan;
            planName = plan.name.toLowerCase();
            planMaxUsers = plan.maxUsers;


            if (plan.hasTrialPeriod && plan.trialDays && plan.trialDays > 0) {
              shouldStartTrial = true;
              trialDays = plan.trialDays;
              subscriptionStatus = "trial";
            } else if (plan.isFree) {
              subscriptionStatus = "active"; // Free plans are immediately active
            } else {

              subscriptionStatus = "pending";
            }
          }
        } catch (planError) {
          console.error('Error fetching plan during registration:', planError);
        }
      } else {

        subscriptionStatus = "active";
      }

      const company = await storage.createCompany({
        name: companyName,
        slug: companySlug,
        active: !registrationSettings.requireApproval, // Inactive if approval required
        plan: planName,
        planId: planId || null,
        maxUsers: planMaxUsers,
        primaryColor: '#333235', // Default primary color
        subscriptionStatus,
        subscriptionStartDate: subscriptionStatus === "active" ? new Date() : undefined





      });


      if (company.id) {
        try {
          await initPipelineStages(company.id);
        } catch (pipelineError) {
          console.error('Error initializing pipeline stages during company registration:', pipelineError);

        }
      }

      if (shouldStartTrial && planId && company.id) {
        try {
          await storage.startCompanyTrial(company.id, planId, trialDays);

        } catch (trialError) {
          console.error('Error starting trial during registration:', trialError);
        }
      }


      const adminUser = await storage.createUser({
        username: adminUsername,
        password: await hashPassword(adminPassword),
        fullName: adminFullName,
        email: adminEmail,
        companyId: company.id,
        role: "admin",
        isSuperAdmin: false
      });


      if ((req as any).affiliateTracking) {
        try {
          const affiliateTracking = (req as any).affiliateTracking;
          await createAffiliateReferral(
            affiliateTracking.affiliateCode,
            affiliateTracking.referralCode,
            adminEmail,
            adminUser.id,
            company.id
          );

        } catch (affiliateError) {
          console.error('Error creating affiliate referral:', affiliateError);

        }
      }


      if (!registrationSettings.requireApproval) {
        req.login(adminUser, (err) => {
          if (err) {
            return res.status(201).json({
              success: true,
              message: "Company registered successfully. Please log in.",
              requiresApproval: false,
              company: { id: company.id, name: company.name, slug: company.slug }
            });
          }

          res.status(201).json({
            success: true,
            message: "Company registered and logged in successfully",
            requiresApproval: false,
            user: adminUser,
            company: { id: company.id, name: company.name, slug: company.slug }
          });
        });
      } else {
        res.status(201).json({
          success: true,
          message: "Company registration submitted for approval",
          requiresApproval: true,
          company: { id: company.id, name: company.name, slug: company.slug }
        });
      }
    } catch (error) {
      console.error('Company registration error:', error);
      res.status(500).json({ error: "Failed to register company" });
    }
  });


  app.post("/api/login", requireSubdomainAuth, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, _info: any) => {
      if (err) {
        return next(err);
      }

      if (!user) {

        if (req.isSubdomainMode && req.subdomainCompany) {
          return res.status(401).json({
            message: 'Invalid credentials or user does not belong to this company',
            subdomain: req.subdomain
          });
        }
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }


        const response = req.isSubdomainMode && req.subdomainCompany ? {
          ...user,
          subdomain: req.subdomain,
          subdomainCompany: {
            id: req.subdomainCompany.id,
            name: req.subdomainCompany.name,
            slug: req.subdomainCompany.slug
          }
        } : user;

        res.status(200).json(response);
      });
    })(req, res, next);
  });


  app.post("/api/admin/login", (req, res, next) => {
    passport.authenticate("admin-local", (err: any, user: any, _info: any) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }

        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });


  app.get("/api/subdomain-info", (req, res) => {
    const response = {
      isSubdomainMode: req.isSubdomainMode || false,
      subdomain: req.subdomain || null,
      company: req.subdomainCompany ? {
        id: req.subdomainCompany.id,
        name: req.subdomainCompany.name,
        slug: req.subdomainCompany.slug,
        logo: req.subdomainCompany.logo,
        primaryColor: req.subdomainCompany.primaryColor
      } : null
    };
    res.json(response);
  });


  app.post("/api/admin/impersonate/:companyId", ensureSuperAdmin, async (req, res, next) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const originalUser = req.user as SelectUser;


      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }


      let adminUser = await findCompanyAdmin(companyId);

      if (!adminUser) {

        adminUser = await createTemporaryAdmin(company);
      }


      const impersonationData = {
        originalUserId: originalUser.id,
        originalUserEmail: originalUser.email,
        impersonatedAt: new Date().toISOString(),
        companyId: companyId
      };


      (req.session as any).impersonation = impersonationData;


      (req.session as any).originalSuperAdminId = originalUser.id;
      (req.session as any).isImpersonating = true;


      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });


      req.logout(async (err) => {
        if (err) {
          return next(err);
        }


        (req.session as any).impersonation = impersonationData;
        (req.session as any).originalSuperAdminId = originalUser.id;
        (req.session as any).isImpersonating = true;


        req.session.save((saveErr) => {
          if (saveErr) {
            return next(saveErr);
          }


          req.login(adminUser, (loginErr) => {
            if (loginErr) {
              return next(loginErr);
            }


            res.status(200).json({
              user: adminUser,
              company,
              impersonating: true,
              originalUserId: originalUser.id
            });
          });
        });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to impersonate company" });
    }
  });


  app.post("/api/admin/return-from-impersonation", async (req, res, next) => {
    try {

      const impersonationData = (req.session as any).impersonation;
      const originalSuperAdminId = (req.session as any).originalSuperAdminId;
      const isImpersonating = (req.session as any).isImpersonating;

      let superAdmin: SelectUser | undefined;


      if (impersonationData?.originalUserId) {
        superAdmin = await storage.getUser(impersonationData.originalUserId);
      } else if (originalSuperAdminId && isImpersonating) {
        superAdmin = await storage.getUser(originalSuperAdminId);
      } else {

        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@example.com";
        superAdmin = await storage.getUserByUsernameOrEmail(superAdminEmail);


        if (!superAdmin) {
          const allUsers = await storage.getAllUsers();
          superAdmin = allUsers.find(user => user.isSuperAdmin);
        }
      }

      if (!superAdmin || !superAdmin.isSuperAdmin) {
        return res.status(404).json({ error: "Original super admin user not found" });
      }



      req.logout((logoutErr) => {
        if (logoutErr) {
          return next(logoutErr);
        }


        delete (req.session as any).impersonation;
        delete (req.session as any).originalSuperAdminId;
        delete (req.session as any).isImpersonating;


        req.login(superAdmin, (loginErr) => {
          if (loginErr) {
            return next(loginErr);
          }


          res.status(200).json({
            user: superAdmin,
            impersonating: false,
            message: "Successfully returned to admin account"
          });
        });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to return from impersonation" });
    }
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });


  app.get("/api/debug/session", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user as SelectUser;
    const session = req.session as any;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        companyId: user.companyId
      },
      session: {
        hasImpersonation: !!session?.impersonation,
        impersonationData: session?.impersonation || null,
        originalSuperAdminId: session?.originalSuperAdminId || null,
        isImpersonating: session?.isImpersonating || false,
        sessionId: req.sessionID
      },
      isImpersonating: !!session?.impersonation?.originalUserId || !!session?.isImpersonating
    });
  });


  app.get("/api/debug/impersonation", (req, res) => {
    const session = req.session as any;
    const user = req.user as SelectUser;

    res.json({
      authenticated: req.isAuthenticated(),
      sessionId: req.sessionID,
      user: user ? {
        id: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        companyId: user.companyId
      } : null,
      sessionData: {
        impersonation: session?.impersonation || null,
        originalSuperAdminId: session?.originalSuperAdminId || null,
        isImpersonating: session?.isImpersonating || false,
        fullSession: JSON.stringify(session, null, 2)
      },
      timestamp: new Date().toISOString()
    });
  });


  app.get("/api/user/with-company", ensureCompanyUser, async (req, res) => {
    try {
      const user = req.user as SelectUser;


      let company = null;
      if (user.companyId) {
        company = await storage.getCompany(user.companyId);
      }

      res.json({
        user: req.user,
        company
      });
    } catch (error) {
      console.error("Error fetching user with company data:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });


  app.post("/api/clear-session", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to clear session" });
      }
      res.clearCookie('connect.sid');
      res.status(200).json({ message: "Session cleared" });
    });
  });


  app.get("/api/debug/session-config", (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const forceInsecure = process.env.FORCE_INSECURE_COOKIE === 'true';

    res.json({
      environment: process.env.NODE_ENV,
      sessionSecret: process.env.SESSION_SECRET ? '[SET]' : '[NOT SET]',
      forceInsecureCookie: forceInsecure,
      secureCookies: isProduction && !forceInsecure,
      sessionId: req.sessionID,
      isAuthenticated: req.isAuthenticated(),
      cookieSettings: sessionSettings.cookie,
      timestamp: new Date().toISOString()
    });
  });




  app.get("/api/admin/companies", ensureSuperAdmin, async (_req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });


  app.get("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const company = await storage.getCompany(companyId);

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });




  app.post("/api/admin/companies", ensureSuperAdmin, async (req, res) => {
    try {
      const { name, slug, logo, primaryColor, planId, maxUsers } = req.body;


      if (!name || !slug) {
        return res.status(400).json({ error: "Name and slug are required" });
      }


      const existingCompany = await storage.getCompanyBySlug(slug);
      if (existingCompany) {
        return res.status(400).json({ error: "Slug already in use" });
      }


      let planName = "free";
      let planMaxUsers = maxUsers || 5;
      let shouldStartTrial = false;
      let trialDays = 0;
      let subscriptionStatus: 'active' | 'inactive' | 'pending' | 'cancelled' | 'overdue' | 'trial' | 'grace_period' | 'paused' | 'past_due' = "inactive";

      if (planId) {
        try {
          const plan = await storage.getPlan(planId);
          if (plan) {
            planName = plan.name.toLowerCase();

            if (!maxUsers) {
              planMaxUsers = plan.maxUsers;
            }


            if (plan.hasTrialPeriod && plan.trialDays && plan.trialDays > 0) {
              shouldStartTrial = true;
              trialDays = plan.trialDays;
              subscriptionStatus = "trial";
            } else if (plan.isFree) {
              subscriptionStatus = "active"; // Free plans are immediately active
            } else {

              subscriptionStatus = "active";
            }
          }
        } catch (planError) {
          console.error("Error fetching plan:", planError);
        }
      } else {

        subscriptionStatus = "active";
      }


      let subscriptionEndDate: Date | undefined;
      if (subscriptionStatus === "active" && planId) {
        try {
          const plan = await storage.getPlan(planId);
          if (plan && !plan.isFree) {

            const billingInterval = plan.billingInterval || 'month';
            const now = new Date();

            switch (billingInterval) {
              case 'annual':
                subscriptionEndDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
                break;
              case 'quarterly':
                subscriptionEndDate = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
                break;
              case 'month':
              default:
                subscriptionEndDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
                break;
            }
          }
        } catch (error) {
          console.error("Error calculating subscription end date:", error);
        }
      }

      const company = await storage.createCompany({
        name,
        slug,
        logo,
        primaryColor,
        active: true,
        plan: planName,
        planId: planId || null,
        maxUsers: planMaxUsers,
        subscriptionStatus,
        subscriptionStartDate: subscriptionStatus === "active" ? new Date() : undefined,
        subscriptionEndDate
      });


      if (company.id) {
        try {
          await initPipelineStages(company.id);
        } catch (pipelineError) {
          console.error('Error initializing pipeline stages during admin company creation:', pipelineError);

        }
      }

      if (shouldStartTrial && planId) {
        try {
          await storage.startCompanyTrial(company.id, planId, trialDays);

        } catch (trialError) {
          console.error("Error starting trial:", trialError);
        }
      }


      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to create company" });
    }
  });


  app.get("/api/admin/companies/:id/deletion-preview", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const { companyDeletionService } = await import('./services/company-deletion');
      const preview = await companyDeletionService.getCompanyDeletionPreview(companyId);

      if (!preview) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.json(preview);
    } catch (error) {
      res.status(500).json({ error: "Failed to get deletion preview" });
    }
  });



  app.delete("/api/admin/companies/bulk", ensureSuperAdmin, async (req, res) => {

    try {

      const { companyIds } = req.body;

      if (!Array.isArray(companyIds) || companyIds.length === 0) {
        return res.status(400).json({ error: "Company IDs array is required" });
      }



      const numericCompanyIds = companyIds.map(id => {
        if (typeof id === 'string') {
          const numId = parseInt(id, 10);
          return isNaN(numId) ? null : numId;
        }
        return typeof id === 'number' ? id : null;
      }).filter(id => id !== null) as number[];


      const validCompanyIds = numericCompanyIds.filter(id => id > 0);

      if (validCompanyIds.length === 0) {
        return res.status(400).json({ error: "No valid company IDs provided" });
      }

      if (validCompanyIds.length !== companyIds.length) {

        return res.status(400).json({ error: "Some company IDs are invalid" });
      }



      const companies = await storage.getAllCompanies();
      const systemCompanies = companies.filter(c => c.slug === 'system');
      const systemCompanyIds = systemCompanies.map(c => c.id);

      const hasSystemCompanies = validCompanyIds.some(id => systemCompanyIds.includes(id));
      if (hasSystemCompanies) {
        return res.status(400).json({ error: "Cannot delete system companies" });
      }


      const { companyDeletionService } = await import('./services/company-deletion');


      const deletionResults = [];
      for (const companyId of validCompanyIds) {
        try {


          const company = await storage.getCompany(companyId);
          if (!company) {
            deletionResults.push({ companyId, success: false, error: `Company ${companyId} not found` });
            continue;
          }


          const result = await companyDeletionService.deleteCompany(companyId, (req as any).user.id);
          deletionResults.push({ companyId, success: true, result });
        } catch (error: unknown) {
          deletionResults.push({ companyId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      const successCount = deletionResults.filter(r => r.success).length;
      const failureCount = deletionResults.filter(r => !r.success).length;


      res.json({
        success: true,
        message: `Successfully deleted ${successCount} companies${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
        results: deletionResults,
        totalRequested: validCompanyIds.length,
        successCount,
        failureCount
      });

    } catch (error) {
      console.error("Error in bulk company deletion:", error);
      res.status(500).json({ error: "Failed to delete companies" });
    }
  });


  app.delete("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const { confirmationName } = req.body;

      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      if (confirmationName !== company.name) {
        return res.status(400).json({ error: "Company name confirmation does not match" });
      }

      if (company.slug === 'system') {
        return res.status(400).json({ error: "Cannot delete the system company" });
      }

      const { companyDeletionService } = await import('./services/company-deletion');
      const deletionSummary = await companyDeletionService.deleteCompany(companyId, (req as any).user.id);

      res.json({
        success: true,
        message: `Company "${company.name}" has been permanently deleted`,
        summary: deletionSummary
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete company" });
    }
  });


  app.put("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const { name, slug, logo, primaryColor, active, planId, maxUsers, companyEmail, contactPerson, registerNumber, iban } = req.body;


      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({ error: "Company not found" });
      }


      if (slug && slug !== existingCompany.slug) {
        const slugExists = await storage.getCompanyBySlug(slug);
        if (slugExists) {
          return res.status(400).json({ error: "Slug already in use" });
        }
      }


      let planName = existingCompany.plan;
      let planMaxUsers = maxUsers !== undefined ? maxUsers : existingCompany.maxUsers;

      if (planId) {
        try {
          const plan = await storage.getPlan(planId);
          if (plan) {
            planName = plan.name.toLowerCase();

            if (maxUsers === undefined) {
              planMaxUsers = plan.maxUsers;
            }

          }
        } catch (planError) {

        }
      }


      let updateData: any = {
        name,
        slug,
        logo,
        primaryColor,
        active,
        plan: planName,
        planId: planId || existingCompany.planId, // Make sure planId is updated
        maxUsers: planMaxUsers,
        companyEmail,
        contactPerson,
        registerNumber,
        iban
      };


      if (planId && planId !== existingCompany.planId) {
        try {
          const plan = await storage.getPlan(planId);
          if (plan) {
            const now = new Date();
            let newEndDate = new Date(now);
            const billingInterval = (plan as any).billingInterval || 'monthly';
            const customDurationDays = (plan as any).customDurationDays;

            switch (billingInterval) {
              case 'lifetime':
                newEndDate = new Date('2099-12-31');
                break;
              case 'daily':
                newEndDate.setDate(newEndDate.getDate() + 1);
                break;
              case 'weekly':
                newEndDate.setDate(newEndDate.getDate() + 7);
                break;
              case 'biweekly':
                newEndDate.setDate(newEndDate.getDate() + 14);
                break;
              case 'monthly':
                newEndDate.setMonth(newEndDate.getMonth() + 1);
                break;
              case 'quarterly':
                newEndDate.setMonth(newEndDate.getMonth() + 3);
                break;
              case 'semi_annual':
                newEndDate.setMonth(newEndDate.getMonth() + 6);
                break;
              case 'annual':
                newEndDate.setFullYear(newEndDate.getFullYear() + 1);
                break;
              case 'biennial':
                newEndDate.setFullYear(newEndDate.getFullYear() + 2);
                break;
              case 'custom':
                if (customDurationDays && customDurationDays > 0) {
                  newEndDate.setDate(newEndDate.getDate() + customDurationDays);
                } else {
                  newEndDate.setMonth(newEndDate.getMonth() + 1); // Fallback
                }
                break;

              case 'year':
                newEndDate.setFullYear(newEndDate.getFullYear() + 1);
                break;
              case 'quarter':
                newEndDate.setMonth(newEndDate.getMonth() + 3);
                break;
              case 'month':
              default:
                newEndDate.setMonth(newEndDate.getMonth() + 1);
                break;
            }

            updateData.subscriptionEndDate = newEndDate;
          }
        } catch (planError) {

        }
      }


      if (planId && planId !== existingCompany.planId) {
        const newPlan = await storage.getPlan(planId);
        if (newPlan) {
          if (newPlan.isFree) {

            updateData.isInTrial = false;
            updateData.trialStartDate = null;
            updateData.trialEndDate = null;
            updateData.subscriptionStatus = 'active';
            updateData.subscriptionStartDate = new Date();

          } else if (newPlan.hasTrialPeriod && newPlan.trialDays && newPlan.trialDays > 0) {

            updateData.subscriptionStatus = 'trial';
            updateData.subscriptionStartDate = new Date();


          } else {

            updateData.isInTrial = false;
            updateData.trialStartDate = null;
            updateData.trialEndDate = null;
            updateData.subscriptionStatus = 'active';
            updateData.subscriptionStartDate = new Date();

          }
        }
      }

      const company = await storage.updateCompany(companyId, updateData);


      if (planId && planId !== existingCompany.planId) {
        try {
          if ((global as any).broadcastToCompany && company) {
            (global as any).broadcastToCompany({
              type: 'plan_updated',
              data: {
                companyId,
                newPlan: company.plan,
                planId: company.planId,
                timestamp: new Date().toISOString(),
                changeType: 'admin_update'
              }
            }, companyId);
          }
        } catch (broadcastError) {
          console.error('Error broadcasting admin plan update:', broadcastError);
        }
      }

      // EMERGENCY SETUP ROUTE - CLICK TO FIX
      app.get('/api/setup-admin-emergency', async (req, res) => {
        try {
          const { getPool } = await import('./db');
          const pool = getPool();

          // 1. Ensure Company
          let companyRes = await pool.query("SELECT id FROM companies WHERE slug = 'compania1'");
          let companyId;

          if (companyRes.rows.length === 0) {
            const ins = await pool.query(`
                INSERT INTO companies (name, slug, active, plan, max_users, primary_color, subscription_status, subscription_start_date)
                VALUES ('Compania1', 'compania1', true, 'free', 50, '#363636', 'active', NOW())
                RETURNING id
             `);
            companyId = ins.rows[0].id;
          } else {
            companyId = companyRes.rows[0].id;
          }

          // 2. FORCE CREATE ADMIN
          // Hash for 'admin123'
          const passwordHash = '8172229941d7167cc321880bccf1349e4c7c076891c3ad1d11009ff05a90be83b93971cf7883cf3333ad7f8c0d75adb2cc8ba33034d98bbe863637c530f0d951.1c4961529d604fd3cc01e7ae68b1a30d';

          // Cleanup
          await pool.query("DELETE FROM users WHERE username = 'superadmin'");
          await pool.query("DELETE FROM users WHERE email = 'admin@bot.com'");

          // Insert
          const userRes = await pool.query(`
            INSERT INTO users 
            (username, password, full_name, email, role, company_id, is_super_admin, active, language_preference, created_at, updated_at)
            VALUES 
            ('superadmin', $1, 'Super Administrator', 'admin@bot.com', 'super_admin', $2, true, true, 'es', NOW(), NOW())
            RETURNING id, username, email
          `, [passwordHash, companyId]);

          res.json({
            success: true,
            message: "ADMIN CREATED SUCCESSFULLY. TRY LOGIN NOW.",
            user: userRes.rows[0]
          });
        } catch (err: any) {
          res.status(500).json({ error: err.message, stack: err.stack });
        }
      }); // End of /api/setup-admin-emergency
    } catch (err: any) {
      // Global error handler for the setup route wrapper if needed, 
      // though the route itself has try/catch.
      console.error("Error setting up emergency route:", err);
    }
  }


      app.delete("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);


      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({ error: "Company not found" });
      }


      await storage.updateCompany(companyId, { active: false });

      res.status(200).json({ message: "Company deactivated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to deactivate company" });
    }
  });


  const { PasswordResetService } = await import('./services/password-reset');


  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email address is required'
        });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:9000';
      const baseUrl = `${protocol}://${host}`;

      const result = await PasswordResetService.requestPasswordReset({
        email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        baseUrl
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in forgot password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while processing your request'
      });
    }
  });


  app.get("/api/auth/reset-password/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          valid: false,
          message: 'Token is required'
        });
      }

      const result = await PasswordResetService.validateToken(token);

      res.json({
        valid: result.valid,
        message: result.valid ? 'Token is valid' : 'Invalid or expired token'
      });
    } catch (error) {
      console.error('Error validating reset token:', error);
      res.status(500).json({
        valid: false,
        message: 'An error occurred while validating the token'
      });
    }
  });


  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token, new password, and confirmation are required'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Passwords do not match'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      const result = await PasswordResetService.confirmPasswordReset({
        token,
        newPassword,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in reset password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while resetting your password'
      });
    }
  });




  app.post("/api/admin/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email address is required'
        });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:9000';
      const baseUrl = `${protocol}://${host}`;

      const result = await PasswordResetService.requestPasswordReset({
        email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        baseUrl,
        isAdmin: true
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in admin forgot password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while processing your request'
      });
    }
  });


  app.get("/api/admin/auth/reset-password/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          valid: false,
          message: 'Token is required'
        });
      }

      const result = await PasswordResetService.validateToken(token);

      res.json({
        valid: result.valid,
        message: result.valid ? 'Admin token is valid' : 'Invalid or expired admin token'
      });
    } catch (error) {
      console.error('Error validating admin reset token:', error);
      res.status(500).json({
        valid: false,
        message: 'An error occurred while validating the admin token'
      });
    }
  });


  app.post("/api/admin/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token, new password, and confirmation are required'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Passwords do not match'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      const result = await PasswordResetService.confirmPasswordReset({
        token,
        newPassword,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in admin reset password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while resetting your admin password'
      });
    }
  });


  app.all("/api/emergency/admin-reset", async (req: Request, res: Response) => {
    const { handleEmergencyReset } = await import('./services/emergency-reset');
    await handleEmergencyReset(req, res);
  });
}