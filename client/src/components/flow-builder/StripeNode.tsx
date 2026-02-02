import { useState, useCallback, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { 
  DollarSign, 
  Users, 
  Repeat, 
  TrendingUp, 
  Copy, 
  Trash2, 
  Eye, 
  EyeOff, 
  Play, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Plus, 
  X, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';

interface MetadataEntry {
  key: string;
  value: string;
}

interface StripeNodeProps {
  id: string;
  data: {
    label: string;
    apiKey?: string;
    resource?: 'customer' | 'payment' | 'subscription' | 'balance';
    operation?: string;
    amountFormat?: 'cents' | 'decimal';
    metadata?: MetadataEntry[];

    email?: string;
    name?: string;
    phone?: string;
    customerId?: string;

    amount?: string;
    currency?: string;
    customer?: string;
    source?: string;
    paymentMethod?: string;
    description?: string;
    charge?: string;
    paymentIntent?: string;

    subscriptionId?: string;
    priceId?: string;
    plan?: string;

    limit?: string;
    startingAfter?: string;
  };
  isConnectable: boolean;
}

const OPERATION_TEMPLATES = [
  {
    id: 'create_customer',
    name: 'Create Customer',
    resource: 'customer' as const,
    operation: 'create',
    fields: {
      email: '{{contact.email}}',
      name: '{{contact.name}}',
      phone: '{{contact.phone}}'
    }
  },
  {
    id: 'process_payment',
    name: 'Process Payment',
    resource: 'payment' as const,
    operation: 'createPaymentIntent',
    fields: {
      amount: '{{payment.amount}}',
      currency: 'usd',
      customer: '{{stripe.customerId}}'
    }
  },
  {
    id: 'create_subscription',
    name: 'Create Subscription',
    resource: 'subscription' as const,
    operation: 'create',
    fields: {
      customer: '{{stripe.customerId}}',
      priceId: '{{stripe.priceId}}'
    }
  },
  {
    id: 'refund_payment',
    name: 'Refund Payment',
    resource: 'payment' as const,
    operation: 'refund',
    fields: {
      paymentIntent: '{{stripe.paymentIntentId}}'
    }
  },
  {
    id: 'get_balance',
    name: 'Get Balance',
    resource: 'balance' as const,
    operation: 'getBalance',
    fields: {}
  },
  {
    id: 'cancel_subscription',
    name: 'Cancel Subscription',
    resource: 'subscription' as const,
    operation: 'cancel',
    fields: {
      subscriptionId: '{{stripe.subscriptionId}}'
    }
  }
];

const RESOURCE_OPERATIONS: Record<string, string[]> = {
  customer: ['create', 'get', 'update', 'delete'],
  payment: ['createCharge', 'createPaymentIntent', 'refund'],
  subscription: ['create', 'get', 'update', 'cancel'],
  balance: ['getBalance', 'listTransactions']
};

const CURRENCIES = [
  'usd', 'eur', 'gbp', 'cad', 'aud', 'jpy', 'chf', 'cny', 'inr', 'brl',
  'mxn', 'sgd', 'hkd', 'nzd', 'sek', 'nok', 'dkk', 'pln', 'czk', 'huf'
];

export function StripeNode({ id, data, isConnectable }: StripeNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [resource, setResource] = useState<'customer' | 'payment' | 'subscription' | 'balance'>(data.resource || 'customer');
  const [operation, setOperation] = useState(data.operation || 'create');
  const [amountFormat, setAmountFormat] = useState<'cents' | 'decimal'>(data.amountFormat || 'cents');
  

  const [email, setEmail] = useState(data.email || '');
  const [name, setName] = useState(data.name || '');
  const [phone, setPhone] = useState(data.phone || '');
  const [customerId, setCustomerId] = useState(data.customerId || '');
  

  const [amount, setAmount] = useState(data.amount || '');
  const [currency, setCurrency] = useState(data.currency || 'usd');
  const [customer, setCustomer] = useState(data.customer || '');
  const [source, setSource] = useState(data.source || '');
  const [paymentMethod, setPaymentMethod] = useState(data.paymentMethod || '');
  const [description, setDescription] = useState(data.description || '');
  const [charge, setCharge] = useState(data.charge || '');
  const [paymentIntent, setPaymentIntent] = useState(data.paymentIntent || '');
  

  const [subscriptionId, setSubscriptionId] = useState(data.subscriptionId || '');
  const [priceId, setPriceId] = useState(data.priceId || '');
  const [plan, setPlan] = useState(data.plan || '');
  

  const [limit, setLimit] = useState(data.limit || '');
  const [startingAfter, setStartingAfter] = useState(data.startingAfter || '');
  
  const [metadata, setMetadata] = useState<MetadataEntry[]>(data.metadata || []);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
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
      apiKey,
      resource,
      operation,
      amountFormat,
      metadata,
      email,
      name,
      phone,
      customerId,
      amount,
      currency,
      customer,
      source,
      paymentMethod,
      description,
      charge,
      paymentIntent,
      subscriptionId,
      priceId,
      plan,
      limit,
      startingAfter
    });
  }, [
    updateNodeData,
    apiKey,
    resource,
    operation,
    amountFormat,
    metadata,
    email,
    name,
    phone,
    customerId,
    amount,
    currency,
    customer,
    source,
    paymentMethod,
    description,
    charge,
    paymentIntent,
    subscriptionId,
    priceId,
    plan,
    limit,
    startingAfter
  ]);

  const addMetadata = () => {
    setMetadata([...metadata, { key: '', value: '' }]);
  };

  const removeMetadata = (index: number) => {
    setMetadata(metadata.filter((_, i) => i !== index));
  };

  const updateMetadata = (index: number, field: 'key' | 'value', value: string) => {
    const newMetadata = [...metadata];
    newMetadata[index][field] = value;
    setMetadata(newMetadata);
  };

  const applyTemplate = (templateId: string) => {
    const template = OPERATION_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setResource(template.resource);
      setOperation(template.operation);
      Object.entries(template.fields).forEach(([key, value]) => {
        switch (key) {
          case 'email':
            setEmail(value);
            break;
          case 'name':
            setName(value);
            break;
          case 'phone':
            setPhone(value);
            break;
          case 'customerId':
            setCustomerId(value);
            break;
          case 'amount':
            setAmount(value);
            break;
          case 'currency':
            setCurrency(value);
            break;
          case 'customer':
            setCustomer(value);
            break;
          case 'source':
            setSource(value);
            break;
          case 'paymentMethod':
            setPaymentMethod(value);
            break;
          case 'description':
            setDescription(value);
            break;
          case 'charge':
            setCharge(value);
            break;
          case 'paymentIntent':
            setPaymentIntent(value);
            break;
          case 'subscriptionId':
            setSubscriptionId(value);
            break;
          case 'priceId':
            setPriceId(value);
            break;
          case 'plan':
            setPlan(value);
            break;
        }
      });
    }
  };

  const getOperationColor = (op: string) => {
    if (op.includes('create') || op === 'create') return 'text-green-600';
    if (op === 'get' || op === 'getBalance' || op === 'listTransactions') return 'text-green-600';
    if (op.includes('update') || op === 'update') return 'text-orange-600';
    if (op.includes('delete') || op === 'delete' || op === 'cancel' || op === 'refund') return 'text-red-600';
    return 'text-muted-foreground';
  };

  const getResourceIcon = (res: string) => {
    switch (res) {
      case 'customer':
        return <Users className="h-3.5 w-3.5" />;
      case 'payment':
        return <DollarSign className="h-3.5 w-3.5" />;
      case 'subscription':
        return <Repeat className="h-3.5 w-3.5" />;
      case 'balance':
        return <TrendingUp className="h-3.5 w-3.5" />;
      default:
        return <img src="https://cdn.activepieces.com/pieces/stripe.png" alt="Stripe" className="h-3.5 w-3.5" />;
    }
  };

  const getOperationsForResource = (res: string): string[] => {
    return RESOURCE_OPERATIONS[res] || [];
  };

  const testStripeConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter your Stripe API key'
      });
      setShowTestResult(true);
      return;
    }


    let validationError = '';
    if (resource === 'customer' && operation === 'create' && !email.trim()) {
      validationError = 'Email is required for creating a customer';
    } else if (resource === 'customer' && (operation === 'get' || operation === 'update' || operation === 'delete') && !customerId.trim()) {
      validationError = 'Customer ID is required for this operation';
    } else if (resource === 'payment' && (operation === 'createCharge' || operation === 'createPaymentIntent') && !amount.trim()) {
      validationError = 'Amount is required for payment operations';
    } else if (resource === 'payment' && operation === 'refund' && !charge.trim() && !paymentIntent.trim()) {
      validationError = 'Charge ID or Payment Intent ID is required for refund';
    } else if (resource === 'subscription' && operation === 'create' && (!customer.trim() || (!priceId.trim() && !plan.trim()))) {
      validationError = 'Customer ID and Price ID or Plan are required for creating a subscription';
    } else if (resource === 'subscription' && (operation === 'get' || operation === 'update' || operation === 'cancel') && !subscriptionId.trim()) {
      validationError = 'Subscription ID is required for this operation';
    }

    if (validationError) {
      setTestResult({
        success: false,
        error: validationError
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const testPayload = {
        apiKey,
        resource,
        operation,
        amountFormat,
        metadata: metadata.filter(m => m.key && m.value),
        email,
        name,
        phone,
        customerId,
        amount,
        currency,
        customer,
        source,
        paymentMethod,
        description,
        charge,
        paymentIntent,
        subscriptionId,
        priceId,
        plan,
        limit,
        startingAfter
      };

      const response = await fetch('/api/test-stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testPayload)
      });

      const responseData = await response.json();

      if (response.ok) {
        setTestResult({
          success: true,
          data: responseData
        });
      } else {
        setTestResult({
          success: false,
          error: responseData.error || responseData.message || 'Test request failed'
        });
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        error: error.message || 'Connection failed'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const renderConfigurationFields = () => {
    if (resource === 'customer') {
      return (
        <div className="space-y-2 pt-2 border-t">
          <Label className="block mb-2 font-medium">Customer Configuration</Label>
          {(operation === 'get' || operation === 'update' || operation === 'delete') && (
            <div>
              <Label className="block mb-1 text-xs">Customer ID</Label>
              <EnhancedVariablePicker
                value={customerId}
                onChange={setCustomerId}
                placeholder="cus_xxxxxxxxxxxxx or {{variable}}"
                className="text-xs h-7"
              />
            </div>
          )}
          {(operation === 'create' || operation === 'update') && (
            <>
              <div>
                <Label className="block mb-1 text-xs">Email</Label>
                <EnhancedVariablePicker
                  value={email}
                  onChange={setEmail}
                  placeholder="customer@example.com or {{contact.email}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">Name</Label>
                <EnhancedVariablePicker
                  value={name}
                  onChange={setName}
                  placeholder="Customer Name or {{contact.name}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">Phone</Label>
                <EnhancedVariablePicker
                  value={phone}
                  onChange={setPhone}
                  placeholder="+1234567890 or {{contact.phone}}"
                  className="text-xs h-7"
                />
              </div>
            </>
          )}
        </div>
      );
    }

    if (resource === 'payment') {
      return (
        <div className="space-y-2 pt-2 border-t">
          <Label className="block mb-2 font-medium">Payment Configuration</Label>
          {operation === 'refund' ? (
            <>
              <div>
                <Label className="block mb-1 text-xs">Charge ID or Payment Intent ID</Label>
                <EnhancedVariablePicker
                  value={charge || paymentIntent}
                  onChange={(value) => {
                    if (value.includes('ch_')) {
                      setCharge(value);
                      setPaymentIntent('');
                    } else if (value.includes('pi_')) {
                      setPaymentIntent(value);
                      setCharge('');
                    } else {
                      setCharge(value);
                    }
                  }}
                  placeholder="ch_xxxxxxxxxxxxx or pi_xxxxxxxxxxxxx"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">Refund Amount (optional)</Label>
                <div className="flex gap-2">
                  <EnhancedVariablePicker
                    value={amount}
                    onChange={setAmount}
                    placeholder={amountFormat === 'decimal' ? '10.00' : '1000'}
                    className="text-xs h-7 flex-1"
                  />
                  {amountFormat === 'decimal' && (
                    <span className="text-xs text-muted-foreground self-center">Enter 10.00 for $10.00</span>
                  )}
                  {amountFormat === 'cents' && (
                    <span className="text-xs text-muted-foreground self-center">Enter 1000 for $10.00</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="block mb-1 text-xs">Amount</Label>
                <div className="flex gap-2">
                  <EnhancedVariablePicker
                    value={amount}
                    onChange={setAmount}
                    placeholder={amountFormat === 'decimal' ? '10.00' : '1000'}
                    className="text-xs h-7 flex-1"
                  />
                  {amountFormat === 'decimal' && (
                    <span className="text-xs text-muted-foreground self-center">Enter 10.00 for $10.00</span>
                  )}
                  {amountFormat === 'cents' && (
                    <span className="text-xs text-muted-foreground self-center">Enter 1000 for $10.00</span>
                  )}
                </div>
              </div>
              <div>
                <Label className="block mb-1 text-xs">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((curr) => (
                      <SelectItem key={curr} value={curr}>
                        {curr.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="block mb-1 text-xs">Customer ID (optional)</Label>
                <EnhancedVariablePicker
                  value={customer}
                  onChange={setCustomer}
                  placeholder="cus_xxxxxxxxxxxxx or {{stripe.customerId}}"
                  className="text-xs h-7"
                />
              </div>
              {operation === 'createCharge' && (
                <div>
                  <Label className="block mb-1 text-xs">Stripe Source/Token</Label>
                  <EnhancedVariablePicker
                    value={source}
                    onChange={setSource}
                    placeholder="tok_xxxxxxxxxxxxx or {{stripe.source}}"
                    className="text-xs h-7"
                  />
                </div>
              )}
              <div>
                <Label className="block mb-1 text-xs">Payment Method (optional)</Label>
                <EnhancedVariablePicker
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  placeholder="pm_xxxxxxxxxxxxx or {{stripe.paymentMethodId}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">Description (optional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Payment description"
                  className="text-xs h-7"
                />
              </div>
            </>
          )}
        </div>
      );
    }

    if (resource === 'subscription') {
      return (
        <div className="space-y-2 pt-2 border-t">
          <Label className="block mb-2 font-medium">Subscription Configuration</Label>
          {operation === 'create' ? (
            <>
              <div>
                <Label className="block mb-1 text-xs">Customer ID</Label>
                <EnhancedVariablePicker
                  value={customer}
                  onChange={setCustomer}
                  placeholder="cus_xxxxxxxxxxxxx or {{stripe.customerId}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">Price ID or Plan</Label>
                <EnhancedVariablePicker
                  value={priceId || plan}
                  onChange={(value) => {
                    if (value.startsWith('price_')) {
                      setPriceId(value);
                      setPlan('');
                    } else {
                      setPlan(value);
                      setPriceId('');
                    }
                  }}
                  placeholder="price_xxxxxxxxxxxxx or plan name"
                  className="text-xs h-7"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="block mb-1 text-xs">Subscription ID</Label>
                <EnhancedVariablePicker
                  value={subscriptionId}
                  onChange={setSubscriptionId}
                  placeholder="sub_xxxxxxxxxxxxx or {{stripe.subscriptionId}}"
                  className="text-xs h-7"
                />
              </div>
              {operation === 'update' && (
                <div>
                  <Label className="block mb-1 text-xs">New Price ID (optional)</Label>
                  <EnhancedVariablePicker
                    value={priceId}
                    onChange={setPriceId}
                    placeholder="price_xxxxxxxxxxxxx"
                    className="text-xs h-7"
                  />
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    if (resource === 'balance') {
      return (
        <div className="space-y-2 pt-2 border-t">
          <Label className="block mb-2 font-medium">Balance Configuration</Label>
          {operation === 'listTransactions' && (
            <>
              <div>
                <Label className="block mb-1 text-xs">Limit</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="10"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">Starting After (optional)</Label>
                <EnhancedVariablePicker
                  value={startingAfter}
                  onChange={setStartingAfter}
                  placeholder="Transaction ID"
                  className="text-xs h-7"
                />
              </div>
            </>
          )}
        </div>
      );
    }

    return null;
  };

  const renderAmountFormatToggle = () => {
    return (
      <div className="pt-2 border-t">
        <Label className="block mb-2 font-medium">Amount Format</Label>
        <div className="flex items-center space-x-2">
          <Switch
            id="amount-format"
            checked={amountFormat === 'decimal'}
            onCheckedChange={(checked) => setAmountFormat(checked ? 'decimal' : 'cents')}
          />
          <Label htmlFor="amount-format" className="text-xs">
            {amountFormat === 'decimal' ? 'Decimal (e.g., 10.00)' : 'Cents (Stripe native)'}
          </Label>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {amountFormat === 'decimal' 
            ? 'Enter amounts in decimal format (10.00 for $10.00). Will be converted to cents automatically.'
            : 'Enter amounts in cents (1000 for $10.00). This is Stripe\'s native format.'}
        </p>
      </div>
    );
  };

  const renderMetadataEditor = () => {
    return (
      <div className="space-y-2 mt-2">
        {metadata.map((entry, index) => (
          <div key={index} className="flex gap-2 items-center">
            <div className="flex-1">
              <EnhancedVariablePicker
                value={entry.key}
                onChange={(value) => updateMetadata(index, 'key', value)}
                placeholder="Metadata key"
                className="text-xs h-7"
              />
            </div>
            <div className="flex-1">
              <EnhancedVariablePicker
                value={entry.value}
                onChange={(value) => updateMetadata(index, 'value', value)}
                placeholder="Metadata value"
                className="text-xs h-7"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => removeMetadata(index)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={addMetadata}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Metadata
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Add custom metadata to track additional information
        </p>
      </div>
    );
  };

  const renderVariablePreview = () => {
    return (
      <div className="mt-2 text-[10px] text-muted-foreground p-2 rounded space-y-1">
        <div><code>&#123;&#123;stripe.lastResponse&#125;&#125;</code> - Full API response object</div>
        <div><code>&#123;&#123;stripe.response.data&#125;&#125;</code> - Response data</div>
        <div><code>&#123;&#123;stripe.response.timestamp&#125;&#125;</code> - Execution timestamp</div>
        <div><code>&#123;&#123;stripe.operation&#125;&#125;</code> - Operation executed</div>
        <div><code>&#123;&#123;stripe.resource&#125;&#125;</code> - Resource type</div>
        <div><code>&#123;&#123;stripe.idempotencyKey&#125;&#125;</code> - Generated idempotency key</div>
        <div><code>&#123;&#123;stripe.error&#125;&#125;</code> - Error details (if error occurred)</div>
        <div><code>&#123;&#123;stripe.errorMessageSent&#125;&#125;</code> - Boolean flag if error message was sent</div>
        {resource === 'customer' && (
          <>
            <div><code>&#123;&#123;stripe.id&#125;&#125;</code> - Customer ID</div>
            <div><code>&#123;&#123;stripe.email&#125;&#125;</code> - Customer email</div>
            <div><code>&#123;&#123;stripe.name&#125;&#125;</code> - Customer name</div>
          </>
        )}
        {resource === 'payment' && (
          <>
            <div><code>&#123;&#123;stripe.id&#125;&#125;</code> - Payment/Charge ID</div>
            <div><code>&#123;&#123;stripe.amount&#125;&#125;</code> - Payment amount</div>
            <div><code>&#123;&#123;stripe.currency&#125;&#125;</code> - Payment currency</div>
            <div><code>&#123;&#123;stripe.status&#125;&#125;</code> - Payment status</div>
          </>
        )}
        {resource === 'subscription' && (
          <>
            <div><code>&#123;&#123;stripe.id&#125;&#125;</code> - Subscription ID</div>
            <div><code>&#123;&#123;stripe.status&#125;&#125;</code> - Subscription status</div>
            <div><code>&#123;&#123;stripe.customerId&#125;&#125;</code> - Customer ID</div>
          </>
        )}
        {resource === 'balance' && (
          <>
            <div><code>&#123;&#123;stripe.available&#125;&#125;</code> - Available balance</div>
            <div><code>&#123;&#123;stripe.pending&#125;&#125;</code> - Pending balance</div>
            <div><code>&#123;&#123;stripe.currency&#125;&#125;</code> - Balance currency</div>
          </>
        )}
      </div>
    );
  };

  const renderTestResults = () => {
    if (!testResult) return null;

    return (
      <div className="mt-3 border rounded p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span className="text-xs font-medium">
              {testResult.success ? 'Test Successful' : 'Test Failed'}
            </span>
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
              Successfully connected to Stripe and executed {operation} operation on {resource}.
            </div>
            {testResult.data && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Response Data:
                </div>
                <div className="text-[10px] bg-gray-50 p-2 rounded font-mono max-h-32 overflow-y-auto">
                  {JSON.stringify(testResult.data, null, 2)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="node-stripe p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
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
        <img 
          src="https://cdn.activepieces.com/pieces/stripe.png" 
          alt="Stripe" 
          className="h-4 w-4"
        />
        <span>Stripe</span>
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

      <div className="text-sm p-2 rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          {getResourceIcon(resource)}
          <span className={cn("font-medium", getOperationColor(operation))}>{operation}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">{resource}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {apiKey && (
            <Badge className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
              API Connected
            </Badge>
          )}
          {metadata.length > 0 && (
            <Badge className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
              {metadata.length} metadata
            </Badge>
          )}
          {amountFormat === 'decimal' && (
            <Badge className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
              Decimal Format
            </Badge>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2">
          <div>
            <Label className="block mb-1 font-medium">Quick Templates</Label>
            <Select value="" onValueChange={applyTemplate}>
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {OPERATION_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 text-xs">Stripe API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_test_... or sk_live_..."
              className="text-xs h-7"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Supports both test and live keys
            </p>
          </div>

          <div>
            <Label className="block mb-1 font-medium">Resource Type</Label>
            <Select value={resource} onValueChange={(value) => {
              setResource(value as typeof resource);
              const ops = getOperationsForResource(value);
              if (ops.length > 0) {
                setOperation(ops[0]);
              }
            }}>
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Select resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="balance">Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium">Operation</Label>
            <Select value={operation} onValueChange={setOperation}>
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                {getOperationsForResource(resource).map((op) => (
                  <SelectItem key={op} value={op}>
                    <span className={getOperationColor(op)}>{op}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {renderConfigurationFields()}

          {resource === 'payment' && renderAmountFormatToggle()}

          <Collapsible open={showMetadata} onOpenChange={setShowMetadata}>
            <CollapsibleTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 w-full">
              Custom Metadata
              {showMetadata ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {renderMetadataEditor()}
            </CollapsibleContent>
          </Collapsible>

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 w-full"
            onClick={testStripeConnection}
            disabled={isTesting || !apiKey}
          >
            {isTesting ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            Test Configuration
          </Button>

          {showTestResult && testResult && renderTestResults()}

          <Collapsible open={showVariablePreview} onOpenChange={setShowVariablePreview}>
            <CollapsibleTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 w-full">
              Available Output Variables
              {showVariablePreview ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {renderVariablePreview()}
            </CollapsibleContent>
          </Collapsible>

          <p className="text-[10px] text-muted-foreground">
            This is a terminal node. Flow execution stops after Stripe operation completes.
            All response data is stored in variables for reference.
          </p>
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
