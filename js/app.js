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
    let lastScanTime = 0;
    const SCAN_INTERVAL = 500; // ms between API calls (adjustable)
    const MIN_CONFIDENCE = 0.7; // Minimum confidence to confirm detection
    let detectionStreak = 0; // Track consecutive detections
    const REQUIRED_STREAK = 2; // Require 2 consecutive good detections
    let objectsDetected = 0; // Track total objects found in this session

    const scanLoop = () => {
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

        // Throttle: Only scan every SCAN_INTERVAL milliseconds
        const now = Date.now();
        if (now - lastScanTime < SCAN_INTERVAL) {
            requestAnimationFrame(scanLoop);
            return;
        }

        // Capture frame (no sharpness check)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const video = camera.getVideo();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to base64
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // Reduced quality for speed
        const rawBase64 = dataUrl.split(',')[1];

        // Start processing this frame
        lastScanTime = now;
        isProcessing = true;

        // Visual feedback
        statusBadge.innerText = 'Analyzing...';
        statusBadge.style.color = '#6c5ce7';
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

        // Send to API
        api.sendDetectionRequest(rawBase64)
            .then(apiResponse => {
                // Check if we have confident detections
                const confidentDetections = apiResponse.detections?.filter(d => d.confidence >= MIN_CONFIDENCE) || [];

                if (confidentDetections.length > 0) {
                    detectionStreak++;
                    logger.log(`Scanner: Good detection! Streak: ${detectionStreak}/${REQUIRED_STREAK}`);

                    if (detectionStreak >= REQUIRED_STREAK) {
                        // SUCCESS: Confirmed Detection
                        handleDetectionResult(apiResponse); // Draw bounding box and label
                        objectsDetected++;

                        // Show bounding box and label
                        statusBadge.innerText = `Found #${objectsDetected}: ${confidentDetections[0].label}`;
                        overlayCtx.lineWidth = 6;
                        overlayCtx.stroke();

                        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

                        // CASE 1: First Object Found
                        if (objectsDetected === 1) {
                            logger.log("Scanner: Object 1 found. Waiting 10s...");
                            isProcessing = false; // Stop temp

                            // Visual Countdown or Message
                            statusBadge.innerText = `Object 1 Found! Next scan in 10s...`;
                            captureBtn.innerText = 'Wait...';

                            setTimeout(() => {
                                // Resume for Object 2
                                logger.log("Scanner: Resuming for Object 2");
                                statusBadge.innerText = 'Scanning for Object 2...';
                                captureBtn.innerText = 'Scanning...';
                                overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

                                detectionStreak = 0; // Reset streak
                                requestAnimationFrame(scanLoop); // Resume loop
                            }, 10000);

                            return; // Pause loop here, resume in timeout
                        }

                        // CASE 2: Second Object Found
                        if (objectsDetected >= 2) {
                            logger.log("Scanner: Object 2 found. All done.");
                            statusBadge.innerText = `Completed! Found ${objectsDetected} objects.`;

                            // STOP LOOP PERMANENTLY
                            isProcessing = false;

                            // Show Reset Button
                            captureBtn.innerText = 'Restart Flow';
                            captureBtn.classList.add('active');
                            captureBtn.onclick = () => {
                                captureBtn.onclick = null;
                                // Full Reset
                                objectsDetected = 0;
                                detectionStreak = 0;
                                captureBtn.innerText = 'Scanning...';
                                captureBtn.classList.remove('active');
                                overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                                startScanning();
                            };
                            return;
                        }
                    }
                } else {
                    // No confident detection - reset streak
                    detectionStreak = 0;

                    // Visual feedback (subtle)
                    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                    statusBadge.innerText = 'Scanning...';
                    statusBadge.style.color = 'white';
                }

                // Continue scanning
                isProcessing = false;
                requestAnimationFrame(scanLoop);
            })
            .catch(err => {
                logger.error(`Scanner: ${err.message}`);
                statusBadge.innerText = 'Error';
                statusBadge.style.color = '#ff7675';

                // Retry after error
                setTimeout(() => {
                    isProcessing = false;
                    statusBadge.innerText = 'Scanning...';
                    statusBadge.style.color = 'white';
                    requestAnimationFrame(scanLoop);
                }, 1000);
            });
    };

    logger.log("Scanner: Starting confidence-based scanning...");
    statusBadge.innerText = 'Scanning...';
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
