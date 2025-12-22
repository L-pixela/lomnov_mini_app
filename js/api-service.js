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
            const imageBlob =
                image instanceof Blob
                    ? image
                    : new Blob([image], { type: "image/jpeg" });

            formData.append("image", imageBlob, "meter.jpg");

            const response = await fetch(this.API_URL, {
                method: "POST",
                body: formData // ❗ no Content-Type header for FormData
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
        return {
            success: true,
            data: apiResult
        };
    }
}
