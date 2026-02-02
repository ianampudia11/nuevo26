import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link, Image, Code, Quote, Undo, Redo, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ImageUploadDialog } from './image-upload-dialog';
import { ImageEditorPanel } from './image-editor-panel';
import { ImageResizeHandles } from './image-resize-handles';

interface WysiwygEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function WysiwygEditor({ value, onChange, placeholder = "Start typing...", className = "" }: WysiwygEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isUpdatingRef = useRef(false);
  const [isCodeView, setIsCodeView] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showResizeHandles, setShowResizeHandles] = useState(false);

  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {

      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value]);


  useEffect(() => {
    if (!isCodeView && editorRef.current) {

      const currentContent = editorRef.current.innerHTML;
      if (currentContent !== value) {
        editorRef.current.innerHTML = value;

        setTimeout(() => {
          editorRef.current?.focus();
        }, 0);
      }
    }
  }, [isCodeView, value]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;






      if (target && (
        target.closest?.('[data-radix-popper-content-wrapper]') || // Radix UI components
        target.closest?.('.image-editor-panel') ||
        target.closest?.('.image-resize-handle') ||
        target.closest?.('[role="dialog"]') ||
        target.closest?.('[role="menu"]') ||
        target.closest?.('[role="listbox"]') ||
        target.closest?.('button') ||
        target.closest?.('input') ||
        target.closest?.('select') ||
        target.closest?.('textarea') ||
        (editorRef.current && editorRef.current.contains(target as Node))
      )) {
        return;
      }
      clearImageSelection();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  useEffect(() => {
    if (!isCodeView && editorRef.current) {
      const images = editorRef.current.querySelectorAll('img');
      images.forEach(img => {
        img.style.cursor = 'pointer';

        img.removeEventListener('click', handleImageClick);
        img.addEventListener('click', handleImageClick);
      });
    }
  }, [value, isCodeView]);

  const handleImageClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    selectImage(e.target as HTMLImageElement);
  };

  const handleInput = () => {
    if (editorRef.current) {
      isUpdatingRef.current = true;
      const content = editorRef.current.innerHTML;
      onChange(content);
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    }
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;


    if (target.closest('.image-resize-handle')) {
      return;
    }

    if (target.tagName === 'IMG') {
      e.preventDefault();
      e.stopPropagation();
      selectImage(target as HTMLImageElement);
    } else {
      clearImageSelection();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedImage && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      deleteSelectedImage();
    }
  };

  const deleteSelectedImage = () => {
    if (selectedImage && selectedImage.parentNode) {
      selectedImage.parentNode.removeChild(selectedImage);
      clearImageSelection();
      handleInput();
    }
  };

  const updateImageProperties = (properties: any) => {
    if (!selectedImage) return;


    if (properties.width !== undefined) {
      selectedImage.style.width = `${properties.width}px`;
    }
    if (properties.height !== undefined) {
      selectedImage.style.height = `${properties.height}px`;
    }


    if (properties.alt !== undefined) {
      selectedImage.alt = properties.alt;
    }


    if (properties.alignment !== undefined) {

      selectedImage.style.float = '';
      selectedImage.style.display = '';
      selectedImage.style.margin = '';

      const parent = selectedImage.parentElement;
      if (parent) {
        parent.style.textAlign = '';
      }

      switch (properties.alignment) {
        case 'left':
          if (parent) parent.style.textAlign = 'left';
          break;
        case 'center':
          if (parent) parent.style.textAlign = 'center';
          selectedImage.style.display = 'block';
          selectedImage.style.margin = '0 auto';
          break;
        case 'right':
          if (parent) parent.style.textAlign = 'right';
          break;
        case 'float-left':
          selectedImage.style.float = 'left';
          selectedImage.style.margin = '0 10px 10px 0';
          break;
        case 'float-right':
          selectedImage.style.float = 'right';
          selectedImage.style.margin = '0 0 10px 10px';
          break;
      }
    }


    if (properties.opacity !== undefined) {
      selectedImage.style.opacity = (properties.opacity / 100).toString();
    }


    if (properties.borderWidth !== undefined || properties.borderColor !== undefined) {
      const borderWidth = properties.borderWidth ?? (parseInt(selectedImage.style.borderWidth) || 0);
      const borderColor = properties.borderColor ?? (selectedImage.style.borderColor || '#000000');
      selectedImage.style.border = borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : '';
    }


    if (properties.margin !== undefined) {
      selectedImage.style.margin = `${properties.margin}px`;
    }

    handleInput();
  };

  const handleImageResize = (width: number, height: number) => {
    if (selectedImage) {
      selectedImage.style.width = `${width}px`;
      selectedImage.style.height = `${height}px`;
    }
  };

  const handleImageResizeEnd = () => {
    handleInput();
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {

    onChange(e.target.value);
  };

  const toggleCodeView = () => {

    clearImageSelection();

    if (isCodeView) {


      setIsCodeView(false);
    } else {


      if (editorRef.current) {
        const currentContent = editorRef.current.innerHTML;
        if (currentContent !== value) {
          onChange(currentContent);
        }
      }
      setIsCodeView(true);
    }
  };

  const clearImageSelection = () => {
    if (selectedImage) {
      selectedImage.classList.remove('selected');
      selectedImage.style.outline = '';
      selectedImage.style.boxShadow = '';
    }
    setSelectedImage(null);
    setShowImageEditor(false);
    setShowResizeHandles(false);
  };

  const selectImage = (img: HTMLImageElement) => {
    clearImageSelection();
    setSelectedImage(img);
    setShowImageEditor(true);
    setShowResizeHandles(true);


    img.classList.add('selected');
    img.style.outline = '2px solid #007cba';
    img.style.boxShadow = '0 0 0 1px rgba(0, 124, 186, 0.2)';
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
    }
  };

  const openImageDialog = () => {
    setIsImageDialogOpen(true);
  };

  const handleImageInsert = (imageUrl: string, altText?: string) => {
    if (isCodeView) {

      const imgTag = `<img src="${imageUrl}" alt="${altText || ''}" style="max-width: 100%; height: auto;" />`;
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = value.slice(0, start) + imgTag + value.slice(end);
        onChange(newValue);


        setTimeout(() => {
          textarea.setSelectionRange(start + imgTag.length, start + imgTag.length);
          textarea.focus();
        }, 0);
      }
    } else {

      execCommand('insertImage', imageUrl);


      if (altText && editorRef.current) {
        setTimeout(() => {
          const images = editorRef.current?.querySelectorAll('img');
          const lastImage = images?.[images.length - 1];
          if (lastImage && !lastImage.alt) {
            lastImage.alt = altText;
            lastImage.style.maxWidth = '100%';
            lastImage.style.height = 'auto';
            handleInput(); // Trigger onChange to save the changes
          }
        }, 100);
      }
    }
  };

  const formatBlock = (tag: string) => {
    execCommand('formatBlock', tag);
  };

  return (
    <div className={`wysiwyg-editor border rounded-lg ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted">
        {/* Text Formatting */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => execCommand('bold')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => execCommand('italic')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => execCommand('underline')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Underline className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Headings */}
        <select
          onChange={(e) => formatBlock(e.target.value)}
          className="text-sm border rounded px-2 py-1 bg-white"
          defaultValue=""
          disabled={isCodeView}
        >
          <option value="">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="h5">Heading 5</option>
          <option value="h6">Heading 6</option>
        </select>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Lists */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => execCommand('insertUnorderedList')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => execCommand('insertOrderedList')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Links and Media */}
        <Button
          variant="ghost"
          size="sm"
          onClick={insertLink}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Link className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={openImageDialog}
          className="h-8 w-8 p-0"
        >
          <Image className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Code and Quote */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => formatBlock('pre')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Code className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => formatBlock('blockquote')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Quote className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Undo/Redo */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => execCommand('undo')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => execCommand('redo')}
          className="h-8 w-8 p-0"
          disabled={isCodeView}
        >
          <Redo className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Text Alignment */}
        <select
          onChange={(e) => execCommand(e.target.value)}
          className="text-sm border rounded px-2 py-1 bg-white"
          defaultValue=""
          disabled={isCodeView}
        >
          <option value="">Align</option>
          <option value="justifyLeft">Left</option>
          <option value="justifyCenter">Center</option>
          <option value="justifyRight">Right</option>
          <option value="justifyFull">Justify</option>
        </select>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Code View Toggle */}
        <Button
          variant={isCodeView ? "default" : "ghost"}
          size="sm"
          onClick={toggleCodeView}
          className="h-8 w-8 p-0"
          title={isCodeView ? "Switch to Visual Editor" : "Switch to Code View"}
        >
          <FileCode className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor */}
      {isCodeView ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextareaChange}
          className="min-h-96 p-4 focus:outline-none font-mono text-sm border-0 resize-none w-full"
          style={{ minHeight: '400px' }}
          placeholder="Enter HTML code here..."
        />
      ) : (
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onClick={handleEditorClick}
            onKeyDown={handleKeyDown}
            className="min-h-96 p-4 focus:outline-none prose max-w-none"
            style={{ minHeight: '400px' }}
            data-placeholder={placeholder}
            suppressContentEditableWarning={true}
          />

          {/* Image Resize Handles */}
          {selectedImage && showResizeHandles && (
            <ImageResizeHandles
              image={selectedImage}
              onResize={handleImageResize}
              onResizeEnd={handleImageResizeEnd}
              aspectRatioLocked={true}
            />
          )}

          {/* Image Editor Panel */}
          <ImageEditorPanel
            image={selectedImage}
            isVisible={showImageEditor}
            onClose={clearImageSelection}
            onUpdate={updateImageProperties}
            onDelete={deleteSelectedImage}
          />
        </div>
      )}

      <style>{`
        .wysiwyg-editor [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }

        .wysiwyg-editor [contenteditable] h1 {
          font-size: 2.25rem;
          font-weight: bold;
          margin: 1rem 0;
        }

        .wysiwyg-editor [contenteditable] h2 {
          font-size: 1.875rem;
          font-weight: bold;
          margin: 0.875rem 0;
        }

        .wysiwyg-editor [contenteditable] h3 {
          font-size: 1.5rem;
          font-weight: bold;
          margin: 0.75rem 0;
        }

        .wysiwyg-editor [contenteditable] h4 {
          font-size: 1.25rem;
          font-weight: bold;
          margin: 0.625rem 0;
        }

        .wysiwyg-editor [contenteditable] h5 {
          font-size: 1.125rem;
          font-weight: bold;
          margin: 0.5rem 0;
        }

        .wysiwyg-editor [contenteditable] h6 {
          font-size: 1rem;
          font-weight: bold;
          margin: 0.5rem 0;
        }

        .wysiwyg-editor [contenteditable] p {
          margin: 0.5rem 0;
        }

        .wysiwyg-editor [contenteditable] ul, .wysiwyg-editor [contenteditable] ol {
          margin: 0.5rem 0;
          padding-left: 2rem;
        }

        .wysiwyg-editor [contenteditable] li {
          margin: 0.25rem 0;
        }

        .wysiwyg-editor [contenteditable] blockquote {
          border-left: 4px solid #e5e7eb;
          padding-left: 1rem;
          margin: 1rem 0;
          font-style: italic;
          color: #6b7280;
        }

        .wysiwyg-editor [contenteditable] pre {
          background-color: #f3f4f6;
          padding: 1rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          font-family: 'Courier New', monospace;
          margin: 1rem 0;
        }

        .wysiwyg-editor [contenteditable] a {
          color: #3b82f6;
          text-decoration: underline;
        }

        .wysiwyg-editor [contenteditable] img {
          max-width: 100%;
          height: auto;
          margin: 1rem 0;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .wysiwyg-editor [contenteditable] img:hover {
          opacity: 0.9;
          transform: scale(1.01);
        }

        .wysiwyg-editor [contenteditable] img.selected {
          outline: 2px solid #007cba;
          box-shadow: 0 0 0 1px rgba(0, 124, 186, 0.2);
        }

        .image-resize-handle {
          position: absolute !important;
          background-color: #007cba !important;
          border: 1px solid #fff !important;
          border-radius: 2px !important;
          width: 8px !important;
          height: 8px !important;
          z-index: 10000 !important;
          pointer-events: auto !important;
          user-select: none !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
        }

        .image-resize-handle:hover {
          background-color: #005a8b !important;
          transform: scale(1.2) !important;
          transition: all 0.1s ease !important;
        }

        .image-editor-panel {
          position: absolute !important;
          z-index: 9999 !important;
          background: white !important;
          pointer-events: auto !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
        }
      `}</style>

      <ImageUploadDialog
        isOpen={isImageDialogOpen}
        onClose={() => setIsImageDialogOpen(false)}
        onImageInsert={handleImageInsert}
      />
    </div>
  );
}
