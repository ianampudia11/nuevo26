import React from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { CampaignDashboard } from '@/components/campaigns/CampaignDashboard';

export default function CampaignsPage() {
  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 overflow-y-auto p-6">
          <CampaignDashboard />
        </div>
      </div>
    </div>
  );
}
