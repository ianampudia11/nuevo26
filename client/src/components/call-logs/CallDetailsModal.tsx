import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Star, StarOff, Download, Copy, Play, Pause, Bot, User, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: number;
}

export function CallDetailsModal({ isOpen, onClose, callId }: CallDetailsModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [notesDraft, setNotesDraft] = useState('');
  const [isStarred, setIsStarred] = useState(false);

  const { data: call, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['/api/call-logs', callId],
    queryFn: async () => {
      const response = await fetch(`/api/call-logs/${callId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Call not found');
        }
        throw new Error(`Failed to fetch call: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data.success) {
        return data.data;
      }
      throw new Error(data.error || 'Failed to fetch call');
    },
    enabled: isOpen && !!callId
  });


  useEffect(() => {
    if (call) {
      setNotesDraft(call.notes || '');
      setIsStarred(call.isStarred || false);
    }
  }, [call, callId]);


  useEffect(() => {
    if (isError && error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const is404 = errorMessage.includes('404') || errorMessage.includes('not found');
      if (is404) {
        const timer = setTimeout(() => {
          onClose();
        }, 3000); // Show error for 3 seconds before closing
        return () => clearTimeout(timer);
      }
    }
  }, [isError, error, onClose]);

  const updateCallMutation = useMutation({
    mutationFn: async (updates: { notes?: string; isStarred?: boolean }) => {
      const response = await fetch(`/api/call-logs/${callId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error(`Failed to update call: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: (data, variables) => {

      queryClient.setQueryData(['/api/call-logs', callId], data);

      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('call_logs.updated', 'Call log updated successfully.'),
      });
    }
  });

  const handleStarToggle = () => {
    const newStarredValue = !isStarred;
    setIsStarred(newStarredValue);
    updateCallMutation.mutate({ isStarred: newStarredValue });
  };

  const handleNotesSave = () => {
    updateCallMutation.mutate({ notes: notesDraft });
  };

  const handleNotesBlur = () => {

    if (call && notesDraft !== (call.notes || '')) {
      handleNotesSave();
    }
  };

  const handleDownloadTranscript = () => {
    if (!call?.transcript) return;
    const blob = new Blob([JSON.stringify(call.transcript, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-${callId}-transcript.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleCopyTranscript = () => {
    if (!call?.transcript) return;
    const text = JSON.stringify(call.transcript, null, 2);
    navigator.clipboard.writeText(text);
    toast({
      title: t('common.success', 'Success'),
      description: t('call_logs.transcript_copied', 'Transcript copied to clipboard.'),
    });
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const is404 = errorMessage.includes('404') || errorMessage.includes('not found');
    
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('call_logs.call_details', 'Call Details')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">{t('common.error', 'Error')}</h3>
              <p className="text-muted-foreground">{errorMessage}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => refetch()}>
                {t('common.retry', 'Retry')}
              </Button>
              {is404 && (
                <Button variant="outline" onClick={onClose}>
                  {t('common.close', 'Close')}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!call) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{t('call_logs.call_details', 'Call Details')}</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStarToggle}
              disabled={updateCallMutation.isPending}
            >
              {isStarred ? (
                <>
                  <Star className="h-4 w-4 mr-2 fill-yellow-400 text-yellow-400" />
                  {t('call_logs.unstar', 'Unstar')}
                </>
              ) : (
                <>
                  <StarOff className="h-4 w-4 mr-2" />
                  {t('call_logs.star', 'Star')}
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">{t('call_logs.overview', 'Overview')}</TabsTrigger>
            <TabsTrigger value="transcript">{t('call_logs.transcript', 'Transcript')}</TabsTrigger>
            {call?.metadata?.callType === 'ai-powered' && (
              <TabsTrigger value="ai-performance">{t('call_logs.ai_performance', 'AI Performance')}</TabsTrigger>
            )}
            <TabsTrigger value="recording">{t('call_logs.recording', 'Recording')}</TabsTrigger>
            <TabsTrigger value="metadata">{t('call_logs.metadata', 'Metadata')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t('call_logs.call_info', 'Call Information')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.status', 'Status')}: </span>
                    <Badge>{call.status}</Badge>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.direction', 'Direction')}: </span>
                    <Badge variant={call.direction === 'inbound' ? 'default' : 'secondary'}>
                      {call.direction}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.from', 'From')}: </span>
                    <span className="text-sm">{call.from}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.to', 'To')}: </span>
                    <span className="text-sm">{call.to}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.duration', 'Duration')}: </span>
                    <span className="text-sm">{formatDuration(call.durationSec)}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.cost', 'Cost')}: </span>
                    <span className="text-sm">
                      {call.cost ? `$${parseFloat(call.cost).toFixed(4)} ${call.costCurrency || 'USD'}` : '-'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t('call_logs.timestamps', 'Timestamps')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.started_at', 'Started At')}: </span>
                    <span className="text-sm">
                      {call.startedAt ? new Date(call.startedAt).toLocaleString() : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.ended_at', 'Ended At')}: </span>
                    <span className="text-sm">
                      {call.endedAt ? new Date(call.endedAt).toLocaleString() : '-'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {call.contact && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('call_logs.contact', 'Contact')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <span className="text-sm text-muted-foreground">{t('call_logs.name', 'Name')}: </span>
                      <span className="text-sm">{call.contact.name}</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">{t('call_logs.phone', 'Phone')}: </span>
                      <span className="text-sm">{call.contact.phone}</span>
                    </div>
                    {call.contact.email && (
                      <div>
                        <span className="text-sm text-muted-foreground">{t('call_logs.email', 'Email')}: </span>
                        <span className="text-sm">{call.contact.email}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {call.flow && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('call_logs.flow', 'Flow')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div>
                      <span className="text-sm text-muted-foreground">{t('call_logs.flow_name', 'Flow Name')}: </span>
                      <span className="text-sm">{call.flow.name}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t('call_logs.notes', 'Notes')}</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNotesSave}
                    disabled={updateCallMutation.isPending || notesDraft === (call.notes || '')}
                  >
                    {updateCallMutation.isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder={t('call_logs.notes_placeholder', 'Add notes about this call...')}
                  rows={4}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcript">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t('call_logs.transcript', 'Transcript')}</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleDownloadTranscript}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('call_logs.download', 'Download')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCopyTranscript}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t('call_logs.copy', 'Copy')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {call.transcript ? (
                  <div className="space-y-4">
                    {(() => {

                      if (typeof call.transcript === 'object' && call.transcript.turns && Array.isArray(call.transcript.turns)) {
                        return call.transcript.turns.map((turn: any, index: number) => (
                          <div 
                            key={index} 
                            className={`border-l-4 pl-4 py-2 ${
                              turn.speaker === 'user' 
                                ? 'border-blue-500 bg-blue-50/50' 
                                : 'border-green-500 bg-green-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {turn.speaker === 'user' ? (
                                <User className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Bot className="h-4 w-4 text-green-600" />
                              )}
                              <span className="font-medium text-sm">
                                {turn.speaker === 'user' ? t('call_logs.user', 'User') : t('call_logs.ai', 'AI')}
                              </span>
                              {turn.turnNumber && (
                                <Badge variant="outline" className="text-xs">
                                  Turn {turn.turnNumber}
                                </Badge>
                              )}
                              {turn.responseTime && (
                                <Badge variant="secondary" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              )}
                              {turn.confidence && (
                                <Badge 
                                  variant={turn.confidence > 0.8 ? 'default' : 'secondary'} 
                                  className="text-xs"
                                >
                                  {Math.round(turn.confidence * 100)}% confidence
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm">{turn.text}</div>
                            {turn.timestamp && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(turn.timestamp).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ));
                      }

                      else if (call.conversationData && Array.isArray(call.conversationData)) {
                        return call.conversationData.map((turn: any, index: number) => (
                          <div 
                            key={index} 
                            className={`border-l-4 pl-4 py-2 ${
                              turn.speaker === 'user' 
                                ? 'border-blue-500 bg-blue-50/50' 
                                : 'border-green-500 bg-green-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {turn.speaker === 'user' ? (
                                <User className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Bot className="h-4 w-4 text-green-600" />
                              )}
                              <span className="font-medium text-sm">
                                {turn.speaker === 'user' ? t('call_logs.user', 'User') : t('call_logs.ai', 'AI')}
                              </span>
                              {turn.turnNumber && (
                                <Badge variant="outline" className="text-xs">
                                  Turn {turn.turnNumber}
                                </Badge>
                              )}
                              {turn.responseTime && (
                                <Badge variant="secondary" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              )}
                              {turn.confidence && (
                                <Badge 
                                  variant={turn.confidence > 0.8 ? 'default' : 'secondary'} 
                                  className="text-xs"
                                >
                                  {Math.round(turn.confidence * 100)}% confidence
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm">{turn.text}</div>
                            {turn.timestamp && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(turn.timestamp).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ));
                      }

                      else if (Array.isArray(call.transcript)) {
                        return call.transcript.map((turn: any, index: number) => (
                          <div 
                            key={index} 
                            className={`border-l-4 pl-4 py-2 ${
                              turn.speaker === 'user' 
                                ? 'border-blue-500 bg-blue-50/50' 
                                : 'border-green-500 bg-green-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {turn.speaker === 'user' ? (
                                <User className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Bot className="h-4 w-4 text-green-600" />
                              )}
                              <span className="font-medium text-sm">
                                {turn.speaker === 'user' ? t('call_logs.user', 'User') : t('call_logs.ai', 'AI')}
                              </span>
                              {turn.turnNumber && (
                                <Badge variant="outline" className="text-xs">
                                  Turn {turn.turnNumber}
                                </Badge>
                              )}
                              {turn.responseTime && (
                                <Badge variant="secondary" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              )}
                              {turn.confidence && (
                                <Badge 
                                  variant={turn.confidence > 0.8 ? 'default' : 'secondary'} 
                                  className="text-xs"
                                >
                                  {Math.round(turn.confidence * 100)}% confidence
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm">{turn.text}</div>
                            {turn.timestamp && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(turn.timestamp).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ));
                      }

                      else {
                        return <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(call.transcript, null, 2)}</pre>;
                      }
                    })()}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t('call_logs.no_transcript', 'No transcript available.')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {call?.metadata?.callType === 'ai-powered' && (
            <TabsContent value="ai-performance">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      {t('call_logs.ai_metrics', 'AI Metrics')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">{t('call_logs.call_type', 'Call Type')}: </span>
                        <Badge variant="default">
                          <Bot className="h-3 w-3 mr-1" />
                          AI-Powered
                        </Badge>
                      </div>
                      {call.metadata?.elevenLabsConversationId && (
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.conversation_id', 'Conversation ID')}: </span>
                          <span className="text-sm font-mono">{call.metadata.elevenLabsConversationId}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {call.conversationData && Array.isArray(call.conversationData) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        {t('call_logs.conversation_stats', 'Conversation Statistics')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.total_turns', 'Total Turns')}: </span>
                          <span className="text-sm font-medium">{call.conversationData.length}</span>
                        </div>
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.user_turns', 'User Turns')}: </span>
                          <span className="text-sm font-medium">
                            {call.conversationData.filter((t: any) => t.speaker === 'user').length}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.ai_turns', 'AI Turns')}: </span>
                          <span className="text-sm font-medium">
                            {call.conversationData.filter((t: any) => t.speaker === 'ai').length}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.avg_response_time', 'Avg Response Time')}: </span>
                          <span className="text-sm font-medium">
                            {(() => {
                              const aiTurns = call.conversationData.filter((t: any) => t.speaker === 'ai' && t.responseTime);
                              if (aiTurns.length === 0) return '-';
                              const avg = aiTurns.reduce((sum: number, t: any) => sum + t.responseTime, 0) / aiTurns.length;
                              return `${(avg / 1000).toFixed(1)}s`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('call_logs.response_times', 'Response Times')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {call.conversationData && Array.isArray(call.conversationData) 
                        ? call.conversationData
                            .filter((turn: any) => turn.speaker === 'ai' && turn.responseTime)
                            .map((turn: any, index: number) => (
                              <div key={index} className="flex justify-between items-center">
                                <span className="text-sm">{t('call_logs.turn', 'Turn')} {turn.turnNumber || index + 1}</span>
                                <Badge variant="outline">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              </div>
                            ))
                        : <p className="text-muted-foreground text-sm">{t('call_logs.no_response_data', 'No response time data available.')}</p>
                      }
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          <TabsContent value="recording">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('call_logs.recording', 'Recording')}</CardTitle>
              </CardHeader>
              <CardContent>
                {call.recordingUrl ? (
                  <div className="space-y-4">
                    <audio controls className="w-full">
                      <source src={`/api/call-logs/${callId}/recording`} type="audio/mpeg" />
                      {t('call_logs.audio_not_supported', 'Your browser does not support the audio element.')}
                    </audio>
                    <Button variant="outline" onClick={() => {
                      window.open(`/api/call-logs/${callId}/recording`, '_blank');
                    }}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('call_logs.download_recording', 'Download Recording')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t('call_logs.no_recording', 'No recording available.')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metadata">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('call_logs.metadata', 'Metadata')}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded">
                  {JSON.stringify({
                    id: call.id,
                    twilioCallSid: call.twilioCallSid,
                    agentConfig: call.agentConfig,
                    metadata: call.metadata
                  }, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
