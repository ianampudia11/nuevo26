import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type AdminProtectedRouteProps = {
  path: string;
  component: React.ComponentType;
};

export function AdminProtectedRoute({ path, component: Component }: AdminProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [licenseError, setLicenseError] = useState<{ message: string; reason?: string } | null>(null);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate("/admin");
      } else if (!user.isSuperAdmin) {
        navigate("/");
      }
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {

    if (!isLoading && user?.isSuperAdmin) {
      const checkLicense = async () => {
        try {

          const res = await apiRequest("GET", "/api/admin/users");
          if (!res.ok && res.status === 403) {
            const errorData = await res.json();
            setLicenseError({
              message: errorData.message || "License validation failed",
              reason: errorData.licenseExpired ? "License expired" : errorData.ipNotAllowed ? "IP not allowed" : "License invalid"
            });
          }
        } catch (error) {

          if (error instanceof Error && error.message.includes("403")) {
            setLicenseError({
              message: "License validation failed",
              reason: "License invalid"
            });
          }
        } finally {
          setIsCheckingLicense(false);
        }
      };
      checkLicense();
    } else {
      setIsCheckingLicense(false);
    }
  }, [user, isLoading]);

  return (
    <Route path={path}>
      {() => {
        if (isLoading || isCheckingLicense) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }

        if (!user || !user.isSuperAdmin) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }

        if (licenseError) {
          return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-500 to-purple-700">
              <div className="bg-card rounded-lg shadow-xl p-8 max-w-md text-center">
                <h1 className="text-2xl font-bold text-destructive mb-4">⚠️ License Error</h1>
                <p className="text-foreground mb-4">{licenseError.message}</p>
                <div className="bg-muted rounded p-4 mb-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Reason:</strong> {licenseError.reason || "License validation failed"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Please renew your license or contact support for assistance.
                  </p>
                </div>
              </div>
            </div>
          );
        }

        return <Component />;
      }}
    </Route>
  );
}
