export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomName(): string {
    const length = Math.floor(Math.random() * 2) + 3;
    return Math.random().toString(36).toUpperCase().replace(/[0-9O]/g, '').substring(1, length + 1);
}

export var log = require('tracer').colorConsole({
    format: '{{timestamp}} [{{title}}]:: {{message}}',
    dateformat: 'HH:MM:ss.L'
});