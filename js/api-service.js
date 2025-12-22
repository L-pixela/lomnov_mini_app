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
            let base64String = image;

            // Convert to base64 if not already a string
            if (typeof image !== 'string') {
                // Handle Blob/File
                if (image instanceof Blob || image instanceof File) {
                    base64String = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const dataUrl = reader.result;
                            // Remove "data:image/jpeg;base64," prefix if present
                            const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
                            resolve(base64);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(image);
                    });
                }
                // Handle ArrayBuffer/Uint8Array
                else if (image instanceof ArrayBuffer || image instanceof Uint8Array) {
                    const bytes = image instanceof ArrayBuffer ? new Uint8Array(image) : image;
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    base64String = btoa(binary);
                }
            } else {
                // Already a string - remove data URL prefix if present
                if (base64String.includes(',')) {
                    base64String = base64String.split(',')[1];
                }
            }

            // Send as JSON to avoid CORS preflight
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