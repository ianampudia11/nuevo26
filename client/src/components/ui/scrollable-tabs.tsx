import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScrollableTabsProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollableTabs({ children, className }: ScrollableTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const checkScrollButtons = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
  };

  const scrollLeft = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setIsScrolling(true);
    const scrollAmount = container.clientWidth * 0.8; // Scroll 80% of visible width
    container.scrollBy({
      left: -scrollAmount,
      behavior: 'smooth'
    });


    setTimeout(() => setIsScrolling(false), 300);
  };

  const scrollRight = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setIsScrolling(true);
    const scrollAmount = container.clientWidth * 0.8; // Scroll 80% of visible width
    container.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });


    setTimeout(() => setIsScrolling(false), 300);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;


    checkScrollButtons();

    const handleScroll = () => {
      if (!isScrolling) {
        checkScrollButtons();
      }
    };

    const handleResize = () => {
      checkScrollButtons();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target !== container) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollLeft();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollRight();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);


    const resizeObserver = new ResizeObserver(() => {
      checkScrollButtons();
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [isScrolling]);

  return (
    <div className="relative">
      {/* Left fade gradient */}
      {showLeftArrow && (
        <div className="absolute left-8 top-0 bottom-0 w-4 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      )}

      {/* Right fade gradient */}
      {showRightArrow && (
        <div className="absolute right-8 top-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      )}

      {/* Left scroll button */}
      {showLeftArrow && (
        <Button
          variant="outline"
          size="sm"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 p-0 bg-background shadow-lg border-border hover:bg-accent rounded-full"
          onClick={scrollLeft}
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Right scroll button */}
      {showRightArrow && (
        <Button
          variant="outline"
          size="sm"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 p-0 bg-background shadow-lg border-border hover:bg-accent rounded-full"
          onClick={scrollRight}
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Scrollable container */}
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        role="tablist"
        aria-label="Settings navigation tabs"
        className={cn(
          "overflow-x-auto overflow-y-hidden scrollbar-hide",
          "scroll-smooth",

          showLeftArrow && "pl-10",
          showRightArrow && "pr-10",

          "touch-pan-x",

          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md",
          className
        )}
        style={{

          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}

        onTouchStart={(e) => {

          e.currentTarget.style.touchAction = 'pan-x';
        }}
      >
        <div className="flex min-w-max">
          {children}
        </div>
      </div>

      {/* Custom scrollbar hide styles */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

interface ScrollableTabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollableTabsList({ children, className }: ScrollableTabsListProps) {
  return (
    <ScrollableTabs className="w-full">
      <div className={cn(
        "inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground",
        "min-w-max gap-1", // Ensure tabs don't compress and add gap
        className
      )}>
        {children}
      </div>
    </ScrollableTabs>
  );
}

interface ScrollableTabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function ScrollableTabsTrigger({ 
  value, 
  children, 
  className, 
  disabled = false 
}: ScrollableTabsTriggerProps) {
  return (
    <button
      type="button"
      role="tab"
      data-state="inactive"
      data-value={value}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        "hover:bg-background/50",
        "flex-shrink-0", // Prevent tabs from shrinking
        "min-w-fit", // Ensure minimum width for content
        className
      )}
    >
      {children}
    </button>
  );
}
