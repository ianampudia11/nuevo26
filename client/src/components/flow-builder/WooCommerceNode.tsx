import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, Copy, ShoppingCart, Settings, Plus, X, Play, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Store, Eye, EyeOff } from 'lucide-react';
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';

const WOOCOMMERCE_RESOURCES = [
  { id: 'orders', name: 'Orders', endpoint: 'orders' },
  { id: 'products', name: 'Products', endpoint: 'products' },
  { id: 'customers', name: 'Customers', endpoint: 'customers' },
  { id: 'coupons', name: 'Coupons', endpoint: 'coupons' },
  { id: 'categories', name: 'Product Categories', endpoint: 'products/categories' },
  { id: 'variations', name: 'Product Variations', endpoint: 'products/{product_id}/variations' },
  { id: 'reports', name: 'Reports', endpoint: 'reports' },
  { id: 'payment_gateways', name: 'Payment Gateways', endpoint: 'payment_gateways' },
  { id: 'shipping_zones', name: 'Shipping Zones', endpoint: 'shipping/zones' },
  { id: 'tax_rates', name: 'Tax Rates', endpoint: 'taxes' }
];

const ACTION_TYPES = [
  { id: 'get', name: 'Get (Fetch Data)' },
  { id: 'post', name: 'Create New' },
  { id: 'put', name: 'Update Existing' },
  { id: 'delete', name: 'Delete' }
];

const ORDER_STATUSES = [
  'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed', 'any'
];

const PRODUCT_STATUSES = [
  'draft', 'pending', 'private', 'publish', 'any'
];

const WOOCOMMERCE_TEMPLATES = [
  {
    id: 'recent_orders',
    name: 'Get Recent Orders',
    resource: 'orders',
    action: 'get',
    filters: { status: 'any', per_page: '10', after: '{{date.last_week}}' }
  },
  {
    id: 'update_product_stock',
    name: 'Update Product Stock',
    resource: 'products',
    action: 'put',
    filters: { id: '{{product.id}}', stock_quantity: '{{inventory.new_quantity}}', manage_stock: 'true' }
  },
  {
    id: 'create_customer',
    name: 'Create Customer',
    resource: 'customers',
    action: 'post',
    filters: { email: '{{contact.email}}', first_name: '{{contact.first_name}}', last_name: '{{contact.last_name}}' }
  },
  {
    id: 'create_coupon',
    name: 'Create Discount Coupon',
    resource: 'coupons',
    action: 'post',
    filters: { code: '{{coupon.code}}', discount_type: 'percent', amount: '{{coupon.amount}}' }
  },
  {
    id: 'order_completed',
    name: 'Mark Order as Completed',
    resource: 'orders',
    action: 'put',
    filters: { id: '{{order.id}}', status: 'completed' }
  }
];

interface ResourceFilter {
  key: string;
  label: string;
  type: string;
  options?: string[];
  default?: string;
}

const RESOURCE_FILTERS: Record<string, ResourceFilter[]> = {
  orders: [
    { key: 'status', label: 'Order Status', type: 'select', options: ORDER_STATUSES, default: '' },
    { key: 'customer', label: 'Customer ID', type: 'number', default: '' },
    { key: 'product', label: 'Product ID', type: 'number', default: '' },
    { key: 'after', label: 'Created After', type: 'date', default: '' },
    { key: 'before', label: 'Created Before', type: 'date', default: '' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Orders', type: 'text', default: '' }
  ],
  products: [
    { key: 'status', label: 'Product Status', type: 'select', options: PRODUCT_STATUSES, default: '' },
    { key: 'category', label: 'Category ID', type: 'number', default: '' },
    { key: 'tag', label: 'Tag ID', type: 'number', default: '' },
    { key: 'featured', label: 'Featured Only', type: 'select', options: ['true', 'false'], default: '' },
    { key: 'on_sale', label: 'On Sale Only', type: 'select', options: ['true', 'false'], default: '' },
    { key: 'min_price', label: 'Minimum Price', type: 'number', default: '' },
    { key: 'max_price', label: 'Maximum Price', type: 'number', default: '' },
    { key: 'stock_status', label: 'Stock Status', type: 'select', options: ['instock', 'outofstock', 'onbackorder'], default: '' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Products', type: 'text', default: '' }
  ],
  customers: [
    { key: 'email', label: 'Email Address', type: 'email' },
    { key: 'role', label: 'User Role', type: 'select', options: ['customer', 'subscriber', 'administrator'] },
    { key: 'orderby', label: 'Order By', type: 'select', options: ['id', 'include', 'name', 'registered_date'] },
    { key: 'order', label: 'Sort Order', type: 'select', options: ['asc', 'desc'] },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Customers', type: 'text' }
  ],
  coupons: [
    { key: 'code', label: 'Coupon Code', type: 'text' },
    { key: 'after', label: 'Created After', type: 'date' },
    { key: 'before', label: 'Created Before', type: 'date' },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Coupons', type: 'text' }
  ],
  categories: [
    { key: 'parent', label: 'Parent Category ID', type: 'number' },
    { key: 'product', label: 'Product ID', type: 'number' },
    { key: 'hide_empty', label: 'Hide Empty Categories', type: 'select', options: ['true', 'false'] },
    { key: 'per_page', label: 'Results Per Page', type: 'number', default: '10' },
    { key: 'search', label: 'Search Categories', type: 'text' }
  ],
  reports: [
    { key: 'period', label: 'Report Period', type: 'select', options: ['week', 'month', 'last_month', 'year'] },
    { key: 'date_min', label: 'Start Date', type: 'date' },
    { key: 'date_max', label: 'End Date', type: 'date' }
  ]
};

interface FilterValue {
  [key: string]: string;
}

interface VariableMapping {
  responseField: string;
  variableName: string;
}

interface WooCommerceNodeProps {
  id: string;
  data: {
    label: string;
    siteUrl?: string;
    consumerKey?: string;
    consumerSecret?: string;
    resource?: string;
    action?: string;
    filters?: FilterValue;
    variableMappings?: VariableMapping[];
    apiVersion?: string;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function WooCommerceNode({ id, data, isConnectable }: WooCommerceNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [siteUrl, setSiteUrl] = useState(data.siteUrl || '');
  const [consumerKey, setConsumerKey] = useState(data.consumerKey || '');
  const [consumerSecret, setConsumerSecret] = useState(data.consumerSecret || '');
  const [resource, setResource] = useState(data.resource || 'orders');
  const [action, setAction] = useState(data.action || 'get');
  const [filters, setFilters] = useState<FilterValue>(data.filters || {});
  const [variableMappings, setVariableMappings] = useState<VariableMapping[]>(data.variableMappings || []);
  const [apiVersion, setApiVersion] = useState(data.apiVersion || 'v3');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
    responseCount?: number;
    apiVersion?: string;
    siteInfo?: any;
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
      siteUrl,
      consumerKey,
      consumerSecret,
      resource,
      action,
      filters,
      variableMappings,
      apiVersion
    });
  }, [
    updateNodeData,
    siteUrl,
    consumerKey,
    consumerSecret,
    resource,
    action,
    filters,
    variableMappings,
    apiVersion
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
    const template = WOOCOMMERCE_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setResource(template.resource);
      setAction(template.action);
      setFilters(Object.fromEntries(
        Object.entries(template.filters).filter(([_, v]) => v !== undefined)
      ));
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

  const isValidSiteUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const replaceVariables = (text: string): string => {
    const testData: Record<string, string> = {
      'contact.email': 'test@example.com',
      'contact.first_name': 'John',
      'contact.last_name': 'Doe',
      'contact.phone': '+1234567890',
      'order.id': '123',
      'product.id': '456',
      'customer.id': '789',
      'coupon.code': 'SAVE10',
      'coupon.amount': '10',
      'inventory.new_quantity': '50',
      'date.last_week': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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

  const buildApiUrl = (siteUrl: string, resource: string, resourceId?: string): string => {
    const cleanUrl = siteUrl.replace(/\/$/, '');
    const baseUrl = `${cleanUrl}/wp-json/wc/${apiVersion}/`;

    if (resourceId) {
      return `${baseUrl}${resource}/${resourceId}`;
    }
    return `${baseUrl}${resource}`;
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

  const getActionColor = (action: string) => {
    switch (action) {
      case 'get': return 'text-blue-600';
      case 'post': return 'text-green-600';
      case 'put': return 'text-orange-600';
      case 'delete': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const testConnection = async () => {
    if (!siteUrl.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter your WordPress site URL (e.g., https://mystore.com)'
      });
      setShowTestResult(true);
      return;
    }

    if (!isValidSiteUrl(siteUrl)) {
      setTestResult({
        success: false,
        error: 'Please enter a valid URL (must include http:// or https://)'
      });
      setShowTestResult(true);
      return;
    }

    if (!consumerKey.trim() || !consumerSecret.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter both Consumer Key and Consumer Secret'
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const resourceEndpoint = WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.endpoint || resource;
      const apiUrl = buildApiUrl(siteUrl, resourceEndpoint);
      const queryParams = buildQueryParams(filters);
      const fullUrl = queryParams ? `${apiUrl}?${queryParams}` : apiUrl;

      const credentials = btoa(`${consumerKey}:${consumerSecret}`);

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

      if (response.ok) {
        let responseCount = 0;
        if (Array.isArray(responseData)) {
          responseCount = responseData.length;
        } else if (responseData && typeof responseData === 'object') {
          responseCount = 1;
        }

        let siteInfo = null;
        try {
          const siteInfoUrl = buildApiUrl(siteUrl, 'system_status');
          const siteInfoResponse = await fetch(siteInfoUrl, {
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Accept': 'application/json'
            }
          });
          if (siteInfoResponse.ok) {
            siteInfo = await siteInfoResponse.json();
          }
        } catch {
        }

        setTestResult({
          success: true,
          data: responseData,
          responseCount,
          apiVersion: apiVersion,
          siteInfo
        });
      } else {
        let errorMessage = 'Request failed';
        if (responseData?.message) {
          errorMessage = responseData.message;
        } else if (responseData?.error) {
          errorMessage = responseData.error;
        } else if (response.status === 401) {
          errorMessage = 'Authentication failed. Please check your Consumer Key and Secret.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please check your API permissions.';
        } else if (response.status === 404) {
          errorMessage = 'Resource not found. Please check your site URL and WooCommerce installation.';
        } else if (response.status === 400) {
          errorMessage = 'Bad request. Please check your filters and parameters.';
        }

        setTestResult({
          success: false,
          error: errorMessage
        });
      }

    } catch (error: any) {
      let errorMessage = 'Connection failed';
      if (error.message) {
        if (error.message.includes('CORS')) {
          errorMessage = 'CORS error. Please ensure your WordPress site allows API access.';
        } else if (error.message.includes('SSL')) {
          errorMessage = 'SSL certificate error. Please check your site\'s SSL configuration.';
        } else {
          errorMessage = error.message;
        }
      }

      setTestResult({
        success: false,
        error: errorMessage
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="node-woocommerce p-3 rounded-lg bg-white border border-purple-200 shadow-sm max-w-[320px] group">
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
        <ShoppingCart className="h-4 w-4 text-purple-600" />
        <span>WooCommerce</span>
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
          <Store className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn("font-medium", getActionColor(action))}>{action.toUpperCase()}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.name || resource}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {siteUrl && (
            <span className="text-[10px] bg-purple-100 text-purple-800 px-1 py-0.5 rounded">
              {new URL(siteUrl).hostname}
            </span>
          )}
          {Object.keys(filters).length > 0 && (
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
              {Object.keys(filters).length} filter{Object.keys(filters).length !== 1 ? 's' : ''}
            </span>
          )}
          {variableMappings.length > 0 && (
            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1 py-0.5 rounded">
              {variableMappings.length} mapping{variableMappings.length !== 1 ? 's' : ''}
            </span>
          )}
          {consumerKey && (
            <span className="text-[10px] bg-orange-100 text-orange-800 px-1 py-0.5 rounded">
              API Connected
            </span>
          )}
          <span className="text-[10px] bg-gray-100 text-gray-800 px-1 py-0.5 rounded">
            API {apiVersion}
          </span>
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
                <SelectValue placeholder="Choose a WooCommerce operation..." />
              </SelectTrigger>
              <SelectContent>
                {WOOCOMMERCE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="block font-medium">WordPress Site Configuration</Label>
            <div>
              <Label className="block mb-1 text-xs">Site URL</Label>
              <Input
                placeholder="https://mystore.com"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div>
              <Label className="block mb-1 text-xs">Consumer Key</Label>
              <Input
                placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div>
              <Label className="block mb-1 text-xs">Consumer Secret</Label>
              <Input
                type="password"
                placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                className="text-xs h-7"
              />
            </div>
            <div>
              <Label className="block mb-1 text-xs">API Version</Label>
              <Select
                value={apiVersion}
                onValueChange={setApiVersion}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select API version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v3">v3 (Latest)</SelectItem>
                  <SelectItem value="v2">v2 (Legacy)</SelectItem>
                  <SelectItem value="v1">v1 (Deprecated)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-1"
                onClick={testConnection}
                disabled={isTesting || !siteUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()}
                title="Test connection to your WooCommerce store"
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
              <Label className="block mb-1 font-medium">WooCommerce Resource</Label>
              <Select
                value={resource}
                onValueChange={setResource}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select resource" />
                </SelectTrigger>
                <SelectContent>
                  {WOOCOMMERCE_RESOURCES.map((res) => (
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
                            {filter.type === 'select' && 'options' in filter && filter.options?.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={filter.type}
                          placeholder={`Enter ${filter.label.toLowerCase()}`}
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
                  placeholder="0.id or name"
                  value={mapping.responseField}
                  onChange={(e) => updateVariableMapping(index, 'responseField', e.target.value)}
                  className="text-xs h-7 flex-1"
                />
                <span className="text-xs text-muted-foreground self-center">→</span>
                <Input
                  placeholder="woocommerce.order_id"
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
              Map WooCommerce response fields to flow variables for use in subsequent nodes
            </div>
          </div>

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
                <div><code>&#123;&#123;woocommerce.{resource}.data&#125;&#125;</code> - {WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.name} data</div>
                <div><code>&#123;&#123;woocommerce.response.count&#125;&#125;</code> - Number of results returned</div>
                <div><code>&#123;&#123;woocommerce.api.version&#125;&#125;</code> - API version used</div>
                <div><code>&#123;&#123;woocommerce.site.url&#125;&#125;</code> - WordPress site URL</div>
                <div><code>&#123;&#123;woocommerce.success&#125;&#125;</code> - Request success status</div>
                {resource === 'orders' && (
                  <>
                    <div><code>&#123;&#123;woocommerce.order.id&#125;&#125;</code> - Order ID</div>
                    <div><code>&#123;&#123;woocommerce.order.total&#125;&#125;</code> - Order total</div>
                    <div><code>&#123;&#123;woocommerce.order.status&#125;&#125;</code> - Order status</div>
                    <div><code>&#123;&#123;woocommerce.order.customer_id&#125;&#125;</code> - Customer ID</div>
                  </>
                )}
                {resource === 'products' && (
                  <>
                    <div><code>&#123;&#123;woocommerce.product.id&#125;&#125;</code> - Product ID</div>
                    <div><code>&#123;&#123;woocommerce.product.name&#125;&#125;</code> - Product name</div>
                    <div><code>&#123;&#123;woocommerce.product.price&#125;&#125;</code> - Product price</div>
                    <div><code>&#123;&#123;woocommerce.product.stock_quantity&#125;&#125;</code> - Stock quantity</div>
                  </>
                )}
                {resource === 'customers' && (
                  <>
                    <div><code>&#123;&#123;woocommerce.customer.id&#125;&#125;</code> - Customer ID</div>
                    <div><code>&#123;&#123;woocommerce.customer.email&#125;&#125;</code> - Customer email</div>
                    <div><code>&#123;&#123;woocommerce.customer.first_name&#125;&#125;</code> - First name</div>
                    <div><code>&#123;&#123;woocommerce.customer.last_name&#125;&#125;</code> - Last name</div>
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
              The WooCommerce Integration node connects to your WordPress/WooCommerce store's REST API.
              Response data will be available as variables in subsequent nodes.
            </p>
          </div>

          {/* Test Result Display */}
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
                  {testResult.apiVersion && (
                    <span className="text-[10px] text-blue-600">
                      API {testResult.apiVersion}
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
                    Successfully connected to WooCommerce store and retrieved {WOOCOMMERCE_RESOURCES.find(r => r.id === resource)?.name.toLowerCase()} data.
                  </div>

                  {/* Site Info */}
                  {testResult.siteInfo && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Store Information:
                      </div>
                      <div className="text-[10px] bg-gray-50 p-2 rounded">
                        <div>WooCommerce Version: {testResult.siteInfo.environment?.wc_version || 'Unknown'}</div>
                        <div>WordPress Version: {testResult.siteInfo.environment?.wp_version || 'Unknown'}</div>
                        <div>PHP Version: {testResult.siteInfo.environment?.php_version || 'Unknown'}</div>
                      </div>
                    </div>
                  )}

                  {/* Sample Response Data */}
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

      {/* Handle for connecting input edges */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Handle for connecting output edges */}
      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}