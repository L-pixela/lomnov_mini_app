/**
 * camera.js
 * Handles camera access and video stream management.
 */

export class Camera {
    constructor(videoElement) {
        this.video = videoElement;
        this.stream = null;
        this.constraints = {
            audio: false,
            video: {
                facingMode: 'environment', // Prefer back camera
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
    }

    async start(customConstraints = null) {
        try {
            // CRITICAL FIX: Check if getUserMedia exists
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                // Check if the issue is likely due to insecure context (HTTP vs HTTPS)
                if (!window.isSecureContext) {
                    throw new Error('Camera requires HTTPS. Please use a secure connection (ngrok/localhost).');
                }
                throw new Error('Camera API not supported in this browser');
            }

            // CRITICAL FIX: Check if we're on HTTPS
            if (!window.isSecureContext) {
                throw new Error('Camera requires HTTPS. GitHub Pages provides HTTPS automatically.');
            }

            // Use custom constraints if provided, otherwise use defaults
            const constraints = customConstraints || this.constraints;

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;

            return new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.video.play().then(resolve).catch(reject);
                };

                // Add timeout in case video never loads
                setTimeout(() => {
                    reject(new Error('Camera video failed to load'));
                }, 5000);
            });

        } catch (error) {
            // Provide user-friendly error messages
            let userMessage = error.message;

            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                userMessage = 'Camera access was denied. Please allow camera permissions and try again.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                userMessage = 'No camera found on your device.';
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                userMessage = 'Camera is already in use by another application.';
            }

            console.error('Camera error:', error.name, error.message);
            throw new Error(userMessage);
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null; // Also clear the video element
        }
    }

    getVideo() {
        return this.video;
    }

    isPlaying() {
        return !!this.stream && !this.video.paused && !this.video.ended;
    }

    // Optional: Add method to switch cameras
    async switchCamera() {
        if (!this.stream) return;

        const currentFacingMode = this.constraints.video.facingMode;
        const newFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';

        this.constraints.video.facingMode = newFacingMode;

        // Stop current stream
        this.stop();

        // Start with new facing mode
        return this.start();
    }
}