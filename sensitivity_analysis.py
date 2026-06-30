"""
Multi-dimensional sensitivity analysis for Eras decode algorithm.
Tests origin_1.jpg against progressive adjustments to find failure thresholds.
"""
import sys
sys.path.insert(0, r'd:\anaconda_projects\SwiftCrypto')
from diagnose_eras import *
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import math

B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
BASE = r'd:\anaconda_projects\SwiftCrypto\pic_comparison'
CORRECT_B64 = 'sKcwL0wLfQ5mS5j3bNFQbBRAQVGzwlPUbmfwzmJ8cfHCfEh69C8k4Ybw/A=='

def test_decode(img_arr, label):
    """Test if an image decodes correctly. Returns (success, b64, details)"""
    W, H = img_arr.shape[1], img_arr.shape[0]
    ref = detect_ref_row(img_arr, W, H)
    if not ref:
        return False, 'NO_REF', None
    
    sampled, ref_top, ref_bot, refH = sample_ref_colors(img_arr, ref, W, H)
    if not sampled or refH < 6:
        return False, 'NO_SAMPLE', None
    
    ref['refBot'] = ref_bot
    b64, details = decode_grid(img_arr, ref, sampled, W, H)
    
    if len(b64) < 2:
        return False, 'NO_DATA', None
    
    # Checksum retry: trim trailing garbage chars
    checksum_ok = False
    for trim in range(4):
        trial = b64 if trim == 0 else b64[:-trim]
        if len(trial) < 2: break
        csChar = trial[-1]
        data = trial[:-1]
        cs = 0
        for c in data:
            i = B64.find(c)
            if i >= 0: cs ^= i
        if (cs & 63) == B64.find(csChar):
            checksum_ok = True
            break
    
    return checksum_ok, b64[:20], None

def adjust_brightness(img_arr, factor):
    """factor: 0.0=black, 1.0=original, >1.0=brighter"""
    return np.clip(img_arr.astype(np.float32) * factor, 0, 255).astype(np.int32)

def adjust_contrast(img_arr, factor):
    """factor: 0.0=gray, 1.0=original, >1.0=more contrast"""
    return np.clip((img_arr.astype(np.float32) - 128) * factor + 128, 0, 255).astype(np.int32)

def adjust_saturation(img_arr, factor):
    """factor: 0.0=grayscale, 1.0=original"""
    gray = np.mean(img_arr, axis=2, keepdims=True)
    return np.clip(gray + (img_arr.astype(np.float32) - gray) * factor, 0, 255).astype(np.int32)

def adjust_color_temp(img_arr, kelvin_shift):
    """Positive=warmer (more red, less blue), Negative=cooler"""
    r = np.clip(img_arr[:,:,0].astype(np.float32) + kelvin_shift, 0, 255)
    b = np.clip(img_arr[:,:,2].astype(np.float32) - kelvin_shift, 0, 255)
    result = img_arr.copy()
    result[:,:,0] = r.astype(np.int32)
    result[:,:,2] = b.astype(np.int32)
    return result

def add_noise(img_arr, std_dev):
    """Add Gaussian noise"""
    noise = np.random.normal(0, std_dev, img_arr.shape)
    return np.clip(img_arr.astype(np.float32) + noise, 0, 255).astype(np.int32)

def adjust_vignette(img_arr, strength):
    """Darken edges: 0=none, 1=full vignette"""
    H, W = img_arr.shape[0], img_arr.shape[1]
    cy, cx = H/2, W/2
    max_dist = math.sqrt(cx*cx + cy*cy)
    y, x = np.ogrid[:H, :W]
    dist = np.sqrt((x-cx)**2 + (y-cy)**2) / max_dist
    vignette = 1.0 - strength * dist
    vignette = np.clip(vignette, 0.1, 1.0)
    return np.clip(img_arr.astype(np.float32) * vignette[:,:,np.newaxis], 0, 255).astype(np.int32)

def adjust_blur(img_arr, radius):
    """Gaussian blur with given radius"""
    img = Image.fromarray(img_arr.astype(np.uint8))
    blurred = img.filter(ImageFilter.GaussianBlur(radius))
    return np.array(blurred).astype(np.int32)

def adjust_jpeg_quality(img_arr, quality):
    """Simulate JPEG compression at given quality"""
    img = Image.fromarray(img_arr.astype(np.uint8))
    import io
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality)
    buf.seek(0)
    reloaded = Image.open(buf).convert('RGB')
    return np.array(reloaded).astype(np.int32)

def find_threshold(img_arr, adjust_fn, param_range, name, threshold_check=0.5):
    """Binary search for failure threshold"""
    success_runs = []
    for p in param_range:
        adjusted = adjust_fn(img_arr.copy(), p)
        ok, info, _ = test_decode(adjusted, f'{name}={p}')
        success_runs.append((p, ok, info))
    
    # Find transition point
    last_ok = True
    threshold = None
    for p, ok, info in success_runs:
        if last_ok and not ok:
            threshold = p
            break
        last_ok = ok
    
    return success_runs, threshold

# Load image
img_orig = np.array(Image.open(r'd:\anaconda_projects\SwiftCrypto\pic_comparison\origin_1.jpg').convert('RGB')).astype(np.int32)

print("="*60)
print("ERAS DECODE SENSITIVITY ANALYSIS")
print("="*60)
print(f"Base image: 319x366, correct b64: {CORRECT_B64[:30]}...")

# Verify base decodes correctly
ok, info, _ = test_decode(img_orig, 'base')
print(f"Base decode: {'OK' if ok else 'FAIL - ' + info}")

tests = []

# 1. Brightness
print("\n--- 1. BRIGHTNESS ---")
brightness_range = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 
                    1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.5, 3.0]
for f in brightness_range:
    adj = adjust_brightness(img_orig, f)
    ok, info, _ = test_decode(adj, f'brightness={f:.2f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  x{f:.2f}: {status}")
    tests.append(('Brightness', f, ok))

# 2. Contrast
print("\n--- 2. CONTRAST ---")
contrast_range = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
                  1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0]
for f in contrast_range:
    adj = adjust_contrast(img_orig, f)
    ok, info, _ = test_decode(adj, f'contrast={f:.2f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  x{f:.2f}: {status}")
    tests.append(('Contrast', f, ok))

# 3. Saturation
print("\n--- 3. SATURATION ---")
sat_range = [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
for f in sat_range:
    adj = adjust_saturation(img_orig, f)
    ok, info, _ = test_decode(adj, f'saturation={f:.2f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  x{f:.2f}: {status}")
    tests.append(('Saturation', f, ok))

# 4. Color temperature
print("\n--- 4. COLOR TEMPERATURE ---")
temp_range = [-80, -60, -40, -30, -20, -10, 0, 10, 20, 30, 40, 60, 80]
for f in temp_range:
    adj = adjust_color_temp(img_orig, f)
    ok, info, _ = test_decode(adj, f'colortemp={f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  {f:+d}: {status}")
    tests.append(('ColorTemp', f, ok))

# 5. Noise
print("\n--- 5. GAUSSIAN NOISE ---")
np.random.seed(42)
noise_range = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60]
for f in noise_range:
    adj = add_noise(img_orig, f)
    ok, info, _ = test_decode(adj, f'noise={f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  sigma={f}: {status}")
    tests.append(('Noise', f, ok))

# 6. Blur
print("\n--- 6. GAUSSIAN BLUR ---")
blur_range = [0, 0.3, 0.5, 0.7, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0]
for f in blur_range:
    adj = adjust_blur(img_orig, f)
    ok, info, _ = test_decode(adj, f'blur={f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  radius={f}: {status}")
    tests.append(('Blur', f, ok))

# 7. Vignette
print("\n--- 7. VIGNETTE ---")
vignette_range = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
for f in vignette_range:
    adj = adjust_vignette(img_orig, f)
    ok, info, _ = test_decode(adj, f'vignette={f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  strength={f}: {status}")
    tests.append(('Vignette', f, ok))

# 8. JPEG quality
print("\n--- 8. JPEG QUALITY ---")
jpeg_range = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100]
for f in jpeg_range:
    adj = adjust_jpeg_quality(img_orig, f)
    ok, info, _ = test_decode(adj, f'jpeg={f}')
    status = 'OK' if ok else 'FAIL'
    print(f"  quality={f}: {status}")
    tests.append(('JPEG', f, ok))

# Summary
print("\n" + "="*60)
print("SUMMARY: FAILURE THRESHOLDS")
print("="*60)
categories = {}
for cat, val, ok in tests:
    if cat not in categories:
        categories[cat] = {'min_ok': None, 'max_ok': None, 'min_fail': None}
    if ok:
        if categories[cat]['min_ok'] is None or val < categories[cat]['min_ok']:
            categories[cat]['min_ok'] = val
        if categories[cat]['max_ok'] is None or val > categories[cat]['max_ok']:
            categories[cat]['max_ok'] = val
    else:
        if categories[cat]['min_fail'] is None or abs(val) < abs(categories[cat]['min_fail']):
            categories[cat]['min_fail'] = val

for cat in ['Brightness', 'Contrast', 'Saturation', 'ColorTemp', 'Noise', 'Blur', 'Vignette', 'JPEG']:
    c = categories[cat]
    range_str = f"{c['min_ok']:.2f} ~ {c['max_ok']:.2f}" if c['min_ok'] is not None else "N/A"
    fail_at = c['min_fail']
    print(f"  {cat:15s}: OK range [{range_str:15s}]  first fail at {fail_at}")


print("\n" + "="*60)
print("DONE")
