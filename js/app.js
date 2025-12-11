/**
 * app.js
 * Main controller for the Lomnov Camera App.
 */
import { Camera } from './camera.js';
import { FrameProcessor } from './frame-processor.js';
import { ApiService } from './api-service.js';

// Init Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// DOM Elements
const videoEl = document.getElementById('camera-stream');
const uiOverlay = document.querySelector('.camera-overlay');
const scanLine = document.querySelector('.scan-line');
const captureBtn = document.getElementById('capture-btn'); // Capture button
const statusBadge = document.createElement('div'); // New status indicator

// Setup Status Badge
statusBadge.className = 'status-badge';
statusBadge.innerText = 'Ready';
document.querySelector('.camera-view').appendChild(statusBadge);

// Modules
const camera = new Camera(videoEl);
const processor = new FrameProcessor();
const api = new ApiService();
const overlayCanvas = document.getElementById('overlay-canvas');
const overlayCtx = overlayCanvas.getContext('2d');

// State
let isProcessing = false;

function resizeCanvas() {
    overlayCanvas.width = videoEl.videoWidth;
    overlayCanvas.height = videoEl.videoHeight;
}

async function startApp() {
    try {
        statusBadge.innerText = 'Starting Camera...';
        await camera.start();
        statusBadge.innerText = 'Ready';
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // MANUAL MODE: Wait for user click
        setupManualCapture();

    } catch (e) {
        console.error(e);
        statusBadge.innerText = 'Camera Error';
        statusBadge.style.background = 'rgba(231, 76, 60, 0.8)';
    }
}

function setupManualCapture() {
    captureBtn.addEventListener('click', async () => {
        if (isProcessing) return;

        // UI Feedback
        isProcessing = true;
        statusBadge.innerText = 'Capturing...';
        statusBadge.style.color = '#6c5ce7';
        captureBtn.classList.add('active'); // Add visual press effect if CSS supports it

        // Haptic Feedback for press
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

        try {
            // 1. Capture Frame immediately
            const frames = processor.captureImmediate(camera.getVideo());

            if (frames) {
                statusBadge.innerText = 'Analyzing...';

                // 2. Clear previous drawings
                overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

                // 3. Send to API
                const apiResponse = await api.sendDetectionRequest(frames);

                // 4. Handle Result
                handleDetectionResult(apiResponse);
            }
        } catch (err) {
            console.error(err);
            statusBadge.innerText = 'Error';
            // Show error in global handler too for visibility
            if (window.onerror) window.onerror(err.message, 'app.js', 0, 0, err);
        } finally {
            isProcessing = false;
            statusBadge.style.color = 'white';
            captureBtn.classList.remove('active');

            // Reset status after a delay unless we found objects
            setTimeout(() => {
                if (statusBadge.innerText === 'Analyzing...' || statusBadge.innerText === 'Error') {
                    statusBadge.innerText = 'Ready';
                }
            }, 3000);
        }
    });
}

function handleDetectionResult(response) {
    if (response.success && response.detections.length > 0) {
        const names = response.detections.map(d => d.label).join(', ');
        statusBadge.innerText = `Detected: ${names}`;

        // Haptic feedback
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }

        // Draw bounding boxes
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        response.detections.forEach(det => {
            const [x, y, w, h] = det.box;

            // Draw Box
            overlayCtx.strokeStyle = '#6c5ce7';
            overlayCtx.lineWidth = 4;
            overlayCtx.beginPath();

            // Check for roundRect support
            if (overlayCtx.roundRect) {
                overlayCtx.roundRect(x, y, w, h, 8);
            } else {
                overlayCtx.rect(x, y, w, h);
            }

            overlayCtx.stroke();

            // Draw Label Background
            overlayCtx.fillStyle = '#6c5ce7';
            overlayCtx.font = '16px Outfit';
            const textWidth = overlayCtx.measureText(det.label).width;
            overlayCtx.fillRect(x, y - 24, textWidth + 16, 24);

            // Draw Label Text
            overlayCtx.fillStyle = '#ffffff';
            overlayCtx.fillText(det.label, x + 8, y - 6);
        });
    } else {
        statusBadge.innerText = 'No objects found';
    }
}

// Start
document.addEventListener('DOMContentLoaded', startApp);

// Cleanup
window.addEventListener('beforeunload', () => {
    if (detectionInterval) clearInterval(detectionInterval);
    camera.stop();
});
