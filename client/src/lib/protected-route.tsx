import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

type ProtectedRouteProps = {
  path: string;
  component: React.ComponentType;
};

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { user, company, isLoading, isMaintenanceMode, isLoadingMaintenance } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user && user.isSuperAdmin && path !== "/admin/dashboard") {
      toast({
        title: "Admin Access",
        description: "You are logged in as a super admin. Redirecting to admin dashboard.",
      });
    }
  }, [user, path, toast]);

  return (
    <Route path={path}>
      {() => {
        if (isLoading || isLoadingMaintenance) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }


        if (isMaintenanceMode && (!user || !user.isSuperAdmin)) {
          return <Redirect to="/maintenance" />;
        }

        if (!user) {
          return <Redirect to="/auth" />;
        }

        if (user.isSuperAdmin && path !== "/admin/dashboard") {
          return <Redirect to="/admin/dashboard" />;
        }

        if (!user.isSuperAdmin && !company) {
          return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
              <h1 className="text-2xl mb-2">Company Not Found</h1>
              <p className="text-muted-foreground mb-4 text-center">
                Your account is not associated with an active company.
                Please contact your administrator.
              </p>
              <button
                onClick={() => {
                  document.cookie = "connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                  window.location.href = "/auth";
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Return to Login
              </button>
            </div>
          );
        }

        return <Component />;
      }}
    </Route>
  );
}