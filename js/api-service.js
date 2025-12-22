import { logger } from './logger.js';

export class ApiService {
    constructor() {
        const env = import.meta.env || {};
        this.API_URL = env.VITE_API_URL;
    }

    /**
     * @param {Blob | File | Uint8Array | ArrayBuffer} image
     */
    async sendDetectionRequest(image) {
        if (!image) {
            logger.error("No image provided to API");
            return;
        }

        logger.log("API: Sending request to Smart Meter server...");

        try {
            // Convert to base64 string instead of FormData
            let base64String = image;

            if (typeof image !== 'string') {
                // Convert Blob to base64
                const reader = new FileReader();
                base64String = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(image);
                });
            } else if (image.includes(',')) {
                base64String = image.split(',')[1];
            }

            // Send as JSON instead of FormData - avoids preflight
            const response = await fetch(this.API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true"
                },
                body: JSON.stringify({
                    image: base64String
                })
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
        // Adapt this to whatever your Flask API returns
        // Assuming the new API returns { detections: [...] } or just [...]
        // Adjust based on observation. For now, try to find an array.

        let detections = [];
        if (apiResult.detections) detections = apiResult.detections;
        else if (Array.isArray(apiResult)) detections = apiResult;
        else if (apiResult.data && Array.isArray(apiResult.data)) detections = apiResult.data;

        return {
            success: true,
            detections: detections, // Ensure this exists for app.js
            data: apiResult
        };
    }
}
