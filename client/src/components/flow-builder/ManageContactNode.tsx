import React, { useCallback, useEffect, useState } from "react";
import {
  NodeProps,
  Handle,
  Position,
  useReactFlow
} from "reactflow";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  HelpCircle,
  User,
  Mail,
  Phone,
  Building,
  Tag,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  UserX,
  UserCheck,
  Edit,
  FileText
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useFlowContext } from "@/pages/flow-builder";
import { cn } from "@/lib/utils";
import { standardHandleStyle } from './StyledHandle';
import { useTranslation } from '@/hooks/use-translation';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';

export type ManageContactData = {
  id: string;
  type: "manage_contact";
  operation: 'update_contact' | 'delete_contact';
  contactIdVariable: string;
  updateFields: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    tags?: string[];
    notes?: string;
    isActive?: boolean;
    isArchived?: boolean;
  };
  deleteConfirmation: boolean;
  errorHandling: 'continue' | 'stop';
  showAdvanced: boolean;
  skipEmptyValues?: boolean;
  tagInput?: string;
};

function ManageContactNode({
  id,
  data,
  selected,
  isConnectable
}: NodeProps<ManageContactData>) {
  const { t } = useTranslation();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const { getNodes, setNodes } = useReactFlow();
  const [showToolbar, setShowToolbar] = useState(false);

  useEffect(() => {
    if (data && (!data.operation || !data.contactIdVariable)) {
      const updatedData = {
        ...data,
        operation: data.operation || 'update_contact',
        contactIdVariable: data.contactIdVariable || "{{contact.id}}",
        updateFields: data.updateFields || {},
        deleteConfirmation: data.deleteConfirmation !== undefined ? data.deleteConfirmation : false,
        errorHandling: data.errorHandling || 'continue',
        showAdvanced: data.showAdvanced || false,
        skipEmptyValues: data.skipEmptyValues !== undefined ? data.skipEmptyValues : true
      };

      updateNodeData(updatedData);
    }
  }, [data, id, getNodes, setNodes]);

  const updateNodeData = useCallback((updates: Partial<ManageContactData>) => {
    const nodes = getNodes();
    const updatedNodes = nodes.map((node: any) => {
      if (node.id === id) {
        return {
          ...node,
          data: { ...node.data, ...updates }
        };
      }
      return node;
    });
    setNodes(updatedNodes);
  }, [id, getNodes, setNodes]);

  const handleDelete = useCallback(() => {
    onDeleteNode(id);
  }, [id, onDeleteNode]);

  const handleDuplicate = useCallback(() => {
    onDuplicateNode(id);
  }, [id, onDuplicateNode]);

  const handleOperationChange = useCallback((value: string) => {
    updateNodeData({ operation: value as 'update_contact' | 'delete_contact' });
  }, [updateNodeData]);

  const handleInputChange = useCallback((field: keyof ManageContactData['updateFields']) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      updateNodeData({
        updateFields: {
          ...data.updateFields,
          [field]: e.target.value
        }
      });
    }, [data.updateFields, updateNodeData]);

  const handleSwitchChange = useCallback((field: keyof ManageContactData) =>
    (checked: boolean) => {
      updateNodeData({ [field]: checked });
    }, [updateNodeData]);

  const handleUpdateFieldChange = useCallback((field: keyof ManageContactData['updateFields'], value: string) => {
    updateNodeData({
      updateFields: {
        ...data.updateFields,
        [field]: value
      }
    });
  }, [data.updateFields, updateNodeData]);

  const handleAddTag = useCallback((tag: string) => {
    if (tag.trim()) {
      const currentTags = data.updateFields?.tags || [];
      if (!currentTags.includes(tag.trim())) {
        updateNodeData({
          updateFields: {
            ...data.updateFields,
            tags: [...currentTags, tag.trim()]
          },
          tagInput: ''
        });
      }
    }
  }, [data.updateFields, updateNodeData]);

  const handleRemoveTag = useCallback((tag: string) => {
    const currentTags = data.updateFields?.tags || [];
    updateNodeData({
      updateFields: {
        ...data.updateFields,
        tags: currentTags.filter(t => t !== tag)
      }
    });
  }, [data.updateFields, updateNodeData]);

  const getOperationIcon = () => {
    switch (data.operation) {
      case 'delete_contact': return <UserX className="w-4 h-4" />;
      default: return <img src="https://cdn-icons-png.flaticon.com/128/9722/9722917.png" alt="Manage Contact" className="w-4 h-4" />;
    }
  };

  const getOperationTitle = () => {
    switch (data.operation) {
      case 'delete_contact': return t('flow_builder.delete_contact', 'Delete Contact');
      default: return t('flow_builder.update_contact', 'Update Contact');
    }
  };

  const getOperationDescription = () => {
    switch (data.operation) {
      case 'delete_contact': return t('flow_builder.manage_contact_description', 'Permanently delete contact and associated data');
      default: return t('flow_builder.manage_contact_description', 'Update or delete contact information');
    }
  };

  const getFieldsToUpdate = () => {
    const fields: string[] = [];
    if (data.updateFields?.name) fields.push('name');
    if (data.updateFields?.email) fields.push('email');
    if (data.updateFields?.phone) fields.push('phone');
    if (data.updateFields?.company) fields.push('company');
    if (data.updateFields?.tags && data.updateFields.tags.length > 0) fields.push('tags');
    if (data.updateFields?.notes) fields.push('notes');
    if (data.updateFields?.isActive !== undefined) fields.push('isActive');
    if (data.updateFields?.isArchived !== undefined) fields.push('isArchived');
    return fields;
  };

  return (
    <TooltipProvider>
      <div
        className="group relative"
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => setShowToolbar(false)}
      >
        {showToolbar && (
          <div className="absolute -top-10 right-0 flex space-x-2 z-50 bg-background p-1 rounded-md shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDuplicate}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Handle
          type="target"
          position={Position.Left}
          style={standardHandleStyle}
          isConnectable={isConnectable}
        />

        <Card className={cn(
          "min-w-[380px] max-w-[480px] transition-all duration-200",
          selected ? 'border-primary border-2 shadow-lg' : 'border-border',
          "bg-gradient-to-br from-background to-muted/20"
        )}>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20">
                  {getOperationIcon()}
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    {getOperationTitle()}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {getOperationDescription()}
                  </CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {t('flow_builder.manage_contact', 'Manage Contact')}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-0 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <User className="w-3 h-3" />
                {t('flow_builder.operation_type', 'Operation Type')}
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('flow_builder.operation_type_help', 'Choose what action to perform on the contact')}</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={data.operation || 'update_contact'}
                onValueChange={handleOperationChange}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={t('flow_builder.select_operation', 'Select operation')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="update_contact">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-3 h-3" />
                      {t('flow_builder.update_contact', 'Update Contact')}
                    </div>
                  </SelectItem>
                  <SelectItem value="delete_contact">
                    <div className="flex items-center gap-2">
                      <UserX className="w-3 h-3" />
                      {t('flow_builder.delete_contact', 'Delete Contact')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <User className="w-3 h-3" />
                {t('flow_builder.contact_id_variable', 'Contact ID Variable')}
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('flow_builder.contact_id_variable_help', 'Variable containing the contact ID or phone number')}</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <EnhancedVariablePicker
                value={data.contactIdVariable || ''}
                onChange={(value) => updateNodeData({ contactIdVariable: value })}
                placeholder="{{contact.id}}"
                className="h-8"
              />
            </div>

            {data.operation === 'update_contact' && (
              <Collapsible
                open={true}
                onOpenChange={() => {}}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between h-8">
                    <span className="text-xs flex items-center gap-1">
                      <Edit className="w-3 h-3" />
                      {t('flow_builder.fields_to_update', 'Fields to Update')}
                    </span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 mt-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_name', 'Contact Name')}</Label>
                    <EnhancedVariablePicker
                      value={data.updateFields?.name || ''}
                      onChange={(value) => handleUpdateFieldChange('name', value)}
                      placeholder="{{contact.name}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_email', 'Contact Email')}</Label>
                    <EnhancedVariablePicker
                      value={data.updateFields?.email || ''}
                      onChange={(value) => handleUpdateFieldChange('email', value)}
                      placeholder="{{contact.email}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_phone', 'Contact Phone')}</Label>
                    <EnhancedVariablePicker
                      value={data.updateFields?.phone || ''}
                      onChange={(value) => handleUpdateFieldChange('phone', value)}
                      placeholder="{{contact.phone}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_company', 'Contact Company')}</Label>
                    <EnhancedVariablePicker
                      value={data.updateFields?.company || ''}
                      onChange={(value) => handleUpdateFieldChange('company', value)}
                      placeholder="{{contact.company}}"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_tags', 'Contact Tags')}</Label>
                    <div className="flex gap-1">
                      <Input
                        value={data.tagInput || ''}
                        onChange={(e) => updateNodeData({ tagInput: e.target.value })}
                        placeholder={t('flow_builder.enter_tag_name', 'Enter tag name')}
                        className="h-8 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag(data.tagInput || '');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => handleAddTag(data.tagInput || '')}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {data.updateFields?.tags && data.updateFields.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {data.updateFields.tags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-3 w-3 p-0 ml-1"
                              onClick={() => handleRemoveTag(tag)}
                            >
                              <X className="w-2 h-2" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_notes', 'Contact Notes')}</Label>
                    <EnhancedVariablePicker
                      value={data.updateFields?.notes || ''}
                      onChange={(value) => handleUpdateFieldChange('notes', value)}
                      placeholder={t('flow_builder.enter_notes', 'Enter notes...')}
                      className="h-16"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_is_active', 'Is Active')}</Label>
                    <Switch
                      checked={data.updateFields?.isActive !== undefined ? data.updateFields.isActive : true}
                      onCheckedChange={(checked) => updateNodeData({
                        updateFields: {
                          ...data.updateFields,
                          isActive: checked
                        }
                      })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('flow_builder.contact_is_archived', 'Is Archived')}</Label>
                    <Switch
                      checked={data.updateFields?.isArchived !== undefined ? data.updateFields.isArchived : false}
                      onCheckedChange={(checked) => updateNodeData({
                        updateFields: {
                          ...data.updateFields,
                          isArchived: checked
                        }
                      })}
                    />
                  </div>

                  {getFieldsToUpdate().length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-2">
                        {t('flow_builder.fields_to_update_summary', 'Fields to update:')}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {getFieldsToUpdate().map((field) => (
                          <Badge key={field} variant="outline" className="text-xs">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {data.operation === 'delete_contact' && (
              <div className="space-y-3">
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-red-800 dark:text-red-200">
                        {t('flow_builder.delete_warning', 'Warning: This will permanently delete the contact and all associated data')}
                      </div>
                      <div className="text-xs text-red-600 dark:text-red-300 mt-1">
                        {t('flow_builder.delete_info', 'This action will delete the contact, conversations, messages, notes, and deals. This cannot be undone.')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={data.deleteConfirmation || false}
                    onCheckedChange={handleSwitchChange('deleteConfirmation')}
                  />
                  <Label className="text-xs">
                    {t('flow_builder.delete_confirmation', 'I understand this will permanently delete the contact')}
                  </Label>
                </div>
              </div>
            )}

            <Collapsible
              open={data.showAdvanced}
              onOpenChange={(open) => updateNodeData({ showAdvanced: open })}
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-muted-foreground">
                  <span className="text-xs">{t('flow_builder.advanced_options', 'Advanced Options')}</span>
                  {data.showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-2">
                {data.operation === 'update_contact' && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('flow_builder.skip_empty_values', 'Skip empty values')}</Label>
                    <Switch
                      checked={data.skipEmptyValues !== undefined ? data.skipEmptyValues : true}
                      onCheckedChange={handleSwitchChange('skipEmptyValues')}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs font-medium">{t('flow_builder.error_handling', 'Error Handling')}</Label>
                  <Select
                    value={data.errorHandling || 'continue'}
                    onValueChange={(value) => updateNodeData({ errorHandling: value as 'continue' | 'stop' })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="continue">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          {t('flow_builder.continue_on_error', 'Continue on error')}
                        </div>
                      </SelectItem>
                      <SelectItem value="stop">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3 h-3 text-red-500" />
                          {t('flow_builder.stop_on_error', 'Stop on error')}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Handle
          type="source"
          position={Position.Right}
          style={standardHandleStyle}
          isConnectable={isConnectable}
        />
      </div>
    </TooltipProvider>
  );
}

export default ManageContactNode;

