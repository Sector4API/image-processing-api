const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Constants for file size limits
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max file size
const MAX_IMAGE_DIMENSION = 2000; // Max 2000px in any dimension

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

// Configure multer with file size limit
const upload = multer({
  dest: path.join(isProduction ? '/tmp' : __dirname, 'uploads'),
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Add error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File size too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
    }
  }
  next(err);
});

// Get Python executable path
function getPythonPath() {
    if (isProduction) {
        // In production (Render.com), Python is in the PATH
        return 'python3';
    }
    return 'python'; // Local development
}

// Add a logging utility
const log = {
    stage: (stage, message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [STAGE: ${stage}] ${message}`);
    },
    error: (stage, message, error) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [ERROR: ${stage}] ${message}`, error);
    },
    info: (message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [INFO] ${message}`);
    }
};

// Function to check image dimensions
async function checkImageDimensions(filePath) {
  return new Promise((resolve, reject) => {
    const pythonScript = `
import sys
from PIL import Image

try:
    with Image.open('${filePath}') as img:
        width, height = img.size
        print(f"{width},{height}")
        sys.exit(0)
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

    const process = spawn(getPythonPath(), ['-c', pythonScript]);
    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        const [width, height] = output.trim().split(',').map(Number);
        resolve({ width, height });
      } else {
        reject(new Error('Failed to check image dimensions'));
      }
    });
  });
}

// Single endpoint for processing images
app.post('/api/process-image', upload.single('image'), async (req, res) => {
    log.stage('REQUEST', 'Received new image processing request');
    log.info(`Environment: ${process.env.NODE_ENV}`);
    log.info(`Working Directory: ${process.cwd()}`);
    
    if (!req.file) {
        log.error('VALIDATION', 'No file uploaded');
        return res.status(400).json({ error: 'No image file uploaded' });
    }

    try {
        // Check image dimensions
        const dimensions = await checkImageDimensions(req.file.path);
        if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
            cleanupFiles(req.file.path);
            return res.status(413).json({ 
                error: `Image dimensions too large. Maximum allowed is ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION} pixels` 
            });
        }

        log.stage('FILE_RECEIVED', `File received: ${JSON.stringify(req.file, null, 2)}`);
        const inputPath = req.file.path;
        const outputFilename = `processed_${path.basename(req.file.filename, path.extname(req.file.filename))}.png`;
        const outputPath = path.join(processedDir, outputFilename);

        log.info(`Input path: ${inputPath}`);
        log.info(`Output path: ${outputPath}`);

        // Verify input file
        if (!fs.existsSync(inputPath)) {
            throw new Error('Input file not found after upload');
        }

        log.stage('FILE_VALIDATION', `
            File exists: ${fs.existsSync(inputPath)}
            Size: ${fs.statSync(inputPath).size} bytes
            Permissions: ${fs.statSync(inputPath).mode.toString(8)}
        `);

        // Verify directories
        fs.accessSync(uploadDir, fs.constants.W_OK);
        fs.accessSync(processedDir, fs.constants.W_OK);
        log.stage('DIRECTORY_CHECK', 'Upload and processed directories are writable');

        const width = 500;
        const height = 500;

        const pythonScript = `
import sys
import os
import traceback
from rembg import remove
from PIL import Image
import time

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

def log_stage(stage, message):
    print(f"[PYTHON] [{stage}] {message}", flush=True)

try:
    log_stage("INIT", f"Python version: {sys.version}")
    log_stage("INIT", f"Working directory: {os.getcwd()}")
    log_stage("INIT", f"Available memory: {os.system('free -m')}")
    
    # Log environment variables
    log_stage("ENV", "Environment variables:")
    for key, value in os.environ.items():
        if 'PATH' in key or 'PYTHON' in key:
            log_stage("ENV", f"{key}: {value}")
    
    input_path = r'${inputPath}'
    output_path = r'${outputPath}'
    
    log_stage("FILE_CHECK", f"Input path: {input_path}")
    log_stage("FILE_CHECK", f"Output path: {output_path}")
    
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")
    
    log_stage("FILE_INFO", f"Input file size: {os.path.getsize(input_path)} bytes")
    log_stage("FILE_INFO", f"Input file permissions: {oct(os.stat(input_path).st_mode)}")
    
    # Load image with error handling
    log_stage("LOAD_IMAGE", "Loading input image...")
    start_time = time.time()
    try:
        input_img = Image.open(input_path)
        log_stage("LOAD_IMAGE", f"Image loaded in {time.time() - start_time:.2f}s. Size: {input_img.size}, Mode: {input_img.mode}")
    except Exception as e:
        log_stage("ERROR", f"Failed to load image: {str(e)}")
        raise
    
    # Convert to RGB if needed
    if input_img.mode != 'RGB':
        log_stage("COLOR_CONVERT", f"Converting from {input_img.mode} to RGB")
        start_time = time.time()
        try:
            input_img = input_img.convert('RGB')
            log_stage("COLOR_CONVERT", f"Conversion completed in {time.time() - start_time:.2f}s")
        except Exception as e:
            log_stage("ERROR", f"Failed to convert image to RGB: {str(e)}")
            raise
    
    # Resize image with error handling
    log_stage("RESIZE", f"Resizing image to {${width}}x{${height}}")
    start_time = time.time()
    try:
        input_img = input_img.resize((${width}, ${height}))
        log_stage("RESIZE", f"Resize completed in {time.time() - start_time:.2f}s. New size: {input_img.size}")
    except Exception as e:
        log_stage("ERROR", f"Failed to resize image: {str(e)}")
        raise
    
    # Remove background with error handling and memory tracking
    log_stage("REMOVE_BG", "Starting background removal...")
    start_time = time.time()
    try:
        output_img = remove(input_img)
        log_stage("REMOVE_BG", f"Background removal completed in {time.time() - start_time:.2f}s")
        log_stage("REMOVE_BG", f"Output image size: {output_img.size}, Mode: {output_img.mode}")
    except Exception as e:
        log_stage("ERROR", f"Failed to remove background: {str(e)}")
        raise
    
    # Save the processed image with error handling
    log_stage("SAVE", f"Saving processed image to {output_path}")
    start_time = time.time()
    try:
        output_img.save(output_path, "PNG")
        log_stage("SAVE", f"Save completed in {time.time() - start_time:.2f}s")
    except Exception as e:
        log_stage("ERROR", f"Failed to save output image: {str(e)}")
        raise
    
    if not os.path.exists(output_path):
        raise FileNotFoundError(f"Output file was not created: {output_path}")
    
    log_stage("COMPLETE", f"Output file size: {os.path.getsize(output_path)} bytes")
    log_stage("COMPLETE", f"Output file permissions: {oct(os.stat(output_path).st_mode)}")
    sys.exit(0)
except Exception as e:
    log_stage("ERROR", f"Error: {str(e)}")
    log_stage("ERROR", "Traceback:")
    log_stage("ERROR", traceback.format_exc())
    sys.exit(1)
`;

        log.stage('PYTHON_INIT', 'Preparing to spawn Python process');
        const pythonPath = getPythonPath();
        log.info(`Using Python executable: ${pythonPath}`);
        
        // Update timeout for smaller value in free tier
        const TIMEOUT_MS = 120000; // 2 minutes timeout for free tier
        let processTimeout;
        
        const pythonProcess = spawn(pythonPath, ['-c', pythonScript], {
            env: {
                ...process.env,
                PYTHONUNBUFFERED: "1",
                REMBG_MAX_MEMORY: "450"  // Limit rembg memory usage
            }
        });

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) console.log(`Python stdout: ${line}`);
            });
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) console.error(`Python stderr: ${line}`);
            });
        });

        pythonProcess.on('error', (error) => {
            clearTimeout(processTimeout);
            log.error('PYTHON_SPAWN', 'Failed to start Python process', error);
            cleanupFiles(inputPath);
            return res.status(500).json({ error: `Failed to start Python process: ${error.message}` });
        });

        processTimeout = setTimeout(() => {
            log.error('TIMEOUT', 'Python process timed out after 2 minutes');
            pythonProcess.kill();
            cleanupFiles(inputPath);
            return res.status(504).json({ 
                error: 'Processing timed out. Please try with a smaller image or reduce image complexity.'
            });
        }, TIMEOUT_MS);

        pythonProcess.on('close', (code) => {
            clearTimeout(processTimeout);
            log.stage('PYTHON_COMPLETE', `Python process closed with code: ${code}`);
            
            if (code !== 0) {
                log.error('PYTHON_ERROR', 'Processing failed', stderrData);
                cleanupFiles(inputPath);
                
                // Try to extract a meaningful error message
                const errorMatch = stderrData.match(/\[PYTHON\] \[ERROR\] (.+)/);
                const errorMessage = errorMatch ? errorMatch[1] : stderrData;
                
                return res.status(500).json({ 
                    error: `Processing failed: ${errorMessage}`,
                    details: stderrData
                });
            }

            // Verify the output file
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                log.error('OUTPUT_VALIDATION', 'Output file not found or empty');
                cleanupFiles(inputPath);
                return res.status(500).json({ error: 'Output file not found or empty' });
            }

            log.stage('SEND_FILE', `Sending processed file: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
            
            // Send the processed image
            res.sendFile(path.resolve(outputPath), {}, (err) => {
                if (err) {
                    log.error('SEND_FILE', 'Error sending file', err);
                    res.status(500).json({ error: 'Error sending processed image' });
                }
                log.stage('CLEANUP', 'Cleaning up temporary files');
                cleanupFiles(inputPath, outputPath);
            });
        });
    } catch (error) {
        log.error('PROCESSING', 'Error during image processing', error);
        cleanupFiles(req.file.path);
        return res.status(500).json({ error: 'Error processing image: ' + error.message });
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