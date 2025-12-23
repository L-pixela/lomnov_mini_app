import { logger } from './logger.js';
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
const captureBtn = document.getElementById('capture-btn');
const statusBadge = document.createElement('div');

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
let waterImageData = null;
let electricityImageData = null;
let currentStep = 0; // 0 = water, 1 = electricity
let chatId = tg.initDataUnsafe.user.id.toString();

function resizeCanvas() {
    if (!videoEl.videoWidth || !videoEl.videoHeight) return;
    overlayCanvas.width = videoEl.videoWidth;
    overlayCanvas.height = videoEl.videoHeight;
}

async function startApp() {
    try {
        statusBadge.innerText = 'Starting Camera...';
        await camera.start();
        statusBadge.innerText = 'Ready to Capture';
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // MANUAL MODE: Capture on button click
        setupManualCapture();

    } catch (e) {
        logger.error(`App Error: ${e.message}`);
        statusBadge.innerText = `Error: ${e.message.substring(0, 30)}...`;
        statusBadge.style.color = '#ff7675';
        console.error(e);
        statusBadge.innerText = 'Camera Error';
        statusBadge.style.background = 'rgba(231, 76, 60, 0.8)';
    }
}

function setupManualCapture() {
    captureBtn.innerText = 'Take Water Meter Photo';
    captureBtn.classList.add('active');
    statusBadge.innerText = 'Ready to Capture Water Meter';

    captureBtn.onclick = async () => {
        if (isProcessing || !camera.isPlaying()) return;

        try {
            isProcessing = true;
            captureBtn.disabled = true;
            statusBadge.innerText = 'Capturing...';
            statusBadge.style.color = 'white';

            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

            // 1. CAPTURE IMAGE
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const video = camera.getVideo();
            if (!video || video.videoWidth === 0) throw new Error("Video not ready");

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const rawBase64 = dataUrl.split(',')[1];

            // 2. DETERMINE METER TYPE & STORE IMAGE
            if (currentStep === 0) {
                // Water meter
                waterImageData = rawBase64;
                statusBadge.innerText = 'Water meter captured!';
            } else {
                // Electricity meter
                electricityImageData = rawBase64;
                statusBadge.innerText = 'Electricity meter captured!';
            }

            // 3. SEND TO OCR FOR METER READING (optional - for UI feedback)
            statusBadge.innerText = 'Analyzing meter reading...';
            const ocrResponse = await api.sendDetectionRequest(rawBase64);

            // Handle visual result
            handleDetectionResult(ocrResponse);

            // Update UI based on current step
            currentStep++;

            if (currentStep === 1) {
                // Water meter captured, ready for electricity
                statusBadge.innerText = 'Water captured ✓ Ready for electricity';
                statusBadge.style.color = '#55efc4';

                captureBtn.innerText = 'Take Electricity Meter Photo';
                captureBtn.disabled = false;
                isProcessing = false;

                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                logger.log(`Water meter captured`);

            } else if (currentStep === 2) {
                // Both meters captured, submit both
                statusBadge.innerText = 'Submitting both readings...';
                statusBadge.style.color = '#fdcb6e';

                // Submit both readings to backend
                const result = await api.submitMeterReadings({
                    chatId: chatId,
                    waterImage: waterImageData,
                    electricityImage: electricityImageData
                });

                if (result.success) {
                    statusBadge.innerText = '✓ Both readings submitted!';
                    statusBadge.style.color = '#00b894';

                    captureBtn.innerText = 'Done - Close App';

                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

                    // Show summary - access result through result.result
                    if (tg.showAlert) {
                        tg.showAlert(`✅ Submitted Successfully!\n\nWater: ${result.result.water_meter}\nElectricity: ${result.result.electricity_meter}`);
                    }

                    // Change button to close app
                    captureBtn.onclick = () => {
                        if (tg.close) tg.close();
                    };

                    // Auto-close after 3 seconds
                    setTimeout(() => {
                        if (tg.close) tg.close();
                    }, 3000);

                    logger.log('Both readings submitted:', result);
                } else {
                    throw new Error('Failed to submit readings');
                }
            }

        } catch (err) {
            logger.error(`Capture Error: ${err.message}`);
            statusBadge.innerText = `Error: ${err.message}`;
            statusBadge.style.color = '#ff7675';

            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

            // Reset button state
            captureBtn.disabled = false;
            isProcessing = false;

            // Keep appropriate button text
            if (currentStep === 0) {
                captureBtn.innerText = 'Take Water Meter Photo';
                statusBadge.innerText = 'Ready to Capture Water Meter';
            } else if (currentStep === 1) {
                captureBtn.innerText = 'Take Electricity Meter Photo';
                statusBadge.innerText = 'Ready to Capture Electricity Meter';
            }

            // Clear error after 2 seconds
            setTimeout(() => {
                statusBadge.style.color = 'white';
            }, 2000);
        }
    };
}

function handleDetectionResult(response) {
    if (response.success && response.detections.length > 0) {
        const names = response.detections.map(d => d.label).join(', ');
        statusBadge.innerText = `Detected: ${names}`;

        // Draw bounding boxes
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        response.detections.forEach(det => {
            const [x, y, w, h] = det.box;

            // Draw Box
            overlayCtx.strokeStyle = '#6c5ce7';
            overlayCtx.lineWidth = 4;
            overlayCtx.beginPath();

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
        statusBadge.innerText = 'No meter detected in image';
    }
}

// Start
document.addEventListener('DOMContentLoaded', startApp);

// Cleanup
window.addEventListener('beforeunload', () => {
    camera.stop();
});

// Add reset function for debugging
function resetApp() {
    currentStep = 0;
    waterImageData = null;
    electricityImageData = null;
    isProcessing = false;
    captureBtn.disabled = false;
    captureBtn.innerText = 'Take Water Meter Photo';
    statusBadge.innerText = 'Ready to Capture Water Meter';
    statusBadge.style.color = 'white';
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Re-setup capture handler
    setupManualCapture();
}

// Expose reset for debugging
window.resetApp = resetApp;