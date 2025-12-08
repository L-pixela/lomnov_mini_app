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
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.video.srcObject = this.stream;
            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve(true);
                };
            });
        } catch (error) {
            console.error('Camera access denied:', error);
            throw error;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    getVideo() {
        return this.video;
    }

    isPlaying() {
        return !!this.stream && !this.video.paused && !this.video.ended;
    }
}
