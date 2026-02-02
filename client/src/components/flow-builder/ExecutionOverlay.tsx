import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowExecution } from '../../hooks/useFlowExecution';

interface ExecutionOverlayProps {
  flowId: number;
  nodeId: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Execution Overlay Component
 * Provides Make.com-style visual feedback for node execution
 */
export const ExecutionOverlay: React.FC<ExecutionOverlayProps> = ({
  flowId,
  nodeId,
  children,
  className = ''
}) => {
  const { isNodeExecuting, wasNodeExecuted, getNodeExecutionStatus } = useFlowExecution(flowId);
  
  const isExecuting = isNodeExecuting(nodeId);
  const wasExecuted = wasNodeExecuted(nodeId);
  const executionStatus = getNodeExecutionStatus(nodeId);

  return (
    <div className={`relative ${className}`}>
      {children}
      
      <AnimatePresence>
        {isExecuting && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 pointer-events-none"
          >
            <motion.div
              animate={{
                boxShadow: [
                  '0 0 0 0px rgba(59, 130, 246, 0.7)',
                  '0 0 0 8px rgba(59, 130, 246, 0)',
                  '0 0 0 0px rgba(59, 130, 246, 0)'
                ]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut"
              }}
              className="absolute inset-0 rounded-lg border-2 border-blue-500"
            />
            
            <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full shadow-lg">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"
              />
              <span className="ml-1">Executing</span>
            </div>
          </motion.div>
        )}
        
        {wasExecuted && !isExecuting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 pointer-events-none"
          >
            <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full shadow-lg">
              <svg className="inline-block w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Executed
            </div>
            
            <div className="absolute inset-0 rounded-lg border border-green-300 bg-green-50 bg-opacity-20" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface ExecutionStatusBadgeProps {
  status: 'pending' | 'executing' | 'executed' | 'waiting' | 'failed';
  className?: string;
}

/**
 * Execution Status Badge Component
 * Shows the current execution status of a node
 */
export const ExecutionStatusBadge: React.FC<ExecutionStatusBadgeProps> = ({
  status,
  className = ''
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'executing':
        return {
          color: 'bg-blue-500',
          text: 'Executing',
          icon: (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"
            />
          )
        };
      case 'executed':
        return {
          color: 'bg-green-500',
          text: 'Executed',
          icon: (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'waiting':
        return {
          color: 'bg-yellow-500',
          text: 'Waiting',
          icon: (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'failed':
        return {
          color: 'bg-red-500',
          text: 'Failed',
          icon: (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  
  if (!config) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`inline-flex items-center px-2 py-1 rounded-full text-white text-xs font-medium ${config.color} ${className}`}
    >
      {config.icon}
      <span className="ml-1">{config.text}</span>
    </motion.div>
  );
};

interface ExecutionProgressProps {
  flowId: number;
  className?: string;
}

/**
 * Execution Progress Component
 * Shows overall execution progress for a flow
 */
export const ExecutionProgress: React.FC<ExecutionProgressProps> = ({
  flowId,
  className = ''
}) => {
  const { getFlowExecutions, getExecutionStats } = useFlowExecution(flowId);
  
  const executions = getFlowExecutions(flowId);
  const stats = getExecutionStats();
  
  if (executions.length === 0) {
    return null;
  }

  return (
    <div className={`bg-card border border-border rounded-lg p-4 shadow-sm ${className}`}>
      <h3 className="text-sm font-medium text-gray-900 mb-3">Flow Execution Status</h3>
      
      <div className="space-y-2">
        {executions.map((execution) => (
          <div key={execution.executionId} className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ExecutionStatusBadge status={execution.status === 'running' ? 'executing' : execution.status === 'completed' ? 'executed' : execution.status} />
              <span className="text-sm text-gray-600">
                Execution {execution.executionId.slice(-8)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {execution.executionPath.length} nodes executed
            </div>
          </div>
        ))}
      </div>
      
      {stats.total > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Total: {stats.total}</span>
            <span>Running: {stats.running}</span>
            <span>Waiting: {stats.waiting}</span>
            <span>Completed: {stats.completed}</span>
            {stats.failed > 0 && <span className="text-red-500">Failed: {stats.failed}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutionOverlay;
