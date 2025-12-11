/**
 * frame-processor.js
 * Analyzes video frames to find the best quality images.
 */

export class FrameProcessor {
    constructor() {
        // Offscreen canvas for processing
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.buffer = []; // Store potential good frames
        this.BUFFER_SIZE = 5; // Keep analysis rolling window short
        this.MIN_SHARPNESS_THRESHOLD = 20; // Lowered threshold for easier detection
    }

    /**
     * Captures a single frame immediately (Manual Mode).
     * @param {HTMLVideoElement} video 
     * @returns {Array} Array containing the single captured frame.
     */
    captureImmediate(video) {
        if (!video || video.videoWidth === 0) return null;

        if (this.canvas.width !== video.videoWidth) {
            this.canvas.width = video.videoWidth;
            this.canvas.height = video.videoHeight;
        }

        this.ctx.drawImage(video, 0, 0);

        const frame = {
            timestamp: Date.now(),
            dataUrl: this.canvas.toDataURL('image/jpeg', 0.9)
        };

        return [frame];
    }

    /**
     * Processing Loop
     * @param {HTMLVideoElement} video 
     * @returns {Object|null} A result object if we have a qualified batch, else null.
     */
    process(video) {
        if (!video || video.videoWidth === 0) return null;

        // Sync canvas size
        if (this.canvas.width !== video.videoWidth) {
            this.canvas.width = video.videoWidth;
            this.canvas.height = video.videoHeight;
        }

        // Draw frame
        this.ctx.drawImage(video, 0, 0);

        // Analyze
        const sharpness = this.calculateSharpness(this.ctx, this.canvas.width, this.canvas.height);

        // Add to buffer
        this.buffer.push({
            timestamp: Date.now(),
            sharpness: sharpness,
            blob: null, // We'll convert to blob only if we select it to save memory, or lazy load? 
            // Actually, to send "best 2", we might need the image data.
            // For performance, let's store the DataURL or just the score for now, 
            // but we can't go back in time to get the blob. 
            // So we MUST capture the image data now.
            dataUrl: this.canvas.toDataURL('image/jpeg', 0.8)
        });

        // Maintain buffer size
        if (this.buffer.length > this.BUFFER_SIZE) {
            this.buffer.shift();
        }

        // Auto-detection logic:
        // If we have enough frames and they are sharp enough, trigger a "Detection Event"
        // For this demo, let's say if we have 2 frames > threshold in the buffer, return them.

        const goodFrames = this.buffer.filter(f => f.sharpness > this.MIN_SHARPNESS_THRESHOLD);

        if (goodFrames.length >= 2) {
            // Sort by sharpness descending
            goodFrames.sort((a, b) => b.sharpness - a.sharpness);

            // Pick top 2
            const top2 = goodFrames.slice(0, 2);

            // Clear buffer to prevent re-sending the same frames immediately
            const result = [...top2];
            this.buffer = [];
            return result;
        }

        return null;
    }

    /**
     * Simple Laplacian Variance algorithm to estimate "blurriness"
     * Higher score = Sharper
     */
    calculateSharpness(ctx, width, height) {
        // Performance optimization: Analyze a smaller center crop or downsampled version
        // Analyzing full 1080p frame every tick is too heavy for JS on mobile.
        // Let's analyze a 300x300 center crop.

        const sampleSize = 300;
        const startX = Math.max(0, (width - sampleSize) / 2);
        const startY = Math.max(0, (height - sampleSize) / 2);
        const w = Math.min(width, sampleSize);
        const h = Math.min(height, sampleSize);

        const imageData = ctx.getImageData(startX, startY, w, h);
        const data = imageData.data;

        // Convert to grayscale
        const grayData = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            // RGB -> Luma
            grayData[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }

        // Calculate Laplacian Kernel (basic edge detection)
        // [0,  1, 0]
        // [1, -4, 1]
        // [0,  1, 0]
        // We skip boundaries for simplicity

        let sum = 0;
        let count = 0;

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const laplacian =
                    grayData[i - w] +       // Top
                    grayData[i - 1] +       // Left
                    grayData[i + 1] +       // Right
                    grayData[i + w] -       // Bottom
                    (4 * grayData[i]);      // Center

                sum += Math.abs(laplacian);
                count++;
            }
        }

        const mean = sum / count;
        // Variance usually used, but mean edge intensity is a good enough proxy for sharpness speed
        return mean;
    }
}
