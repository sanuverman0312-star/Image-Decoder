import { useState, useRef, useCallback } from 'react';

// Dynamic import for heic2any
const convertHeicToJpeg = async (file: File): Promise<Blob> => {
  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92
    });
    return Array.isArray(result) ? result[0] : result;
  } catch (error) {
    console.error('heic2any failed:', error);
    throw error;
  }
};

// Alternative HEIC to JPEG using Canvas (fallback method)
const convertHeicViaCanvas = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Canvas context not available'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob failed'));
            }
          },
          'image/jpeg',
          0.92
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load HEIC image'));
    };
    
    img.src = url;
  });
};

// Icons
const UploadIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);



const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const ShareIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ErrorIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

interface ProcessStep {
  id: number;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  detail?: string;
}

function App() {
  const [base64Code, setBase64Code] = useState<string>('');
  const [decodeInput, setDecodeInput] = useState<string>('');
  const [decodedImage, setDecodedImage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isTxtDragging, setIsTxtDragging] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [processStats, setProcessStats] = useState<{originalSize: string, finalSize: string, time: string} | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtFileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const updateStep = (stepId: number, status: ProcessStep['status'], detail?: string) => {
    setProcessSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status, detail: detail || step.detail } : step
    ));
  };

  const isHEIC = (file: File): boolean => {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif') || 
           type === 'image/heic' || type === 'image/heif';
  };

  const processImage = useCallback(async (file: File) => {
    const startTime = performance.now();
    setIsProcessing(true);
    setBase64Code('');
    setErrorDetails('');
    setProcessStats(null);
    setUploadedFileName(file.name);

    // Initialize steps
    const steps: ProcessStep[] = [
      { id: 1, name: 'File Validation', status: 'pending', detail: 'Checking file type and size...' },
      { id: 2, name: 'Format Detection', status: 'pending', detail: 'Detecting image format...' },
      { id: 3, name: 'Format Conversion', status: 'pending', detail: 'Converting if needed...' },
      { id: 4, name: 'Base64 Encoding', status: 'pending', detail: 'Encoding to Base64...' },
      { id: 5, name: 'Verification', status: 'pending', detail: 'Verifying output...' },
    ];
    setProcessSteps(steps);

    try {
      // Step 1: File Validation
      updateStep(1, 'processing');
      await new Promise(r => setTimeout(r, 100));
      
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        updateStep(1, 'error', `File too large: ${formatFileSize(file.size)}`);
        throw new Error(`❌ File Size Error\n\nYour file: ${formatFileSize(file.size)}\nMax allowed: 10 MB\n\n💡 Solution: Compress your image or use a smaller file.`);
      }

      if (!file.type.startsWith('image/') && !isHEIC(file)) {
        updateStep(1, 'error', `Invalid type: ${file.type || 'unknown'}`);
        throw new Error(`❌ Invalid File Type\n\nUploaded: ${file.type || 'Unknown type'}\nFile name: ${file.name}\n\n💡 Solution: Please upload an image file (JPG, PNG, GIF, WebP, HEIC, etc.)`);
      }
      
      updateStep(1, 'completed', `Valid: ${formatFileSize(file.size)}`);

      // Step 2: Format Detection
      updateStep(2, 'processing');
      await new Promise(r => setTimeout(r, 100));
      
      const isHeicFile = isHEIC(file);
      const formatName = isHeicFile ? 'HEIC/HEIF' : file.type.split('/')[1]?.toUpperCase() || 'Unknown';
      updateStep(2, 'completed', `Format: ${formatName}`);

      // Step 3: Format Conversion (HEIC needs conversion)
      updateStep(3, 'processing');
      let processedFile: File | Blob = file;
      
      if (isHeicFile) {
        updateStep(3, 'processing', 'Converting HEIC to JPEG (Method 1: heic2any)...');
        
        let converted = false;
        let lastError: Error | null = null;
        
        // Method 1: heic2any library
        try {
          processedFile = await convertHeicToJpeg(file);
          converted = true;
          updateStep(3, 'completed', 'HEIC → JPEG converted (heic2any)');
        } catch (e) {
          lastError = e instanceof Error ? e : new Error('Unknown error');
          console.warn('heic2any method failed:', e);
          updateStep(3, 'processing', 'Trying Method 2: Canvas...');
        }
        
        // Method 2: Canvas fallback (works if browser supports HEIC natively)
        if (!converted) {
          try {
            processedFile = await convertHeicViaCanvas(file);
            converted = true;
            updateStep(3, 'completed', 'HEIC → JPEG converted (Canvas)');
          } catch (e) {
            lastError = e instanceof Error ? e : new Error('Unknown error');
            console.warn('Canvas method failed:', e);
          }
        }
        
        // Method 3: Try reading directly (some browsers support HEIC)
        if (!converted) {
          updateStep(3, 'processing', 'Trying Method 3: Direct read...');
          try {
            // Try to read the file directly, maybe browser supports it
            const testBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error('Read failed'));
              reader.readAsDataURL(file);
            });
            
            // Verify the image loads
            await new Promise<void>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('Image load failed'));
              img.src = testBase64;
            });
            
            converted = true;
            updateStep(3, 'completed', 'HEIC read directly (browser supported)');
          } catch (e) {
            lastError = e instanceof Error ? e : new Error('Unknown error');
            console.warn('Direct read method failed:', e);
          }
        }
        
        if (!converted) {
          updateStep(3, 'error', 'All HEIC conversion methods failed');
          throw new Error(`❌ HEIC Conversion Failed\n\nReason: ${lastError?.message || 'Unknown error'}\n\n💡 Solutions:\n1. 🔄 Try converting HEIC to JPG at: convertio.co or heictojpg.com\n2. 📱 iPhone: Settings > Camera > Formats > Most Compatible\n3. 💻 Windows: Open in Photos app → Save as JPG\n4. 🖼️ Try uploading a different image format (JPG/PNG)`);
        }
      } else {
        updateStep(3, 'completed', 'No conversion needed');
      }

      // Step 4: Base64 Encoding
      updateStep(4, 'processing');
      
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read file as string'));
          }
        };
        
        reader.onerror = () => {
          reject(new Error(`File read error: ${reader.error?.message || 'Unknown'}`));
        };
        
        reader.onabort = () => {
          reject(new Error('File reading was aborted'));
        };
        
        reader.readAsDataURL(processedFile);
      });

      updateStep(4, 'completed', `Encoded: ${formatFileSize(base64.length)} chars`);

      // Step 5: Verification
      updateStep(5, 'processing');
      
      // Verify the base64 is valid by trying to load it as an image
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Generated Base64 is not a valid image'));
        img.src = base64;
      });

      updateStep(5, 'completed', 'Image verified ✓');

      const endTime = performance.now();
      setProcessStats({
        originalSize: formatFileSize(file.size),
        finalSize: formatFileSize(base64.length),
        time: (endTime - startTime).toFixed(0) + 'ms'
      });

      setBase64Code(base64);
      showToast('✅ Image encoded successfully!', 'success');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorDetails(errorMsg);
      showToast('❌ Encoding failed!', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processImage(file);
  }, [processImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    e.target.value = '';
  }, [processImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          processImage(file);
          break;
        }
      }
    }
  }, [processImage]);

  // TXT file drag & drop handlers
  const handleTxtDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsTxtDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.endsWith('.txt')) {
        showToast('❌ Please drop a .txt file', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const trimmedContent = content.trim();
          setDecodeInput(trimmedContent);
          decodeBase64(trimmedContent);
        }
      };
      reader.onerror = () => {
        showToast('❌ Failed to read file', 'error');
      };
      reader.readAsText(file);
    }
  }, []);

  const handleTxtDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsTxtDragging(true);
  }, []);

  const handleTxtDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsTxtDragging(false);
  }, []);

  

  const downloadAsText = () => {
    if (!base64Code) return;
    
    const filename = `${uploadedFileName.split('.')[0] || 'image'}_base64.txt`;
    
    try {
      const blob = new Blob([base64Code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      link.setAttribute('target', '_blank');
      
      document.body.appendChild(link);
      
      // Use click with delay for mobile compatibility
      setTimeout(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 250);
      }, 0);
      
      showToast('📥 Code downloading...', 'success');
    } catch (error) {
      console.error('Download error:', error);
      // Fallback: Open data URI in new window
      try {
        const dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(base64Code);
        window.open(dataUri, '_blank');
        showToast('📄 Code opened in new tab - save manually', 'success');
      } catch (e) {
        showToast('❌ Download failed', 'error');
      }
    }
  };

  const handleTxtFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      showToast('❌ Please upload a .txt file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const trimmedContent = content.trim();
        setDecodeInput(trimmedContent);
        decodeBase64(trimmedContent);
      }
    };
    reader.onerror = () => {
      showToast('❌ Failed to read file', 'error');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const decodeBase64 = (input?: string) => {
    const code = input || decodeInput.trim();
    
    if (!code) {
      showToast('❌ Please enter Base64 code', 'error');
      return;
    }

    let finalCode = code;
    
    // Add data URI prefix if missing
    if (!code.startsWith('data:image/')) {
      // Try to detect image type from base64 header
      if (code.startsWith('/9j/')) {
        finalCode = 'data:image/jpeg;base64,' + code;
      } else if (code.startsWith('iVBORw')) {
        finalCode = 'data:image/png;base64,' + code;
      } else if (code.startsWith('R0lGOD')) {
        finalCode = 'data:image/gif;base64,' + code;
      } else if (code.startsWith('UklGR')) {
        finalCode = 'data:image/webp;base64,' + code;
      } else {
        finalCode = 'data:image/png;base64,' + code;
      }
    }

    // Verify the image loads correctly
    const img = new Image();
    img.onload = () => {
      setDecodedImage(finalCode);
      showToast('✅ Image decoded successfully!', 'success');
      // Scroll to preview
      setTimeout(() => {
        document.getElementById('decoded-preview')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };
    img.onerror = () => {
      showToast('❌ Invalid Base64 code - cannot create image', 'error');
      setDecodedImage('');
    };
    img.src = finalCode;
  };

  const downloadImage = () => {
    if (!decodedImage) {
      showToast('❌ No image to download', 'error');
      return;
    }
    
    try {
      // Extract mime type and base64 data
      const matches = decodedImage.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid base64 format');
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      
      // Convert base64 to blob
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      // Get extension from mime type
      let ext = mimeType.split('/')[1] || 'png';
      if (ext === 'jpeg') ext = 'jpg';
      
      const filename = `decoded_image_${Date.now()}.${ext}`;
      
      // Method 1: Using Blob URL
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      link.setAttribute('target', '_blank');
      
      document.body.appendChild(link);
      
      // Delay click for mobile browsers
      setTimeout(() => {
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 250);
      }, 0);
      
      showToast('📥 Image downloading...', 'success');
      
    } catch (error) {
      console.error('Download error:', error);
      
      // Fallback Method 2: Direct data URI
      try {
        const link = document.createElement('a');
        link.href = decodedImage;
        link.download = `decoded_image_${Date.now()}.png`;
        link.style.display = 'none';
        link.setAttribute('target', '_blank');
        
        document.body.appendChild(link);
        
        setTimeout(() => {
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
          }, 250);
        }, 0);
        
        showToast('📥 Image downloading...', 'success');
      } catch (e) {
        // Fallback Method 3: Open in new tab
        try {
          const newWindow = window.open(decodedImage, '_blank');
          if (newWindow) {
            showToast('📄 Image opened in new tab - save manually', 'success');
          } else {
            throw new Error('Popup blocked');
          }
        } catch (e2) {
          showToast('❌ Download failed. Try long-press on image to save.', 'error');
        }
      }
    }
  };

  // Share code as file
  const shareCode = async () => {
    if (!base64Code) return;

    const filename = `${uploadedFileName.split('.')[0] || 'image'}_base64.txt`;

    // Check if Web Share API is available
    if (navigator.share && navigator.canShare) {
      try {
        const blob = new Blob([base64Code], { type: 'text/plain' });
        const file = new File([blob], filename, { type: 'text/plain' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Image Base64 Code',
            text: 'Decode this code to get the image'
          });
          showToast('✅ Shared successfully!', 'success');
          return;
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Share failed:', error);
        }
      }
    }

    // Fallback: Copy link/text share
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Image Base64 Code',
          text: `Image Base64 Code (${base64Code.length} chars)\n\nOpen this tool to decode: ${window.location.href}\n\nCode is too large to share directly. Please download the .txt file and share it manually.`
        });
        showToast('✅ Message shared!', 'success');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          showToast('❌ Share failed', 'error');
        }
      }
    } else {
      // No share API - show instructions
      showToast('📥 Download the .txt file and share manually', 'success');
      downloadAsText();
    }
  };

  const clearEncode = () => {
    setBase64Code('');
    setUploadedFileName('');
    setProcessSteps([]);
    setErrorDetails('');
    setProcessStats(null);
  };

  const clearDecode = () => {
    setDecodeInput('');
    setDecodedImage('');
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white"
      onPaste={handlePaste}
    >
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-2xl animate-slide-in ${
          toast.type === 'success' 
            ? 'bg-gradient-to-r from-green-500 to-emerald-500' 
            : 'bg-gradient-to-r from-red-500 to-pink-500'
        }`}>
          <p className="font-medium">{toast.message}</p>
        </div>
      )}

      {/* Fullscreen Modal */}
      {showFullscreen && decodedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
          <button
            onClick={() => setShowFullscreen(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all"
          >
            <CloseIcon />
          </button>
          <img
            src={decodedImage}
            alt="Fullscreen preview"
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={downloadImage}
            className="absolute bottom-4 right-4 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl font-semibold hover:opacity-90 transition-all flex items-center gap-2"
          >
            <DownloadIcon />
            Download Image
          </button>
        </div>
      )}

      {/* Header */}
      <header className="text-center py-8 px-4">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
          🖼️ Image Code Converter
        </h1>
        <p className="text-gray-400 text-lg">
          Convert images to Base64 code & decode back to images
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {['JPG', 'PNG', 'GIF', 'WebP', 'HEIC', 'BMP', 'SVG', 'AVIF'].map(format => (
            <span key={format} className="px-3 py-1 bg-white/10 rounded-full text-sm">
              {format}
            </span>
          ))}
        </div>
      </header>

      <main className="container mx-auto px-4 pb-12 space-y-8 max-w-4xl">
        
        {/* Encode Section */}
        <section className="glass-card rounded-3xl p-6 md:p-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-r from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-lg">1</span>
            Upload Image → Get Code
          </h2>

          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 text-center cursor-pointer transition-all duration-300 ${
              isDragging
                ? 'border-purple-400 bg-purple-500/20 scale-[1.02]'
                : 'border-gray-600 hover:border-purple-400 hover:bg-white/5'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handleFileSelect}
              className="hidden"
            />
            <UploadIcon />
            <p className="text-xl font-semibold mt-4 mb-2">
              {isDragging ? '📥 Drop here!' : '📤 Drop image or click to upload'}
            </p>
            <p className="text-gray-400 text-sm">
              Supports: JPG, PNG, GIF, WebP, HEIC, BMP, SVG, AVIF • Max 10MB
            </p>
            <p className="text-purple-400 text-sm mt-2">
              💡 Tip: You can also paste image (Ctrl+V)
            </p>
          </div>

          {/* Processing Progress */}
          {(isProcessing || processSteps.length > 0) && (
            <div className="mt-6 p-4 bg-white/5 rounded-2xl">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                {isProcessing && <SpinnerIcon />}
                Processing: {uploadedFileName}
              </h3>
              
              <div className="space-y-3">
                {processSteps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      step.status === 'completed' ? 'bg-green-500' :
                      step.status === 'error' ? 'bg-red-500' :
                      step.status === 'processing' ? 'bg-purple-500' :
                      'bg-gray-600'
                    }`}>
                      {step.status === 'completed' && <CheckIcon />}
                      {step.status === 'error' && <ErrorIcon />}
                      {step.status === 'processing' && <SpinnerIcon />}
                      {step.status === 'pending' && <span className="text-sm">{step.id}</span>}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${
                        step.status === 'completed' ? 'text-green-400' :
                        step.status === 'error' ? 'text-red-400' :
                        step.status === 'processing' ? 'text-purple-400' :
                        'text-gray-500'
                      }`}>
                        {step.name}
                      </p>
                      {step.detail && (
                        <p className="text-sm text-gray-400">{step.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress Bar */}
              {isProcessing && (
                <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${(processSteps.filter(s => s.status === 'completed').length / processSteps.length) * 100}%` 
                    }}
                  />
                </div>
              )}

              {/* Stats */}
              {processStats && (
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full">
                    ⏱️ {processStats.time}
                  </span>
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full">
                    📁 Original: {processStats.originalSize}
                  </span>
                  <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full">
                    📝 Code: {processStats.finalSize}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error Details */}
          {errorDetails && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
              <h3 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
                <ErrorIcon /> Error Details
              </h3>
              <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">
                {errorDetails}
              </pre>
            </div>
          )}

          {/* Generated Code */}
          {base64Code && (
            <div className="mt-6 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-green-400">✅ Generated Base64 Code</h3>
                <span className="text-sm text-gray-400">
                  {base64Code.length.toLocaleString()} characters
                </span>
              </div>
              
              <div className="relative">
                <textarea
                  value={base64Code}
                  readOnly
                  className="w-full h-40 bg-black/30 border border-gray-700 rounded-xl p-4 font-mono text-sm text-gray-300 resize-none focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  onClick={downloadAsText}
                  className="flex-1 min-w-[180px] px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl font-bold text-lg hover:opacity-90 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/25"
                >
                  <DownloadIcon />
                  Download (.txt)
                </button>
                <button
                  onClick={shareCode}
                  className="flex-1 min-w-[140px] px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-bold text-lg hover:opacity-90 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
                >
                  <ShareIcon />
                  Share
                </button>
                <button
                  onClick={clearEncode}
                  className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-all"
                >
                  🗑️ Clear
                </button>
              </div>
              <p className="text-sm text-gray-400 mt-3 text-center">
                💡 Download .txt file → Share it → Decode on any device
              </p>
            </div>
          )}
        </section>

        {/* Decode Section */}
        <section className="glass-card rounded-3xl p-6 md:p-8">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <span className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-500 rounded-xl flex items-center justify-center text-lg">2</span>
            Paste Code → Get Image
          </h2>

          {/* TXT File Upload with Drag & Drop */}
          <div
            onClick={() => txtFileInputRef.current?.click()}
            onDrop={handleTxtDrop}
            onDragOver={handleTxtDragOver}
            onDragLeave={handleTxtDragLeave}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all mb-6 ${
              isTxtDragging
                ? 'border-pink-400 bg-pink-500/20 scale-[1.02]'
                : 'border-gray-600 hover:border-pink-400 hover:bg-white/5'
            }`}
          >
            <input
              ref={txtFileInputRef}
              type="file"
              accept=".txt"
              onChange={handleTxtFileUpload}
              className="hidden"
            />
            <p className="text-lg font-semibold">
              {isTxtDragging ? '📥 Drop .txt file here!' : '📄 Upload or Drop .txt File'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              📱 Drag & Drop supported • Click to browse
            </p>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-gray-700"></div>
            <span className="text-gray-500">OR</span>
            <div className="flex-1 h-px bg-gray-700"></div>
          </div>

          {/* Manual Paste */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              💻 Paste Base64 code here:
            </label>
            <textarea
              value={decodeInput}
              onChange={(e) => setDecodeInput(e.target.value)}
              placeholder="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
              className="w-full h-32 bg-black/30 border border-gray-700 rounded-xl p-4 font-mono text-sm text-gray-300 resize-none focus:outline-none focus:border-pink-500 placeholder-gray-600"
            />
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={() => decodeBase64()}
              className="flex-1 min-w-[140px] px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 rounded-xl font-semibold hover:opacity-90 transition-all"
            >
              🔓 Decode Image
            </button>
            <button
              onClick={clearDecode}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-all"
            >
              Clear
            </button>
          </div>

          {/* Decoded Image Preview */}
          {decodedImage && (
            <div id="decoded-preview" className="mt-6 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-green-400">✅ Decoded Image</h3>
              </div>
              
              <div 
                className="relative bg-black/30 rounded-2xl p-4 cursor-pointer group"
                onClick={() => setShowFullscreen(true)}
              >
                <img
                  src={decodedImage}
                  alt="Decoded"
                  className="max-w-full max-h-96 mx-auto rounded-lg"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all rounded-2xl flex items-center justify-center">
                  <span className="text-lg font-semibold">👁️ Click for Fullscreen</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  onClick={() => setShowFullscreen(true)}
                  className="flex-1 min-w-[140px] px-4 py-3 bg-gradient-to-r from-purple-500 to-violet-500 rounded-xl font-semibold hover:opacity-90 transition-all"
                >
                  👁️ View Fullscreen
                </button>
                <button
                  onClick={downloadImage}
                  className="flex-1 min-w-[200px] px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl font-bold text-lg hover:opacity-90 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/25"
                >
                  <DownloadIcon />
                  📥 Download Image
                </button>
              </div>
              <p className="text-sm text-gray-400 mt-3 text-center">
                💡 If download doesn't work, try long-press on image and "Save Image"
              </p>
            </div>
          )}
        </section>

        {/* Features */}
        <section className="grid md:grid-cols-3 gap-4">
          {[
            { icon: '🔒', title: '100% Private', desc: 'All processing in browser' },
            { icon: '⚡', title: 'Instant', desc: 'Fast encoding & decoding' },
            { icon: '📱', title: 'Mobile Ready', desc: 'Works on all devices' },
          ].map((feature, i) => (
            <div key={i} className="glass-card rounded-2xl p-5 text-center">
              <span className="text-3xl">{feature.icon}</span>
              <h3 className="font-bold mt-2">{feature.title}</h3>
              <p className="text-sm text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </section>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-sm">
        <p>Image Code Converter • Made with ❤️ • {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default App;
