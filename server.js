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

// Set up storage for uploaded files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use /tmp directory in production for Render.com
        const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : 'uploads';
        console.log('Upload directory:', uploadDir);
        if (!fs.existsSync(uploadDir)) {
            console.log('Creating upload directory...');
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + path.extname(file.originalname);
        console.log('Generated filename:', filename);
        cb(null, filename);
    }
});

const upload = multer({ storage });

// Ensure directories exist
const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : 'uploads';
const processedDir = process.env.NODE_ENV === 'production' ? '/tmp/processed' : 'processed';

console.log('Creating directories if they don\'t exist:');
console.log('Upload directory:', uploadDir);
console.log('Processed directory:', processedDir);

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Created upload directory');
}
if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
    console.log('Created processed directory');
}

// Single endpoint for processing images
app.post('/api/process-image', upload.single('image'), (req, res) => {
    console.log('Received image processing request');
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

    // Default size for resizing
    const width = 500;
    const height = 500;

    const pythonScript = `
import sys
import traceback
from rembg import remove
from PIL import Image

try:
    input_path = '${inputPath.replace(/\\/g, '\\\\')}'
    output_path = '${outputPath.replace(/\\/g, '\\\\')}'
    
    # Load image
    print("Loading image...")
    input_img = Image.open(input_path)
    
    # Resize image
    print("Resizing image...")
    input_img = input_img.resize((${width}, ${height}), Image.Resampling.LANCZOS)
    
    # Remove background
    print("Removing background...")
    output_img = remove(input_img)
    
    # Save the processed image
    output_img.save(output_path, "PNG")
    print(f"Image saved to: {output_path}")
    
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

    pythonProcess.on('close', (code) => {
        console.log('Python process closed with code:', code);
        if (code !== 0) {
            console.error('Processing failed');
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
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Current directory:', __dirname);
    console.log('Available routes:');
    console.log('  - GET /test.html (Web Interface)');
    console.log('  - GET / (Redirects to /test.html)');
    console.log('  - POST /api/process-image (API Endpoint)');
    console.log('\nTry accessing:');
    console.log(`  http://localhost:${port}/test.html`);
});