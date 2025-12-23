// ==================== STORAGE SERVICE ====================
class MeterStorageService {
    // Storage keys
    static STORAGE_KEYS = {
        CHAT_ID: 'meter_chat_id',
        WATER_DATA: 'meter_water_data',
        ELECTRICITY_DATA: 'meter_electricity_data'
    };

    // Save water meter data
    static saveWaterData(ocrResponse, imageUrl, meterType = 'water') {
        // Log the raw OCR response for debugging
        // logger.log('saveWaterData - Raw OCR response:', ocrResponse);
        // logger.log('saveWaterData - Reading value:', ocrResponse.reading);
        // logger.log('saveWaterData - Reading type:', typeof ocrResponse.reading);

        // Extract data from OCR response
        // Use reading_confidence first, fallback to meter_confidence
        const readingConfidence = ocrResponse.reading_confidence !== undefined
            ? ocrResponse.reading_confidence
            : (ocrResponse.meter_confidence || 0);

        // IMPORTANT: Keep reading as exact string from OCR, don't convert
        const reading = ocrResponse.reading ? String(ocrResponse.reading) : "0.00";

        // logger.log('saveWaterData - Extracted reading:', reading);
        // logger.log('saveWaterData - Reading confidence:', readingConfidence);

        // Format accuracy to 4 decimal places as string
        const accuracy = readingConfidence.toFixed(4);

        const data = {
            meter: reading,                       // Keep as string exactly as received
            accuracy: accuracy,                   // Already string with 4 decimals
            imageUrl: imageUrl,
            meterType: meterType,
            timestamp: Date.now(),
            rawOCR: ocrResponse // Store raw response for debugging
        };

        // logger.log('saveWaterData - Final data to save:', data);
        localStorage.setItem(this.STORAGE_KEYS.WATER_DATA, JSON.stringify(data));
        // logger.log('Water data saved successfully');
        return data;
    }

    // Save electricity meter data
    static saveElectricityData(ocrResponse, imageUrl, meterType = 'electricity') {
        // Log the raw OCR response for debugging
        // logger.log('saveElectricityData - Raw OCR response:', ocrResponse);
        // logger.log('saveElectricityData - Reading value:', ocrResponse.reading);
        // logger.log('saveElectricityData - Reading type:', typeof ocrResponse.reading);

        // Extract data from OCR response
        // Use reading_confidence first, fallback to meter_confidence
        const readingConfidence = ocrResponse.reading_confidence !== undefined
            ? ocrResponse.reading_confidence
            : (ocrResponse.meter_confidence || 0);

        // IMPORTANT: Keep reading as exact string from OCR, don't convert
        const reading = ocrResponse.reading ? String(ocrResponse.reading) : "0.00";

        // logger.log('saveElectricityData - Extracted reading:', reading);
        // logger.log('saveElectricityData - Reading confidence:', readingConfidence);

        // Format accuracy to 4 decimal places as string
        const accuracy = readingConfidence.toFixed(4);

        const data = {
            meter: reading,                       // Keep as string exactly as received
            accuracy: accuracy,                   // Already string with 4 decimals
            imageUrl: imageUrl,
            meterType: meterType,
            timestamp: Date.now(),
            rawOCR: ocrResponse
        };

        // logger.log('saveElectricityData - Final data to save:', data);
        localStorage.setItem(this.STORAGE_KEYS.ELECTRICITY_DATA, JSON.stringify(data));
        // logger.log('Electricity data saved successfully');
        return data;
    }

    // Save chat ID
    static saveChatId(chatId) {
        localStorage.setItem(this.STORAGE_KEYS.CHAT_ID, chatId.toString());
        return chatId;
    }

    // Get stored data
    static getWaterData() {
        const data = localStorage.getItem(this.STORAGE_KEYS.WATER_DATA);
        return data ? JSON.parse(data) : null;
    }

    static getElectricityData() {
        const data = localStorage.getItem(this.STORAGE_KEYS.ELECTRICITY_DATA);
        return data ? JSON.parse(data) : null;
    }

    static getChatId() {
        return localStorage.getItem(this.STORAGE_KEYS.CHAT_ID);
    }

    // Check if both meters are completed
    static isComplete() {
        return this.getWaterData() && this.getElectricityData() && this.getChatId();
    }

    // Clear all data
    static clearAll() {
        Object.values(this.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    }
}

// ==================== API SERVICE ====================
export class ApiService {
    constructor() {
        const env = import.meta.env || {};

        // Separate URLs for different services
        this.OCR_API_URL = env.VITE_OCR_API_URL || env.VITE_API_URL;
        this.IMAGE_UPLOAD_API = env.VITE_UPLOAD_URL;
        this.NOTIFICATION_API = env.VITE_NOTIFICATION_API || env.VITE_MAIN_BACKEND_URL;

        // Initialize storage
        this.storage = MeterStorageService;

        // logger.log(`API Services initialized:
        //   OCR: ${this.OCR_API_URL}
        //   Image Upload: ${this.IMAGE_UPLOAD_API}
        //   Notification API: ${this.NOTIFICATION_API}`);
    }

    /**
     * Send image to OCR API for meter reading
     * UPDATED to handle new response format
     */
    async sendDetectionRequest(image) {
        if (!image) {
            // logger.error("No image provided to API");
            throw new Error("No image provided");
        }

        // logger.log("API: Sending to OCR for meter reading...");

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
                // logger.error(`OCR API Failed: ${response.status} - ${errText}`);
                throw new Error(`OCR Request failed: ${response.status}`);
            }

            const result = await response.json();
            // logger.log("OCR API Response:", result);

            // Format the new response structure
            return this.formatOCRResponse(result);

        } catch (error) {
            // logger.error(`OCR API Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format OCR response for new API format
     * Python API returns: { success: true, result: { reading, reading_confidence, ... } }
     */
    formatOCRResponse(apiResult) {
        // Log what we received from API
        // logger.log('formatOCRResponse - Raw API result:', apiResult);

        // IMPORTANT: Python API wraps data in 'result' object
        const data = apiResult.result || apiResult;

        // logger.log('formatOCRResponse - Extracted data:', data);
        // logger.log('formatOCRResponse - Reading from API:', data.reading);
        // logger.log('formatOCRResponse - Reading confidence from API:', data.reading_confidence);

        // Format the response
        const formatted = {
            success: true,
            reading: data.reading || "0.00",
            reading_confidence: data.reading_confidence || 0,
            meter_confidence: data.meter_confidence || 0,
            meter_type: data.meter_type || 'unknown',
            raw: apiResult  // Keep original response for debugging
        };

        // logger.log('formatOCRResponse - Formatted response:', formatted);
        return formatted;
    }

    /**
     * Upload image to storage service
     * FIXED: Better response validation and error handling
     */
    async uploadImageToStorage(image, chatId, meterType = 'water') {
        if (!image || !chatId) {
            throw new Error('Image and chatId are required');
        }

        // logger.log(`Uploading ${meterType} image for chat ${chatId}...`);

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
                    "ngrok-skip-browser-warning": "true"
                },
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                // logger.error(`Image upload failed: ${response.status} - ${errText}`);
                throw new Error(`Image upload failed: ${response.status}`);
            }

            const result = await response.json();
            // logger.log("Upload API Full Response:", result);

            // FIXED: Properly extract URL from various response formats
            let imageUrl = null;

            // Try direct url field
            if (result.url) {
                imageUrl = result.url;
            }
            // Try nested data.url
            else if (result.data && result.data.url) {
                imageUrl = result.data.url;
            }
            // Try path field (some APIs return path instead of url)
            else if (result.path && this.IMAGE_UPLOAD_API) {
                // Construct full URL from path if needed
                const baseUrl = new URL(this.IMAGE_UPLOAD_API).origin;
                imageUrl = result.path.startsWith('http') ? result.path : `${baseUrl}${result.path.startsWith('/') ? '' : '/'}${result.path}`;
            }

            // Validate that we got a URL
            if (!imageUrl) {
                // logger.error('No URL found in upload response:', result);
                throw new Error('Invalid response from image upload service: No URL found');
            }

            // logger.log(`Image uploaded successfully: ${imageUrl}`);
            return imageUrl;

        } catch (error) {
            // logger.error(`Image upload error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process water meter and save to storage
     */
    async processAndSaveWaterMeter(imageBase64, chatId) {
        try {
            // logger.log(`Processing water meter for chat ${chatId}...`);

            // 1. Save chat ID first
            this.storage.saveChatId(chatId);

            // 2. Send to OCR
            const ocrResponse = await this.sendDetectionRequest(imageBase64);
            // logger.log('Water OCR Response:', ocrResponse);

            // 3. Upload image
            const imageUrl = await this.uploadImageToStorage(imageBase64, chatId, 'water');
            // logger.log('Water Image URL:', imageUrl);

            // 4. Save water data to storage
            const savedData = this.storage.saveWaterData(ocrResponse, imageUrl, 'water');

            // 5. Verify storage
            const storedData = this.storage.getWaterData();
            // logger.log('Water data after saving:', storedData);

            return {
                success: true,
                message: "Water meter processed and saved",
                meterValue: ocrResponse.reading,
                accuracy: ocrResponse.reading_confidence || ocrResponse.meter_confidence,
                imageUrl: imageUrl,
                ocrResponse: ocrResponse,
                storedData: savedData,
                nextStep: "electricity"
            };

        } catch (error) {
            // logger.error(`Water meter processing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process electricity meter and save to storage
     */
    async processAndSaveElectricityMeter(imageBase64) {
        try {
            // Get chat ID from storage
            const chatId = this.storage.getChatId();
            if (!chatId) {
                throw new Error("Chat ID not found. Please process water meter first.");
            }

            // logger.log(`Processing electricity meter for chat ${chatId}...`);

            // 1. Send to OCR
            const ocrResponse = await this.sendDetectionRequest(imageBase64);
            // logger.log('Electricity OCR Response:', ocrResponse);

            // 2. Upload image
            const imageUrl = await this.uploadImageToStorage(imageBase64, chatId, 'electricity');
            // logger.log('Electricity Image URL:', imageUrl);

            // 3. Save electricity data to storage
            const savedData = this.storage.saveElectricityData(ocrResponse, imageUrl, 'electricity');

            // 4. Verify storage
            const storedData = this.storage.getElectricityData();
            // logger.log('Electricity data after saving:', storedData);

            return {
                success: true,
                message: "Electricity meter processed and saved",
                meterValue: ocrResponse.reading,
                accuracy: ocrResponse.reading_confidence || ocrResponse.meter_confidence,
                imageUrl: imageUrl,
                ocrResponse: ocrResponse,
                storedData: savedData,
                bothComplete: this.storage.isComplete()
            };

        } catch (error) {
            // logger.error(`Electricity meter processing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build final payload from stored data
     */
    buildFinalPayloadFromStorage() {
        const chatId = this.storage.getChatId();
        const waterData = this.storage.getWaterData();
        const electricityData = this.storage.getElectricityData();

        if (!chatId) {
            throw new Error("Chat ID not found in storage");
        }

        // Build the payload in the EXACT required format
        // Laravel expects: { result: { ... } }
        const payload = {
            result: {
                chat_id: chatId.toString(),
                water_meter: waterData?.meter || "0.00",
                water_accuracy: waterData?.accuracy || "0.0000",
                electricity_meter: electricityData?.meter || "0.00",
                electricity_accuracy: electricityData?.accuracy || "0.0000",
                water_image: waterData?.imageUrl || "",
                electricity_image: electricityData?.imageUrl || ""
            }
        };

        // logger.log("Final payload built from storage:", payload);
        return payload;
    }

    /**
     * Submit final payload from stored data
     */
    async submitFromStorage() {
        try {
            // 1. Build final payload from storage
            const finalPayload = this.buildFinalPayloadFromStorage();

            // logger.log('Sending notification with payload:', finalPayload);

            // 2. Send notification
            const notificationResponse = await this.sendNotification(finalPayload);

            // 3. Clear storage after successful submission
            // logger.log('✅ Notification sent successfully. Clearing storage...');
            this.storage.clearAll();
            // logger.log('✅ Storage cleared successfully');

            // Verify storage was cleared
            const verifyCleared = {
                chatId: this.storage.getChatId(),
                waterData: this.storage.getWaterData(),
                electricityData: this.storage.getElectricityData()
            };
            // logger.log('Storage state after clearing:', verifyCleared);

            return {
                success: true,
                message: "Meter readings submitted successfully",
                payload: finalPayload.result, // Return inner result for UI display
                notificationResponse: notificationResponse,
                fullPayload: finalPayload
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Send notification with meter reading results
     */
    async sendNotification(resultData) {
        if (!resultData || typeof resultData !== 'object') {
            throw new Error('Valid result data is required');
        }

        // logger.log('Sending notification to backend...', resultData);

        try {
            const response = await fetch(this.NOTIFICATION_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true",
                    "Accept": "application/json"
                },
                body: JSON.stringify(resultData)
            });

            // Get response text first for better error handling
            const responseText = await response.text();

            if (!response.ok) {
                // Get response text first for better error handling
                const responseText = await response.text();

                // Try to parse as JSON for structured error
                try {
                    const errorJson = JSON.parse(responseText);
                    throw new Error(`Notification failed: ${response.status} - ${errorJson.message || errorJson.error || 'Unknown error'}`);
                } catch (parseError) {
                    // If not JSON, throw with text
                    throw new Error(`Notification failed: ${response.status} - ${responseText.substring(0, 200)}`);
                }
            }

            // Try to parse successful response
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                // logger.warn('Response is not JSON:', responseText);
                result = { success: true, raw: responseText };
            }

            // logger.log('Notification sent successfully', result);
            return result;

        } catch (error) {
            throw error;
        }
    }

    /**
     * Get current progress status
     */
    getProgressStatus() {
        const chatId = this.storage.getChatId();
        const waterData = this.storage.getWaterData();
        const electricityData = this.storage.getElectricityData();

        return {
            chatId: chatId,
            waterCompleted: !!waterData,
            electricityCompleted: !!electricityData,
            waterMeter: waterData?.meter,
            electricityMeter: electricityData?.meter,
            isComplete: this.storage.isComplete()
        };
    }

    /**
     * Reset/clear all stored data
     */
    resetStorage() {
        this.storage.clearAll();
        return { success: true, message: "Storage cleared" };
    }

}