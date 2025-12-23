import { logger } from './logger.js';

export class ApiService {
    constructor() {
        const env = import.meta.env || {};

        // Separate URLs for different services
        this.OCR_API_URL = env.VITE_OCR_API_URL || env.VITE_API_URL; // OCR detection backend
        this.IMAGE_UPLOAD_API = env.VITE_IMAGE_UPLOAD_API; // Image storage service
        this.NOTIFICATION_API = env.VITE_NOTIFICATION_API || env.VITE_MAIN_BACKEND_URL; // Notification API

        logger.log(`API Services initialized:
          OCR: ${this.OCR_API_URL}
          Image Upload: ${this.IMAGE_UPLOAD_API}
          Notification API: ${this.NOTIFICATION_API}`);
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
     * @param {string} chatId - Telegram chat ID
     * @param {string} meterType - 'water' or 'electricity'
     * @returns {Promise<string>} Image URL from storage
     */
    async uploadImageToStorage(image, chatId, meterType = 'water') {
        if (!image || !chatId) {
            throw new Error('Image and chatId are required');
        }

        logger.log(`Uploading ${meterType} image for chat ${chatId}...`);

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

            const response = await fetch(this.IMAGE_UPLOAD_API, {
                method: "POST",
                headers: {
                    "Content-Type": "multipart/form-data",
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

            if (!result.success || !result.url) {
                throw new Error('Invalid response from image upload service');
            }

            logger.log(`Image uploaded successfully: ${result.url}`);
            return result.url;

        } catch (error) {
            logger.error(`Image upload error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send notification with meter reading results wrapped in "result" object
     * @param {Object} resultData - The complete result object wrapped in "result"
     * @returns {Promise<Object>} Notification API response
     */
    async sendNotification(resultData) {
        if (!resultData || typeof resultData !== 'object') {
            throw new Error('Valid result data is required');
        }

        logger.log('Sending notification to backend...', resultData);

        try {
            const response = await fetch(this.NOTIFICATION_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true"
                },
                body: JSON.stringify(resultData)
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.error(`Notification failed: ${response.status} - ${errText}`);
                throw new Error(`Notification failed: ${response.status}`);
            }

            const result = await response.json();
            logger.log('Notification sent successfully', result);

            return result;

        } catch (error) {
            logger.error(`Notification error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build the complete result object for notification, wrapped in "result"
     * @param {Object} params - Parameters for building result
     * @returns {Object} Formatted result object with wrapper
     */
    buildResultObject({
        chatId,
        waterMeter = "0.00",
        waterAccuracy = "0.00",
        electricityMeter = "0.00",
        electricityAccuracy = "0.00",
        waterImage = "",
        electricityImage = ""
    }) {
        // Return wrapped in "result" object
        return {
            result: {
                chat_id: chatId.toString(),
                water_meter: waterMeter,
                water_accuracy: waterAccuracy,
                electricity_meter: electricityMeter,
                electricity_accuracy: electricityAccuracy,
                water_image: waterImage,
                electricity_image: electricityImage
            }
        };
    }

    /**
     * Process single meter and return meter data
     * @param {string} imageBase64 - Captured image
     * @param {string} chatId - Telegram chat ID
     * @param {string} meterType - 'water' or 'electricity'
     * @param {Object} existingData - Optional existing data to merge with
     * @returns {Promise<Object>} Processed meter data
     */
    async processSingleMeter(imageBase64, chatId, meterType = 'water', existingData = null) {
        try {
            logger.log(`Processing ${meterType} meter for chat ${chatId}...`);

            // 1. Send to OCR for meter reading
            const ocrResult = await this.sendDetectionRequest(imageBase64);

            // Extract meter value from OCR
            let meterValue = '0.00';
            let accuracy = 0;

            if (ocrResult.success && ocrResult.detections?.length > 0) {
                meterValue = ocrResult.detections[0].text || '0.00';
                accuracy = ocrResult.detections[0].confidence || 0;
            }

            // 2. Upload image to storage
            const imageUrl = await this.uploadImageToStorage(
                imageBase64,
                chatId,
                meterType
            );

            // 3. Build meter data
            const meterData = {
                chatId: chatId
            };

            // Add meter-specific data
            if (meterType === 'water') {
                meterData.waterMeter = meterValue;
                meterData.waterAccuracy = accuracy.toFixed(2);
                meterData.waterImage = imageUrl;
            } else {
                meterData.electricityMeter = meterValue;
                meterData.electricityAccuracy = accuracy.toFixed(2);
                meterData.electricityImage = imageUrl;
            }

            // 4. Merge with existing data if provided
            const mergedData = existingData ?
                { ...existingData, ...meterData } :
                meterData;

            logger.log(`Processed ${meterType} data:`, mergedData);

            return {
                success: true,
                meterType: meterType,
                meterValue: meterValue,
                accuracy: accuracy.toFixed(2),
                imageUrl: imageUrl,
                meterData: mergedData
            };

        } catch (error) {
            logger.error(`Process ${meterType} meter error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Main method to submit meter readings
     * @param {Object} params - Submission parameters
     * @param {string} params.chatId - Telegram chat ID
     * @param {string} [params.waterImage] - Water meter image (optional)
     * @param {string} [params.electricityImage] - Electricity meter image (optional)
     * @returns {Promise<Object>} Complete result with notification response
     */
    async submitMeterReadings({ chatId, waterImage, electricityImage }) {
        if (!chatId) {
            throw new Error('Chat ID is required');
        }

        if (!waterImage && !electricityImage) {
            throw new Error('At least one meter image is required');
        }

        try {
            let meterData = {};

            if (waterImage && electricityImage) {
                // Process both meters
                const waterResult = await this.processSingleMeter(
                    waterImage,
                    chatId,
                    'water'
                );

                const electricityResult = await this.processSingleMeter(
                    electricityImage,
                    chatId,
                    'electricity',
                    waterResult.meterData
                );

                meterData = electricityResult.meterData;

            } else if (waterImage) {
                // Process only water meter
                const waterResult = await this.processSingleMeter(
                    waterImage,
                    chatId,
                    'water'
                );
                meterData = waterResult.meterData;

            } else {
                // Process only electricity meter
                const electricityResult = await this.processSingleMeter(
                    electricityImage,
                    chatId,
                    'electricity'
                );
                meterData = electricityResult.meterData;
            }

            // Build the final result object (wrapped in "result")
            const finalResult = this.buildResultObject(meterData);

            // Send notification to backend
            const notificationResponse = await this.sendNotification(finalResult);

            return {
                success: true,
                notificationSent: true,
                result: finalResult.result, // Return just the inner result for UI
                fullPayload: finalResult, // Keep the full payload for debugging
                notificationResponse: notificationResponse
            };

        } catch (error) {
            logger.error(`Submit meter readings error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Alternative: Submit already processed data
     * @param {Object} meterData - Pre-processed meter data
     * @returns {Promise<Object>} Notification response
     */
    async submitProcessedData(meterData) {
        try {
            // Build the result object (wrapped in "result")
            const resultObject = this.buildResultObject(meterData);

            // Send notification
            const response = await this.sendNotification(resultObject);

            return {
                success: true,
                result: resultObject.result,
                fullPayload: resultObject,
                notificationResponse: response
            };

        } catch (error) {
            logger.error(`Submit processed data error: ${error.message}`);
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