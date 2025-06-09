import sys
import os
from rembg import remove
from PIL import Image
import numpy as np

print("Python Version:", sys.version)
print("Python Executable:", sys.executable)
print("Working Directory:", os.getcwd())
print("PYTHONPATH:", os.environ.get('PYTHONPATH', 'Not set'))
print("Available Packages:")
print("- PIL version:", Image.__version__)
print("- numpy version:", np.__version__)
try:
    import rembg
    print("- rembg version:", rembg.__version__)
except Exception as e:
    print("Error importing rembg:", str(e))

print("\nDirectory Contents:")
print(os.listdir('.')) 