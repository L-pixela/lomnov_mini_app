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
            const formData = new FormData();

            // Ensure it's a Blob
            let imageBlob = image;
            if (typeof image === 'string') {
                let base64 = image;

                // Strip data URL prefix if present
                if (base64.includes(',')) {
                    base64 = base64.split(',')[1];
                }

                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);

                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }

                imageBlob = new Blob([bytes], { type: "image/jpeg" });
            }

            formData.append("image", imageBlob, "meter.jpg");

            const response = await fetch(this.API_URL, {
                method: "POST",
                headers: {
                    'ngrok-skip-browser-warning': '69420'
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
