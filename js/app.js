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

// Debounce flag to prevent rapid clicks
let lastCaptureTime = 0;
const CAPTURE_COOLDOWN = 2000; // 2 seconds between captures

// Check for existing data on startup
function checkExistingData() {
    try {
        const status = api.getProgressStatus ? api.getProgressStatus() : null;

        // logger.log('Checking existing data:', status);

        if (status && status.waterCompleted && !status.electricityCompleted) {
            // Resume from electricity step
            currentStep = 1;
            updateUIForStep(1);
            // logger.log('Resuming: Water meter already captured');
            // logger.log('Water data:', status.waterMeter);
            return true;
        } else if (status && status.isComplete) {
            // Both completed, ready to submit
            currentStep = 2;
            updateUIForStep(2);
            // logger.log('Resuming: Both meters captured, ready to submit');
            // logger.log('Water:', status.waterMeter, 'Electricity:', status.electricityMeter);
            return true;
        }
    } catch (error) {
        // Silent error handling
    }
    return false;
}

function resizeCanvas() {
    if (!videoEl?.videoWidth || !videoEl?.videoHeight || !overlayCanvas) return;
    overlayCanvas.width = videoEl.videoWidth;
    overlayCanvas.height = videoEl.videoHeight;
}

function updateUIForStep(step) {
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

        // Small delay to ensure camera is fully ready
        await new Promise(resolve => setTimeout(resolve, 500));

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

        // logger.log(`App started successfully. Chat ID: ${chatId}, Current step: ${currentStep}`);

    } catch (e) {
        statusBadge.innerText = `Error: ${e.message.substring(0, 30)}...`;
        statusBadge.style.color = '#ff7675';
        statusBadge.style.background = 'rgba(231, 76, 60, 0.8)';
    }
}

function setupCaptureHandler() {
    if (!captureBtn) return;

    captureBtn.onclick = async () => {
        // Debounce check
        const now = Date.now();
        if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
            // logger.log('Capture blocked: too soon after last capture');
            statusBadge.innerText = 'Please wait...';
            return;
        }

        if (isProcessing || !camera.isPlaying()) {
            // logger.log('Capture blocked: already processing or camera not ready');
            return;
        }

        try {
            isProcessing = true;
            lastCaptureTime = now;
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

            // logger.log(`Captured image for step ${currentStep} (${currentStep === 0 ? 'water' : currentStep === 1 ? 'electricity' : 'submit'})`);

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
            // Small delay before re-enabling button
            setTimeout(() => {
                isProcessing = false;
                captureBtn.disabled = false;
            }, 500);
        }
    };
}

async function processWaterMeter(imageBase64) {
    try {
        statusBadge.innerText = 'Processing water meter...';
        statusBadge.style.color = '#74b9ff';

        // logger.log('Starting water meter processing...');

        // Use the storage-enabled method
        const result = await api.processAndSaveWaterMeter(imageBase64, chatId);

        // logger.log('Water meter processing result:', result);

        // Verify storage immediately
        const storedData = api.storage.getWaterData();
        // logger.log('Verified water data in storage:', storedData);

        if (!storedData) {
            throw new Error('Water data failed to save to storage');
        }

        // OCR feedback
        await handleDetectionResult(imageBase64);

        // Small delay to ensure storage is fully written
        await new Promise(resolve => setTimeout(resolve, 300));

        // Move to next step
        currentStep = 1;
        updateUIForStep(1);

        statusBadge.innerText = `Water: ${result.meterValue} ✓`;
        statusBadge.style.color = '#55efc4';

        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        // logger.log(`✓ Water meter captured: ${result.meterValue}`);
        // logger.log('Ready for electricity meter');

    } catch (error) {
        throw new Error(`Water meter processing failed: ${error.message}`);
    }
}

async function processElectricityMeter(imageBase64) {
    try {
        statusBadge.innerText = 'Processing electricity meter...';
        statusBadge.style.color = '#fdcb6e';

        // logger.log('Starting electricity meter processing...');

        // Verify water data exists before proceeding
        const waterData = api.storage.getWaterData();
        const chatIdStored = api.storage.getChatId();

        // logger.log('Pre-check - Water data exists:', !!waterData);
        // logger.log('Pre-check - Chat ID exists:', !!chatIdStored);
        // logger.log('Pre-check - Water meter value:', waterData?.meter);

        if (!waterData || !chatIdStored) {
            throw new Error('Water meter data not found. Please capture water meter first.');
        }

        // Use the storage-enabled method
        const result = await api.processAndSaveElectricityMeter(imageBase64);

        // logger.log('Electricity meter processing result:', result);

        // Verify storage immediately
        const storedData = api.storage.getElectricityData();
        // logger.log('Verified electricity data in storage:', storedData);

        if (!storedData) {
            throw new Error('Electricity data failed to save to storage');
        }

        // OCR feedback
        await handleDetectionResult(imageBase64);

        // Small delay to ensure storage is fully written
        await new Promise(resolve => setTimeout(resolve, 300));

        // Move to submit step
        currentStep = 2;
        updateUIForStep(2);

        const waterMeter = waterData.meter;
        statusBadge.innerText = `Water: ${waterMeter} | Elec: ${result.meterValue} ✓`;
        statusBadge.style.color = '#00b894';

        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        // logger.log(`✓ Electricity meter captured: ${result.meterValue}`);
        // logger.log('Both meters complete. Ready to submit.');

    } catch (error) {
        throw new Error(`Electricity meter processing failed: ${error.message}`);
    }
}

async function submitBothReadings() {
    try {
        statusBadge.innerText = 'Submitting readings...';
        statusBadge.style.color = '#a29bfe';
        captureBtn.disabled = true;

        // logger.log('Starting submission...');

        // Final verification before submission
        const waterData = api.storage.getWaterData();
        const electricityData = api.storage.getElectricityData();
        const chatIdStored = api.storage.getChatId();

        // logger.log('Pre-submit check:');
        // logger.log('- Water data:', waterData);
        // logger.log('- Electricity data:', electricityData);
        // logger.log('- Chat ID:', chatIdStored);

        if (!waterData || !electricityData || !chatIdStored) {
            throw new Error('Missing data. Please recapture meters.');
        }

        // Use storage method
        const result = await api.submitFromStorage();

        // logger.log('Submission result:', result);

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

            // logger.log('✓ Readings submitted successfully:', result);

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

// Reset function
function resetApp() {
    currentStep = 0;
    isProcessing = false;
    lastCaptureTime = 0;

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

    // logger.log('App reset successfully');
}

// Debug function to check storage state
function debugStorage() {
    const status = api.getProgressStatus();
    const waterRaw = localStorage.getItem('meter_water_data');
    const electricityRaw = localStorage.getItem('meter_electricity_data');
    const chatIdRaw = localStorage.getItem('meter_chat_id');

    // console.log('=== STORAGE DEBUG ===');
    // console.log('Status:', status);
    // console.log('Water (raw):', waterRaw);
    // console.log('Electricity (raw):', electricityRaw);
    // console.log('Chat ID (raw):', chatIdRaw);
    // console.log('Current step:', currentStep);
    // console.log('Is processing:', isProcessing);
    // console.log('==================');

    return status;
}

// Expose for debugging
window.resetApp = resetApp;
window.debugStorage = debugStorage;
window.api = api; // For manual testing

// Start the app
document.addEventListener('DOMContentLoaded', startApp);

// Cleanup
window.addEventListener('beforeunload', () => {
    camera.stop();
});