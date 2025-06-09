import React, { useState } from 'react';
import './App.css';
import FileUploader from './components/FileUploader/FileUploader';
import { batchRemoveBackground } from './services/backgroundRemovalService';

function App() {
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [processedImages, setProcessedImages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [selectedImageIndex, setSelectedImageIndex] = useState(null);

    const handleFilesSelected = async (files) => {
        // Filter to ensure only image files are accepted
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

        if (imageFiles.length > 0) {
            setSelectedFiles(imageFiles);
            setProcessedImages([]);
            setSelectedImageIndex(null);
            // Automatically start processing
            await startProcessing(imageFiles);
        } else {
            alert('Please select only image files.');
        }
    };

    const startProcessing = async (files) => {
        if (files.length === 0) return;

        setIsProcessing(true);
        setProcessingProgress(0);
        setSelectedImageIndex(null);

        try {
            console.log('Starting image processing...');
            const results = await batchRemoveBackground(files);
            setProcessedImages(results);
        } catch (error) {
            console.error('Error during processing:', error);
            alert('An error occurred during processing. Please try again.');
        } finally {
            setIsProcessing(false);
            setProcessingProgress(100);
        }
    };

    // Function to create object URLs for preview
    const getImagePreviewUrl = (file) => {
        return URL.createObjectURL(file);
    };

    // Toggle image preview when clicking on an item
    const toggleImagePreview = (index) => {
        setSelectedImageIndex(selectedImageIndex === index ? null : index);
    };

    // Function to delete a processed image
    const deleteProcessedImage = (index) => {
        const updatedImages = [...processedImages];
        updatedImages.splice(index, 1);
        setProcessedImages(updatedImages);

        if (selectedImageIndex === index) {
            setSelectedImageIndex(null);
        } else if (selectedImageIndex > index) {
            setSelectedImageIndex(selectedImageIndex - 1);
        }
    };

    // Clean up object URLs when component unmounts or when images change
    React.useEffect(() => {
        return () => {
            processedImages.forEach(result => {
                if (result.success) {
                    URL.revokeObjectURL(getImagePreviewUrl(result.original));
                    URL.revokeObjectURL(getImagePreviewUrl(result.processed));
                }
            });
        };
    }, [processedImages]);

    // Update progress bar width using CSS class instead of inline style
    React.useEffect(() => {
        const progressBarElement = document.querySelector('.progress-bar-fill');
        if (progressBarElement) {
            progressBarElement.style.setProperty('--progress-width', `${processingProgress}%`);
        }
    }, [processingProgress]);

    return (
        <div className="app">
            <header className="app-header">
                <h1>Image Processor</h1>
            </header>
            <main className="app-main">
                <section className="app-section">
                    <h2>Upload Images</h2>
                    <FileUploader onFilesSelected={handleFilesSelected} />
                </section>

                {isProcessing && (
                    <section className="app-section">
                        <h2>Processing...</h2>
                        <div className="progress-bar">
                            <div className="progress-bar-fill"></div>
                        </div>
                    </section>
                )}

                {processedImages.length > 0 && (
                    <section className="app-section">
                        <h2>Processed Images</h2>
                        <div className="image-grid">
                            {processedImages.map((result, index) => (
                                <div
                                    key={index}
                                    className={`image-item ${selectedImageIndex === index ? 'selected' : ''}`}
                                >
                                    {result.success ? (
                                        <>
                                            <div className="image-preview" onClick={() => toggleImagePreview(index)}>
                                                <img
                                                    src={getImagePreviewUrl(result.processed)}
                                                    alt={`Processed ${index}`}
                                                />
                                            </div>
                                            <div className="image-actions">
                                                <button onClick={() => deleteProcessedImage(index)}>Delete</button>
                                                <a
                                                    href={getImagePreviewUrl(result.processed)}
                                                    download={`processed_${result.original.name}`}
                                                    className="download-button"
                                                >
                                                    Download
                                                </a>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="error-message">{result.error}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}

export default App;
