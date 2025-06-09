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

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'build'))) {
    app.use(express.static(path.join(__dirname, 'build')));
}

// Set up storage for uploaded files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use /tmp directory in production for Render.com
        const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Ensure directories exist
const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : 'uploads';
const processedDir = process.env.NODE_ENV === 'production' ? '/tmp/processed' : 'processed';

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
}

// Single endpoint for processing images
app.post('/api/process-image', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }

    const inputPath = req.file.path;
    const outputFilename = `processed_${path.basename(req.file.filename, path.extname(req.file.filename))}.png`;
    const outputPath = path.join(processedDir, outputFilename);

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

    const pythonProcess = spawn('python', ['-c', pythonScript]);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        console.log(`stdout: ${data.toString()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        console.error(`stderr: ${data.toString()}`);
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('Processing failed');
            // Clean up input file
            fs.unlink(inputPath, (err) => {
                if (err) console.error('Error deleting input file:', err);
            });
            return res.status(500).json({ error: `Processing failed: ${stderrData}` });
        }

        // Send the processed image
        res.sendFile(path.resolve(outputPath), {}, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).json({ error: 'Error sending processed image' });
            }

            // Clean up files after sending
            fs.unlink(inputPath, (err) => {
                if (err) console.error('Error deleting input file:', err);
            });
            fs.unlink(outputPath, (err) => {
                if (err) console.error('Error deleting output file:', err);
            });
        });
    });
});

// Serve the React app for any other routes in production
if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'build'))) {
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'build', 'index.html'));
    });
}

// Add a catch-all route for API 404s
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Add a basic route for the root path when not in production
app.get('/', (req, res) => {
    res.send(`
        <h1>Image Processing API</h1>
        <p>Use POST /api/process-image to process images.</p>
        <p>The API will automatically resize images to 500x500 and remove backgrounds.</p>
    `);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`
API Endpoint:
  POST /api/process-image
    - Automatically resizes image to 500x500 and removes background
    - File parameter: image
    - Returns: Processed PNG image with transparent background
`);
});