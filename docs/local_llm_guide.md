# 🚀 Local LLM Optimization Guide

Your local LLM is slow likely because of **model size** or **quantization level** relative to your hardware.

For *SmallSteps*, we need a model that is **fast** and **good at following JSON instructions**. We don't need a massive "creative writing" model.

## 🏆 Recommended Models (Fastest to Slowest)

### 1. **Phi-3 Mini (3.8B) - Instruct**
*   **Speed:** ⚡⚡⚡⚡⚡ (Extremely Fast)
*   **Why:** Designed by Microsoft for logical reasoning and instruction following. Punching way above its weight class.
*   **Search in LM Studio:** `microsoft phi 3 mini 4k`
*   **Select:** `Q4_K_M` (Quantized) or `Q5_K_M`.

### 2. **Qwen 2.5 7B - Instruct**
*   **Speed:** ⚡⚡⚡ (Medium-Fast)
*   **Why:** Currently the "king" of small open-source models for logic and coding. Excellent at valid JSON generation.
*   **Search in LM Studio:** `qwen 2.5 7b instruct`
*   **Select:** `Q4_K_M` or `Q5_K_M`.

### 3. **Llama 3 8B - Instruct**
*   **Speed:** ⚡⚡⚡ (Medium-Fast)
*   **Why:** Very solid reasoning, but slightly larger/slower than Phi-3.
*   **Search in LM Studio:** `meta llama 3 8b instruct`
*   **Select:** `Q4_K_M`.

---

## ⚙️ Critical Settings in LM Studio

Make sure these settings are applied in the right-hand panel:

1.  **GPU Offload**:
    *   **Max**: If you have an NVIDIA GPU, set the slide bar to **MAX** (offload all layers).
    *   If you don't have a GPU, these models will run on CPU, which is why **Phi-3 Mini** is your best bet (it runs great on CPU).

2.  **Context Length**:
    *   Keep it around **2048** or **4096**. Higher context = Slower.

3.  **Flash Attention**: 
    *   Enable this checkbox if your hardware supports it (usually on by default for Apple Silicon / Newer NVIDIA).

## 🔄 How to Switch
1.  Go to the **Search** (Magnifying glass) tab in LM Studio.
2.  Type `phi 3 mini`.
3.  Download the one by `microsoft` (or `bartowski` / `QuantFactory` for GGUF).
4.  Pick the file ending in `Q4_K_M.gguf`.
5.  Go back to **Chat** tab, select the new model at the top.
6.  **Important**: Click "Reload" or "Eject" on the old model to free up memory first.
