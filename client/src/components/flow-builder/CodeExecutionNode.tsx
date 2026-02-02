import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, Copy, Settings, Play, Loader2, Eye, EyeOff, Check, HelpCircle, X, Code, Network, AlertCircle, CheckCircle, Variable, Globe, Clock, Shield } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { standardHandleStyle } from './StyledHandle';
import { useTranslation } from '@/hooks/use-translation';

interface CodeExecutionNodeProps {
  id: string;
  data: {
    label: string;
    code?: string;
    timeout?: number; // ms
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

const TEMPLATES = {
  api: `const response = await fetch('https://api.example.com/data');
const data = await response.json();
variables.result = data;`,
  conditional: `if (variables.score > 80) {
  variables.result = "Pass";
} else {
  variables.result = "Fail";
}`,
  trycatch: `try {
  const res = await fetch('https://api.example.com/user');
  const user = await res.json();
  variables.user = user;
} catch (err) {
  variables.error = 'Failed to fetch user data';
}`,
  wikipedia: `const query = variables.query || "Pakistan";

const url = \`https://en.wikipedia.org/api/rest_v1/page/summary/\${encodeURIComponent(query)}\`;

const response = await fetch(url);
if (!response.ok) {
  throw new Error(\`Wikipedia API error: \${response.status}\`);
}

const data = await response.json();

variables.wiki_summary = data.extract || "Sorry, I couldn't find info on that.";`
};

export function CodeExecutionNode({ id, data, isConnectable }: CodeExecutionNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [code, setCode] = useState<string>(data.code || '');
  const [timeout, setTimeoutMs] = useState<number>(typeof data.timeout === 'number' ? data.timeout : 5000);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; result?: any; variables?: any } | null>(null);
  const [copied, setCopied] = useState(false);

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
    updateNodeData({ code, timeout });
  }, [updateNodeData, code, timeout]);

  const applyTemplate = (templateKey: keyof typeof TEMPLATES) => {
    setCode(TEMPLATES[templateKey]);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const runLocalLint = () => {
    if (!code.trim()) {
      setTestResult({ success: false, error: 'Code is empty' });
      return false;
    }
    setTestResult(null);
    return true;
  };

  const testExecution = async () => {
    if (!runLocalLint()) return;
    setIsTesting(true);
    try {
      const res = await fetch('/api/flows/test-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, timeout, variables: {} })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTestResult({ success: false, error: data.error || `HTTP ${res.status}` });
      } else {
        setTestResult({ success: true, result: data.result, variables: data.variables });
      }
    } catch (e: any) {
      setTestResult({ success: false, error: e?.message || 'Unknown error' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="node-code-execution rounded-lg bg-card border border-border shadow-sm max-w-[380px] group relative">
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
              <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
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
              <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="p-3 border-b bg-muted/60">
        <div className="font-medium flex items-center gap-2">
          <img 
            src="https://cdn-icons-png.flaticon.com/128/4205/4205106.png" 
            alt="Code Execution" 
            className="h-4 w-4"
          />
          <span>{t('flow_builder.code_execution', 'Code Execution')}</span>
          <div className="ml-auto flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogPrimitive.Portal>
                      <DialogPrimitive.Content
                        className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden"
                      >
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Code className="h-5 w-5 text-primary" />
                            Code Execution Node - Help & Documentation
                          </DialogTitle>
                          <DialogDescription>
                            Learn how to execute custom JavaScript code in your flows
                          </DialogDescription>
                        </DialogHeader>
                        <CodeExecutionHelpContent />
                        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                          <X className="h-4 w-4" />
                        </DialogPrimitive.Close>
                      </DialogPrimitive.Content>
                    </DialogPrimitive.Portal>
                  </Dialog>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Help & Documentation</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
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
        </div>
      </div>

      <div className={`${isEditing ? 'max-h-[520px]' : 'max-h-[220px]'} overflow-y-auto custom-scrollbar`}>
        <div className="p-3 space-y-3">
          <div className="text-sm p-3  rounded border border-border">
            <div className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate">Async JavaScript • variables + fetch available</span>
            </div>
            <div className="mt-2 text-xs text-primary font-medium">
              Output: <code 
                className="bg-primary/10 px-1 rounded cursor-pointer hover:bg-primary/20 transition-colors"
                onClick={() => copyToClipboard('code_execution_output')}
                title="Click to copy"
              >
                code_execution_output
              </code>
              {copied && (
                <span className="ml-2 text-primary flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Copied!
                </span>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="text-xs space-y-3 border rounded p-2 ">
              <div>
                <Label className="block mb-1 font-medium">Timeout (ms)</Label>
                <Input
                  type="number"
                  min={100}
                  max={30000}
                  step={100}
                  value={timeout}
                  onChange={(e) => setTimeoutMs(Math.max(100, Math.min(30000, Number(e.target.value) || 0)))}
                  className="text-xs h-7 w-32"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="font-medium">Code</Label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('api')}>API</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('conditional')}>If/Else</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('trycatch')}>Try/Catch</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => applyTemplate('wikipedia')}>Wikipedia</Button>
                  </div>
                </div>
                <Textarea
                  placeholder={"// You can use 'variables' and 'fetch' here.\n// Example: variables.order = 'invoice_number'"}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-xs min-h-[160px] resize-y font-mono"
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Runs in a secure sandbox with async/await. Use variables to pass data downstream.
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={testExecution}
                  disabled={isTesting || !code.trim()}
                >
                  {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                </Button>
                {testResult && (
                  <span className={`text-[10px] ${testResult.success ? 'text-primary' : 'text-destructive'}`}>
                    {testResult.success ? 'Success' : (testResult.error || 'Error')}
                  </span>
                )}
              </div>
              {testResult?.success && (
                <div className="mt-2 text-[10px] bg-muted border p-2 rounded font-mono max-h-40 overflow-y-auto">
                  <div className="mb-1 text-xs font-medium">Result</div>
                  <pre className="whitespace-pre-wrap">{JSON.stringify(testResult.result, null, 2)}</pre>
                  <div className="mt-2 mb-1 text-xs font-medium">Variables</div>
                  <pre className="whitespace-pre-wrap">{JSON.stringify(testResult.variables, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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

function CodeExecutionHelpContent() {
  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* Node Overview */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            Node Overview
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              The <strong>Code Execution Node</strong> allows you to run custom JavaScript code within your flows.
              It provides a secure sandbox environment where you can execute complex logic, make API calls,
              and manipulate data using modern JavaScript features like async/await.
            </p>
            <p className="text-sm text-foreground">
              <strong>Key Benefits:</strong> Custom business logic, API integrations, data transformation,
              conditional processing, and dynamic content generation.
            </p>
          </div>
        </section>

        {/* Available APIs */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            Available APIs & Variables
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Variable className="h-3 w-3" />
                Variables Object
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Access and modify flow variables using the <code className="bg-muted px-1 rounded">variables</code> object.
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>Reading:</strong> const name = variables.user_name;</div>
                <div><strong>Writing:</strong> variables.result = "Hello World";</div>
                <div><strong>Updating:</strong> variables.counter = (variables.counter || 0) + 1;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Globe className="h-3 w-3" />
                Fetch API
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Make HTTP requests to external APIs using the standard fetch API.
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>GET Request:</strong></div>
                <div>const response = await fetch('https://api.example.com/data');</div>
                <div>const data = await response.json();</div>
                <div><strong>POST Request:</strong></div>
                <div>const response = await fetch('https://api.example.com/data', &#123;</div>
                <div>  method: 'POST',</div>
                <div>  headers: &#123; 'Content-Type': 'application/json' &#125;,</div>
                <div>  body: JSON.stringify(&#123; key: 'value' &#125;)</div>
                <div>&#125;);</div>
              </div>
            </div>
          </div>
        </section>

        {/* Security & Sandbox */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Security & Sandbox
          </h3>
          <div className="space-y-3">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">✅ What's Allowed</h4>
              <ul className="text-xs text-primary space-y-1">
                <li>• Standard JavaScript (ES6+) features</li>
                <li>• Async/await for asynchronous operations</li>
                <li>• HTTP requests via fetch API</li>
                <li>• JSON parsing and manipulation</li>
                <li>• String, array, and object operations</li>
                <li>• Mathematical calculations</li>
              </ul>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-destructive">❌ What's Restricted</h4>
              <ul className="text-xs text-destructive space-y-1">
                <li>• File system access</li>
                <li>• Network access beyond fetch</li>
                <li>• Process manipulation</li>
                <li>• Environment variables</li>
                <li>• Node.js specific modules</li>
                <li>• eval() and similar functions</li>
              </ul>
            </div>
          </div>
        </section>

        <Separator />

        {/* Output System */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Variable className="h-4 w-4 text-primary" />
            Output System
          </h3>
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">How Output Works</h4>
              <p className="text-xs text-foreground mb-2">
                All variables you create in your code are automatically saved and made available to other nodes
                through the <code className="bg-muted px-1 rounded">code_execution_output</code> variable.
              </p>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div><strong>In Code Execution Node:</strong></div>
                <div>variables.wiki_summary = "Pakistan is a country...";</div>
                <div>variables.user_score = 95;</div>
                <br/>
                <div><strong>In Next Node (Message):</strong></div>
                <div>Summary: &#123;&#123;code_execution_output.wiki_summary&#125;&#125;</div>
                <div>Score: &#123;&#123;code_execution_output.user_score&#125;&#125;</div>
              </div>
            </div>
          </div>
        </section>

        {/* Configuration Options */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Configuration Options
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <Clock className="h-3 w-3 text-primary" />
                Execution Timeout
              </h4>
              <p className="text-xs text-muted-foreground">
                Set the maximum execution time in milliseconds (100ms - 30,000ms).
                Code that runs longer will be automatically terminated.
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-primary" />
                Test Code Feature
              </h4>
              <p className="text-xs text-muted-foreground">
                Use the Test button to execute your code in a safe environment and see the results
                before deploying to your flow.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Code Templates */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            Code Templates
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-primary/10">
              <h4 className="font-medium text-sm mb-2">API Call Template</h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>const response = await fetch('https://api.example.com/data');</div>
                <div>const data = await response.json();</div>
                <div>variables.result = data;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-primary/10">
              <h4 className="font-medium text-sm mb-2">Conditional Logic Template</h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>if (variables.score &gt; 80) &#123;</div>
                <div>  variables.result = "Pass";</div>
                <div>&#125; else &#123;</div>
                <div>  variables.result = "Fail";</div>
                <div>&#125;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-secondary/10">
              <h4 className="font-medium text-sm mb-2">Error Handling Template</h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>try &#123;</div>
                <div>  const res = await fetch('https://api.example.com/user');</div>
                <div>  const user = await res.json();</div>
                <div>  variables.user = user;</div>
                <div>&#125; catch (err) &#123;</div>
                <div>  variables.error = 'Failed to fetch user data';</div>
                <div>&#125;</div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-primary/10">
              <h4 className="font-medium text-sm mb-2">Wikipedia API Template</h4>
              <div className="bg-card rounded p-2 text-xs font-mono">
                <div>const query = variables.query || "Pakistan";</div>
                <div>const url = `https://en.wikipedia.org/api/rest_v1/page/summary/$&#123;encodeURIComponent(query)&#125;`;</div>
                <div>const response = await fetch(url);</div>
                <div>if (!response.ok) &#123;</div>
                <div>  throw new Error(`Wikipedia API error: $&#123;response.status&#125;`);</div>
                <div>&#125;</div>
                <div>const data = await response.json();</div>
                <div>variables.wiki_summary = data.extract || "Sorry, I couldn't find info on that.";</div>
              </div>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            Best Practices & Tips
          </h3>
          <div className="space-y-3">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">✅ Do's</h4>
              <ul className="text-xs text-primary space-y-1">
                <li>• Use descriptive variable names (user_data, api_response, processed_result)</li>
                <li>• Always handle errors with try/catch blocks</li>
                <li>• Test your code using the Test button before deploying</li>
                <li>• Use appropriate timeouts for API calls</li>
                <li>• Validate API responses before using the data</li>
                <li>• Use async/await for cleaner asynchronous code</li>
              </ul>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-destructive">❌ Don'ts</h4>
              <ul className="text-xs text-destructive space-y-1">
                <li>• Don't write infinite loops or blocking code</li>
                <li>• Don't make synchronous calls that could timeout</li>
                <li>• Don't store sensitive data in variables</li>
                <li>• Don't make too many API calls in a single execution</li>
                <li>• Don't ignore error handling</li>
              </ul>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">💡 Pro Tips</h4>
              <ul className="text-xs text-primary space-y-1">
                <li>• Use the Test button to debug your code before deploying</li>
                <li>• Click on "code_execution_output" to copy the variable name</li>
                <li>• Use templates as starting points for common scenarios</li>
                <li>• Check the console logs for debugging information</li>
                <li>• Use the Variables tab to see all available flow variables</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

export default CodeExecutionNode;


