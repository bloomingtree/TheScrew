/**
 * PPTXPreviewDialog - Preview PowerPoint presentations with thumbnail grid
 */

import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface PPTXPreviewDialogProps {
  isOpen: boolean;
  filepath: string;
  thumbnailPath?: string;
  onClose: () => void;
}

export const PPTXPreviewDialog: React.FC<PPTXPreviewDialogProps> = ({
  isOpen,
  filepath,
  thumbnailPath,
  onClose
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && thumbnailPath) {
      setLoading(true);
      setError(null);

      // Convert file path to URL
      const url = `file://${thumbnailPath.replace(/\\/g, '/')}`;
      setImageUrl(url);

      // Check if image loads
      const img = new Image();
      img.onload = () => setLoading(false);
      img.onerror = () => {
        setError('Failed to load thumbnail');
        setLoading(false);
      };
      img.src = url;
    }
  }, [isOpen, thumbnailPath]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <span className="text-orange-400 font-semibold text-lg">P</span>
            </div>
            <div>
              <h2 className="text-white font-medium">PowerPoint Preview</h2>
              <p className="text-gray-400 text-sm">{filepath}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          {loading && (
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-400">Loading thumbnail...</p>
            </div>
          )}

          {error && (
            <div className="text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <p className="text-gray-500 text-sm">
                Make sure the thumbnail file exists at: {thumbnailPath}
              </p>
            </div>
          )}

          {!loading && !error && imageUrl && (
            <div className="max-w-full max-h-full">
              <img
                src={imageUrl}
                alt="Presentation thumbnails"
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                onError={() => setError('Failed to load image')}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={() => {
              if (filepath) {
                window.electronAPI?.openFile(filepath);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Open in PowerPoint
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PPTXPreviewDialog;
