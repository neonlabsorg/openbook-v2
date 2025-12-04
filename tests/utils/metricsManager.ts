import { log } from "./helpers";
import Prometheus from "prom-client";

const express = require('express');
const application = express();

const register = new Prometheus.Registry();
Prometheus.collectDefaultMetrics({ register });
register.setDefaultLabels({
    application: 'monitoring',
});

export class Metrics {
    private server;

    constructor(port: number) {
        this.server = application.listen(port, () => {
            log.info(`Metrics app running at http://localhost:${port}`);
        });
    }

    public async sendMetrics() {
        application.get('/metrics', async (req, res) => {
            res.setHeader('Content-Type', Prometheus.register.contentType);
            const metrics = await Prometheus.register.metrics();
            res.send(metrics);
            log.info("Send collected metrics to db");
        });
    }

    public registerMetric(metric) {
        register.registerMetric(metric);
    }

    public close() {
        this.server.close();
        log.info("Close Metrics app");
    }
}