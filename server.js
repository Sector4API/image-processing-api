const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Log all requests with timestamp
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve static files from the root directory
app.use(express.static(__dirname));
console.log('Static directory:', __dirname);
console.log('Files in directory:', fs.readdirSync(__dirname));

// Ensure directories exist
const isProduction = process.env.NODE_ENV === 'production';
const baseDir = isProduction ? '/tmp' : path.join(__dirname);
const uploadDir = path.join(baseDir, 'uploads');
const processedDir = path.join(baseDir, 'processed');

console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Base directory:', baseDir);
console.log('Upload directory:', uploadDir);
console.log('Processed directory:', processedDir);

// Create directories if they don't exist
[uploadDir, processedDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        console.log(`Creating directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
        if (isProduction) {
            fs.chmodSync(dir, '777');
        }
    }
});

// Configure multer with file size limits
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + path.extname(file.originalname);
        console.log('Generated filename:', filename);
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    next(err);
};

app.use(handleMulterError);

// Get Python executable path
function getPythonPath() {
    if (isProduction) {
        // In production (Render.com), Python is in the PATH
        return 'python3';
    }
    return 'python'; // Local development
}

// Single endpoint for processing images
app.post('/api/process-image', upload.single('image'), async (req, res) => {
    console.log('Received image processing request');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Current working directory:', process.cwd());
    
    if (!req.file) {
        console.log('No file uploaded');
        return res.status(400).json({ error: 'No image file uploaded' });
    }

    console.log('File details:', req.file);
    const inputPath = req.file.path;
    const outputFilename = `processed_${path.basename(req.file.filename, path.extname(req.file.filename))}.png`;
    const outputPath = path.join(processedDir, outputFilename);

    console.log('Input path:', inputPath);
    console.log('Output path:', outputPath);

    try {
        // Verify input file
        if (!fs.existsSync(inputPath)) {
            throw new Error('Input file not found after upload');
        }

        console.log('Input file exists:', fs.existsSync(inputPath));
        console.log('Input file size:', fs.statSync(inputPath).size);
        console.log('Input file permissions:', fs.statSync(inputPath).mode.toString(8));

        // Verify directories are writable
        fs.accessSync(uploadDir, fs.constants.W_OK);
        fs.accessSync(processedDir, fs.constants.W_OK);
        console.log('Directories are writable');

        // Default size for resizing
        const width = 500;
        const height = 500;

        const pythonScript = `
import sys
import os
import traceback
from rembg import remove
from PIL import Image

try:
    print(f"Python version: {sys.version}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Environment variables:")
    for key, value in os.environ.items():
        if 'PATH' in key or 'PYTHON' in key:
            print(f"{key}: {value}")
    
    input_path = r'${inputPath}'
    output_path = r'${outputPath}'
    
    print(f"Python script starting...")
    print(f"Input path: {input_path}")
    print(f"Output path: {output_path}")
    
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")
    
    print(f"Input file size: {os.path.getsize(input_path)}")
    print(f"Input file permissions: {oct(os.stat(input_path).st_mode)}")
    
    # Load image
    print("Loading image...")
    input_img = Image.open(input_path)
    print(f"Image loaded successfully. Size: {input_img.size}, Mode: {input_img.mode}")
    
    # Convert to RGB if needed
    if input_img.mode != 'RGB':
        input_img = input_img.convert('RGB')
        print(f"Converted image to RGB mode")
    
    # Resize image
    print("Resizing image...")
    input_img = input_img.resize((${width}, ${height}), Image.Resampling.LANCZOS)
    print(f"Image resized successfully. New size: {input_img.size}")
    
    # Remove background
    print("Removing background...")
    output_img = remove(input_img)
    print(f"Background removed successfully. Output size: {output_img.size}, Mode: {output_img.mode}")
    
    # Save the processed image
    print("Saving image...")
    output_img.save(output_path, "PNG")
    print(f"Image saved successfully to: {output_path}")
    
    if not os.path.exists(output_path):
        raise FileNotFoundError(f"Output file was not created: {output_path}")
    
    print(f"Output file size: {os.path.getsize(output_path)}")
    print(f"Output file permissions: {oct(os.stat(output_path).st_mode)}")
    sys.exit(0)
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    print("Traceback:", file=sys.stderr)
    print(traceback.format_exc(), file=sys.stderr)
    sys.exit(1)
`;

        console.log('Spawning Python process...');
        const pythonPath = getPythonPath();
        console.log('Using Python executable:', pythonPath);
        
        const pythonProcess = spawn(pythonPath, ['-c', pythonScript]);

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
            console.log(`Python stdout: ${data.toString()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.error(`Python stderr: ${data.toString()}`);
        });

        pythonProcess.on('error', (error) => {
            console.error('Failed to start Python process:', error);
            cleanupFiles(inputPath);
            return res.status(500).json({ error: `Failed to start Python process: ${error.message}` });
        });

        pythonProcess.on('close', (code) => {
            console.log('Python process closed with code:', code);
            if (code !== 0) {
                console.error('Processing failed with error:', stderrData);
                cleanupFiles(inputPath);
                return res.status(500).json({ error: `Processing failed: ${stderrData}` });
            }

            // Verify the output file exists and has content
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                console.error('Output file not found or empty:', outputPath);
                cleanupFiles(inputPath);
                return res.status(500).json({ error: 'Output file not found or empty' });
            }

            console.log('Sending processed file:', outputPath);
            console.log('Output file size:', fs.statSync(outputPath).size);
            
            // Send the processed image
            res.sendFile(path.resolve(outputPath), {}, (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    res.status(500).json({ error: 'Error sending processed image' });
                }
                cleanupFiles(inputPath, outputPath);
            });
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        cleanupFiles(inputPath);
        return res.status(500).json({ error: `Unexpected error: ${error.message}` });
    }
});

// Helper function to clean up files
function cleanupFiles(...files) {
    files.forEach(file => {
        if (file && fs.existsSync(file)) {
            fs.unlink(file, (err) => {
                if (err) console.error(`Error deleting file ${file}:`, err);
                else console.log(`Successfully deleted file: ${file}`);
            });
        }
    });
}

// Explicit route for test.html
app.get('/test.html', (req, res) => {
    const testHtmlPath = path.join(__dirname, 'test.html');
    console.log('Attempting to serve test.html from:', testHtmlPath);
    if (fs.existsSync(testHtmlPath)) {
        res.sendFile(testHtmlPath);
    } else {
        res.status(404).send('test.html not found. Available files: ' + fs.readdirSync(__dirname).join(', '));
    }
});

// Redirect root to test.html
app.get('/', (req, res) => {
    res.redirect('/test.html');
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Current directory:', process.cwd());
    console.log('Python executable:', getPythonPath());
    console.log('Available routes:');
    console.log('  - GET /test.html (Web Interface)');
    console.log('  - GET / (Redirects to /test.html)');
    console.log('  - POST /api/process-image (API Endpoint)');
    console.log('Try accessing:');
    console.log(`  http://localhost:${port}/test.html`);
});