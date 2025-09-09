
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { InfiniteCanvas, CanvasApi } from './components/InfiniteCanvas';
import { ContextMenu } from './components/ContextMenu';
import { DrawingModal } from './components/DrawingModal';
import type { CanvasElement, NoteElement, ImageElement, ArrowElement, DrawingElement, Point, ElementType } from './types';
import { useHistoryState } from './useHistoryState';

export const COLORS = [
  { name: 'Gray', bg: 'bg-gray-700', text: 'text-gray-700' },
  { name: 'Red', bg: 'bg-red-500', text: 'text-red-500' },
  { name: 'Orange', bg: 'bg-orange-500', text: 'text-orange-500' },
  { name: 'Yellow', bg: 'bg-yellow-500', text: 'text-yellow-500' },
  { name: 'Green', bg: 'bg-green-500', text: 'text-green-500' },
  { name: 'Blue', bg: 'bg-blue-600', text: 'text-blue-600' },
  { name: 'Purple', bg: 'bg-purple-600', text: 'text-purple-600' },
  { name: 'Pink', bg: 'bg-pink-500', text: 'text-pink-500' },
];

const INITIAL_ELEMENTS: CanvasElement[] = [
  { id: '1', type: 'note', position: { x: 20, y: -190 }, width: 430, height: 190, rotation: 0, zIndex: 1, content: '[ 🍌 Nano Banana Infinite Cnavas 🍌 ]\n\nThreads: @Prompt_case\n\nPatreon: www.patreon.com/MattTrendsPromptEngineering\n\nCopyright: Prompt_case', color: 'bg-blue-600', textAlign: 'center' },
  { id: '2', type: 'note', position: { x: 250, y: 30 }, width: 250, height: 190, rotation: -10, zIndex: 2, content: '🕹️ CONTROL: \n\n● Hold [SPACE] to Pan\n\n● [SCROLL] the mouse to zoom\n\n● [Right-click] for options!', color: 'bg-green-500' },
  { id: '3', type: 'note', position: { x: -200, y: 30 }, width: 250, height: 150, rotation: 5, zIndex: 0, content: '⚡ Shortcut:\n\n● [Command+Z] for Undo\n\n● [Shift+Command+Z] for Redo', color: 'bg-yellow-500' },
];

interface ContextMenuData {
    x: number;
    y: number;
    worldPoint: Point;
    elementId: string | null;
}

const getRandomPosition = () => ({
  x: Math.floor(Math.random() * 400) - 200,
  y: Math.floor(Math.random() * 400) - 200
});

const App: React.FC = () => {
  const { 
    state: elements, 
    setState: setElements, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistoryState<CanvasElement[]>(INITIAL_ELEMENTS);

  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [resetView, setResetView] = useState<() => void>(() => () => {});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [editingDrawing, setEditingDrawing] = useState<DrawingElement | null>(null);
  const [imageStyle, setImageStyle] = useState<string>('Default');
  const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const canvasApiRef = useRef<CanvasApi>(null);
  const lastImagePosition = useRef<Point | null>(null);
  const zIndexCounter = useRef(INITIAL_ELEMENTS.length);
  
  const ai = useRef<GoogleGenAI | null>(null);

  const getAi = useCallback(() => {
    if (!ai.current) {
        if (!process.env.API_KEY) {
            alert("API_KEY environment variable is not set.");
            return null;
        }
        ai.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return ai.current;
  }, []);

  const addElement = useCallback((newElement: Omit<NoteElement, 'id' | 'zIndex'> | Omit<ImageElement, 'id' | 'zIndex'> | Omit<ArrowElement, 'id' | 'zIndex'> | Omit<DrawingElement, 'id' | 'zIndex'>) => {
    const elementWithId: CanvasElement = {
        ...newElement,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        zIndex: zIndexCounter.current++,
    } as CanvasElement;
     setElements(prev => [...prev, elementWithId]);
  }, [setElements]);

  const addNote = useCallback((position?: Point) => {
    addElement({
      type: 'note',
      position: position || getRandomPosition(),
      width: 150,
      height: 100,
      rotation: 0,
      content: 'New Note',
      color: COLORS[Math.floor(Math.random() * COLORS.length)].bg,
    });
  }, [addElement]);
  
  const addDrawing = useCallback((position?: Point) => {
    addElement({
      type: 'drawing',
      position: position || getRandomPosition(),
      width: 400,
      height: 300,
      rotation: 0,
      src: '',
    });
  }, [addElement]);
  
  const handleEditDrawing = useCallback((elementId: string) => {
      const element = elements.find(el => el.id === elementId);
      if (element && element.type === 'drawing') {
          setEditingDrawing(element);
      }
  }, [elements]);
  
  const handleSaveDrawing = (elementId: string, dataUrl: string) => {
      setElements(prev => prev.map(el =>
          el.id === elementId ? { ...el, src: dataUrl } : el
      ));
      setEditingDrawing(null);
  };

  const addArrow = useCallback((position?: Point) => {
    const start = position || getRandomPosition();
    const end = { x: start.x + 150, y: start.y };

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const width = Math.sqrt(dx * dx + dy * dy);
    const rotation = Math.atan2(dy, dx) * (180 / Math.PI);
    const centerPosition = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    addElement({
      type: 'arrow',
      start,
      end,
      position: centerPosition,
      width,
      height: 30,
      rotation,
      color: 'text-red-500',
    });
  }, [addElement]);
  
  const triggerImageUpload = (position?: Point) => {
    lastImagePosition.current = position || null;
    imageInputRef.current?.click();
  };

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const basePosition = lastImagePosition.current || getRandomPosition();

    const imagePromises = Array.from(files).map((file, index) => {
      return new Promise<Omit<ImageElement, 'id' | 'zIndex'> | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (!src) return resolve(null);

          const img = new Image();
          img.onload = () => {
            const MAX_DIMENSION = 300;
            let { width, height } = img;
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
              if (width > height) {
                height = (height / width) * MAX_DIMENSION;
                width = MAX_DIMENSION;
              } else {
                width = (width / height) * MAX_DIMENSION;
                height = MAX_DIMENSION;
              }
            }
            const position = { x: basePosition.x + index * 20, y: basePosition.y + index * 20 };
            resolve({ type: 'image', position, src, width, height, rotation: 0 });
          };
          img.onerror = () => resolve(null);
          img.src = src;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises).then(results => {
      const newElements = results.filter((el): el is Omit<ImageElement, 'id' | 'zIndex'> => el !== null);
      if (newElements.length > 0) {
        setElements(prev => [
          ...prev,
          ...newElements.map(el => ({
            ...el,
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            zIndex: zIndexCounter.current++,
          } as CanvasElement))
        ]);
      }
    });

    if (imageInputRef.current) {
        imageInputRef.current.value = "";
    }
  }, [setElements]);
  
 const handleGenerate = useCallback(async (selectedElements: CanvasElement[]) => {
      const genAI = getAi();
      if (!genAI) return;

      const imageElements = selectedElements.filter(el => el.type === 'image' || el.type === 'drawing') as (ImageElement | DrawingElement)[];
      const noteElements = selectedElements.filter(el => el.type === 'note') as NoteElement[];

      if (imageElements.length === 0 && noteElements.length === 0) {
          alert("Please select at least one image, drawing, or note to provide context for generation.");
          return;
      }

      setIsGenerating(true);
      setGeneratedImages(null);
      
      try {
        const instructions = noteElements.map(note => note.content).join(' \n');
        let finalInstructions = instructions;
        if (imageStyle && imageStyle !== 'Default') {
            finalInstructions = instructions ? `${instructions}, ${imageStyle} Style` : `${imageStyle} Style`;
        }

        if (imageElements.length > 0) { // Editing with existing image(s)
            const imageParts = imageElements.filter(el => el.src).map(el => {
                const [header, data] = el.src.split(',');
                const mimeType = header.match(/data:(.*);base64/)?.[1] || 'image/png';
                return { inlineData: { data, mimeType } };
            });

            const promptForEditing = finalInstructions || "Creatively reimagine and enhance the image(s).";
            const textPart = { text: promptForEditing };
            const parts = [...imageParts, textPart];
            
            const generateSingleImage = async () => {
              const response = await genAI.models.generateContent({
                  model: 'gemini-2.5-flash-image-preview',
                  contents: { parts },
                  config: {
                      responseModalities: [Modality.IMAGE, Modality.TEXT],
                  },
              });
              for (const part of response.candidates[0].content.parts) {
                  if (part.inlineData) {
                      return `data:image/png;base64,${part.inlineData.data}`;
                  }
              }
              return null;
            };

            const [image1, image2] = await Promise.all([generateSingleImage(), generateSingleImage()]);
            const validImages = [image1, image2].filter((img): img is string => img !== null);
            setGeneratedImages(validImages);

        } else { // Generating new image from text
            const promptText = `Generate a completely new image based on this description: "${finalInstructions}"`;

            const response = await genAI.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: promptText,
                config: {
                    numberOfImages: 2,
                    outputMimeType: 'image/png',
                },
            });

            if (response.generatedImages) {
                const urls = response.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
                setGeneratedImages(urls);
            }
        }
      } catch (error) {
        console.error("Error generating image:", error);
        alert("Failed to generate image. Please check the console for details.");
      } finally {
        setIsGenerating(false);
      }
  }, [getAi, imageStyle]);


  const handleSelectElement = useCallback((id: string | null, shiftKey: boolean) => {
    if (contextMenu) setContextMenu(null);

    if (id === null) {
      if (!shiftKey) setSelectedElementIds([]);
      return;
    }
    
    setSelectedElementIds(prevIds => {
      if (shiftKey) {
        return prevIds.includes(id) ? prevIds.filter(prevId => prevId !== id) : [...prevIds, id];
      } else {
        return prevIds.includes(id) ? prevIds : [id];
      }
    });
  }, [contextMenu]);

  const handleMarqueeSelect = useCallback((ids: string[], shiftKey: boolean) => {
    setSelectedElementIds(prevIds => {
      if (shiftKey) {
        const newIds = ids.filter(id => !prevIds.includes(id));
        return [...prevIds, ...newIds];
      } else {
        return ids;
      }
    });
  }, []);


  const updateElements = useCallback((updatedElement: CanvasElement, dragDelta?: Point) => {
    setElements(prevElements => {
      if (dragDelta && selectedElementIds.length > 1 && selectedElementIds.includes(updatedElement.id)) {
        const selectedSet = new Set(selectedElementIds);
        return prevElements.map(el => {
          if (el.id === updatedElement.id) {
            return updatedElement;
          }
          if (selectedSet.has(el.id)) {
             return { ...el, position: { x: el.position.x + dragDelta.x, y: el.position.y + dragDelta.y } };
          }
          return el;
        });
      } else {
        return prevElements.map(el => (el.id === updatedElement.id ? updatedElement : el));
      }
    }, { addToHistory: false });
  }, [selectedElementIds, setElements]);

  const handleInteractionEnd = useCallback(() => {
    setElements(currentElements => currentElements, { addToHistory: true });
  }, [setElements]);

  const deleteElement = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.filter(el => !selectedSet.has(el.id)));
    setSelectedElementIds([]);
  }, [selectedElementIds, setElements]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the drawing modal is open, let it handle its own keyboard shortcuts.
      if (editingDrawing) {
        return;
      }

      const target = e.target as HTMLElement;
      const isEditingText = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
        e.preventDefault();
        deleteElement();
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (isCtrlOrCmd && !isEditingText) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [deleteElement, undo, redo, editingDrawing]);

  const bringToFront = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const maxZ = Math.max(...elements.map(el => el.zIndex), 0);
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.map(el => selectedSet.has(el.id) ? { ...el, zIndex: maxZ + 1 } : el));
    zIndexCounter.current = maxZ + 2;
  }, [selectedElementIds, elements, setElements]);

  const sendToBack = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const minZ = Math.min(...elements.map(el => el.zIndex), 0);
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.map(el => selectedSet.has(el.id) ? { ...el, zIndex: minZ - 1 } : el));
  }, [selectedElementIds, elements, setElements]);

  const getResetViewCallback = useCallback((callback: () => void) => {
    setResetView(() => callback);
  }, []);

  const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
  const canChangeColor = selectedElements.some(el => el.type === 'note' || el.type === 'arrow');

  const handleColorChange = (newColor: string) => {
      if (!canChangeColor) return;
      const selectedSet = new Set(selectedElementIds);
      setElements(prev => prev.map(el => {
          if (selectedSet.has(el.id)) {
              if (el.type === 'note') return { ...el, color: newColor };
              if (el.type === 'arrow') {
                  const newTextColor = newColor.replace('bg-', 'text-');
                  return { ...el, color: newTextColor };
              }
          }
          return el;
      }));
  };
  
  const downloadGeneratedImage = (imageUrl: string) => {
      if (!imageUrl) return;
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `generated-canvas-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const getCenterOfViewport = useCallback((): Point => {
    if (canvasApiRef.current) {
        const screenCenter: Point = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        };
        return canvasApiRef.current.screenToWorld(screenCenter);
    }
    return getRandomPosition();
  }, []);

  const addGeneratedImageToCanvas = useCallback((imageUrl: string) => {
    if (!imageUrl) return;

    const src = imageUrl;
    const img = new Image();
    img.onload = () => {
      const MAX_DIMENSION = 400;
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = (height / width) * MAX_DIMENSION;
          width = MAX_DIMENSION;
        } else {
          width = (width / height) * MAX_DIMENSION;
          height = MAX_DIMENSION;
        }
      }
      addElement({
        type: 'image',
        position: getCenterOfViewport(),
        src,
        width,
        height,
        rotation: 0,
      });
    };
    img.src = src;
  }, [addElement, getCenterOfViewport]);

  const downloadImage = useCallback((elementId: string) => {
    if (!elementId) return;
    const element = elements.find(el => el.id === elementId);
    if (element && (element.type === 'image' || element.type === 'drawing') && element.src) {
        const link = document.createElement('a');
        link.href = element.src;
        const mimeType = element.src.match(/data:(.*);base64/)?.[1] || 'image/png';
        const extension = mimeType.split('/')[1] || 'png';
        link.download = `canvas-image-${Date.now()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  }, [elements]);

  const handleContextMenu = useCallback((e: React.MouseEvent, worldPoint: Point, elementId: string | null) => {
      e.preventDefault();
      
      if (elementId && !selectedElementIds.includes(elementId)) {
        handleSelectElement(elementId, false);
      }
      
      setContextMenu({ x: e.clientX, y: e.clientY, worldPoint, elementId });
  }, [selectedElementIds, handleSelectElement]);
  
  const handleExportCanvas = () => {
    const dataStr = JSON.stringify(elements, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.download = 'infinite-canvas-export.json';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCanvas = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const result = e.target?.result;
            if (typeof result !== 'string') {
                throw new Error("File could not be read as text.");
            }
            const importedElements = JSON.parse(result) as CanvasElement[];
            
            // Basic validation
            if (!Array.isArray(importedElements) || (importedElements.length > 0 && !importedElements[0].id)) {
                throw new Error("Invalid file format.");
            }
            
            setElements(importedElements);
            const maxZ = Math.max(0, ...importedElements.map(el => el.zIndex || 0));
            zIndexCounter.current = maxZ + 1;

            alert('Canvas imported successfully!');
        } catch (error) {
            console.error("Error importing canvas:", error);
            alert("Failed to import canvas. The file might be corrupted or in the wrong format.");
        }
    };
    reader.onerror = () => {
        alert("Error reading file.");
    };
    reader.readAsText(file);

    if (event.target) {
        event.target.value = "";
    }
  };

  const contextMenuElement = contextMenu?.elementId ? elements.find(el => el.id === contextMenu.elementId) : null;

  return (
    <main className="relative w-screen h-screen bg-gray-100 font-sans" onClick={() => setContextMenu(null)}>
      <div 
        className={`absolute top-4 left-4 z-20 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 w-64 flex flex-col gap-4 transition-transform duration-300 ease-in-out ${isMenuCollapsed ? '-translate-x-full' : 'translate-x-0'}`}
      >
        <div>
          <h1 className="text-xl font-bold text-gray-800">Infinite Canvas</h1>
          <p className="text-sm text-gray-600 mt-1">Select an object to transform it.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
            <button onClick={() => addNote()} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors col-span-1">Add Note</button>
            <button onClick={() => addArrow()} className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors col-span-1">Add Arrow</button>
            <button onClick={() => addDrawing()} className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-colors col-span-2">Add Drawing</button>
            <label className="cursor-pointer px-3 py-2 text-sm text-center bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50 transition-colors col-span-2">
                Add Image(s)
                <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageUpload} multiple />
            </label>
        </div>

        {selectedElementIds.length > 0 && canChangeColor && (
            <div className="border-t pt-3 mt-1">
                <h2 className="text-md font-semibold text-gray-700 mb-2">Color</h2>
                <div className="grid grid-cols-8 gap-1.5">
                    {COLORS.map(color => {
                        const isNoteSelected = selectedElements.some(el => el.type === 'note');
                        const colorClass = isNoteSelected ? color.bg : color.text;
                        const finalColor = isNoteSelected ? color.bg : color.bg;
                        return (
                            <button
                                key={color.name}
                                onClick={() => handleColorChange(finalColor)}
                                className={`w-6 h-6 rounded-full border-2 ${color.bg} border-white`}
                                aria-label={`Change color to ${color.name}`}
                            />
                        )
                    })}
                </div>
            </div>
        )}

         <div className="flex flex-col gap-2 border-t pt-3 mt-3">
            <h2 className="text-md font-semibold text-gray-700">Controls</h2>
             <div className="grid grid-cols-2 gap-2">
                <button onClick={undo} disabled={!canUndo} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Undo</button>
                <button onClick={redo} disabled={!canRedo} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Redo</button>
                 <button onClick={handleExportCanvas} className="px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors">Export</button>
                <label className="cursor-pointer text-center px-3 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors">
                    Import
                    <input type="file" accept=".json" ref={importInputRef} className="hidden" onChange={handleImportCanvas} />
                </label>
            </div>
             <button onClick={bringToFront} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">↑ Bring to Front</button>
             <button onClick={sendToBack} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">↓ Send to Back</button>
             <button onClick={deleteElement} disabled={selectedElementIds.length === 0} className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Delete</button>
            <button onClick={resetView} className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors">Reset View</button>
        </div>
      </div>
      
      <button
        onClick={() => setIsMenuCollapsed(!isMenuCollapsed)}
        className="absolute top-4 z-20 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all duration-300 ease-in-out"
        style={{ left: isMenuCollapsed ? '1rem' : 'calc(1rem + 16rem + 0.5rem)' }}
        aria-label={isMenuCollapsed ? 'Expand menu' : 'Collapse menu'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {isMenuCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            )}
        </svg>
      </button>

      <InfiniteCanvas 
        ref={canvasApiRef}
        elements={elements} 
        selectedElementIds={selectedElementIds}
        onSelectElement={handleSelectElement}
        onMarqueeSelect={handleMarqueeSelect}
        onUpdateElement={updateElements}
        onInteractionEnd={handleInteractionEnd}
        setResetViewCallback={getResetViewCallback} 
        onGenerate={handleGenerate}
        onContextMenu={handleContextMenu}
        onEditDrawing={handleEditDrawing}
        imageStyle={imageStyle}
        onSetImageStyle={setImageStyle}
      />

      {isGenerating && (
        <div className="absolute inset-0 z-30 bg-black/50 flex flex-col items-center justify-center text-white">
            <svg className="animate-spin h-10 w-10 text-white mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg font-semibold">Generating Images...</p>
            <p className="text-sm">This may take a moment.</p>
        </div>
      )}

      {generatedImages && generatedImages.length > 0 && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-4" onClick={() => setGeneratedImages(null)}>
          <div className="bg-white rounded-lg shadow-2xl p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="text-xl font-bold text-gray-800">Choose an Image</h2>
              <button onClick={() => setGeneratedImages(null)} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
              {generatedImages.map((imgSrc, index) => (
                <div key={index} className="border rounded-lg p-2 flex flex-col gap-2">
                  <div className="bg-gray-100 rounded-md flex items-center justify-center flex-grow">
                     <img src={imgSrc} alt={`Generated by AI ${index + 1}`} className="w-full h-auto object-contain rounded-md max-h-[60vh]" />
                  </div>
                  <div className="flex-shrink-0 mt-auto flex justify-center gap-2">
                    <button onClick={() => addGeneratedImageToCanvas(imgSrc)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors">Add to Canvas</button>
                    <button onClick={() => downloadGeneratedImage(imgSrc)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors">Download</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setGeneratedImages(null)} className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}
      
      {editingDrawing && (
        <DrawingModal 
          element={editingDrawing}
          onSave={handleSaveDrawing}
          onClose={() => setEditingDrawing(null)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          menuData={contextMenu}
          onClose={() => setContextMenu(null)}
          actions={{
            addNote,
            addArrow,
            addDrawing,
            editDrawing: handleEditDrawing,
            addImage: triggerImageUpload,
            deleteElement,
            bringToFront,
            sendToBack,
            changeColor: handleColorChange,
            downloadImage,
          }}
          canChangeColor={canChangeColor}
          elementType={contextMenuElement?.type || null}
        />
      )}

    </main>
  );
};

export default App;