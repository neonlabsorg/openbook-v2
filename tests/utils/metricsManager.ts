import Prometheus from "prom-client";
import express from "express";
import { Express } from "express";
import type { Server } from "http";
import { log } from "./helpers";


const application = express();

const register = new Prometheus.Registry();
Prometheus.collectDefaultMetrics({ register });
register.setDefaultLabels({
    application: 'monitoring',
});

export class Metrics {
    private server: Server;
    private readonly app: Express;

    constructor(port: number) {
        this.app = application;
        this.setupMetricsEndpoint();
        this.server = this.app.listen(port, () => {
            log.info(`Metrics app running at http://localhost:${port}`);
        });
    }

    public setupMetricsEndpoint(): void {
        this.app.get('/metrics', async (_req, res) => {
            res.setHeader('Content-Type', register.contentType);
            const metrics = await register.metrics();
            res.send(metrics);
            log.info("Metrics endpoint accessed");
        });
    }

    public registerMetric(metric: Prometheus.Metric<string>): void {
        register.registerMetric(metric);
    }

    public async sendMetrics(): Promise<void> {
        await register.metrics();
    }

    public close(): void {
        this.server.close(() => {
            log.info("Metrics app closed");
        });
    }
}