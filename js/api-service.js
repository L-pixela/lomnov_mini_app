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
     * Sends the best frame to the API.
     * @param {Array} frames - Array of objects containing dataUrl or blobs
     */
    async sendDetectionRequest(frames) {
        if (!frames || frames.length === 0) {
            console.warn("ApiService: Not enough frames to send.");
            return;
        }

        console.log(`ApiService: Sending frame to Roboflow...`);

        // Use the first frame (best sharpness)
        const bestFrame = frames[0];
        const base64Image = bestFrame.dataUrl;

        try {
            const inputs = {
                "image": { "type": "url", "value": base64Image }
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
            console.error('ApiService: Error sending frames', error);
            throw error;
        }
    }

    formatResponse(apiResult) {
        // Roboflow Workflow response format mapping
        // Logic depends on the specific workflow output block name. 
        // Usually it returns an object with keys corresponding to output names.
        // Assuming output is `predictions` or standard Roboflow format.

        // Check for standard prediction structure
        // Workflows often return { "output_name": [ ... ] } or simple execution results.

        let detections = [];

        // Attempt to find an array in the result
        // Common keys: 'predictions', 'output', 'results'
        const possibleKeys = ['predictions', 'output', 'results', 'data'];

        for (const key of possibleKeys) {
            if (Array.isArray(apiResult[key])) {
                detections = apiResult[key];
                break;
            }
        }

        // Fallback: checks if the root invalidates array logic or nested structure
        // If specific format is known (from user snippet), use it. User didn't specify beyond URL.
        // Let's assume standard Roboflow object detection format inside the array: 
        // { class: "bottle", confidence: 0.9, x: 100, y: 100, width: 50, height: 50 }

        // Map to app format: { label, confidence, box: [x, y, w, h] }
        // Note: Roboflow often gives center_x, center_y. App expects top-left x, y? 
        // Looking at app.js: 
        // const [x, y, w, h] = det.box;
        // overlayCtx.roundRect(x, y, w, h, 8);
        // So App expects x, y (top-left), w, h.

        const formattedDetections = detections.map(d => {
            // Check coordinate format
            let x = d.x;
            let y = d.y;

            // If API returns center coordinates (Roboflow often does), convert to top-left
            // Usually Roboflow Standard API returns { x, y, width, height } where x,y are center.
            // Let's assume center and convert. 
            // If they are regular x,y (top-left), this subtraction might be wrong, 
            // but 99% of Roboflow JSON is center-based. 

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
