import { logger } from './logger.js';

export class UploadService {
    constructor() {
        this.UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL;
        if (!this.UPLOAD_URL) {
            logger.error("VITE_UPLOAD_URL is missing!");
        }
    }

    async upload(blob) {
        logger.log(`Upload: Starting (${blob.size} bytes)...`);

        try {
            const formData = new FormData();
            formData.append('file', blob);

            const response = await fetch(this.UPLOAD_URL, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                logger.error(`Upload Failed: ${response.status}`);
                throw new Error(`Upload failed: ${response.status}`);
            }

            const data = await response.json();
            const publicUrl = data.url || data.link || data.secure_url;

            if (!publicUrl) {
                logger.error("Upload: No URL in response");
                throw new Error("No URL returned");
            }

            logger.log(`Upload: Success! URL obtained.`);
            return publicUrl;
        } catch (e) {
            logger.error(`Upload logic error: ${e.message}`);
            throw e;
        }
    }
}
