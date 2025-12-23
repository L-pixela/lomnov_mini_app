import { logger } from './logger.js';

export class ApiService {
    constructor() {
        const env = import.meta.env || {};

        // Separate URLs for different services
        this.OCR_API_URL = env.VITE_OCR_API_URL || env.VITE_API_URL; // OCR detection backend
        this.IMAGE_UPLOAD_API = env.VITE_IMAGE_UPLOAD_API; // Image storage service
        this.MAIN_BACKEND_API = env.VITE_MAIN_BACKEND_API; // Main backend for consumption

        logger.log(`API Services initialized:
          OCR: ${this.OCR_API_URL}
          Image Upload: ${this.IMAGE_UPLOAD_API}
          Main Backend: ${this.MAIN_BACKEND_API}`);
    }

    /**
     * Step 1: Send image to OCR API for meter reading
     * @param {string | Blob | File | Uint8Array | ArrayBuffer} image
     * @returns {Promise<Object>} OCR response with meter reading
     */
    async sendDetectionRequest(image) {
        if (!image) {
            logger.error("No image provided to API");
            throw new Error("No image provided");
        }

        logger.log("API: Sending to OCR for meter reading...");

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

            const response = await fetch(this.OCR_API_URL, {
                method: "POST",
                headers: {
                    "ngrok-skip-browser-warning": "true"
                },
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.error(`OCR API Failed: ${response.status} - ${errText}`);
                throw new Error(`OCR Request failed: ${response.status}`);
            }

            const result = await response.json();
            logger.log("OCR API: Meter reading received");

            logger.log(this.formatOCRResponse(result));

            return this.formatOCRResponse(result);

        } catch (error) {
            logger.error(`OCR API Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Step 2: Upload image to storage service
     * @param {string|Blob} image - Image data (base64 or Blob)
     * @param {string|number} tenantId - Tenant ID
     * @param {string} meterType - 'water' or 'electricity'
     * @returns {Promise<string>} Image URL from storage
     */
    async uploadImageToStorage(image, tenantId, meterType = 'water') {
        if (!image || !tenantId) {
            throw new Error('Image and tenantId are required');
        }

        logger.log(`Uploading ${meterType} image for tenant ${tenantId}...`);

        try {
            let imageBlob = image;

            // Convert Base64 to Blob if needed
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
            formData.append("image", imageBlob, `${meterType}_meter_${Date.now()}.jpg`);
            formData.append("tenant_id", tenantId.toString());
            formData.append("meter_type", meterType);

            const response = await fetch(this.IMAGE_UPLOAD_API, {
                method: "POST",
                headers: {
                    "ngrok-skip-browser-warning": "true"
                },
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.error(`Image upload failed: ${response.status} - ${errText}`);
                throw new Error(`Image upload failed: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success || !result.image_url) {
                throw new Error('Invalid response from image upload service');
            }

            logger.log(`Image uploaded successfully: ${result.image_url}`);
            return result.image_url;

        } catch (error) {
            logger.error(`Image upload error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Step 3: Update consumption in main backend
     * @param {Object} consumptionData - Consumption data for single meter
     * @returns {Promise<Object>} Update result
     */
    async updateConsumption(consumptionData) {
        if (!consumptionData || typeof consumptionData !== 'object') {
            throw new Error('Valid consumption data is required');
        }

        logger.log('Updating consumption in backend...', consumptionData);

        try {
            const response = await fetch(`${this.MAIN_BACKEND_API}/consumptions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true"
                },
                body: JSON.stringify(consumptionData)
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.error(`Update consumption failed: ${response.status} - ${errText}`);
                throw new Error(`Update failed: ${response.status}`);
            }

            const result = await response.json();
            logger.log('Consumption updated successfully', result);

            if (!result.success) {
                throw new Error(result.error || 'Failed to update consumption');
            }

            return result;

        } catch (error) {
            logger.error(`Update consumption error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Complete workflow: OCR → Upload → Build JSON → Update
     * @param {string} imageBase64 - Captured image
     * @param {string} telegramId - Telegram user ID
     * @param {string} meterType - 'water' or 'electricity'
     * @returns {Promise<Object>} Complete result
     */
    async processMeterReading(imageBase64, telegramId, meterType = 'water') {
        try {
            logger.log(`Starting ${meterType} meter processing for user ${telegramId}...`);

            // 1. Get tenant info (landlord_id, room_id, etc.)
            const tenantInfo = await this.getTenantInfo(telegramId);

            // 2. Send to OCR for meter reading
            const ocrResult = await this.sendDetectionRequest(imageBase64);

            // Extract meter value from OCR
            let meterValue = '0.00';
            let accuracy = 0;

            if (ocrResult.success && ocrResult.detections?.length > 0) {
                meterValue = ocrResult.detections[0].text || '0.00';
                accuracy = ocrResult.detections[0].confidence || 0;
            }

            // 3. Upload image to storage
            const imageUrl = await this.uploadImageToStorage(
                imageBase64,
                tenantInfo.tenant_id,
                meterType
            );

            // 4. Build consumption data JSON
            const consumptionData = {
                landlord_id: tenantInfo.landlord_id,
                chat_id: telegramId,
                [meterType === 'water' ? 'water_meter' : 'electricity_meter']: meterValue,
                [meterType === 'water' ? 'water_accuracy' : 'electricity_accuracy']: accuracy.toFixed(2),
                [meterType === 'water' ? 'water_image' : 'electricity_image']: imageUrl,
                tenant_id: tenantInfo.tenant_id,
                room_id: tenantInfo.room_id,
                submitted_at: new Date().toISOString()
            };

            logger.log(`Built ${meterType} consumption data:`, consumptionData);

            // 5. Update consumption in main backend
            const updateResult = await this.updateConsumption(consumptionData);

            return {
                success: true,
                meterType: meterType,
                meterValue: meterValue,
                imageUrl: imageUrl,
                consumptionData: consumptionData,
                updateResult: updateResult
            };

        } catch (error) {
            logger.error(`Process meter reading error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format OCR response consistently
     */
    formatOCRResponse(apiResult) {
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
            raw: apiResult
        };
    }
}