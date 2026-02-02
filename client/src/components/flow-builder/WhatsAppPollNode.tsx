import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import { useFlowContext } from '../../pages/flow-builder';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from '@/components/ui/tooltip';
import { standardHandleStyle } from './StyledHandle';


const outputHandleStyle = {
  ...standardHandleStyle,
  top: '50%',
  right: '-12px', // Match Quick Reply node positioning exactly
};


const invalidResponseHandleStyle = {
  ...standardHandleStyle,
  top: '50%',
  right: '-12px',
  backgroundColor: 'hsl(var(--secondary))',
  borderColor: 'hsl(var(--border))'
};

interface PollOption {
  text: string;
  value: string;
}


function NodeToolbar({ id, onDuplicate, onDelete }: { id: string; onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const { t } = useTranslation();

  return (
    <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDuplicate(id)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDelete(id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export default function WhatsAppPollNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const [isEditing, setIsEditing] = useState(false);
  const [question, setQuestion] = useState<string>(data.message || data.question || t('flow_builder.poll_default_question', 'Please vote:'));
  const [options, setOptions] = useState<PollOption[]>(
    data.options || [
      { text: t('flow_builder.poll_default_option1', 'Option 1'), value: 'option1' },
      { text: t('flow_builder.poll_default_option2', 'Option 2'), value: 'option2' }
    ]
  );
  const [invalidResponseMessage, setInvalidResponseMessage] = useState(
    data.invalidResponseMessage || t('flow_builder.quick_reply_invalid_response', "I didn't understand your selection. Please choose one of the available options:")
  );
  
  const [enableGoBack, setEnableGoBack] = useState(data.enableGoBack !== false);
  const [goBackText, setGoBackText] = useState(data.goBackText || t('flow_builder.poll_go_back_default', '← Go Back'));
  const [goBackValue, setGoBackValue] = useState(data.goBackValue || 'go_back');

  const { setNodes } = useReactFlow();

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...updates } } : node))
    );
  }, [id, setNodes]);

  const handleQuestionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newQuestion = e.target.value;
    setQuestion(newQuestion);
    updateNodeData({ question: newQuestion, message: newQuestion });
  };

  const handleOptionTextChange = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], text };
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const handleOptionValueChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], value };
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const addOption = () => {
    const newOptions = [...options, { text: t('flow_builder.poll_new_option', 'New option'), value: `option${options.length + 1}` }];
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const handleEnableGoBackChange = (checked: boolean) => {
    setEnableGoBack(checked);
    updateNodeData({ enableGoBack: checked });
  };

  const handleGoBackTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setGoBackText(newText);
    updateNodeData({ goBackText: newText });
  };

  const handleGoBackValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setGoBackValue(newValue);
    updateNodeData({ goBackValue: newValue });
  };

  return (
    <div className="node-whatsapp-poll p-3 rounded-lg bg-card border border-border shadow-sm max-w-[380px] group">
      <NodeToolbar
        id={id}
        onDuplicate={onDuplicateNode}
        onDelete={onDeleteNode}
      />

      <div className="font-medium flex items-center gap-2 mb-2">
        <img src="https://cdn-icons-png.flaticon.com/128/12482/12482449.png" alt="WhatsApp Poll" className="h-4 w-4" />
        <span>{t('flow_builder.whatsapp_poll_node_title', 'WhatsApp Poll')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.poll_question_label', 'Question:')}</label>
            <textarea
              className="w-full p-2 text-sm border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={question}
              onChange={handleQuestionChange}
              placeholder={t('flow_builder.poll_question_placeholder', 'Type your question here...')}
              rows={3}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.poll_options_label', 'Options:')}</label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addOption} disabled={options.length >= 10}>
                + {t('flow_builder.poll_add_option', 'Add Option')}
              </Button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {options.map((option, index) => (
                <div key={index} className="space-y-2 p-3 border border-border rounded-lg bg-background/50">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 font-medium text-xs">Option {index + 1}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeOption(index)}
                      disabled={options.length <= 2}
                    >
                      ×
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        {t('flow_builder.poll_option_text_label', 'Display Text:')}
                      </label>
                      <input
                        className="w-full p-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        value={option.text}
                        onChange={(e) => handleOptionTextChange(index, e.target.value)}
                        placeholder={t('flow_builder.poll_option_text_placeholder', 'Text to display')}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        {t('flow_builder.poll_option_value_label', 'Response Value:')}
                      </label>
                      <input
                        className="w-full p-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        value={option.value}
                        onChange={(e) => handleOptionValueChange(index, e.target.value)}
                        placeholder={t('flow_builder.poll_option_value_placeholder', 'Value to match')}
                      />
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {t('flow_builder.poll_option_routing_hint', 'User selection will route via this option\'s handle')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">
              {t('flow_builder.poll_invalid_response_label', 'Invalid Response Message:')}
            </label>
            <textarea
              className="w-full p-2 text-sm border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={invalidResponseMessage}
              onChange={(e) => {
                setInvalidResponseMessage(e.target.value);
                updateNodeData({ invalidResponseMessage: e.target.value });
              }}
              placeholder={t('flow_builder.poll_invalid_response_placeholder', 'Message to send when user\'s response doesn\'t match any option...')}
              rows={3}
            />
          </div>

          {/* 🔧 NEW: Go Back Option Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.poll_go_back_label', 'Go Back Option:')}</label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableGoBack}
                  onChange={(e) => handleEnableGoBackChange(e.target.checked)}
                  className="w-4 h-4 rounded border-input"
                />
                <span className="text-muted-foreground">Enable Go Back</span>
              </label>
            </div>
            
            {enableGoBack && (
              <div className="space-y-2 p-3 border rounded-lg ">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Display Text:</label>
                  <input
                    className="w-full p-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={goBackText}
                    onChange={handleGoBackTextChange}
                    placeholder="← Go Back"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Text shown to users for the go back option
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Response Value:</label>
                  <input
                    className="w-full p-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={goBackValue}
                    onChange={handleGoBackValueChange}
                    placeholder="go_back"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Value users can type to trigger the go back action
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              {t('flow_builder.poll_question_label', 'Question')}
            </div>
            <div className="text-sm p-2  rounded-md border border-border">
              {question || t('flow_builder.poll_no_question', 'No question set')}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              {t('flow_builder.poll_options_label', 'Options')}
            </div>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2 relative">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </div>
                <div className="text-sm flex-1 pr-6">
                  <div className="font-medium">{option.text}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('flow_builder.poll_responds_to', 'Responds to')}: "{option.value}"
                  </div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`option-${index + 1}`}
                  style={outputHandleStyle}
                  isConnectable={isConnectable}
                />
              </div>
            ))}
            
            {/* 🔧 NEW: Go Back Option Display */}
            {enableGoBack && (
              <div className="flex items-center gap-2 relative">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">
                  ←
                </div>
                <div className="text-sm flex-1 pr-6">
                  <div className="font-medium">{goBackText}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('flow_builder.poll_responds_to', 'Responds to')}: "{goBackValue}"
                  </div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="go-back"
                  style={{
                    ...outputHandleStyle,
                    backgroundColor: 'hsl(var(--muted))',
                    borderColor: 'hsl(var(--border))'
                  }}
                  isConnectable={isConnectable}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 relative mt-3 pt-3 border-t border-border/50">
            <div className="flex-shrink-0 w-6 h-6 rounded-md flex-shrink-0 w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex items-center justify-center text-xs font-medium">
              !
            </div>
            <div className="text-sm flex-1 pr-6">
              <div className="text-secondary font-medium">
                {t('flow_builder.poll_invalid_response_title', 'Invalid Response')}
              </div>
              <div className="text-xs text-muted-foreground">
                {invalidResponseMessage.length > 50
                  ? `${invalidResponseMessage.substring(0, 50)}...`
                  : invalidResponseMessage || t('flow_builder.poll_no_invalid_message', 'No invalid response message set')
                }
              </div>
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id="invalid-response"
              style={invalidResponseHandleStyle}
              isConnectable={isConnectable}
            />
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

