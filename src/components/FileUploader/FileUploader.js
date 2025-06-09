import React, { useRef, useState } from 'react';
import './FileUploader.css';

const FileUploader = ({ onFilesSelected }) => {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragError, setDragError] = useState(false);

  const validateFiles = (files) => {
    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setDragError(true);
      setTimeout(() => setDragError(false), 3000); // Clear error after 3 seconds
      return false;
    }
    return true;
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      if (validateFiles(e.target.files)) {
        onFilesSelected(e.target.files);
      }
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current.click();
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files.length > 0) {
      if (validateFiles(e.dataTransfer.files)) {
        onFilesSelected(e.dataTransfer.files);
      }
    }
  };

  return (
    <div 
      className={`file-uploader ${dragActive ? 'drag-active' : ''} ${dragError ? 'drag-error' : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <div className="file-uploader-content">
        <div className="file-uploader-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </div>
        <p className="file-uploader-text">
          {dragError ? (
            <span className="error-message">Please select only image files</span>
          ) : (
            "Drag & drop images here, or"
          )}
        </p>
        <button className="browse-button" onClick={handleBrowseClick}>
          Browse Files
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          multiple 
          accept="image/*" 
          className="file-input"
        />
        <p className="file-type-hint">Supported formats: JPG, PNG, GIF, WEBP, etc.</p>
      </div>
    </div>
  );
};

export default FileUploader;