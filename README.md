# Image Processing API

This project provides a web-based API for image processing with two main features:
1. Automatically resize images to 500x500 pixels
2. Remove image backgrounds using the rembg library

## Features

- Single-step image processing
- Automatic image resizing
- Background removal with transparency
- React-based frontend
- Node.js/Express backend
- Python integration for background removal

## Prerequisites

- Node.js (v14 or higher)
- Python (v3.7 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone [your-repo-url]
cd [repo-name]
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Create necessary directories:
```bash
mkdir uploads processed
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:
```
PORT=3000
```

## Running the Application

1. Start the development server:
```bash
npm start
```

2. The application will be available at `http://localhost:3000`

## Deployment

This application is configured for deployment on Render.com. The necessary configuration files (`render.yaml`, `Procfile`, `requirements.txt`, and `runtime.txt`) are included in the repository.

## License

MIT
