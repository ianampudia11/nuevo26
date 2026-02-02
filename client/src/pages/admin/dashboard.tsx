import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Users, Building, Package } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest } from "@/lib/queryClient";

interface Company {
  id: number;
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  active: boolean;
  plan: string;
  maxUsers: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminDashboard() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [_, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  const { data: companies, isLoading: isLoadingCompanies } = useQuery<Company[]>({
    queryKey: ['/api/admin/companies'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const activeCompanies = companies?.filter(c => c.active).length || 0;
  const inactiveCompanies = companies?.filter(c => !c.active).length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">{t('admin.nav.dashboard', 'Admin Dashboard')}</h1>
          <Button
            onClick={() => navigate("/admin/companies/new")}
            variant="brand"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('admin.companies.new_company', 'New Company')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('admin.companies.total_companies', 'Total Companies')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Building className="h-5 w-5 text-primary mr-2" />
                <div className="text-2xl">
                  {isLoadingCompanies ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    companies?.length || 0
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('admin.companies.active_companies', 'Active Companies')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Building className="h-5 w-5 text-green-500 dark:text-green-400 mr-2" />
                <div className="text-2xl">
                  {isLoadingCompanies ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    activeCompanies
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('admin.companies.inactive_companies', 'Inactive Companies')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <Building className="h-5 w-5 text-muted-foreground mr-2" />
                <div className="text-2xl">
                  {isLoadingCompanies ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    inactiveCompanies
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.nav.companies', 'Companies')}</CardTitle>
            <CardDescription>
              {t('admin.companies.manage_description', 'Manage all companies in the system')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCompanies ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : companies?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('admin.companies.no_companies_found', 'No companies found. Create your first company to get started.')}
              </div>
            ) : (
              <div className="rounded-md border">
                <div className="grid grid-cols-5 p-4 font-medium border-b">
                  <div>{t('admin.companies.table.name', 'Name')}</div>
                  <div>{t('admin.companies.table.slug', 'Slug')}</div>
                  <div>{t('admin.companies.table.plan', 'Plan')}</div>
                  <div>{t('admin.companies.table.status', 'Status')}</div>
                  <div>{t('admin.companies.table.actions', 'Actions')}</div>
                </div>
                <div className="divide-y">
                  {companies?.map((company) => (
                    <div key={company.id} className="grid grid-cols-5 p-4 items-center">
                      <div className="font-medium">{company.name}</div>
                      <div className="text-muted-foreground">{company.slug}</div>
                      <div>
                        <span className="capitalize">{company.plan}</span>
                      </div>
                      <div>
                        {company.active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                            {t('common.active', 'Active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            {t('common.inactive', 'Inactive')}
                          </span>
                        )}
                      </div>
                      <div>
                        <Button
                          variant="brand"
                          size="sm"
                          onClick={() => navigate(`/admin/companies/${company.id}`)}
                        >
                          {t('common.manage', 'Manage')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
