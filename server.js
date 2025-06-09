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

// Log all requests
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
    }
});

// Set up storage for uploaded files
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

const upload = multer({ storage });

// Single endpoint for processing images
app.post('/api/process-image', upload.single('image'), (req, res) => {
    console.log('Received image processing request');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Python Path:', process.env.PYTHONPATH);
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
    console.log('Checking file exists:', fs.existsSync(inputPath));
    console.log('Input file size:', fs.statSync(inputPath).size);

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
    print(f"PYTHONPATH: {os.environ.get('PYTHONPATH', 'Not set')}")
    print(f"Files in current directory: {os.listdir('.')}")
    
    input_path = r'${inputPath}'
    output_path = r'${outputPath}'
    
    print(f"Python script starting...")
    print(f"Input path: {input_path}")
    print(f"Output path: {output_path}")
    print(f"Input file exists: {os.path.exists(input_path)}")
    if os.path.exists(input_path):
        print(f"Input file size: {os.path.getsize(input_path)}")
    
    # Load image
    print("Loading image...")
    input_img = Image.open(input_path)
    print(f"Image loaded successfully. Size: {input_img.size}, Mode: {input_img.mode}")
    
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
    print(f"Output file exists: {os.path.exists(output_path)}")
    if os.path.exists(output_path):
        print(f"Output file size: {os.path.getsize(output_path)}")
    
    sys.exit(0)
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    print("Traceback:", file=sys.stderr)
    print(traceback.format_exc(), file=sys.stderr)
    sys.exit(1)
`;

    console.log('Spawning Python process...');
    const pythonProcess = spawn('python', ['-c', pythonScript]);

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
        return res.status(500).json({ error: `Failed to start Python process: ${error.message}` });
    });

    pythonProcess.on('close', (code) => {
        console.log('Python process closed with code:', code);
        if (code !== 0) {
            console.error('Processing failed with error:', stderrData);
            // Clean up input file
            fs.unlink(inputPath, (err) => {
                if (err) console.error('Error deleting input file:', err);
            });
            return res.status(500).json({ error: `Processing failed: ${stderrData}` });
        }

        // Verify the output file exists
        if (!fs.existsSync(outputPath)) {
            console.error('Output file not found:', outputPath);
            return res.status(500).json({ error: 'Output file not found' });
        }

        console.log('Sending processed file:', outputPath);
        console.log('Output file size:', fs.statSync(outputPath).size);
        
        // Send the processed image
        res.sendFile(path.resolve(outputPath), {}, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).json({ error: 'Error sending processed image' });
            }

            // Clean up files after sending
            console.log('Cleaning up files...');
            fs.unlink(inputPath, (err) => {
                if (err) console.error('Error deleting input file:', err);
            });
            fs.unlink(outputPath, (err) => {
                if (err) console.error('Error deleting output file:', err);
            });
        });
    });
});

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

// Root route
app.get('/', (req, res) => {
    res.redirect('/test.html');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Current directory:', __dirname);
    console.log('Available routes:');
    console.log('  - GET /test.html (Web Interface)');
    console.log('  - GET / (Redirects to /test.html)');
    console.log('  - POST /api/process-image (API Endpoint)');
    console.log('\nTry accessing:');
    console.log(`  http://localhost:${port}/test.html`);
});