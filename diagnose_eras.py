"""
Analyze origin vs modified Eras Code images to understand why
decoder fails on modified image despite human-discernible colors.
"""
import sys, os, json, math
from PIL import Image
import numpy as np

ERA_COLORS = ['#FFD60A','#FF9500','#34C759','#007AFF','#AF52DE','#5AC8FA','#FF2D55','#8E8E93']
ERA_COLORS_RGB = [(int(c[1:3],16), int(c[3:5],16), int(c[5:7],16)) for c in ERA_COLORS]
BASE = r'd:\anaconda_projects\SwiftCrypto\pic_comparison'
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

EC_COLS, EC_CELL, EC_GAP = 12, 20, 3
CELL_SP = EC_CELL + EC_GAP

def rgb2lab(r, g, b):
    """sRGB → CIE Lab (D65)"""
    def lin(v):
        v = v / 255.0
        return ((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92
    rl, gl, bl = lin(r), lin(g), lin(b)
    x = 0.4124564*rl + 0.3575761*gl + 0.1804375*bl
    y = 0.2126729*rl + 0.7151522*gl + 0.0721750*bl
    z = 0.0193339*rl + 0.1191920*gl + 0.9503041*bl
    def f(v):
        return v**(1/3) if v > 0.008856 else 7.787*v + 16/116
    fx, fy, fz = f(x/0.95047), f(y/1.0), f(z/1.08883)
    return (116*fy - 16, 500*(fx - fy), 200*(fy - fz))

def detect_ref_row(img_arr, W, H):
    """Find reference row with 8 evenly-spaced bright blocks"""
    # Adaptive bg threshold
    bg_sum, bg_n = 0, 0
    for y in range(int(H*0.05), int(H*0.15), 3):
        for x in range(int(W*0.1), int(W*0.9), 5):
            r, g, b = img_arr[y, x]; bg_sum += int(r)+int(g)+int(b); bg_n += 1
    bg_avg = bg_sum / bg_n if bg_n > 0 else 60
    thresholds = sorted(set([round(bg_avg+40), round(bg_avg+80), 120, 180, 240]))
    for thresh in thresholds:
        for y in range(4, int(H*0.4)):
            runs = []
            in_b, rs = False, 0
            for x in range(W):
                r, g, b = img_arr[y, x]
                bright = int(r)+int(g)+int(b) > thresh
                if bright and not in_b:
                    in_b = True; rs = x
                if not bright and in_b:
                    in_b = False
                    if x - rs >= 8:
                        runs.append((rs, x))
            if len(runs) >= 8:
                # Sliding window: find 8 consistently-spaced runs
                for trimL in range(len(runs) - 7):
                    sub = runs[trimL:trimL+8]
                    sp = [sub[i][0] - sub[i-1][0] for i in range(1, 8)]
                    avg = sum(sp) / 7
                    if all(abs(s - avg) < avg * 0.3 for s in sp):
                        return {
                        'refY': y, 'refX0': sub[0][0],
                        'refW': sub[0][1] - sub[0][0],
                        'refSp': avg, 'runs': sub,
                        'thresh': thresh
                    }
    return None

def sample_ref_colors(img_arr, ref, W, H):
    """Sample actual colors from reference blocks"""
    refY, refX0, refW = ref['refY'], ref['refX0'], ref['refW']
    refRuns = ref['runs']
    
    # Vertical scan to find ref height
    cx = refX0 + round(refW / 2)
    ref_top, ref_bot = refY, refY
    while ref_top > 0 and int(img_arr[ref_top-1, cx, 0]) + int(img_arr[ref_top-1, cx, 1]) + int(img_arr[ref_top-1, cx, 2]) > 120:
        ref_top -= 1
    while ref_bot < H-1 and int(img_arr[ref_bot+1, cx, 0]) + int(img_arr[ref_bot+1, cx, 1]) + int(img_arr[ref_bot+1, cx, 2]) > 120:
        ref_bot += 1
    refH = ref_bot - ref_top + 1
    
    if refH < 6:
        return None, None, None, None
    
    ref_cy = ref_top + round(refH / 2)
    sr = max(2, round(refW * 0.3))
    sampled = []
    for i in range(min(8, len(refRuns))):
        cx = round((refRuns[i][0] + refRuns[i][1]) / 2)
        r_sum, g_sum, b_sum, count = 0, 0, 0, 0
        for dy in range(-sr, sr+1):
            for dx in range(-sr, sr+1):
                sy = ref_cy + dy
                if 0 <= sy < H:
                    r, g, b = img_arr[sy, cx+dx]
                    if r+g+b > 120:
                        r_sum += r; g_sum += g; b_sum += b; count += 1
        if count >= sr:
            sampled.append((round(r_sum/count), round(g_sum/count), round(b_sum/count)))
        else:
            break
    
    if len(sampled) != 8:
        return None, None, None, None
    
    return sampled, ref_top, ref_bot, refH

def read_cell(img_arr, refX0, dataY0, cellW, cellSp, col, row, target_lab, maxD2Vote, W, H, confThresh=0.15):
    """Simulate readCell using CIE Lab a*b* matching"""
    cx = round(refX0 + col * cellSp + cellW/2)
    cy = round(dataY0 + row * cellSp + cellW/2)
    if cx < 2 or cy < 2 or cx+2 >= W or cy+2 >= H:
        return -1
    
    r = max(3, round(cellW * 0.25))
    votes = [0]*8
    total = 0
    
    for dy in range(-r, r+1):
        for dx in range(-r, r+1):
            sy, sx = cy + dy, cx + dx
            if 0 <= sy < H and 0 <= sx < W:
                pr, pg, pb = img_arr[sy, sx]
                if pr + pg + pb < 25:
                    continue
                dist2 = dx*dx + dy*dy
                w = max(1, r*r - dist2)
                total += w
                lab = rgb2lab(pr, pg, pb)
                best_d2 = 1e9
                best_k = 0
                for k in range(8):
                    da = lab[1] - target_lab[k][1]
                    db = lab[2] - target_lab[k][2]
                    d2 = da*da + db*db
                    if d2 < best_d2:
                        best_d2 = d2
                        best_k = k
                if best_d2 < maxD2Vote:
                    votes[best_k] += w
    
    if total == 0:
        return -1
    maxV = max(votes)
    winner = votes.index(maxV)
    return winner if maxV > total * confThresh else -1

def decode_grid(img_arr, ref, sampled_rgb, W, H):
    """Full decode simulation"""
    refX0, refW, refBot = ref['refX0'], ref['refW'], ref['refBot']
    dataY0 = refBot + 1 + EC_GAP
    cellW, cellSp = refW, CELL_SP
    
    # Convert sampled reference RGB to Lab
    target_lab = [rgb2lab(*c) for c in sampled_rgb]
    
    # Compute maxD2Vote
    maxD2 = 0
    for i in range(8):
        for j in range(i+1, 8):
            da = target_lab[i][1] - target_lab[j][1]
            db = target_lab[i][2] - target_lab[j][2]
            d2 = da*da + db*db
            if d2 > maxD2:
                maxD2 = d2
    maxD2Vote = maxD2 * 1.5
    confThresh = 0.15
    
    # Max rows from card formula: cardH = rows*23 + 136
    maxDataRows = max(1, (H - 136) // CELL_SP)
    
    # Decode rows
    b64 = ''
    row_details = []
    for row in range(maxDataRows):
        mc = 0
        cell_results = []
        for col in range(EC_COLS):
            c = read_cell(img_arr, refX0, dataY0, cellW, cellSp, col, row,
                         target_lab, maxD2Vote, W, H, confThresh)
            if c >= 0:
                mc += 1
            cell_results.append(c)
        
        if mc == 0:
            break
        
        row_chars = ''
        for col in range(0, EC_COLS-1, 2):
            hi = read_cell(img_arr, refX0, dataY0, cellW, cellSp, col, row,
                          target_lab, maxD2Vote, W, H, confThresh)
            lo = read_cell(img_arr, refX0, dataY0, cellW, cellSp, col+1, row,
                          target_lab, maxD2Vote, W, H, confThresh)
            if hi >= 0 and lo >= 0:
                ch = B64[(hi << 3) | lo]
                b64 += ch
                row_chars += ch
        
        row_details.append({'row': row, 'mc': mc, 'chars': row_chars, 'cells': cell_results})
    
    return b64, row_details

def analyze_image(path, label):
    """Full analysis of one image"""
    print(f"\n{'='*60}")
    print(f"Analyzing: {label}")
    print(f"File: {path}")
    
    img = Image.open(path).convert('RGB')
    img_arr = np.array(img).astype(np.int32)
    W, H = img.size
    print(f"Dimensions: {W}x{H}")
    
    # Detect reference row
    ref = detect_ref_row(img_arr, W, H)
    if not ref:
        print("[FAIL] Reference row not found!")
        return None
    
    print(f"Reference: y={ref['refY']}, x0={ref['refX0']}, w={ref['refW']}, threshold={ref['thresh']}")
    
    # Sample reference colors
    sampled, ref_top, ref_bot, refH = sample_ref_colors(img_arr, ref, W, H)
    if not sampled:
        print("[FAIL] Could not sample reference colors!")
        return None
    
    ref['refBot'] = ref_bot
    
    print("\nSampled reference colors (RGB):")
    target_rgb = ERA_COLORS_RGB
    for i in range(8):
        orig_rgb = target_rgb[i]
        samp_rgb = sampled[i]
        print(f"  Color {i}: expected={orig_rgb}  sampled={samp_rgb}  DRGB=({samp_rgb[0]-orig_rgb[0]},{samp_rgb[1]-orig_rgb[1]},{samp_rgb[2]-orig_rgb[2]})")
    
    # Lab comparison
    print("\nReference colors in Lab (a*, b*):")
    target_lab = [rgb2lab(*c) for c in sampled]
    orig_lab = [rgb2lab(*c) for c in target_rgb]
    for i in range(8):
        print(f"  Color {i}: original a*b*=({orig_lab[i][1]:.1f},{orig_lab[i][2]:.1f})  sampled=({target_lab[i][1]:.1f},{target_lab[i][2]:.1f})")
    
    # Inter-color distances
    print("\nMin/max a*b* distance between reference colors:")
    minD2, maxD2 = float('inf'), 0
    minPair = None
    for i in range(8):
        for j in range(i+1, 8):
            da = target_lab[i][1] - target_lab[j][1]
            db = target_lab[i][2] - target_lab[j][2]
            d2 = da*da + db*db
            if d2 < minD2:
                minD2 = d2
                minPair = (i, j, d2)
            if d2 > maxD2:
                maxD2 = d2
    print(f"  Closest pair: colors {minPair[0]}-{minPair[1]}, d2={minPair[2]:.1f}, d={math.sqrt(minPair[2]):.1f}")
    print(f"  Furthest: d^2={maxD2:.1f}")
    print(f"  maxD2Vote={maxD2*1.5:.1f}")
    
    # Decode
    b64, details = decode_grid(img_arr, ref, sampled, W, H)
    print(f"\nDecoded {len(b64)} chars")
    print(f"Rows read: {len(details)}")
    
    # Show all rows
    for d in details[:]:
        cells_str = ' '.join(f'{c:2d}' if c>=0 else ' -' for c in d['cells'])
        print(f"  Row {d['row']:2d}: mc={d['mc']:2d} chars='{d['chars']}' cells=[{cells_str}]")
    
    # Check checksum
    if len(b64) > 1:
        csChar = b64[-1]
        data = b64[:-1]
        cs = 0
        for c in data:
            i = B64.find(c)
            if i >= 0:
                cs ^= i
        expected = B64[cs & 63]
        checksum_ok = expected == csChar
        print(f"\nChecksum: read='{csChar}' expected='{expected}' {'[OK]' if checksum_ok else '[FAIL] MISMATCH'}")
        if not checksum_ok:
            print(f"  XOR of data = {cs}, cs&63 = {cs&63}, expected char = '{B64[cs&63]}'")
    
    return {
        'ref': ref,
        'sampled': sampled,
        'target_lab': target_lab,
        'b64': b64,
        'details': details,
        'W': W, 'H': H,
        'minD2': minD2,
        'maxD2': maxD2,
    }


# ── Main Analysis ──
print("="*60)
print("ERAS DECODE DIAGNOSTIC: origin_1.jpg vs modified_1.jpg")
print("="*60)

# Analyze origin
origin = analyze_image(os.path.join(BASE, 'origin_1.jpg'), 'ORIGIN')

# Analyze modified
modified = analyze_image(os.path.join(BASE, 'modified_1.jpg'), 'MODIFIED')

# ── Cross-comparison ──
if origin and modified:
    print(f"\n{'='*60}")
    print("CROSS-COMPARISON")
    print(f"{'='*60}")
    
    # Compare sampled reference colors
    print("\n1. Reference color comparison (sampled RGB):")
    for i in range(8):
        o_rgb = origin['sampled'][i]
        m_rgb = modified['sampled'][i]
        print(f"  Color {i}: origin={o_rgb}  modified={m_rgb}  D=({m_rgb[0]-o_rgb[0]},{m_rgb[1]-o_rgb[1]},{m_rgb[2]-o_rgb[2]})")
    
    # Compare Lab values
    print("\n2. Reference color comparison (a*b*):")
    for i in range(8):
        o_lab = origin['target_lab'][i]
        m_lab = modified['target_lab'][i]
        da = m_lab[1] - o_lab[1]
        db = m_lab[2] - o_lab[2]
        dist = math.sqrt(da*da + db*db)
        print(f"  Color {i}: origin a*b*=({o_lab[1]:.1f},{o_lab[2]:.1f})  modified=({m_lab[1]:.1f},{m_lab[2]:.1f})  Dab={dist:.1f}")
    
    # Compare color separability
    print(f"\n3. Color separability:")
    print(f"  Origin:    minD^2={origin['minD2']:.1f}, maxD^2={origin['maxD2']:.1f}")
    print(f"  Modified:  minD^2={modified['minD2']:.1f}, maxD^2={modified['maxD2']:.1f}")
    
    # Check if origin's target colors would work on modified
    print(f"\n4. Using ORIGIN's target colors on MODIFIED image:")
    # Re-decode modified with origin's sampled colors
    b64_cross, details_cross = decode_grid(
        np.array(Image.open(os.path.join(BASE, 'modified_1.jpg')).convert('RGB')).astype(np.int32),
        modified['ref'], origin['sampled'],
        modified['W'], modified['H']
    )
    csChar = b64_cross[-1] if len(b64_cross) > 1 else '?'
    data = b64_cross[:-1] if len(b64_cross) > 1 else ''
    cs = 0
    for c in data:
        i = B64.find(c)
        if i >= 0:
            cs ^= i
    print(f"  Decoded {len(b64_cross)} chars, checksum={'[OK]' if (cs&63)==B64.find(csChar) else '[FAIL]'}")
    
    # Pixel-level statistics
    print(f"\n5. Pixel-level analysis on first data cell:")
    refX0, refW, refBot = modified['ref']['refX0'], modified['ref']['refW'], modified['ref']['refBot']
    dataY0 = refBot + 1 + EC_GAP
    cellW, cellSp = refW, CELL_SP
    
    img_mod = np.array(Image.open(os.path.join(BASE, 'modified_1.jpg')).convert('RGB')).astype(np.int32)
    img_orig = np.array(Image.open(os.path.join(BASE, 'origin_1.jpg')).convert('RGB')).astype(np.int32)
    
    # First cell (col=0, row=0) center
    cx = round(refX0 + 0 * cellSp + cellW/2)
    cy = round(dataY0 + 0 * cellSp + cellW/2)
    r = max(3, round(cellW * 0.25))
    
    # Which color should it be? Let's check origin
    o_center = img_orig[cy, cx]
    m_center = img_mod[cy, cx]
    o_lab = rgb2lab(*o_center)
    m_lab = rgb2lab(*m_center)
    print(f"  Cell(0,0) center pixel:")
    print(f"    Origin:   RGB={tuple(o_center)}  a*b*=({o_lab[1]:.1f},{o_lab[2]:.1f})")
    print(f"    Modified: RGB={tuple(m_center)}  a*b*=({m_lab[1]:.1f},{m_lab[2]:.1f})")
    print(f"    Da*b* = {math.sqrt((m_lab[1]-o_lab[1])**2+(m_lab[2]-o_lab[2])**2):.1f}")
    
    # Vote distribution
    print(f"\n6. Vote distribution for cell(0,0) on MODIFIED:")
    votes = [0]*8
    total = 0
    target_lab = modified['target_lab']
    maxD2Vote = modified['maxD2'] * 1.5
    for dy in range(-r, r+1):
        for dx in range(-r, r+1):
            sy, sx = cy + dy, cx + dx
            if 0 <= sy < modified['H'] and 0 <= sx < modified['W']:
                pr, pg, pb = img_mod[sy, sx]
                if pr + pg + pb < 25:
                    continue
                dist2 = dx*dx + dy*dy
                w = max(1, r*r - dist2)
                total += w
                lab = rgb2lab(pr, pg, pb)
                best_k = 0
                best_d2 = 1e9
                for k in range(8):
                    da = lab[1] - target_lab[k][1]
                    db = lab[2] - target_lab[k][2]
                    d2 = da*da + db*db
                    if d2 < best_d2:
                        best_d2 = d2
                        best_k = k
                if best_d2 < maxD2Vote:
                    votes[best_k] += w
    
    print(f"  maxD2Vote = {maxD2Vote:.1f}")
    for k in range(8):
        pct = (votes[k]/total*100) if total > 0 else 0
        bar = '#' * int(pct/2)
        print(f"  Color {k}: {votes[k]:6.1f} ({pct:5.1f}%) {bar}")
    maxV = max(votes)
    winner = votes.index(maxV)
    conf = maxV/total if total > 0 else 0
    print(f"  Winner: color {winner}, confidence={conf:.3f} {'[OK]' if conf > 0.15 else '[FAIL] < 0.15'}")

    # ── Per-char comparison ──
    print(f"\n7. Decoded b64 char-by-char comparison:")
    o_b64 = origin['b64']
    m_b64 = modified['b64']
    diffs = 0
    for i in range(min(len(o_b64), len(m_b64))):
        oc, mc = o_b64[i], m_b64[i]
        if oc != mc:
            oi = B64.find(oc); mi = B64.find(mc)
            # Decompose into two color indices
            o_hi, o_lo = oi>>3, oi&7
            m_hi, m_lo = mi>>3, mi&7
            print(f"  [{i:3d}] '{oc}'→'{mc}'  colorIdx: {oi:2d}→{mi:2d}  cells: ({o_hi},{o_lo})→({m_hi},{m_lo})")
            diffs += 1
            if diffs >= 15:
                print(f"  ... ({diffs} differences)")
                break
    if diffs == 0:
        print(f"  All chars match [OK]")
    if len(o_b64) != len(m_b64):
        print(f"  Length: origin={len(o_b64)}, modified={len(m_b64)}")
    
    # ── Color confusion matrix ──
    print(f"\n8. Cell-level color confusion (origin→modified):")
    confusion = [[0]*8 for _ in range(8)]
    refX0, refBot = origin['ref']['refX0'], origin['ref']['refBot']
    dataY0 = refBot + 1 + EC_GAP
    o_lab = origin['target_lab']; m_lab = modified['target_lab']
    o_maxD2V = origin['maxD2']*1.5; m_maxD2V = modified['maxD2']*1.5
    
    for row in range(min(len(origin['details']), len(modified['details']))):
        for col in range(EC_COLS):
            oc = read_cell(img_orig, refX0, dataY0, 20, 23, col, row, o_lab, o_maxD2V, origin['W'], origin['H'])
            mc = read_cell(img_mod, refX0, dataY0, 20, 23, col, row, m_lab, m_maxD2V, modified['W'], modified['H'])
            if oc >= 0 and mc >= 0 and oc != mc:
                confusion[oc][mc] += 1
    
    for i in range(8):
        confused = [(j, confusion[i][j]) for j in range(8) if i != j and confusion[i][j] > 0]
        if confused:
            parts = [f"→{j}({n}x)" for j, n in confused]
            print(f"  Color {i}: " + ", ".join(parts))

print("\n" + "="*60)
print("DONE")
