---
name: ollama-vision
description: >
  Batch image analysis using local Ollama + gemma4 (multimodal).
  Use when the user needs to analyze, caption, classify, or extract text from images locally — 
  free, offline, no rate limits, no API key needed.
  Keywords: image analysis, batch images, captions, OCR, vision, gemma4, ollama, local AI
---

# Ollama Vision — Batch Image Analysis with gemma4

## Setup (already done on this machine)

- Ollama installed and running (auto-starts on Windows boot)
- Model: `gemma4` (9.6 GB, multimodal)
- Python package: `ollama` v0.6.1 installed (pip, Python 3.10)
- REST API available at `http://localhost:11434`

## Core Pattern

```python
import ollama

response = ollama.chat(model='gemma4', messages=[{
    'role': 'user',
    'content': 'Your prompt here',
    'images': ['path/to/image.jpg']  # omit for text-only
}])
print(response['message']['content'])
```

## Batch Image Captioning Script

```python
import ollama
from pathlib import Path
import csv

def caption_images(folder: str, prompt: str = "Write a short caption for this image.", output_csv: str = "captions.csv"):
    images_dir = Path(folder)
    extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}
    image_files = [f for f in images_dir.iterdir() if f.suffix.lower() in extensions]
    
    results = []
    for i, img_path in enumerate(image_files, 1):
        print(f"[{i}/{len(image_files)}] Processing {img_path.name}...")
        try:
            response = ollama.chat(model='gemma4', messages=[{
                'role': 'user',
                'content': prompt,
                'images': [str(img_path)]
            }])
            caption = response['message']['content'].strip()
            results.append({'file': img_path.name, 'caption': caption})
            print(f"  → {caption[:80]}...")
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({'file': img_path.name, 'caption': f'ERROR: {e}'})
    
    with open(output_csv, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['file', 'caption'])
        writer.writeheader()
        writer.writerows(results)
    
    print(f"\nDone! Saved {len(results)} captions to {output_csv}")

# Usage
caption_images("./images", prompt="Describe this image in one sentence.")
```

## Common Prompts

| Task | Prompt |
|------|--------|
| Caption | `"Write a short, descriptive caption for this image."` |
| Alt text | `"Write alt text for this image for accessibility."` |
| Classification | `"What category does this image belong to? Reply with one word."` |
| OCR | `"Extract all text visible in this image."` |
| Product description | `"Write a product description for the item shown in this image."` |
| Social media | `"Write a catchy Instagram caption for this image."` |

## REST API Alternative (no Python package needed)

```python
import requests, base64

def analyze_image(image_path: str, prompt: str) -> str:
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    
    response = requests.post("http://localhost:11434/api/generate", json={
        "model": "gemma4",
        "prompt": prompt,
        "images": [img_b64],
        "stream": False
    })
    return response.json()["response"]
```

## Tips

- gemma4 handles JPG, PNG, WEBP, GIF, BMP
- For large batches, add `time.sleep(0.5)` between requests to avoid overloading
- Results are best when prompts are specific ("describe the main subject" vs "describe this")
- Ollama must be running — check with `ollama list` in terminal
