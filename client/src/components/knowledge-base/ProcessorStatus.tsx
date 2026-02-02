import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  AlertCircle, 
  FileText, 
  File, 
  Download,
  RefreshCw,
  Info
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ProcessorCapabilities {
  processors: {
    pdf: boolean;
    pdfAdvanced: boolean;
    docx: boolean;
    doc: boolean;
  };
  supportedMimeTypes: string[];
  recommendations: {
    pdf: string;
    docx: string;
    doc: string;
    pdfAdvanced: string;
  };
}

interface ProcessorStatusProps {
  showInstallInstructions?: boolean;
  compact?: boolean;
}

export function ProcessorStatus({ 
  showInstallInstructions = true, 
  compact = false 
}: ProcessorStatusProps) {
  const { t } = useTranslation();

  const { data: capabilities, isLoading, error, refetch } = useQuery({
    queryKey: ['knowledge-base-capabilities'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/knowledge-base/capabilities');
      const result = await response.json();
      return result.data as ProcessorCapabilities;
    }
  });

  const getProcessorIcon = (available: boolean) => {
    return available ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <AlertCircle className="w-4 h-4 text-orange-500" />
    );
  };

  const getProcessorBadge = (available: boolean, name: string) => {
    return (
      <Badge 
        variant={available ? "default" : "secondary"}
        className={available ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}
      >
        {available ? `${name} Available` : `${name} Missing`}
      </Badge>
    );
  };

  const getFileTypeSupport = () => {
    if (!capabilities) return [];
    
    const fileTypes = [
      { 
        type: 'text/plain', 
        name: 'Text Files (.txt)', 
        icon: <FileText className="w-4 h-4" />,
        always: true 
      },
      {
        type: 'application/pdf',
        name: 'PDF Documents (.pdf)',
        icon: <FileText className="w-4 h-4 text-red-500" />,
        available: capabilities.processors.pdf || capabilities.processors.pdfAdvanced
      },
      {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'Word Documents (.docx)',
        icon: <FileText className="w-4 h-4 text-blue-500" />,
        available: capabilities.processors.docx
      },
      {
        type: 'application/msword',
        name: 'Legacy Word (.doc)',
        icon: <File className="w-4 h-4 text-blue-600" />,
        available: capabilities.processors.doc
      }
    ];

    return fileTypes;
  };

  if (isLoading) {
    return (
      <Card className={compact ? "p-3" : ""}>
        <CardContent className={compact ? "p-0" : ""}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {t('knowledge_base.processor.checking', 'Checking processor capabilities...')}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !capabilities) {
    return (
      <Card className={compact ? "p-3" : ""}>
        <CardContent className={compact ? "p-0" : ""}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {t('knowledge_base.processor.error', 'Failed to check capabilities')}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    const fileTypes = getFileTypeSupport();
    const supportedCount = fileTypes.filter(ft => ft.always || ft.available).length;
    const totalCount = fileTypes.length;

    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1">
          {supportedCount === totalCount ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-orange-500" />
          )}
          <span className="text-gray-600">
            {supportedCount}/{totalCount} {t('knowledge_base.processor.formats_supported', 'formats supported')}
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-4 h-4 text-gray-400" />
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                {fileTypes.map((ft, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {ft.always || ft.available ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-orange-500" />
                    )}
                    <span className="text-xs">{ft.name}</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              {t('knowledge_base.processor.title', 'Document Processor Status')}
            </CardTitle>
            <CardDescription>
              {t('knowledge_base.processor.description', 'Available document processing capabilities')}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Type Support */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {t('knowledge_base.processor.supported_formats', 'Supported File Formats')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {getFileTypeSupport().map((fileType, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {fileType.icon}
                  <span className="text-sm font-medium">{fileType.name}</span>
                </div>
                {fileType.always || fileType.available ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Processor Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {t('knowledge_base.processor.processors', 'Document Processors')}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 border rounded">
              <div className="flex items-center gap-2">
                {getProcessorIcon(capabilities.processors.pdf)}
                <span className="text-sm">PDF Parser (Basic)</span>
              </div>
              {getProcessorBadge(capabilities.processors.pdf, 'pdf-parse')}
            </div>

            <div className="flex items-center justify-between p-2 border rounded">
              <div className="flex items-center gap-2">
                {getProcessorIcon(capabilities.processors.pdfAdvanced)}
                <span className="text-sm">PDF Parser (Advanced)</span>
              </div>
              {getProcessorBadge(capabilities.processors.pdfAdvanced, 'pdfjs-dist')}
            </div>

            <div className="flex items-center justify-between p-2 border rounded">
              <div className="flex items-center gap-2">
                {getProcessorIcon(capabilities.processors.docx)}
                <span className="text-sm">Word Document Parser</span>
              </div>
              {getProcessorBadge(capabilities.processors.docx, 'mammoth')}
            </div>
          </div>
        </div>

        {/* Installation Instructions */}
        {showInstallInstructions && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              {t('knowledge_base.processor.install_instructions', 'Installation Instructions')}
            </h3>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                {t('knowledge_base.processor.install_desc', 'To enable additional document processing capabilities, install the following packages:')}
              </p>
              <div className="space-y-1 text-xs font-mono bg-gray-800 text-green-400 p-2 rounded">
                {!capabilities.processors.pdf && !capabilities.processors.pdfAdvanced && (
                  <div>npm install pdf-parse pdfjs-dist</div>
                )}
                {!capabilities.processors.docx && (
                  <div>npm install mammoth</div>
                )}
                {capabilities.processors.pdf && capabilities.processors.docx && capabilities.processors.pdfAdvanced && (
                  <div className="text-green-300">✓ All processors available</div>
                )}
                {(!capabilities.processors.pdf && !capabilities.processors.pdfAdvanced) || !capabilities.processors.docx ? (
                  <div className="text-yellow-300 mt-2">Restart server after installing packages</div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
