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
const captureBtn = document.getElementById('capture-btn');
const statusBadge = document.createElement('div');

// Setup Status Badge
statusBadge.className = 'status-badge';
statusBadge.innerText = 'Ready';

// Find where to append status badge
const cameraView = document.querySelector('.camera-view');
if (cameraView) {
    cameraView.appendChild(statusBadge);
}

// Create progress bar wrapper
const progressBar = document.createElement('div');
progressBar.className = 'progress-bar';
progressBar.innerHTML = `
    <div class="progress-step" data-step="water">1. Water</div>
    <div class="progress-step" data-step="electricity">2. Electricity</div>
    <div class="progress-step" data-step="submit">3. Submit</div>
`;

// Find camera container and insert progress bar
const cameraContainer = document.querySelector('.camera-container');
if (cameraContainer) {
    // Insert progress bar at the beginning
    cameraContainer.insertBefore(progressBar, cameraContainer.firstChild);
}

// Modules
const camera = new Camera(videoEl);
const processor = new FrameProcessor();
const api = new ApiService();
const overlayCanvas = document.getElementById('overlay-canvas');
const overlayCtx = overlayCanvas?.getContext('2d') || null;

// State
let isProcessing = false;
let currentStep = 0; // 0 = water, 1 = electricity, 2 = submit
let chatId = tg.initDataUnsafe?.user?.id?.toString() || 'unknown';

// Check for existing data on startup
function checkExistingData() {
    try {
        const status = api.getProgressStatus ? api.getProgressStatus() : null;

        if (status && status.waterCompleted && !status.electricityCompleted) {
            // Resume from electricity step
            currentStep = 1;
            updateUIForStep(1);
            logger.log('Resuming: Water meter already captured');
            return true;
        } else if (status && status.isComplete) {
            // Both completed, ready to submit
            currentStep = 2;
            updateUIForStep(2);
            logger.log('Resuming: Both meters captured, ready to submit');
            return true;
        }
    } catch (error) {
        logger.error('Error checking existing data:', error);
    }
    return false;
}

function resizeCanvas() {
    if (!videoEl?.videoWidth || !videoEl?.videoHeight || !overlayCanvas) return;
    overlayCanvas.width = videoEl.videoWidth;
    overlayCanvas.height = videoEl.videoHeight;
}

function updateUIForStep(step) {
    const steps = document.querySelectorAll('.progress-step');
    steps.forEach((s, index) => {
        if (index === step) {
            s.classList.add('active');
            s.classList.remove('completed');
        } else if (index < step) {
            s.classList.add('completed');
            s.classList.remove('active');
        } else {
            s.classList.remove('active', 'completed');
        }
    });

    switch (step) {
        case 0:
            captureBtn.innerText = 'Take Water Meter Photo';
            statusBadge.innerText = 'Ready to Capture Water Meter';
            captureBtn.disabled = false;
            break;
        case 1:
            captureBtn.innerText = 'Take Electricity Meter Photo';
            statusBadge.innerText = 'Water captured ✓ Ready for electricity';
            captureBtn.disabled = false;
            break;
        case 2:
            captureBtn.innerText = 'Submit Both Readings';
            statusBadge.innerText = 'Both meters captured! Ready to submit';
            captureBtn.disabled = false;
            break;
    }
}

async function startApp() {
    try {
        statusBadge.innerText = 'Starting Camera...';
        await camera.start();

        // Check for existing data
        const hasExistingData = checkExistingData();

        if (!hasExistingData) {
            statusBadge.innerText = 'Ready to Capture Water Meter';
            updateUIForStep(0);
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Setup capture handler
        setupCaptureHandler();

    } catch (e) {
        logger.error(`App Error: ${e.message}`);
        statusBadge.innerText = `Error: ${e.message.substring(0, 30)}...`;
        statusBadge.style.color = '#ff7675';
        statusBadge.style.background = 'rgba(231, 76, 60, 0.8)';
    }
}

function setupCaptureHandler() {
    if (!captureBtn) return;

    captureBtn.onclick = async () => {
        if (isProcessing || !camera.isPlaying()) return;

        try {
            isProcessing = true;
            captureBtn.disabled = true;

            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

            // CAPTURE IMAGE
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const video = camera.getVideo();

            if (!video || video.videoWidth === 0) throw new Error("Video not ready");

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const rawBase64 = dataUrl.split(',')[1];

            // PROCESS BASED ON CURRENT STEP
            switch (currentStep) {
                case 0: // Water meter
                    await processWaterMeter(rawBase64);
                    break;

                case 1: // Electricity meter
                    await processElectricityMeter(rawBase64);
                    break;

                case 2: // Submit both
                    await submitBothReadings();
                    break;
            }

        } catch (err) {
            handleCaptureError(err);
        } finally {
            captureBtn.disabled = false;
        }
    };
}

async function processWaterMeter(imageBase64) {
    try {
        statusBadge.innerText = 'Processing water meter...';
        statusBadge.style.color = '#74b9ff';

        // Use the storage-enabled method
        const result = await api.processAndSaveWaterMeter(imageBase64, chatId);

        // OCR feedback
        await handleDetectionResult(imageBase64);

        // Move to next step
        currentStep = 1;
        updateUIForStep(1);

        statusBadge.innerText = `Water: ${result.meterValue} ✓`;
        statusBadge.style.color = '#55efc4';

        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        logger.log(`Water meter captured: ${result.meterValue || 'N/A'}`);

    } catch (error) {
        throw new Error(`Water meter processing failed: ${error.message}`);
    }
}

async function processElectricityMeter(imageBase64) {
    try {
        statusBadge.innerText = 'Processing electricity meter...';
        statusBadge.style.color = '#fdcb6e';

        // Use the storage-enabled method
        const result = await api.processAndSaveElectricityMeter(imageBase64);

        // OCR feedback
        await handleDetectionResult(imageBase64);

        // Move to submit step
        currentStep = 2;
        updateUIForStep(2);

        statusBadge.innerText = `Water: ${api.getProgressStatus()?.waterMeter || '?'} | Elec: ${result.meterValue} ✓`;
        statusBadge.style.color = '#00b894';

        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        logger.log(`Electricity meter captured: ${result.meterValue || 'N/A'}`);

    } catch (error) {
        throw new Error(`Electricity meter processing failed: ${error.message}`);
    }
}

async function submitBothReadings() {
    try {
        statusBadge.innerText = 'Submitting readings...';
        statusBadge.style.color = '#a29bfe';
        captureBtn.disabled = true;

        // Use storage method
        const result = await api.submitFromStorage();

        if (result.success) {
            // SUCCESS
            statusBadge.innerText = '✓ Readings submitted successfully!';
            statusBadge.style.color = '#00b894';

            captureBtn.innerText = 'Done - Close App';

            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

            // Show summary
            if (tg.showAlert && result.payload) {
                tg.showAlert(
                    `✅ Submitted Successfully!\n\n` +
                    `Water: ${result.payload.water_meter}\n` +
                    `Electricity: ${result.payload.electricity_meter}`
                );
            }

            // Change button to close app
            captureBtn.onclick = () => {
                if (tg.close) {
                    tg.close();
                }
            };

            logger.log('Readings submitted successfully:', result);

            // Auto-close after 5 seconds
            setTimeout(() => {
                if (tg.close) {
                    tg.close();
                }
            }, 5000);

        } else {
            throw new Error('Submission failed');
        }

    } catch (err) {
        throw new Error(`Submission failed: ${err.message}`);
    }
}

async function handleDetectionResult(imageBase64) {
    try {
        statusBadge.innerText = 'Analyzing meter reading...';
        const ocrResponse = await api.sendDetectionRequest(imageBase64);

        if (ocrResponse.success) {
            const meterValue = ocrResponse.reading || "N/A";
            const confidence = ((ocrResponse.reading_confidence || ocrResponse.meter_confidence || 0) * 100).toFixed(1);
            const meterType = ocrResponse.meter_type || 'meter';

            statusBadge.innerText = `${meterType}: ${meterValue} (${confidence}%)`;

            // Update UI with detection (optional bounding boxes if API provides them)
            if (ocrResponse.raw && ocrResponse.raw.detections) {
                drawDetectionBoxes(ocrResponse.raw.detections);
            }
        } else {
            statusBadge.innerText = 'No meter detected';
        }

        return ocrResponse;
    } catch (error) {
        logger.error(`OCR analysis failed: ${error.message}`);
        statusBadge.innerText = 'Analysis skipped';
        return null;
    }
}

function drawDetectionBoxes(detections) {
    if (!overlayCtx || !overlayCanvas) return;

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    detections.forEach(det => {
        const [x, y, w, h] = det.box;

        // Draw Box
        overlayCtx.strokeStyle = currentStep === 0 ? '#0984e3' : '#fdcb6e';
        overlayCtx.lineWidth = 4;
        overlayCtx.beginPath();

        if (overlayCtx.roundRect) {
            overlayCtx.roundRect(x, y, w, h, 8);
        } else {
            overlayCtx.rect(x, y, w, h);
        }
        overlayCtx.stroke();

        // Draw Label Background
        overlayCtx.fillStyle = currentStep === 0 ? '#0984e3' : '#fdcb6e';
        overlayCtx.font = '16px Outfit';
        const labelText = `${det.label}: ${det.text || ''}`;
        const textWidth = overlayCtx.measureText(labelText).width;
        overlayCtx.fillRect(x, y - 24, textWidth + 16, 24);

        // Draw Label Text
        overlayCtx.fillStyle = '#ffffff';
        overlayCtx.fillText(labelText, x + 8, y - 6);
    });
}

function handleCaptureError(err) {
    logger.error(`Capture Error: ${err.message}`);
    statusBadge.innerText = `Error: ${err.message.substring(0, 40)}...`;
    statusBadge.style.color = '#ff7675';

    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

    // Keep appropriate button state
    updateUIForStep(currentStep);

    // Clear error after 3 seconds
    setTimeout(() => {
        if (statusBadge.style.color === '#ff7675') {
            statusBadge.style.color = 'white';
            updateUIForStep(currentStep);
        }
    }, 3000);
}

// Add reset function
function resetApp() {
    currentStep = 0;
    isProcessing = false;

    // Clear storage
    if (api.resetStorage) {
        api.resetStorage();
    }

    // Clear overlay
    if (overlayCtx && overlayCanvas) {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    // Reset UI
    updateUIForStep(0);

    logger.log('App reset successfully');
}

// Expose for debugging
window.resetApp = resetApp;

// Add CSS for progress bar
const style = document.createElement('style');
style.textContent = `
    .progress-bar {
        display: flex;
        justify-content: space-between;
        padding: 10px 20px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        margin-bottom: 15px;
        backdrop-filter: blur(10px);
    }
    
    .progress-step {
        padding: 8px 16px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
    }
    
    .progress-step.active {
        background: #6c5ce7;
        color: white;
        box-shadow: 0 4px 15px rgba(108, 92, 231, 0.4);
    }
    
    .progress-step.completed {
        background: #00b894;
        color: white;
    }
`;
document.head.appendChild(style);

// Start the app
document.addEventListener('DOMContentLoaded', startApp);

// Cleanup
window.addEventListener('beforeunload', () => {
    camera.stop();
});