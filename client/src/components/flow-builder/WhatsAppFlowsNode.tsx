import { Copy, Eye, EyeOff, ExternalLink, MessageSquare, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { standardHandleStyle } from './StyledHandle';

interface WhatsAppFlowsNodeProps {
  id: string;
  isConnectable: boolean;
  data: {
    label: string;
    flowId?: string;
    bodyText?: string;
    ctaText?: string;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
}

export function WhatsAppFlowsNode({ id, data, isConnectable }: WhatsAppFlowsNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const [flowId, setFlowId] = useState(data.flowId || '');


  const extractFlowIdFromUrl = (input: string): string => {

    if (/^\d+$/.test(input.trim())) {
      return input.trim();
    }



    const urlMatch = input.match(/\/flows\/(\d+)/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }


    return input.trim();
  };

  const handleFlowIdChange = (value: string) => {
    const extractedId = extractFlowIdFromUrl(value);
    setFlowId(extractedId);
  };

  const updateNodeData = useCallback((newData: any) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...newData } } : node
      )
    );
  }, [setNodes, id]);

  useEffect(() => {
    updateNodeData({
      flowId
    });
  }, [
    updateNodeData,
    flowId
  ]);

  return (
    <div className="node-whatsapp-flows p-3 rounded-lg bg-card border border-border shadow-sm max-w-[320px] group">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateNode(id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Duplicate node</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Delete node</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2">
        <img src="https://cdn-icons-png.flaticon.com/128/1587/1587495.png" alt="WhatsApp Flows" className="h-4 w-4" />
        <span>WhatsApp Flows</span>
        <span className="px-1.5 py-0.5 text-[9px] font-medium bg-primary/10 text-primary rounded border border-primary/20">
          Official API
        </span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? (
            <>
              <EyeOff className="h-3 w-3" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              Edit
            </>
          )}
        </button>
      </div>

      <div className="text-sm p-2  rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-primary">FLOW</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {flowId || 'No Flow ID'}
          </span>
        </div>
        
        <div className="text-xs text-muted-foreground">
          Flow content managed in Facebook Business Manager
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 space-y-3 text-xs">
          {/* Basic Configuration */}
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Flow ID</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => window.open('https://business.facebook.com/latest/whatsapp_manager/flow_create/', '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Create Flow
                </Button>
              </div>
              <Input
                value={flowId}
                onChange={(e) => handleFlowIdChange(e.target.value)}
                placeholder="Paste Flow URL or enter Flow ID (e.g., 1501195611215264)"
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Paste the full Facebook Flow URL or just the Flow ID. The ID will be extracted automatically.
              </p>
            </div>



            {/* API Info */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-primary mt-0.5" />
                <div className="text-xs text-primary">
                  <p className="font-medium mb-1">{t('whatsapp_flows.api_info_title', 'WhatsApp Flows')}</p>
                  <p>{t('whatsapp_flows.api_info_description', 'Only works with Official WhatsApp Business API connections. Flows provide interactive experiences within WhatsApp conversations.')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      
    </div>
  );
}
