import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Play, 
  Loader2, 
  FileText, 
  Clock,
  Target,
  Zap,
  AlertCircle,
  CheckCircle,
  Copy
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SearchResult {
  content: string;
  similarity: number;
  document: {
    id: number;
    filename: string;
    originalName: string;
  };
  chunk: {
    index: number;
    tokenCount: number;
  };
}

interface TestResult {
  originalPrompt: string;
  enhancedPrompt: string;
  contextUsed: string[];
  stats: {
    chunksRetrieved: number;
    chunksUsed: number;
    averageSimilarity: number;
    retrievalDurationMs: number;
  };
}

interface KnowledgeBaseTesterProps {
  nodeId: string;
  systemPrompt?: string;
}

export function KnowledgeBaseTester({ 
  nodeId, 
  systemPrompt = 'You are a helpful assistant.' 
}: KnowledgeBaseTesterProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());


  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await apiRequest('POST', '/api/knowledge-base/search', {
        query: searchQuery,
        nodeId,
        maxResults: 5
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Search failed');
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      setSearchResults(result.data.results);
    },
    onError: (error: Error) => {
      toast({
        title: t('knowledge_base.test.search_error', 'Search failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const testMutation = useMutation({
    mutationFn: async (testQuery: string) => {
      const response = await apiRequest('POST', '/api/knowledge-base/test-query', {
        query: testQuery,
        nodeId,
        systemPrompt
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Test failed');
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      setTestResult(result.data);
    },
    onError: (error: Error) => {
      toast({
        title: t('knowledge_base.test.test_error', 'Test failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleSearch = async () => {
    if (!query.trim()) return;
    await searchMutation.mutateAsync(query);
  };

  const handleTest = async () => {
    if (!query.trim()) return;
    await testMutation.mutateAsync(query);
  };

  const toggleChunkExpansion = (index: number) => {
    const newExpanded = new Set(expandedChunks);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedChunks(newExpanded);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('common.copied', 'Copied to clipboard'),
        description: t('knowledge_base.test.prompt_copied', 'Enhanced prompt copied to clipboard')
      });
    } catch (error) {
      toast({
        title: t('common.copy_failed', 'Copy failed'),
        description: t('common.copy_failed_desc', 'Failed to copy to clipboard'),
        variant: 'destructive'
      });
    }
  };

  const formatSimilarity = (similarity: number) => {
    return (similarity * 100).toFixed(1) + '%';
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.8) return 'text-green-600 bg-green-100';
    if (similarity >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="space-y-6">
      {/* Query Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            {t('knowledge_base.test.title', 'Knowledge Base Tester')}
          </CardTitle>
          <CardDescription>
            {t('knowledge_base.test.description', 'Test how your knowledge base retrieves and enhances responses for different queries')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              {t('knowledge_base.test.query_label', 'Test Query')}
            </Label>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('knowledge_base.test.query_placeholder', 'Enter a question or query to test against your knowledge base...')}
              rows={3}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSearch}
              disabled={!query.trim() || searchMutation.isPending}
              variant="outline"
            >
              {searchMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              {t('knowledge_base.test.search_button', 'Search Only')}
            </Button>
            
            <Button
              onClick={handleTest}
              disabled={!query.trim() || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {t('knowledge_base.test.test_button', 'Test RAG Enhancement')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              {t('knowledge_base.test.search_results', 'Search Results')}
            </CardTitle>
            <CardDescription>
              {searchResults.length} {t('knowledge_base.test.chunks_found', 'relevant chunks found')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {searchResults.map((result, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{result.document.originalName}</span>
                    <Badge variant="secondary" className="text-xs">
                      Chunk {result.chunk.index + 1}
                    </Badge>
                  </div>
                  <Badge className={`text-xs ${getSimilarityColor(result.similarity)}`}>
                    {formatSimilarity(result.similarity)} match
                  </Badge>
                </div>
                
                <Collapsible>
                  <CollapsibleTrigger
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
                    onClick={() => toggleChunkExpansion(index)}
                  >
                    {expandedChunks.has(index) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    {t('knowledge_base.test.view_content', 'View content')} ({result.chunk.tokenCount} tokens)
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap">
                      {result.content}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              {t('knowledge_base.test.enhancement_results', 'RAG Enhancement Results')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{testResult.stats.chunksRetrieved}</div>
                <div className="text-sm text-blue-600">{t('knowledge_base.test.chunks_retrieved', 'Chunks Retrieved')}</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{testResult.stats.chunksUsed}</div>
                <div className="text-sm text-green-600">{t('knowledge_base.test.chunks_used', 'Chunks Used')}</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {formatSimilarity(testResult.stats.averageSimilarity)}
                </div>
                <div className="text-sm text-purple-600">{t('knowledge_base.test.avg_similarity', 'Avg Similarity')}</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{testResult.stats.retrievalDurationMs}ms</div>
                <div className="text-sm text-orange-600">{t('knowledge_base.test.retrieval_time', 'Retrieval Time')}</div>
              </div>
            </div>

            <Separator />

            {/* Original vs Enhanced Prompt */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {t('knowledge_base.test.prompt_comparison', 'Prompt Comparison')}
              </h3>
              
              {/* Original Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t('knowledge_base.test.original_prompt', 'Original System Prompt')}
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(testResult.originalPrompt)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {testResult.originalPrompt}
                </div>
                <div className="text-xs text-gray-500">
                  {testResult.originalPrompt.length} characters
                </div>
              </div>

              {/* Enhanced Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t('knowledge_base.test.enhanced_prompt', 'Enhanced System Prompt')}
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(testResult.enhancedPrompt)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {testResult.enhancedPrompt}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{testResult.enhancedPrompt.length} characters</span>
                  <span className="text-green-600">
                    +{testResult.enhancedPrompt.length - testResult.originalPrompt.length} characters added
                  </span>
                </div>
              </div>
            </div>

            {/* Context Used */}
            {testResult.contextUsed.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t('knowledge_base.test.context_used', 'Context Chunks Used')}
                </Label>
                <div className="space-y-2">
                  {testResult.contextUsed.map((context, index) => (
                    <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          Chunk {index + 1}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {context.length} characters
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap">
                        {context}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
