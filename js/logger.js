export class Logger {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'debug-console';
        Object.assign(this.container.style, {
            position: 'fixed',
            bottom: '120px', // Above capture button
            left: '10px',
            right: '10px',
            height: '150px',
            overflowY: 'scroll',
            background: 'rgba(0,0,0,0.8)',
            color: '#00ff00',
            fontSize: '11px',
            fontFamily: 'monospace',
            padding: '8px',
            zIndex: '9999',
            borderRadius: '8px',
            border: '1px solid #333',
            pointerEvents: 'none' // Allow seeing through clicks, though scroll might require events.
        });

        // Allow scrolling (pointer-events auto would block clicks to things behind, but log is important)
        this.container.style.pointerEvents = 'auto';

        document.body.appendChild(this.container);
        this.log("Debug Console Initialized");
    }

    log(msg) {
        const line = document.createElement('div');
        line.style.marginBottom = '2px';
        const time = new Date().toLocaleTimeString().split(' ')[0];
        line.innerText = `[${time}] ${msg}`;
        this.container.appendChild(line);
        this.container.scrollTop = this.container.scrollHeight;
        console.log(`[Logger] ${msg}`);
    }

    error(msg) {
        const line = document.createElement('div');
        line.style.color = '#ff5555';
        line.style.marginBottom = '2px';
        const time = new Date().toLocaleTimeString().split(' ')[0];
        line.innerText = `[${time}] ERR: ${msg}`;
        this.container.appendChild(line);
        this.container.scrollTop = this.container.scrollHeight;
        console.error(msg);
    }
}

export const logger = new Logger();
