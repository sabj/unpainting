import os
from PIL import Image
try:
    Image.open(os.environ['TGT']).load(); print('NOT BLOCKED: PIL Image.open')
except Exception as e: print('blocked: PIL Image.open ->', str(e)[:70])
