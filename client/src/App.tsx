import React from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Inbox from "@/pages/Inbox";
import Flows from "@/pages/flows";
import FlowBuilder from "@/pages/flow-builder";
import Contacts from "@/pages/contacts";
import Tasks from "@/pages/tasks";
import Calendar from "@/pages/calendar";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import ProfilePage from "@/pages/profile";
import SubscriptionGuard from "@/components/plan-expiration/SubscriptionGuard";
import { suppressAuthErrors } from "@/utils/suppress-auth-errors";

declare global {
  interface Window {
    isEmbedded?: boolean;
  }
}
import CampaignsPage from "@/pages/campaigns";
import CampaignBuilderPage from "@/pages/campaign-builder";
import PipelineView from "@/pages/pipeline-view";
import AuthPage from "@/pages/auth-page";
import CompanyRegistrationPage from "@/pages/company-registration";
import AdminLoginPage from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import CompanyDetailPage from "@/pages/admin/companies/[id]";
import NewCompanyPage from "@/pages/admin/companies/new";
import { FacebookSDKLoader } from "@/components/FacebookSDKLoader";
import { ConversationProvider } from "./context/ConversationContext";
import { AuthProvider } from "@/hooks/use-auth";
import { TranslationProvider } from "@/hooks/use-translation";
import { BrandingProvider } from "@/contexts/branding-context";
import { CurrencyProvider } from "@/contexts/currency-context";
import { SubdomainProvider } from "@/contexts/subdomain-context";
import { PlanUpdatesProvider } from "@/components/PlanUpdatesProvider";
import { ActiveChannelProvider } from "@/contexts/ActiveChannelContext";
import { ProtectedRoute } from "@/lib/protected-route";
import { AdminProtectedRoute } from "@/lib/admin-protected-route";
import {
  SettingsRoute,
  AnalyticsRoute,
  FlowsRoute,
  ContactsRoute,
  TasksRoute,
  PipelineRoute,
  CalendarRoute,
  CampaignsRoute,
  PagesRoute,
  TemplatesRoute,
  CallLogsRoute
} from "@/components/auth/ProtectedRoute";
import AccessDenied from "@/pages/AccessDenied";

import { Loader2 } from "lucide-react";
import PagesPage from "./pages/pages";
import LandingPage from "./pages/landing";
import ProtectedLandingPage from "./components/ProtectedLandingPage";
import Templates from "./pages/templates";
import CallLogsPage from "./pages/call-logs";
import RootRedirect from "./components/RootRedirect";
import { CustomScriptsProvider } from "@/components/CustomScriptsProvider";
import { CustomCssProvider } from "@/components/CustomCssProvider";
import { ManualRenewalProvider } from "@/contexts/manual-renewal-context";
import { initializeGoogleTranslateCompatibility } from "@/utils/google-translate-compatibility";
import { initializeEmbedContext, preserveEmbedParam } from "@/utils/embed-context";

const LazyLoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

function Router() {
  return (
    <React.Suspense fallback={<LazyLoadingFallback />}>
      <Switch>
        <Route path="/" component={RootRedirect} />
        <ProtectedRoute path="/inbox" component={Inbox} />
        <ProtectedRoute path="/email/:channelId" component={React.lazy(() => import("@/pages/EmailInterface"))} />


        <Route path="/flows">
          <FlowsRoute>
            <Flows />
          </FlowsRoute>
        </Route>
        <Route path="/flows/new">
          <FlowsRoute>
            <FlowBuilder />
          </FlowsRoute>
        </Route>
        <Route path="/flows/:id">
          <FlowsRoute>
            <FlowBuilder />
          </FlowsRoute>
        </Route>
        <Route path="/contacts">
          <ContactsRoute>
            <Contacts />
          </ContactsRoute>
        </Route>

        <Route path="/tasks">
          <TasksRoute>
            <Tasks />
          </TasksRoute>
        </Route>

        <Route path="/pipeline">
          <PipelineRoute>
            <PipelineView />
          </PipelineRoute>
        </Route>

        <Route path="/calendar">
          <CalendarRoute>
            <Calendar />
          </CalendarRoute>
        </Route>

        <Route path="/campaigns">
          <CampaignsRoute>
            <CampaignsPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/new">
          <CampaignsRoute>
            <CampaignBuilderPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/:id/edit">
          <CampaignsRoute>
            <CampaignBuilderPage />
          </CampaignsRoute>
        </Route>

        <Route path="/campaigns/:id">
          <CampaignsRoute>
            <CampaignsPage />
          </CampaignsRoute>
        </Route>

        <Route path="/call-logs">
          <CallLogsRoute>
            <CallLogsPage />
          </CallLogsRoute>
        </Route>

        <Route path="/templates">
          <TemplatesRoute>
            <Templates />
          </TemplatesRoute>
        </Route>

        <Route path="/analytics">
          <AnalyticsRoute>
            <Analytics />
          </AnalyticsRoute>
        </Route>

        <Route path="/settings">
          <SettingsRoute>
            <Settings />
          </SettingsRoute>
        </Route>

        <Route path="/pages">
          <PagesRoute>
            <PagesPage />
          </PagesRoute>
        </Route>


        <ProtectedRoute path="/profile" component={ProfilePage} />

        <Route path="/access-denied" component={AccessDenied} />

        {/* Public landing page */}
        <Route path="/landing" component={ProtectedLandingPage} />

        <Route path="/auth" component={AuthPage} />
        <Route path="/forgot-password" component={React.lazy(() => import("@/pages/forgot-password"))} />
        <Route path="/reset-password" component={React.lazy(() => import("@/pages/reset-password"))} />
        <Route path="/register" component={CompanyRegistrationPage} />
        <Route path="/signup" component={CompanyRegistrationPage} />
        <Route path="/affiliate-apply" component={React.lazy(() => import("@/pages/affiliate-application"))} />
        <Route path="/become-partner" component={React.lazy(() => import("@/pages/affiliate-application"))} />
        <Route path="/accept-invitation" component={React.lazy(() => import("@/pages/AcceptInvitation"))} />
        <Route path="/admin" component={React.lazy(() => import("@/pages/admin/index"))} />
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/admin/forgot-password" component={React.lazy(() => import("@/pages/admin/forgot-password"))} />
        <Route path="/admin/reset-password" component={React.lazy(() => import("@/pages/admin/reset-password"))} />

        <AdminProtectedRoute path="/admin/dashboard" component={AdminDashboard} />
        <AdminProtectedRoute path="/admin/companies" component={React.lazy(() => import("@/pages/admin/companies"))} />
        <AdminProtectedRoute path="/admin/companies/new" component={NewCompanyPage} />
        <AdminProtectedRoute path="/admin/companies/:id" component={CompanyDetailPage} />
        <AdminProtectedRoute path="/admin/users" component={React.lazy(() => import("@/pages/admin/users"))} />
        <AdminProtectedRoute path="/admin/users/new" component={React.lazy(() => import("@/pages/admin/users/new"))} />
        <AdminProtectedRoute path="/admin/users/:id" component={React.lazy(() => import("@/pages/admin/users/[id]"))} />
        <AdminProtectedRoute path="/admin/plans" component={React.lazy(() => import("@/pages/admin/plans"))} />
        <AdminProtectedRoute path="/admin/coupons" component={React.lazy(() => import("@/pages/admin/coupons"))} />
        <AdminProtectedRoute path="/admin/payments" component={React.lazy(() => import("@/pages/admin/payments"))} />
        <AdminProtectedRoute path="/admin/analytics" component={React.lazy(() => import("@/pages/admin/analytics"))} />
        <AdminProtectedRoute path="/admin/settings" component={React.lazy(() => import("@/pages/admin/settings"))} />
        <AdminProtectedRoute path="/admin/translations" component={React.lazy(() => import("@/pages/admin/translations"))} />
        <AdminProtectedRoute path="/admin/website-builder" component={React.lazy(() => import("@/pages/admin/website-builder/index"))} />
        <AdminProtectedRoute path="/admin/website-builder/new" component={React.lazy(() => import("@/pages/admin/website-builder/new"))} />
        <AdminProtectedRoute path="/admin/website-builder/edit/:id" component={React.lazy(() => import("@/pages/admin/website-builder/edit/[id]"))} />

        <AdminProtectedRoute path="/admin/affiliate" component={React.lazy(() => import("@/pages/admin/affiliate"))} />

        <Route path="/payment/success" component={React.lazy(() => import("@/pages/payment/success"))} />
        <Route path="/payment/cancel" component={React.lazy(() => import("@/pages/payment/cancel"))} />
        <Route path="/payment/pending" component={React.lazy(() => import("@/pages/payment/pending"))} />

        {/* Public website pages - must be before NotFound */}
        <Route path="/:slug" component={React.lazy(() => import("@/pages/public-website"))} />

        <Route component={NotFound} />
      </Switch>
    </React.Suspense>
  );
}

function App() {

  React.useEffect(() => {
    const cleanupAuthErrorSuppression = suppressAuthErrors();
    return cleanupAuthErrorSuppression;
  }, []);

  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {

    initializeGoogleTranslateCompatibility();


    initializeGoogleTranslateCompatibility();


    initializeEmbedContext();

    setTimeout(() => {
      setIsInitializing(false);
    }, 500);
  }, []);

  if (isInitializing) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center font-poppins">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Initializing...</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <CustomScriptsProvider>
        <SubdomainProvider>
          <AuthProvider>
            <CustomCssProvider>
              <BrandingProvider>
                <CurrencyProvider>
                  <TranslationProvider>
                    <ActiveChannelProvider>
                      <ConversationProvider>
                        <PlanUpdatesProvider>
                          <ManualRenewalProvider>
                            <TooltipProvider>
                              <SubscriptionGuard>
                              <div className="font-poppins">
                                <Toaster />
                                <FacebookSDKLoader />
                                <Router />
                              </div>
                            </SubscriptionGuard>
                          </TooltipProvider>
                        </ManualRenewalProvider>
                      </PlanUpdatesProvider>
                    </ConversationProvider>
                  </ActiveChannelProvider>
                </TranslationProvider>
                </CurrencyProvider>
              </BrandingProvider>
            </CustomCssProvider>
          </AuthProvider>
        </SubdomainProvider>
      </CustomScriptsProvider>
    </QueryClientProvider>
  );
}

export default App;
