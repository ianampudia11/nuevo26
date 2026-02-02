import React from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { CallLogsDashboard } from '@/components/call-logs/CallLogsDashboard';

export default function CallLogsPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-y-auto p-6">
          <CallLogsDashboard />
        </div>
      </div>
    </div>
  );
}
