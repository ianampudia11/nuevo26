import { useState } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import ConversationList from '@/components/conversations/ConversationList';
import GroupConversationList from '@/components/groups/GroupConversationList';
import ConversationView from '@/components/conversations/ConversationView';
import { useConversations } from '@/context/ConversationContext';
import { MobileLayoutProvider, useMobileLayout } from '@/contexts/mobile-layout-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from '@/hooks/use-translation';

function InboxContent() {
  const {
    showGroupChats
  } = useConversations();

  const {
    isMobile,
    isTablet,
    isConversationListOpen,
    isContactDetailsOpen,
    closeAllPanels
  } = useMobileLayout();

  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'individual' | 'groups'>('individual');

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-foreground">
      <Header />

      <div className="flex flex-1 overflow-hidden relative">
        <div className={`${isMobile ? 'hidden' : 'flex'}`}>
          <Sidebar />
        </div>

        <div className={`
          ${isMobile
            ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${
                isConversationListOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : isTablet
            ? `${isConversationListOpen ? 'flex' : 'hidden'}`
            : 'flex'
          }
        `}>
          {showGroupChats ? (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'individual' | 'groups')} className="flex flex-col h-full">
              <div className="border-r border-border bg-background flex-shrink-0 overflow-hidden flex flex-col h-full">
                <div className="p-3 sm:p-4 border-b border-border">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="individual" className="text-xs sm:text-sm">
                      {t('inbox.individual', 'Individual')}
                    </TabsTrigger>
                    <TabsTrigger value="groups" className="text-xs sm:text-sm">
                      {t('inbox.groups', 'Groups')}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="individual" className="flex-1 overflow-hidden m-0">
                  <ConversationList />
                </TabsContent>

                <TabsContent value="groups" className="flex-1 overflow-hidden m-0">
                  <GroupConversationList />
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <ConversationList />
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <ConversationView />
        </div>

        {isMobile && (isConversationListOpen || isContactDetailsOpen) && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={(e) => {
              e.stopPropagation();
              closeAllPanels();
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Inbox() {
  return (
    <MobileLayoutProvider>
      <InboxContent />
    </MobileLayoutProvider>
  );
}
