import { logger } from './logger.js';
import { Camera } from './camera.js';
import { FrameProcessor } from './frame-processor.js';
import { ApiService } from './api-service.js';

// ... (setup)



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
    // Add null/undefined check
    if (!videoEl.videoWidth || !videoEl.videoHeight) return;
    overlayCanvas.width = videoEl.videoWidth;
    overlayCanvas.height = videoEl.videoHeight;
}

async function startApp() {
    try {
        statusBadge.innerText = 'Starting Camera...';
        await camera.start();
        statusBadge.innerText = 'Scanning...'; // Changed to Scanning
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // REAL-TIME MODE: Auto-scan
        startScanning();
        // setupManualCapture(); // Disabled

    } catch (e) {
        logger.error(`App Error: ${e.message}`);
        statusBadge.innerText = `Error: ${e.message.substring(0, 30)}...`;
        statusBadge.style.color = '#ff7675';
        console.error(e);
        statusBadge.innerText = 'Camera Error';
        statusBadge.style.background = 'rgba(231, 76, 60, 0.8)';
    }
}

function startScanning() {
    const scanLoop = async () => {
        // Stop if tab hidden or camera stopped
        if (!camera.isPlaying()) {
            requestAnimationFrame(scanLoop);
            return;
        }

        // Don't process if already busy
        if (isProcessing) {
            requestAnimationFrame(scanLoop);
            return;
        }

        // Check for sharp frames
        const frames = processor.process(camera.getVideo());

        if (frames && frames.length > 0) {
            isProcessing = true;
            logger.log("Scanner: Sharp frame found!");

            // Visual feedback - flash or status update
            statusBadge.innerText = 'Analyzing...';
            statusBadge.style.color = '#6c5ce7';
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

            try {
                const bestFrame = frames[0];
                const rawBase64 = bestFrame.dataUrl.split(',')[1];

                const apiResponse = await api.sendDetectionRequest(rawBase64);

                handleDetectionResult(apiResponse);

                // COOLDOWN: Wait 2s before scanning again so user can see boxes
                await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                logger.error(`Scanner: ${err.message}`);
                statusBadge.innerText = 'Error';
            } finally {
                isProcessing = false;
                statusBadge.style.color = 'white';

                // Clear boxes after cooldown if desired? 
                // For now, let's keep them until next detection or clear them here.
                // overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); 

                if (['Analyzing...', 'Error'].includes(statusBadge.innerText)) {
                    statusBadge.innerText = 'Scanning...';
                }
            }
        }

        requestAnimationFrame(scanLoop);
    };

    logger.log("Scanner: Starting loop...");
    requestAnimationFrame(scanLoop);
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
    camera.stop();
});
