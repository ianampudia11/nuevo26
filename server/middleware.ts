import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { User as SelectUser, Company, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@shared/schema";
import { planLimitsService } from "./services/plan-limits-service";


export { ensureActiveSubscription, apiSubscriptionGuard, subscriptionWarning } from './middleware/subscription-guard';
import { ensureLicenseValid } from './middleware/license-guard';
export { ensureLicenseValid };

export const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};

export const ensureSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  ensureLicenseValid(req, res, (err?: any) => {
    if (err) {
      return next(err);
    }
    
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    const session = req.session as any;
    if (session?.impersonation?.originalUserId) {
      (req as any).isImpersonating = true;
      (req as any).originalUserId = session.impersonation.originalUserId;
      return next();
    }
    res.status(403).json({ message: 'Super admin access required' });
  });
};

/** Call Agent health: super admins get full access; company admins get their company's connections only */
export const ensureCallAgentHealthAccess = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const user = req.user as SelectUser;
  if (user.isSuperAdmin) {
    (req as any).healthScope = 'full';
    return next();
  }
  if (user.companyId) {
    (req as any).healthScope = 'company';
    (req as any).healthCompanyId = user.companyId;
    return next();
  }
  return res.status(403).json({ message: 'Company admin access required' });
};

export const ensureAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = req.user as SelectUser;
  if (user.role !== 'admin' && !user.isSuperAdmin) {
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  }

  next();
};

export const ensureCompanyUser = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = req.user as SelectUser;

  if (user.isSuperAdmin) {
    return next();
  }

  const session = req.session as any;
  if (session?.impersonation?.originalUserId) {
    if (!user.companyId) {
      return res.status(403).json({ message: 'Impersonated user has no company association' });
    }

    const company = await storage.getCompany(user.companyId);
    if (!company || !company.active) {
      return res.status(403).json({ message: 'Impersonated company account is inactive or not found' });
    }

    (req as any).company = company;
    (req as any).isImpersonating = true;
    (req as any).originalUserId = session.impersonation.originalUserId;
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

export const getUserPermissions = async (user: SelectUser): Promise<Record<string, boolean>> => {
  if (user.isSuperAdmin) {
    return Object.values(PERMISSIONS).reduce((acc, permission) => {
      acc[permission] = true;
      return acc;
    }, {} as Record<string, boolean>);
  }

  let rolePermissions = {};
  if (user.companyId && user.role) {
    try {
      if (user.role === 'admin' || user.role === 'agent') {
        const companyRolePermissions = await storage.getRolePermissionsByRole(user.companyId, user.role);
        if (companyRolePermissions) {
          rolePermissions = companyRolePermissions.permissions || {};
        } else {
          rolePermissions = (DEFAULT_ROLE_PERMISSIONS as any)[user.role] || {};
        }
      } else {
        rolePermissions = (DEFAULT_ROLE_PERMISSIONS as any)[user.role] || {};
      }
    } catch (error) {
      rolePermissions = (DEFAULT_ROLE_PERMISSIONS as any)[user.role] || {};
    }
  }

  const userSpecificPermissions = user.permissions || {};

  return {
    ...rolePermissions,
    ...userSpecificPermissions
  };
};

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    try {
      const userPermissions = await getUserPermissions(user);

      if (!userPermissions[permission]) {
        return res.status(403).json({
          message: 'Forbidden: Insufficient permissions',
          requiredPermission: permission
        });
      }

      (req as any).userPermissions = userPermissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error checking permissions' });
    }
  };
};

export const requireAllPermissions = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    try {
      const userPermissions = await getUserPermissions(user);

      const missingPermissions = permissions.filter(permission => !userPermissions[permission]);

      if (missingPermissions.length > 0) {
        return res.status(403).json({
          message: 'Forbidden: Insufficient permissions',
          requiredPermissions: permissions,
          missingPermissions
        });
      }

      (req as any).userPermissions = userPermissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error checking permissions' });
    }
  };
};

export const requireAnyPermission = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;

    if (user.isSuperAdmin) {
      return next();
    }

    try {
      const userPermissions = await getUserPermissions(user);

      const hasAnyPermission = permissions.some(permission => userPermissions[permission]);

      if (!hasAnyPermission) {
        return res.status(403).json({
          message: 'Forbidden: Insufficient permissions',
          requiredPermissions: permissions
        });
      }

      (req as any).userPermissions = userPermissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error checking permissions' });
    }
  };
};
