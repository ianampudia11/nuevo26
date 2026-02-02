import { useState, useCallback, useEffect, FC, memo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Trash2, Copy, Settings, Eye, EyeOff } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { standardHandleStyle } from './StyledHandle';



const TRANSLATION_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },

];

const getTranslationModes = (t: any) => [
  { id: 'separate', name: t('flow_builder.translation_node.separate_message', 'Separate Message'), description: t('flow_builder.translation_node.separate_desc', 'Send translation as a separate follow-up message') },
  { id: 'append', name: t('flow_builder.translation_node.append_original', 'Append to Original'), description: t('flow_builder.translation_node.append_desc', 'Add translation to the end of the original message') },
  { id: 'replace', name: t('flow_builder.translation_node.replace_original', 'Replace Original'), description: t('flow_builder.translation_node.replace_desc', 'Replace the original message with the translation') },
];

interface TranslationNodeData {
  label: string;
  enabled?: boolean;
  apiKey?: string;
  targetLanguage?: string;
  translationMode?: string;
  detectLanguage?: boolean;
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
}

interface TranslationNodeProps {
  id: string;
  data: TranslationNodeData;
  isConnectable: boolean;
}




const NodeToolbar: FC<{ onDelete: () => void; onDuplicate: () => void; }> = memo(({ onDelete, onDuplicate }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button></TooltipTrigger>
          <TooltipContent side="top"><p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate Node')}</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger>
          <TooltipContent side="top"><p className="text-xs">{t('flow_builder.delete_node', 'Delete Node')}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});


const NodeHeader: FC<{ isEditing: boolean; onToggleEdit: () => void; }> = memo(({ isEditing, onToggleEdit }) => {
  const { t } = useTranslation();
  return (
    <div className="p-3 border-b border-primary/20 bg-primary/10">
      <div className="font-medium flex items-center gap-2">
        <img 
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Google_Translate_logo.svg/1024px-Google_Translate_logo.svg.png" 
          alt="Translation" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.translation', 'Translation')}</span>
        <button className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={onToggleEdit}>
          {isEditing ? <><EyeOff className="h-3 w-3" />{t('flow_builder.translation_node.hide', 'Hide')}</> : <><Eye className="h-3 w-3" />{t('flow_builder.translation_node.edit', 'Edit')}</>}
        </button>
      </div>
    </div>
  );
});


const TranslationNodeSummary: FC<Pick<TranslationNodeData, 'enabled' | 'targetLanguage' | 'translationMode' | 'detectLanguage'>> = memo(({ enabled, targetLanguage, translationMode, detectLanguage }) => {
  const { t } = useTranslation();
  const targetLanguageName = TRANSLATION_LANGUAGES.find(l => l.code === targetLanguage)?.name || targetLanguage?.toUpperCase();
  const modeName = getTranslationModes(t).find(m => m.id === translationMode)?.name || t('flow_builder.translation_node.separate_message', 'Separate');
  
  return (
    <div className="text-sm p-3  rounded border border-border">
      <div className="flex items-center gap-1 mb-2">
        <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{t('flow_builder.translation_node.openai_translation', 'OpenAI Translation')}</span>
        {enabled && <span className="text-xs text-muted-foreground">{targetLanguageName}</span>}
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        {enabled ? t('flow_builder.translation_node.translation_enabled', 'Translation enabled') : t('flow_builder.translation_node.translation_disabled', 'Translation disabled')}
      </div>
      {enabled && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">{t('flow_builder.translation_node.target_label', 'Target:')} {targetLanguageName}</span>
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">{t('flow_builder.translation_node.mode_label', 'Mode:')} {modeName}</span>
          {detectLanguage && <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">{t('flow_builder.translation_node.auto_detect', 'Auto-detect')}</span>}
        </div>
      )}
    </div>
  );
});


const TranslationNodeSettings: FC<{
  state: TranslationNodeData;
  setState: (updates: Partial<TranslationNodeData>) => void;
}> = memo(({ state, setState }) => {
  const { t } = useTranslation();
  const { enabled, apiKey, targetLanguage, translationMode, detectLanguage } = state;
  const getApiDocUrl = () => 'https://platform.openai.com/api-keys';

  return (
    <div className="border rounded-lg p-3 bg-primary/10">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <img 
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Google_Translate_logo.svg/1024px-Google_Translate_logo.svg.png" 
          alt="Translation" 
          className="h-4 w-4"
        /> {t('flow_builder.translation_node.configuration', 'Translation Configuration')}
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-medium cursor-pointer">{t('flow_builder.translation_node.enable_translation', 'Enable Translation')}</Label>
            <p className="text-[10px] text-muted-foreground">{t('flow_builder.translation_node.enable_desc', 'Automatically translate messages using OpenAI')}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={value => setState({ enabled: value })} />
        </div>
        {enabled && (
          <div className="pl-4 border-l-2 border-primary/20 space-y-3">
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.openai_api_key', 'OpenAI API Key')}</Label>
              <Input type="password" placeholder={t('flow_builder.translation_node.api_key_placeholder', 'Enter your OpenAI API key')} value={apiKey} onChange={e => setState({ apiKey: e.target.value })} className="text-xs h-7 mt-1" />
              <a href={getApiDocUrl()} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline mt-1 block">{t('flow_builder.translation_node.get_api_key', 'Get your API key here')}</a>
            </div>
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.target_language', 'Target Language')}</Label>
              <Select value={targetLanguage} onValueChange={value => setState({ targetLanguage: value })}>
                <SelectTrigger className="text-xs h-7 mt-1"><SelectValue placeholder={t('flow_builder.translation_node.select_language', 'Select language...')} /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {TRANSLATION_LANGUAGES.map(lang => <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.translation_mode', 'Translation Mode')}</Label>
              <Select value={translationMode} onValueChange={value => setState({ translationMode: value })}>
                <SelectTrigger className="text-xs h-7 mt-1"><SelectValue placeholder={t('flow_builder.translation_node.select_mode', 'Select mode...')} /></SelectTrigger>
                <SelectContent>
                  {getTranslationModes(t).map(mode => <SelectItem key={mode.id} value={mode.id}><div className="flex flex-col"><span className="font-medium">{mode.name}</span><span className="text-[10px] text-muted-foreground">{mode.description}</span></div></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.translation_node.auto_language_detection', 'Auto Language Detection')}</Label>
                <p className="text-[9px] text-muted-foreground">{t('flow_builder.translation_node.auto_detect_desc', 'Only translate if source ≠ target language')}</p>
              </div>
              <Switch checked={detectLanguage} onCheckedChange={value => setState({ detectLanguage: value })} className="scale-75" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});



export function TranslationNode({ id, data, isConnectable }: TranslationNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nodeState, setNodeState] = useState<TranslationNodeData>({
    label: data.label,
    enabled: data.enabled ?? true,
    apiKey: data.apiKey || '',
    targetLanguage: data.targetLanguage || 'en',
    translationMode: data.translationMode || 'separate',
    detectLanguage: data.detectLanguage ?? true,
  });

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const updateNodeData = useCallback((updates: Partial<TranslationNodeData>) => {
    setNodes(nodes => nodes.map(node =>
      node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
    ));
  }, [id, setNodes]);

  useEffect(() => {
    updateNodeData(nodeState);
  }, [nodeState, updateNodeData]);

  const handleStateChange = (updates: Partial<TranslationNodeData>) => {
    setNodeState(prevState => ({ ...prevState, ...updates }));
  };
  
  const handleDelete = () => onDeleteNode?.(id);
  const handleDuplicate = () => onDuplicateNode?.(id);

  return (
    <div className="node-translation rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group relative">
      <NodeToolbar onDelete={handleDelete} onDuplicate={handleDuplicate} />
      <NodeHeader isEditing={isEditing} onToggleEdit={() => setIsEditing(!isEditing)} />
      
      <div className="p-3 space-y-3">
        <TranslationNodeSummary {...nodeState} />
        {isEditing && (
            <TranslationNodeSettings state={nodeState} setState={handleStateChange} />
        )}
      </div>

      {/* CORRECTED HANDLES: Left is target (input), Right is source (output) */}
      <Handle type="target" position={Position.Left} id="input" style={{ ...standardHandleStyle, left: -8 }} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} id="output" style={{ ...standardHandleStyle, right: -8 }} isConnectable={isConnectable} />

      {/* Conditional output handle for separate translation messages */}
      {nodeState.translationMode === 'separate' && nodeState.enabled && (
        <Handle type="source" position={Position.Right} id="translation-output" style={{ ...standardHandleStyle, right: -8, top: '75%' }} isConnectable={isConnectable} />
      )}
    </div>
  );
}