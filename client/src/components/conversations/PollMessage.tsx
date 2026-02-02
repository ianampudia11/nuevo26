import React from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { CheckCircle, Circle } from 'lucide-react';

interface PollOption {
  text: string;
  value: string;
  votes?: number;
  isSelected?: boolean;
}

interface PollMessageProps {
  question: string;
  options: PollOption[];
  totalVotes?: number;
  isOutbound?: boolean;
  selectedOptionIndex?: number;
  showResults?: boolean;
  onViewVotes?: () => void;
  isLoadingVotes?: boolean;
}

export default function PollMessage({
  question,
  options,
  totalVotes = 0,
  isOutbound = false,
  selectedOptionIndex,
  showResults = false,
  onViewVotes,
  isLoadingVotes = false
}: PollMessageProps) {
  const { t } = useTranslation();


  const calculatePercentage = (votes: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  return (
    <div className="poll-message bg-card rounded-lg border border-border overflow-hidden max-w-sm">
      {/* Poll Header */}
      <div className="px-4 py-3 bg-green-50 dark:bg-green-900/40 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm font-medium text-green-800 dark:text-green-300">
            {t('poll.title', 'Poll')}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
          {question}
        </p>
      </div>

      {/* Poll Options */}
      <div className="px-4 py-3 space-y-2">
        {options.map((option, index) => {
          const isSelected = selectedOptionIndex === index;
          const votes = option.votes || 0;
          const percentage = calculatePercentage(votes);
          
          return (
            <div 
              key={index}
              className={`relative rounded-lg border transition-colors ${
                isSelected 
                  ? 'border-green-500' 
                  : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {/* Vote percentage background bar */}
              {showResults && totalVotes > 0 && (
                <div 
                  className="absolute inset-0 bg-green-100 dark:bg-green-800/50 rounded-lg transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              )}
              
              <div className="relative px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {/* Selection indicator */}
                  <div className="flex-shrink-0">
                    {isSelected ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    )}
                  </div>
                  
                  {/* Option text */}
                  <span className={`text-sm font-medium flex-1 ${
                    isSelected ? 'text-green-900 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {option.text}
                  </span>
                </div>

                {/* Vote count and percentage */}
                {showResults && (
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    {votes > 0 && (
                      <> &nbsp;
                        <span>({percentage}%)</span>
                        <span className="font-medium">&nbsp;{votes}</span>

                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Poll Footer */}
      {showResults && totalVotes > 0 && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
            {t('poll.total_votes', '{{count}} vote', { count: totalVotes })}
          </p>
        </div>
      )}
      
      {/* View/Hide votes link for outbound polls */}
      {isOutbound && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <button
            className="text-xs text-green-600 hover:text-green-700 font-medium w-full text-center transition-colors disabled:opacity-50"
            onClick={onViewVotes}
            disabled={isLoadingVotes}
          >
            {isLoadingVotes ? (
              <span className="flex items-center justify-center gap-1">
                <div className="w-3 h-3 border border-green-600 border-t-transparent rounded-full animate-spin"></div>
                {t('poll.loading_votes', 'Loading...')}
              </span>
            ) : showResults ? (
              t('poll.hide_votes', 'Hide votes')
            ) : (
              t('poll.view_votes', 'View votes')
            )}
          </button>
        </div>
      )}
    </div>
  );
}
