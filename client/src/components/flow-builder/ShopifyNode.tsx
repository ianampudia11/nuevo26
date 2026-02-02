import { CheckCircle, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Loader2, Play, Plus, ShoppingBag, Store, Trash2, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';



const RESOURCE_FILTERS: {
  [key: string]: Array<{
    key: string;
    label: string;
    type: string;
    options?: string[];
    required: boolean;
    default?: string;
    placeholder?: string;
  }>;
} = {
  orders: [
    { key: 'status', label: 'Order Status', type: 'select', options: ['open', 'closed', 'cancelled', 'any'], required: false },
    { key: 'financial_status', label: 'Payment Status', type: 'select', options: ['pending', 'authorized', 'paid', 'refunded', 'voided'], required: false },
    { key: 'fulfillment_status', label: 'Fulfillment Status', type: 'select', options: ['shipped', 'partial', 'unshipped', 'any'], required: false },
    { key: 'created_at_min', label: 'Created After', type: 'date', required: false },
    { key: 'created_at_max', label: 'Created Before', type: 'date', required: false },
    { key: 'limit', label: 'Limit Results', type: 'number', default: '50', required: false }
  ],
  products: [
    { key: 'vendor', label: 'Vendor', type: 'text', required: false },
    { key: 'product_type', label: 'Product Type', type: 'text', required: false },
    { key: 'status', label: 'Status', type: 'select', options: ['active', 'archived', 'draft'], required: false },
    { key: 'created_at_min', label: 'Created After', type: 'date', required: false },
    { key: 'limit', label: 'Limit Results', type: 'number', default: '50', required: false }
  ],
  customers: [
    { key: 'email', label: 'Email', type: 'text', required: false },
    { key: 'phone', label: 'Phone', type: 'text', required: false },
    { key: 'created_at_min', label: 'Created After', type: 'date', required: false },
    { key: 'limit', label: 'Limit Results', type: 'number', default: '50', required: false }
  ],
  inventory_items: [
    { key: 'ids', label: 'Inventory Item IDs', type: 'text', placeholder: 'Comma-separated IDs', required: false },
    { key: 'limit', label: 'Limit Results', type: 'number', default: '50', required: false }
  ],
  fulfillments: [
    { key: 'order_id', label: 'Order ID', type: 'text', required: true },
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'open', 'success', 'cancelled', 'error', 'failure'], required: false },
    { key: 'created_at_min', label: 'Created After', type: 'date', required: false }
  ]
};

interface FilterValue {
  [key: string]: string;
}

interface VariableMapping {
  responseField: string;
  variableName: string;
}

interface ShopifyNodeProps {
  id: string;
  data: {
    label: string;
    shopDomain?: string;
    apiKey?: string;
    apiPassword?: string;
    resource?: string;
    action?: string;
    filters?: FilterValue;
    variableMappings?: VariableMapping[];
    rateLimitDelay?: number;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function ShopifyNode({ id, data, isConnectable }: ShopifyNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const SHOPIFY_RESOURCES = [
    { id: 'orders', name: t('flow_builder.shopify_orders', 'Orders'), endpoint: 'orders' },
    { id: 'products', name: t('flow_builder.shopify_products', 'Products'), endpoint: 'products' },
    { id: 'customers', name: t('flow_builder.shopify_customers', 'Customers'), endpoint: 'customers' },
    { id: 'inventory_items', name: t('flow_builder.shopify_inventory', 'Inventory'), endpoint: 'inventory_items' },
    { id: 'fulfillments', name: t('flow_builder.shopify_fulfillments', 'Fulfillments'), endpoint: 'fulfillments' },
    { id: 'webhooks', name: t('flow_builder.shopify_webhooks', 'Webhooks'), endpoint: 'webhooks' },
    { id: 'variants', name: t('flow_builder.shopify_product_variants', 'Product Variants'), endpoint: 'variants' },
    { id: 'collections', name: t('flow_builder.shopify_collections', 'Collections'), endpoint: 'collections' }
  ];

  const ACTION_TYPES = [
    { id: 'get', name: t('flow_builder.shopify_get_fetch_data', 'Get (Fetch Data)') },
    { id: 'post', name: t('flow_builder.shopify_create_new', 'Create New') },
    { id: 'put', name: t('flow_builder.shopify_update_existing', 'Update Existing') },
    { id: 'delete', name: t('flow_builder.shopify_delete', 'Delete') }
  ];

  const SHOPIFY_TEMPLATES = [
    {
      id: 'recent_orders',
      name: t('flow_builder.shopify_get_recent_orders', 'Get Recent Orders'),
      resource: 'orders',
      action: 'get',
      filters: { status: 'any', limit: '10', created_at_min: '{{date.last_week}}' }
    },
    {
      id: 'update_inventory',
      name: t('flow_builder.shopify_update_product_stock', 'Update Product Stock'),
      resource: 'inventory_items',
      action: 'put',
      filters: { inventory_item_id: '{{product.inventory_item_id}}', available: '{{inventory.new_quantity}}' }
    },
    {
      id: 'create_customer',
      name: t('flow_builder.shopify_create_customer', 'Create Customer'),
      resource: 'customers',
      action: 'post',
      filters: { email: '{{contact.email}}', first_name: '{{contact.first_name}}', last_name: '{{contact.last_name}}' }
    },
    {
      id: 'order_fulfillment',
      name: t('flow_builder.shopify_create_order_fulfillment', 'Create Order Fulfillment'),
      resource: 'fulfillments',
      action: 'post',
      filters: { order_id: '{{order.id}}', tracking_number: '{{shipping.tracking}}' }
    }
  ];
  const [shopDomain, setShopDomain] = useState(data.shopDomain || '');
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [apiPassword, setApiPassword] = useState(data.apiPassword || '');
  const [resource, setResource] = useState(data.resource || 'orders');
  const [action, setAction] = useState(data.action || 'get');
  const [filters, setFilters] = useState<FilterValue>(data.filters || {});
  const [variableMappings, setVariableMappings] = useState<VariableMapping[]>(data.variableMappings || []);
  const [rateLimitDelay, setRateLimitDelay] = useState(data.rateLimitDelay || 500);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
    rateLimitRemaining?: number;
    responseCount?: number;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [showVariablePreview, setShowVariablePreview] = useState(false);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  useEffect(() => {
    updateNodeData({
      shopDomain,
      apiKey,
      apiPassword,
      resource,
      action,
      filters,
      variableMappings,
      rateLimitDelay
    });
  }, [
    updateNodeData,
    shopDomain,
    apiKey,
    apiPassword,
    resource,
    action,
    filters,
    variableMappings,
    rateLimitDelay
  ]);

  const addVariableMapping = () => {
    setVariableMappings([...variableMappings, { responseField: '', variableName: '' }]);
  };

  const removeVariableMapping = (index: number) => {
    setVariableMappings(variableMappings.filter((_, i) => i !== index));
  };

  const updateVariableMapping = (index: number, field: 'responseField' | 'variableName', value: string) => {
    const newMappings = [...variableMappings];
    newMappings[index][field] = value;
    setVariableMappings(newMappings);
  };

  const applyTemplate = (templateId: string) => {
    const template = SHOPIFY_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setResource(template.resource);
      setAction(template.action);
      const cleanedFilters: FilterValue = Object.entries(template.filters)
        .reduce((acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as FilterValue);
      setFilters(cleanedFilters);
    }
  };

  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const removeFilter = (key: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  };

  const isValidShopDomain = (domain: string): boolean => {
    const shopifyDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
    return shopifyDomainRegex.test(domain) || domain.includes('.myshopify.com');
  };

  const replaceVariables = (text: string): string => {
    const testData: Record<string, string> = {
      'contact.email': 'test@example.com',
      'contact.first_name': 'John',
      'contact.last_name': 'Doe',
      'contact.phone': '+1234567890',
      'order.id': '12345',
      'product.id': '67890',
      'product.inventory_item_id': '11111',
      'inventory.new_quantity': '100',
      'shipping.tracking': 'TRACK123456',
      'date.last_week': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      'date.today': new Date().toISOString().split('T')[0],
      'date.now': new Date().toISOString()
    };

    let result = text;
    Object.entries(testData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    });

    return result;
  };

  const buildApiUrl = (shopDomain: string, resource: string, resourceId?: string): string => {
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '');
    const baseUrl = `https://${cleanDomain}/admin/api/2025-06/`;

    if (resourceId) {
      return `${baseUrl}${resource}/${resourceId}.json`;
    }
    return `${baseUrl}${resource}.json`;
  };

  const buildQueryParams = (filters: FilterValue): string => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value.trim()) {
        const processedValue = replaceVariables(value);
        params.append(key, processedValue);
      }
    });

    return params.toString();
  };

  const testConnection = async () => {
    if (!shopDomain.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter your shop domain (e.g., mystore.myshopify.com)'
      });
      setShowTestResult(true);
      return;
    }

    if (!isValidShopDomain(shopDomain)) {
      setTestResult({
        success: false,
        error: 'Please enter a valid Shopify domain (e.g., mystore.myshopify.com)'
      });
      setShowTestResult(true);
      return;
    }

    if (!apiKey.trim() || !apiPassword.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter both API key and password'
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const resourceEndpoint = SHOPIFY_RESOURCES.find(r => r.id === resource)?.endpoint || resource;
      const apiUrl = buildApiUrl(shopDomain, resourceEndpoint);
      const queryParams = buildQueryParams(filters);
      const fullUrl = queryParams ? `${apiUrl}?${queryParams}` : apiUrl;

      const credentials = btoa(`${apiKey}:${apiPassword}`);

      const response = await fetch(fullUrl, {
        method: action.toUpperCase(),
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      let responseData: any;
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }

      const rateLimitRemaining = response.headers.get('X-Shopify-Shop-Api-Call-Limit');

      if (response.ok) {
        let responseCount = 0;
        if (responseData && typeof responseData === 'object') {
          const resourceKey = Object.keys(responseData)[0];
          if (Array.isArray(responseData[resourceKey])) {
            responseCount = responseData[resourceKey].length;
          } else if (responseData[resourceKey]) {
            responseCount = 1;
          }
        }

        setTestResult({
          success: true,
          data: responseData,
          rateLimitRemaining: rateLimitRemaining ? parseInt(rateLimitRemaining.split('/')[0]) : undefined,
          responseCount
        });
      } else {
        let errorMessage = 'Request failed';
        if (responseData?.errors) {
          errorMessage = Array.isArray(responseData.errors)
            ? responseData.errors.join(', ')
            : responseData.errors;
        } else if (responseData?.error) {
          errorMessage = responseData.error;
        } else if (response.status === 401) {
          errorMessage = 'Authentication failed. Please check your API credentials.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please check your API permissions.';
        } else if (response.status === 404) {
          errorMessage = 'Resource not found. Please check your shop domain and resource selection.';
        } else if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait before making more requests.';
        }

        setTestResult({
          success: false,
          error: errorMessage,
          rateLimitRemaining: rateLimitRemaining ? parseInt(rateLimitRemaining.split('/')[0]) : undefined
        });
      }

    } catch (error: any) {
      let errorMessage = t('flow_builder.shopify_connection_failed', 'Connection failed');
      if (error.message) {
        errorMessage = error.message;
      }

      setTestResult({
        success: false,
        error: errorMessage
      });
    } finally {
      setIsTesting(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'get': return 'text-blue-600';
      case 'post': return 'text-green-600';
      case 'put': return 'text-orange-600';
      case 'delete': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="node-shopify p-3 rounded-lg bg-white border border-green-200 shadow-sm max-w-[320px] group">
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
              <p className="text-xs">{t('flow_builder.shopify_duplicate_node', 'Duplicate node')}</p>
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
              <p className="text-xs">{t('flow_builder.shopify_delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2">
        <ShoppingBag className="h-4 w-4 text-green-600" />
        <span>{t('flow_builder.shopify_node_title', 'Shopify')}</span>
       <button
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    {t('flow_builder.shopify_hide', 'Hide')}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {t('flow_builder.shopify_edit', 'Edit')}
                  </>
                )}
              </button>
      </div>

      <div className="text-sm p-2  rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <Store className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn("font-medium", getActionColor(action))}>{action.toUpperCase()}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {SHOPIFY_RESOURCES.find(r => r.id === resource)?.name || resource}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {shopDomain && (
            <span className="text-[10px] bg-green-100 text-green-800 px-1 py-0.5 rounded">
              {shopDomain.replace('.myshopify.com', '')}
            </span>
          )}
          {Object.keys(filters).length > 0 && (
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
              {Object.keys(filters).length} filter{Object.keys(filters).length !== 1 ? 's' : ''}
            </span>
          )}
          {variableMappings.length > 0 && (
            <span className="text-[10px] bg-purple-100 text-purple-800 px-1 py-0.5 rounded">
              {variableMappings.length} mapping{variableMappings.length !== 1 ? 's' : ''}
            </span>
          )}
          {apiKey && (
            <span className="text-[10px] bg-orange-100 text-orange-800 px-1 py-0.5 rounded">
              API Connected
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div>
            <Label className="block mb-1 font-medium">Quick Templates</Label>
            <Select
              value=""
              onValueChange={applyTemplate}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Choose a Shopify operation..." />
              </SelectTrigger>
              <SelectContent>
                {SHOPIFY_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="block font-medium">Shop Configuration</Label>
            <div>
              <Label className="block mb-1 text-xs">Shop Domain</Label>
              <Input
                placeholder="mystore.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div>
              <Label className="block mb-1 text-xs">API Key</Label>
              <Input
                placeholder="Your Shopify API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div>
              <Label className="block mb-1 text-xs">API Password</Label>
              <Input
                type="password"
                placeholder="Your Shopify API password"
                value={apiPassword}
                onChange={(e) => setApiPassword(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-1"
                onClick={testConnection}
                disabled={isTesting || !shopDomain.trim() || !apiKey.trim() || !apiPassword.trim()}
                title="Test connection to your Shopify store"
              >
                {isTesting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Test Connection
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div>
              <Label className="block mb-1 font-medium">Shopify Resource</Label>
              <Select
                value={resource}
                onValueChange={setResource}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select resource" />
                </SelectTrigger>
                <SelectContent>
                  {SHOPIFY_RESOURCES.map((res) => (
                    <SelectItem key={res.id} value={res.id}>
                      {res.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="block mb-1 font-medium">Action Type</Label>
              <Select
                value={action}
                onValueChange={setAction}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((actionType) => (
                    <SelectItem key={actionType.id} value={actionType.id}>
                      <span className={getActionColor(actionType.id)}>{actionType.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {RESOURCE_FILTERS[resource as keyof typeof RESOURCE_FILTERS] && (
            <div className="pt-2 border-t">
              <Label className="block mb-2 font-medium">Filters & Parameters</Label>
              <div className="space-y-2">
                {RESOURCE_FILTERS[resource as keyof typeof RESOURCE_FILTERS].map((filter) => (
                  <div key={filter.key} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Label className="block mb-1 text-[10px] text-muted-foreground">
                        {filter.label}
                        {filter.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      {filter.type === 'select' ? (
                        <Select
                          value={filters[filter.key] || ''}
                          onValueChange={(value) => updateFilter(filter.key, value)}
                        >
                          <SelectTrigger className="text-xs h-6">
                            <SelectValue placeholder={`Select ${filter.label.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {filter.type === 'select' && 'options' in filter && Array.isArray(filter.options) && filter.options.map((option: string) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={filter.type}
                          placeholder={filter.placeholder || `Enter ${filter.label.toLowerCase()}`}
                          value={filters[filter.key] || filter.default || ''}
                          onChange={(e) => updateFilter(filter.key, e.target.value)}
                          className="text-xs h-6"
                        />
                      )}
                    </div>
                    {filters[filter.key] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 mt-4"
                        onClick={() => removeFilter(filter.key)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">
                Use &#123;&#123;variable&#125;&#125; syntax for dynamic values
              </div>
            </div>
          )}

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">Response Variable Mapping</Label>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={addVariableMapping}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            {variableMappings.map((mapping, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <Input
                  placeholder="orders.0.id"
                  value={mapping.responseField}
                  onChange={(e) => updateVariableMapping(index, 'responseField', e.target.value)}
                  className="text-xs h-7 flex-1"
                />
                <span className="text-xs text-muted-foreground self-center">→</span>
                <Input
                  placeholder="shopify.order_id"
                  value={mapping.variableName}
                  onChange={(e) => updateVariableMapping(index, 'variableName', e.target.value)}
                  className="text-xs h-7 flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => removeVariableMapping(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="text-[10px] text-muted-foreground">
              Map Shopify response fields to flow variables for use in subsequent nodes
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Rate Limit Delay (ms)</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setRateLimitDelay(Math.max(100, rateLimitDelay - 100))}
                  disabled={rateLimitDelay <= 100}
                >-</Button>
                <span className="text-xs w-12 text-center">{rateLimitDelay}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setRateLimitDelay(Math.min(5000, rateLimitDelay + 100))}
                  disabled={rateLimitDelay >= 5000}
                >+</Button>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Delay between requests to respect Shopify's rate limits
            </div>
          </div>

          {/* Variable Preview */}
          <div className="pt-2 border-t">
            <button
              className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 w-full"
              onClick={() => setShowVariablePreview(!showVariablePreview)}
            >
              Available Output Variables
              {showVariablePreview ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showVariablePreview && (
              <div className="mt-2 text-[10px] bg-gray-50 p-2 rounded space-y-1">
                <div><code>&#123;&#123;shopify.{resource}.data&#125;&#125;</code> - {SHOPIFY_RESOURCES.find(r => r.id === resource)?.name} data</div>
                <div><code>&#123;&#123;shopify.response.count&#125;&#125;</code> - Number of results returned</div>
                <div><code>&#123;&#123;shopify.api.rate_limit_remaining&#125;&#125;</code> - API calls remaining</div>
                <div><code>&#123;&#123;shopify.success&#125;&#125;</code> - Request success status</div>
                {resource === 'orders' && (
                  <>
                    <div><code>&#123;&#123;shopify.order.id&#125;&#125;</code> - Order ID</div>
                    <div><code>&#123;&#123;shopify.order.total_price&#125;&#125;</code> - Order total</div>
                    <div><code>&#123;&#123;shopify.order.customer.email&#125;&#125;</code> - Customer email</div>
                  </>
                )}
                {resource === 'products' && (
                  <>
                    <div><code>&#123;&#123;shopify.product.id&#125;&#125;</code> - Product ID</div>
                    <div><code>&#123;&#123;shopify.product.title&#125;&#125;</code> - Product title</div>
                    <div><code>&#123;&#123;shopify.product.vendor&#125;&#125;</code> - Product vendor</div>
                  </>
                )}
                {resource === 'customers' && (
                  <>
                    <div><code>&#123;&#123;shopify.customer.id&#125;&#125;</code> - Customer ID</div>
                    <div><code>&#123;&#123;shopify.customer.email&#125;&#125;</code> - Customer email</div>
                    <div><code>&#123;&#123;shopify.customer.first_name&#125;&#125;</code> - First name</div>
                  </>
                )}
                {variableMappings.map((mapping, index) => (
                  mapping.variableName && (
                    <div key={index}>
                      <code>&#123;&#123;{mapping.variableName}&#125;&#125;</code> - {mapping.responseField || 'Custom mapping'}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground mt-2">
            <p>
              The Shopify Integration node connects to your Shopify store's Admin API.
              Response data will be available as variables in subsequent nodes.
            </p>
          </div>

          {showTestResult && testResult && (
            <div className="mt-3 border rounded p-2 ">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="text-xs font-medium">
                    {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </span>
                  {testResult.responseCount !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      ({testResult.responseCount} result{testResult.responseCount !== 1 ? 's' : ''})
                    </span>
                  )}
                  {testResult.rateLimitRemaining !== undefined && (
                    <span className="text-[10px] text-orange-600">
                      {testResult.rateLimitRemaining} API calls remaining
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => setShowTestResult(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {testResult.error ? (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                  {testResult.error}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                    Successfully connected to Shopify store and retrieved {SHOPIFY_RESOURCES.find(r => r.id === resource)?.name.toLowerCase()} data.
                  </div>

                  {testResult.data && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Sample Response Data:
                      </div>
                      <div className="text-[10px] bg-gray-50 p-2 rounded font-mono max-h-32 overflow-y-auto">
                        {JSON.stringify(testResult.data, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}