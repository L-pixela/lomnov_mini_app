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
statusBadge.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.6);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.1);
    z-index: 100;
    transition: all 0.3s ease;
`;
statusBadge.innerHTML = 'Initialize...';
document.querySelector('.camera-view').appendChild(statusBadge);

// Modules
const camera = new Camera(videoEl);
const processor = new FrameProcessor();
const api = new ApiService();

// State
let isProcessing = false;
let detectionInterval = null;

async function startApp() {
    try {
        statusBadge.innerText = 'Starting Camera...';
        await camera.start();
        statusBadge.innerText = 'Scanning...';

        // Start Analysis Loop
        startAnalysis();
    } catch (e) {
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
                }, 2000);
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

        // Here you could draw bounding boxes on an overlay canvas
        // based on response.detections[i].box
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
