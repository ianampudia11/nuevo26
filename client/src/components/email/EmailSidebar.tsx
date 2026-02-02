import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Inbox, 
  Send, 
  FileText, 
  Trash2, 
  Archive, 
  Star, 
  Tag,
  Plus,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface EmailFolder {
  id: string;
  name: string;
  count: number;
  type: 'inbox' | 'sent' | 'drafts' | 'starred' | 'archive' | 'trash' | 'custom';
}

interface EmailSidebarProps {
  folders: EmailFolder[];
  selectedFolder: string;
  onFolderSelect: (folderId: string) => void;
}

export default function EmailSidebar({ 
  folders, 
  selectedFolder, 
  onFolderSelect 
}: EmailSidebarProps) {
  const { t } = useTranslation();
  const [isLabelsExpanded, setIsLabelsExpanded] = useState(true);

  const getFolderIcon = (type: string) => {
    switch (type) {
      case 'inbox':
        return <Inbox className="h-4 w-4" />;
      case 'sent':
        return <Send className="h-4 w-4" />;
      case 'drafts':
        return <FileText className="h-4 w-4" />;
      case 'trash':
        return <Trash2 className="h-4 w-4" />;
      case 'archive':
        return <Archive className="h-4 w-4" />;
      case 'starred':
        return <Star className="h-4 w-4" />;
      default:
        return <Tag className="h-4 w-4" />;
    }
  };

  const getFolderDisplayName = (folder: EmailFolder) => {
    switch (folder.type) {
      case 'inbox':
        return t('email.folders.inbox', 'Inbox');
      case 'sent':
        return t('email.folders.sent', 'Sent');
      case 'drafts':
        return t('email.folders.drafts', 'Drafts');
      case 'starred':
        return t('email.folders.starred', 'Starred');
      case 'archive':
        return t('email.folders.archive', 'Archived');
      case 'trash':
        return t('email.folders.trash', 'Trash');
      default:
        return folder.name;
    }
  };


  const systemFolders = folders.filter(f => f.type !== 'custom');
  const customFolders = folders.filter(f => f.type === 'custom');

  return (
    <div className="flex-1 overflow-y-auto">
      {/* System Folders */}
      <div className="p-2">
        {systemFolders.map((folder) => (
          <Button
            key={folder.id}
            variant={selectedFolder === folder.id ? "secondary" : "ghost"}
            className={`w-full justify-start mb-1 ${
              selectedFolder === folder.id
                ? 'bg-accent border-border'
                : 'text-foreground hover:bg-accent'
            }`}
            style={selectedFolder === folder.id ? { color: 'var(--brand-primary-color)' } : {}}
            onClick={() => onFolderSelect(folder.id)}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                {getFolderIcon(folder.type)}
                <span className="ml-3 text-sm font-medium">
                  {getFolderDisplayName(folder)}
                </span>
              </div>
              {folder.count > 0 && (
                <Badge 
                  variant={selectedFolder === folder.id ? "default" : "secondary"}
                  className="ml-auto text-xs"
                >
                  {folder.count}
                </Badge>
              )}
            </div>
          </Button>
        ))}
      </div>

      {/* Custom Labels/Folders */}
      {customFolders.length > 0 && (
        <div className="border-t border-gray-200 mt-4">
          <div className="p-2">
            <Button
              variant="ghost"
              className="w-full justify-start text-xs font-medium text-gray-500 uppercase tracking-wide mb-2"
              onClick={() => setIsLabelsExpanded(!isLabelsExpanded)}
            >
              {isLabelsExpanded ? (
                <ChevronDown className="h-3 w-3 mr-2" />
              ) : (
                <ChevronRight className="h-3 w-3 mr-2" />
              )}
              {t('email.labels', 'Labels')}
            </Button>

            {isLabelsExpanded && (
              <div className="space-y-1">
                {customFolders.map((folder) => (
                  <Button
                    key={folder.id}
                    variant={selectedFolder === folder.id ? "secondary" : "ghost"}
                    className={`w-full justify-start text-sm ${
                      selectedFolder === folder.id
                        ? 'bg-gray-100'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    style={selectedFolder === folder.id ? { color: 'var(--brand-primary-color)' } : {}}
                    onClick={() => onFolderSelect(folder.id)}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center">
                        {getFolderIcon(folder.type)}
                        <span className="ml-3 truncate">
                          {folder.name}
                        </span>
                      </div>
                      {folder.count > 0 && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {folder.count}
                        </Badge>
                      )}
                    </div>
                  </Button>
                ))}

                <Button
                  variant="ghost"
                  className="w-full justify-start text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => {


                  }}
                >
                  <Plus className="h-4 w-4 mr-3" />
                  {t('email.create_label', 'Create label')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="border-t border-gray-200 mt-4 p-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 px-2">
          {t('email.quick_actions', 'Quick Actions')}
        </div>
        
        <Button
          variant="ghost"
          className="w-full justify-start text-sm text-gray-600 hover:bg-gray-50"
          onClick={() => {

            onFolderSelect('starred');
          }}
        >
          <Star className="h-4 w-4 mr-3" />
          {t('email.starred', 'Starred')}
        </Button>

        <Button
          variant="ghost"
          className="w-full justify-start text-sm text-gray-600 hover:bg-gray-50"
          onClick={() => {

            onFolderSelect('archive');
          }}
        >
          <Archive className="h-4 w-4 mr-3" />
          {t('email.archived', 'Archived')}
        </Button>
      </div>
    </div>
  );
}
