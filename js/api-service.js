import { logger } from './logger.js';

export class ApiService {
    constructor() {
        // ...
        const env = import.meta.env || {};
        this.API_URL = env.VITE_API_URL || 'https://serverless.roboflow.com/vandaa/workflows/custom-workflow-2';
        this.API_KEY = env.VITE_API_KEY;

        if (!this.API_KEY) {
            logger.error("VITE_API_KEY is missing!");
        }
    }

    async sendDetectionRequest(base64Image) {
        if (!base64Image) {
            logger.error("No image data provided to API");
            return;
        }

        logger.log(`API: Sending request to Roboflow...`);

        try {
            // 1. Build the CORRECT request body for Serverless API
            const requestBody = {
                api_keys: this.API_KEY,
                inputs: [
                    {
                        image: {
                            "type": "base64",
                            "value": base64Image
                        }
                    }
                ]
            };

            // 2. Construct the URL with API key as a query parameter
            const urlWithKey = `${this.API_URL}`;

            const response = await fetch(urlWithKey, { // Use the new URL
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody) // Send the simpler body
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


}
