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
const statusBadge = document.createElement('div'); // New status indicator

// Setup Status Badge
statusBadge.className = 'status-badge';
statusBadge.innerText = 'Initialize...';
document.querySelector('.camera-view').appendChild(statusBadge);

// Modules
const camera = new Camera(videoEl);
const processor = new FrameProcessor();
const api = new ApiService();
const overlayCanvas = document.getElementById('overlay-canvas');
const overlayCtx = overlayCanvas.getContext('2d');

// State
let isProcessing = false;
let detectionInterval = null;

function resizeCanvas() {
    overlayCanvas.width = videoEl.videoWidth;
    overlayCanvas.height = videoEl.videoHeight;
}

async function startApp() {
    try {
        statusBadge.innerText = 'Starting Camera...';
        await camera.start();
        statusBadge.innerText = 'Scanning...';
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Start Analysis Loop
        startAnalysis();
    } catch (e) {
        console.error(e);
        statusBadge.innerText = 'Camera Error';
        statusBadge.style.background = 'rgba(231, 76, 60, 0.8)';
    }
}

function startAnalysis() {
    // Run analysis every 200ms (5 FPS) to save battery while keeping UI responsive
    detectionInterval = setInterval(async () => {
        if (isProcessing) return; // Don't stack requests

        const result = processor.process(camera.getVideo());

        if (result) {
            // Found good frames!
            isProcessing = true;
            statusBadge.innerText = 'Analyzing Objects...';
            statusBadge.style.color = '#6c5ce7'; // Primary color
            scanLine.style.boxShadow = '0 0 15px #6c5ce7'; // Emphasize scan line

            // Clear previous boxes
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            try {
                const apiResponse = await api.sendDetectionRequest(result);
                handleDetectionResult(apiResponse);
            } catch (err) {
                console.error(err);
                statusBadge.innerText = 'Network Error';
            } finally {
                // Cooldown before next detection
                setTimeout(() => {
                    isProcessing = false;
                    statusBadge.innerText = 'Scanning...';
                    statusBadge.style.color = 'white';
                    scanLine.style.boxShadow = '0 0 10px var(--primary-color)';
                    // Clear boxes after cooldown? Or keep them until next scan? 
                    // Let's fade them out or clear them when scanning resumes logic picks up.
                    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                }, 3000);
            }
        }
    }, 200);
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
