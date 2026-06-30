# Eras 解码算法敏感性分析报告 v2

> 基于 `origin_1.jpg` 逐维度测试，密码 `1298131795-boss-dressed`
> 
> 测试环境: sliding window ref detection + adaptive bg threshold + CIE Lab a\*b\* Euclidean matching

## 测试方法

对 origin_1.jpg 逐维度施加渐进式调整，通过 Python 模拟完整解码管线，记录首次失败的阈值。

---

## 1. 亮度 (Brightness)

`pixel * factor`

| 倍率 | 结果 | 倍率 | 结果 |
|------|------|------|------|
| 0.05x | FAIL | 0.80x | OK |
| 0.10x | FAIL | 0.90x | OK |
| 0.15x | FAIL | 1.00x | OK |
| 0.20x | FAIL | 1.10x | OK |
| 0.30x | FAIL | 1.20x | OK |
| 0.40x | OK | 1.30x | OK |
| 0.50x | OK | 1.40x | OK |
| 0.60x | OK | 1.50x | OK |
| 0.70x | OK | 1.60x | OK |
| | | 1.80x | OK |
| | | 2.00x | OK |
| | | 2.50x | OK |
| | | 3.00x | FAIL |

**通过范围: 0.40x ~ 2.50x** (v1: 0.40~1.20, +108%)

---

## 2. 对比度 (Contrast)

`(pixel - 128) * factor + 128`

| 倍率 | 结果 | 倍率 | 结果 |
|------|------|------|------|
| 0.10x | FAIL | 1.00x | OK |
| 0.20x | FAIL | 1.10x | OK |
| 0.30x | FAIL | 1.20x | OK |
| 0.40x | FAIL | 1.30x | OK |
| 0.50x | FAIL | 1.40x | OK |
| 0.60x | FAIL | 1.50x | OK |
| 0.70x | FAIL | 1.60x | OK |
| 0.80x | FAIL | 1.80x | OK |
| 0.90x | FAIL | 2.00x | OK |

**通过范围: 1.00x ~ 2.00x (模拟)**

> 真实滤镜图片 modified_3.jpg (对比度降低) **已通过浏览器测试** - sliding window ref detection 修复了背景变亮导致的检测失效

---

## 3. 饱和度 (Saturation)

`gray + (pixel - gray) * factor`

| 倍率 | 结果 |
|------|------|
| 0.00x | FAIL |
| 0.05x | OK |
| 0.10~1.00x | OK |

**通过范围: 5% ~ 100%** - 极强

---

## 4. 色温 (Color Temperature)

`R + shift, B - shift`

| 偏移 | 结果 |
|------|------|
| -80 ~ -30 | FAIL |
| -20 ~ +20 | OK |
| +30 ~ +80 | FAIL |

**通过范围: -20 ~ +20**

---

## 5. 高斯噪声 (Gaussian Noise)

`pixel + N(0, sigma^2)`

| sigma | 结果 |
|-------|------|
| 0 | OK |
| 5~60 | FAIL |

**通过范围: 仅 sigma=0** - 无纠错码

---

## 6. 高斯模糊 (Gaussian Blur)

| 半径 | 结果 |
|------|------|
| 0~1.0px | OK |
| 1.2px | FAIL |

**通过范围: 0 ~ 1.0px**

---

## 7. 暗角 (Vignette)

| 强度 | 结果 |
|------|------|
| 0~0.9 | OK |

**通过范围: 0 ~ 90%** - 极强

---

## 8. JPEG 压缩质量

| 质量 | 结果 |
|------|------|
| Q10~100 | OK |

**通过范围: Q=10 ~ 100** - 极强

---

## 总结 (v2 vs v1)

| 维度 | v1 范围 | v2 范围 | 变化 |
|------|---------|---------|------|
| JPEG 质量 | Q10~100 | Q10~100 | - |
| 饱和度 | 5%~100% | 5%~100% | - |
| 暗角 | 0~90% | 0~90% | - |
| 模糊 | 0~1.0px | 0~1.0px | - |
| 亮度 | 0.40~1.20x | 0.40~2.50x | +108% |
| 色温 | -20~+20 | -20~+20 | - |
| 对比度(模拟) | 1.0~2.0x | 1.0~2.0x | - |
| 对比度(真实) | FAIL | OK (modified_3) | 修复 |
| 噪声 | sigma=0 | sigma=0 | - |

### v2 关键改进

1. **亮度范围翻倍**: 自适应背景阈值 + 滑动窗口使亮度容忍度从 1.20x 提升到 2.50x
2. **真实对比度降低修复**: sliding window ref detection 解决了对比度降低时卡片边框被误认为参考块的问题
3. **四张真实滤镜图片全部通过**: origin_1, modified_1 (蓝调), modified_2 (暗角), modified_3 (对比度降低)

---

*报告生成时间: 2026-06-30 | commit e2ad0ff*
