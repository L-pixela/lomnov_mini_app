/**
 * api-service.js
 * Handles communication with the Object Detection Model API.
 */

export class ApiService {
    constructor() {
        this.API_URL = 'https://serverless.roboflow.com/vandaa/workflows/custom-workflow'; // REPLACE with actual endpoint
    }

    /**
     * Sends the two best frames to the API.
     * @param {Array} frames - Array of objects containing dataUrl or blobs
     */
    async sendDetectionRequest(frames) {
        if (!frames || frames.length < 2) {
            console.warn("ApiService: Not enough frames to send.");
            return;
        }

        console.log(`ApiService: Sending ${frames.length} frames...`);

        const formData = new FormData();

        // Convert base64 to File objects
        /* 
           Note: In a real app, it's better to pass Blobs directly from FrameProcessor 
           to avoid base64 overhead, but for this demo using DataURL is easier to debug 
           and compatible with the 'draw to canvas' approach.
        */

        const file1 = await this.dataURLtoFile(frames[0].dataUrl, 'frame_1.jpg');
        const file2 = await this.dataURLtoFile(frames[1].dataUrl, 'frame_2.jpg');

        formData.append('image_1', file1);
        formData.append('image_2', file2);
        formData.append('timestamp', Date.now());

        try {
            /* 
               SIMULATION MODE 
               Since we don't have a real backend, we simulate network delay and a random response.
            */
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: 'MNYtURs9SnSz7i9LwyfS',
                    inputs: {
                        "image": { "type": "url", "value": "IMAGE_URL" }
                    }
                })
            });

            const result = await response.json();
            console.log(result);

            return await this.simulateApiResponse();

        } catch (error) {
            console.error('ApiService: Error sending frames', error);
            throw error;
        }
    }

    async dataURLtoFile(dataurl, filename) {
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

    simulateApiResponse() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    detections: [
                        { label: 'bottle', confidence: 0.95, box: [100, 100, 200, 200] },
                        { label: 'laptop', confidence: 0.88, box: [300, 150, 400, 300] }
                    ],
                    message: "Objects detected successfully"
                });
            }, 1500); // 1.5s simulated latency
        });
    }
}
