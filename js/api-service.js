import { logger } from './logger.js';

export class ApiService {
    constructor() {
        const env = import.meta.env || {};
        this.API_URL = env.VITE_API_URL;
    }

    /**
     * @param {string | Blob | File | Uint8Array | ArrayBuffer} image
     */
    async sendDetectionRequest(image) {
        if (!image) {
            logger.error("No image provided to API");
            return;
        }

        logger.log("API: Sending request to Smart Meter server...");

        try {
            let imageBlob = image;

            // Convert Base64 string to Blob if necessary
            if (typeof image === 'string') {
                const base64Data = image.includes(',') ? image.split(',')[1] : image;
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                imageBlob = new Blob([byteArray], { type: "image/jpeg" });
            } else if (!(image instanceof Blob)) {
                imageBlob = new Blob([image], { type: "image/jpeg" });
            }

            const formData = new FormData();
            formData.append("image", imageBlob, "meter.jpg");

            // Send as FormData (multipart/form-data)
            // Browser automatically sets the proper Content-Type with boundary
            const response = await fetch(this.API_URL, {
                method: "POST",
                headers: {
                    "ngrok-skip-browser-warning": "true"
                },
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.error(`API Failed: ${response.status} - ${errText}`);
                throw new Error(`API Request failed: ${response.status}`);
            }

            const result = await response.json();
            logger.log("API: Response received");

            return this.formatResponse(result);

        } catch (error) {
            logger.error(`API Error: ${error.message}`);
            throw error;
        }
    }

    formatResponse(apiResult) {
        // Handle different response formats from your Flask API
        let detections = [];

        if (apiResult.detections) {
            detections = apiResult.detections;
        } else if (Array.isArray(apiResult)) {
            detections = apiResult;
        } else if (apiResult.data && Array.isArray(apiResult.data)) {
            detections = apiResult.data;
        }

        return {
            success: detections.length > 0 || apiResult.success === true,
            detections: detections,
            data: apiResult
        };
    }
}