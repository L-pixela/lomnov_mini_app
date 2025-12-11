/**
 * api-service.js
 * Handles communication with the Object Detection Model API.
 */

export class ApiService {
    constructor() {
        const env = import.meta.env || {};
        this.API_URL = env.VITE_API_URL || 'https://serverless.roboflow.com/vandaa/workflows/custom-workflow-2';
        this.API_KEY = env.VITE_API_KEY;

        if (!this.API_KEY) {
            console.warn("ApiService: VITE_API_KEY is missing. Please check .env file.");
        }
    }

    /**
     * Sends the image URL to the API.
     * @param {string} imageUrl - The public URL of the uploaded image
     */
    async sendDetectionRequest(imageUrl) {
        if (!imageUrl) {
            console.warn("ApiService: No URL provided.");
            return;
        }

        console.log(`ApiService: Sending URL to Roboflow...`, imageUrl);

        try {
            // New Format: URL input
            const inputs = {
                "image": { "type": "url", "value": imageUrl }
            };

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: this.API_KEY,
                    inputs: inputs
                })
            });

            if (!response.ok) {
                throw new Error(`API Request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log("ApiService: Response received", result);

            return this.formatResponse(result);

        } catch (error) {
            console.error('ApiService: Error sending request', error);
            throw error;
        }
    }

    formatResponse(apiResult) {
        /*
        Target structure:
        {
            "outputs": [
                {
                    "predictions": {
                        "predictions": [ { ... }, ... ]
                    }
                }
            ]
        }
        */

        let detections = [];

        // 1. Try specific user format
        try {
            if (apiResult.outputs && apiResult.outputs.length > 0) {
                const output = apiResult.outputs[0];
                if (output.predictions && output.predictions.predictions) {
                    detections = output.predictions.predictions;
                }
            }
        } catch (e) {
            console.warn("ApiService: Error parsing specifics, trying fallbacks", e);
        }

        // 2. Fallbacks (if above failed or empty)
        if (detections.length === 0) {
            const possibleKeys = ['predictions', 'output', 'results', 'data'];
            for (const key of possibleKeys) {
                if (Array.isArray(apiResult[key])) {
                    detections = apiResult[key];
                    break;
                }
            }
        }

        const formattedDetections = detections.map(d => {
            // App expects: { label, confidence, box: [x, y, w, h] }
            // API provides: x, y (center usually?), width, height, class, confidence

            // Note: Roboflow often gives center_x, center_y. 
            // If the user's JSON shows x=501, width=254, let's assume it might be center or top-left.
            // Standard Roboflow is center.

            let x = d.x;
            let y = d.y;

            // Convert to top-left for Canvas drawing if it seems to be center
            // (Heuristic: if x > width/2, likely center. If x < width/2 could be top-left. 
            // Safe bet with Roboflow is always Center).

            if (d.x !== undefined && d.width !== undefined) {
                x = d.x - (d.width / 2);
                y = d.y - (d.height / 2);
            }

            return {
                label: d.class || d.label || 'unknown',
                confidence: d.confidence || 0,
                box: [x, y, d.width, d.height]
            };
        });

        return {
            success: true,
            detections: formattedDetections,
            message: "Objects detected"
        };
    }

    async dataURLtoFile(dataurl, filename) {
        // ... (legacy helper, kept if needed but unused now)
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    }
}
